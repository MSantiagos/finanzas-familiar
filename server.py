#!/usr/bin/env python3
"""
Servidor Local y Sincronizador WiFi con Fusión Determinista (CRDT-Lite) para Finanzas Familiar.
Permite que el Mac y los iPhones de Mauricio y Marie compartan la misma base de datos
en tiempo real a través del WiFi de la casa (http://192.168.x.x:8090) sin pisarse los datos
cuando ambos registran gastos al mismo tiempo.
"""

from datetime import datetime, timezone
import json
import os
import socket
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
STATE_FILE = os.path.join(DATA_DIR, "family_state.json")
STATE_LOCK = threading.Lock()

DEFAULT_FIXED_ORDER = [
    "fix_arriendo",
    "fix_gGCC",
    "fix_luz",
    "fix_agua",
    "fix_gas",
    "fix_internet",
    "fix_suscripciones",
]


def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


def iso_now():
    return datetime.now(timezone.utc).isoformat()


def _merge_two_transactions(prev, cand):
    prev_stamp = str(prev.get("updatedAt") or prev.get("createdAt") or "")
    cand_stamp = str(cand.get("updatedAt") or cand.get("createdAt") or "")
    prev_rec = bool(prev.get("reconciled"))
    cand_rec = bool(cand.get("reconciled"))

    if cand_stamp > prev_stamp:
        winner, loser = cand, prev
    elif prev_stamp > cand_stamp:
        winner, loser = prev, cand
    else:
        if prev_rec and not cand_rec:
            winner, loser = prev, cand
        else:
            winner, loser = cand, prev

    merged_tx = dict(loser)
    merged_tx.update(winner)
    if prev_rec or cand_rec:
        merged_tx["reconciled"] = True
        fp = winner.get("bankFingerprint") or loser.get("bankFingerprint")
        if fp:
            merged_tx["bankFingerprint"] = fp
    return merged_tx


def _fixed_template_sort_key(tpl):
    tpl_id = str(tpl.get("id") or "")
    if tpl_id in DEFAULT_FIXED_ORDER:
        return (0, DEFAULT_FIXED_ORDER.index(tpl_id), tpl_id)
    return (1, 0, tpl_id)


def merge_family_states(existing, incoming):
    """
    Fusiona de forma determinista, idempotente y conmutativa el estado guardado en disco
    con el estado entrante de cualquiera de los iPhones o del Mac, evitando que un dispositivo
    sobrescriba transacciones nuevas creadas en otro dispositivo.
    """
    if not existing or not isinstance(existing, dict):
        return incoming
    if not incoming or not isinstance(incoming, dict):
        return existing

    # 1. Fusionar registro de eliminados (tombstones: { tx_id: iso_timestamp })
    deleted_map = dict(existing.get("deletedTransactionIds") or {})
    for tx_id, del_ts in (incoming.get("deletedTransactionIds") or {}).items():
        prev_ts = str(deleted_map.get(tx_id, "") or "")
        if not prev_ts or str(del_ts) >= prev_ts:
            deleted_map[tx_id] = del_ts

    # 2. Propagar limpieza de demostración (demoCleared)
    incoming_txs = incoming.get("transactions") if isinstance(incoming.get("transactions"), list) else []
    existing_txs = existing.get("transactions") if isinstance(existing.get("transactions"), list) else []
    has_demo_existing = any(isinstance(t, dict) and t.get("isDemo") for t in existing_txs)
    has_demo_incoming = any(isinstance(t, dict) and t.get("isDemo") for t in incoming_txs)

    demo_cleared = (
        bool(existing.get("demoCleared"))
        or bool(incoming.get("demoCleared"))
        or (has_demo_existing and isinstance(incoming.get("transactions"), list) and not has_demo_incoming)
        or (has_demo_incoming and isinstance(existing.get("transactions"), list) and not has_demo_existing)
    )

    # 3. Fusionar transacciones por ID (gana el updatedAt/createdAt más reciente, preserva reconciled y respeta tombstones)
    tx_by_id = {}
    for tx in existing_txs + incoming_txs:
        if not isinstance(tx, dict):
            continue
        tx_id = tx.get("id")
        if not tx_id:
            continue
        if tx_id in deleted_map:
            continue
        if demo_cleared and tx.get("isDemo"):
            continue
        prev = tx_by_id.get(tx_id)
        if not prev:
            tx_by_id[tx_id] = dict(tx)
        else:
            tx_by_id[tx_id] = _merge_two_transactions(prev, tx)

    merged_txs = list(tx_by_id.values())
    merged_txs.sort(
        key=lambda t: (
            str(t.get("date") or ""),
            str(t.get("createdAt") or ""),
            str(t.get("id") or ""),
        ),
        reverse=True,
    )

    # 4. Fusionar contactos aprendidos (Memoria Familiar)
    learned_contacts = dict(existing.get("learnedContacts") or {})
    for ck, cval in (incoming.get("learnedContacts") or {}).items():
        prev_c = learned_contacts.get(ck)
        if not isinstance(prev_c, dict) or not isinstance(cval, dict):
            learned_contacts[ck] = cval
        else:
            prev_u = str(prev_c.get("updatedAt") or "")
            next_u = str(cval.get("updatedAt") or "")
            if next_u >= prev_u:
                learned_contacts[ck] = cval

    # 5. Fusionar presupuestos mensuales por updatedAt
    monthly_budgets = dict(existing.get("monthlyBudgets") or {})
    for ym, cfg in (incoming.get("monthlyBudgets") or {}).items():
        if not isinstance(cfg, dict):
            continue
        if ym not in monthly_budgets or not isinstance(monthly_budgets.get(ym), dict):
            monthly_budgets[ym] = cfg
        else:
            prev_u = str(monthly_budgets[ym].get("updatedAt") or "")
            new_u = str(cfg.get("updatedAt") or "")
            if new_u >= prev_u:
                monthly_budgets[ym] = cfg

    # 6. Fusionar plantillas de gastos fijos por ID
    tpl_by_id = {}
    for t in (existing.get("fixedTemplates") or []) + (incoming.get("fixedTemplates") or []):
        if not isinstance(t, dict) or not t.get("id"):
            continue
        tid = t["id"]
        if tid not in tpl_by_id:
            tpl_by_id[tid] = t
        else:
            prev_u = str(tpl_by_id[tid].get("updatedAt") or "")
            new_u = str(t.get("updatedAt") or "")
            if new_u >= prev_u:
                tpl_by_id[tid] = t

    merged_templates = sorted(tpl_by_id.values(), key=_fixed_template_sort_key)

    # 7. Fusionar integraciones compartidas conservando claves no vacías
    shared_integrations = {
        "googleSheetsWebhookUrl": "",
        "geminiApiKey": "",
    }
    for src in (existing.get("sharedIntegrations") or {}, incoming.get("sharedIntegrations") or {}):
        if isinstance(src, dict):
            for k, v in src.items():
                if v is not None and str(v).strip() != "":
                    shared_integrations[k] = v
                elif k not in shared_integrations:
                    shared_integrations[k] = v

    if shared_integrations.get("googleSheetsUrl") and not shared_integrations.get("googleSheetsWebhookUrl"):
        shared_integrations["googleSheetsWebhookUrl"] = shared_integrations["googleSheetsUrl"]
    if shared_integrations.get("googleSheetsWebhookUrl") and not shared_integrations.get("googleSheetsUrl"):
        shared_integrations["googleSheetsUrl"] = shared_integrations["googleSheetsWebhookUrl"]

    existing_last = str(existing.get("lastUpdated") or "")
    incoming_last = str(incoming.get("lastUpdated") or "")
    latest_stamp = max(existing_last, incoming_last)

    merged = dict(existing)
    merged.update(incoming)
    merged.update(
        {
            "version": 3,
            "familyConfig": incoming.get("familyConfig") or existing.get("familyConfig"),
            "categories": incoming.get("categories") or existing.get("categories"),
            "monthlyBudgets": monthly_budgets,
            "fixedTemplates": merged_templates,
            "transactions": merged_txs,
            "deletedTransactionIds": deleted_map,
            "learnedContacts": learned_contacts,
            "sharedIntegrations": shared_integrations,
            "demoCleared": demo_cleared,
            "lastUpdated": latest_stamp if latest_stamp else iso_now(),
        }
    )
    return merged


def _read_disk_state():
    """Lee de forma segura el archivo STATE_FILE en disco sin lanzar excepciones ante JSON corrupto."""
    if not os.path.exists(STATE_FILE):
        return None, None
    try:
        with open(STATE_FILE, "r", encoding="utf-8") as f:
            raw = f.read().strip()
        if not raw:
            return None, None
        data = json.loads(raw)
        if not isinstance(data, dict):
            return None, "El archivo de estado no contiene un objeto JSON válido"
        return data, None
    except Exception as e:
        return None, str(e)


class FinanzasHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        super().end_headers()

    def _send_json(self, status_code, payload):
        body_bytes = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body_bytes)))
        self.end_headers()
        self.wfile.write(body_bytes)

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/health":
            with STATE_LOCK:
                data, _ = _read_disk_state()
            txs = data.get("transactions") if isinstance(data, dict) else []
            tx_count = len(txs) if isinstance(txs, list) else 0
            self._send_json(
                200,
                {
                    "status": "ok",
                    "version": 3,
                    "localIp": get_local_ip(),
                    "transactionCount": tx_count,
                },
            )
            return

        if parsed.path == "/api/state":
            with STATE_LOCK:
                data, err = _read_disk_state()
            if err:
                self._send_json(
                    200,
                    {"status": "error", "localIp": get_local_ip(), "message": err},
                )
            elif data is not None:
                self._send_json(
                    200,
                    {"status": "ok", "localIp": get_local_ip(), "payload": data},
                )
            else:
                self._send_json(
                    200,
                    {"status": "empty", "localIp": get_local_ip()},
                )
            return

        if parsed.path == "/api/info":
            self._send_json(
                200,
                {"status": "ok", "localIp": get_local_ip(), "port": 8090},
            )
            return

        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/state":
            try:
                raw_len = self.headers.get("Content-Length", "0")
                length = max(0, int(raw_len))
            except (ValueError, TypeError):
                length = 0

            raw_body = (
                self.rfile.read(length).decode("utf-8", errors="replace")
                if length > 0
                else ""
            )
            if not raw_body.strip():
                self._send_json(
                    400,
                    {"status": "error", "message": "Cuerpo JSON vacío"},
                )
                return

            try:
                body = json.loads(raw_body)
            except json.JSONDecodeError as e:
                self._send_json(
                    400,
                    {"status": "error", "message": f"JSON inválido: {e.msg}"},
                )
                return

            if not isinstance(body, dict):
                self._send_json(
                    400,
                    {"status": "error", "message": "El cuerpo de la petición debe ser un objeto JSON"},
                )
                return

            incoming_payload = body.get("payload", body)
            if not isinstance(incoming_payload, dict):
                self._send_json(
                    400,
                    {"status": "error", "message": "El campo payload debe ser un objeto JSON"},
                )
                return

            try:
                os.makedirs(DATA_DIR, exist_ok=True)
                with STATE_LOCK:
                    existing_payload, _ = _read_disk_state()
                    merged_payload = merge_family_states(existing_payload, incoming_payload)
                    with open(STATE_FILE, "w", encoding="utf-8") as f:
                        json.dump(merged_payload, f, ensure_ascii=False, indent=2)

                self._send_json(
                    200,
                    {
                        "status": "ok",
                        "localIp": get_local_ip(),
                        "savedAt": merged_payload.get("lastUpdated"),
                        "payload": merged_payload,
                    },
                )
            except Exception as e:
                self._send_json(
                    500,
                    {"status": "error", "message": str(e)},
                )
            return

        self._send_json(404, {"status": "error", "message": "Ruta no encontrada"})


if __name__ == "__main__":
    os.chdir(BASE_DIR)
    port = 8090
    ip = get_local_ip()
    print(f"Servidor Finanzas Familiar activo en http://localhost:{port} y http://{ip}:{port}", flush=True)
    server = ThreadingHTTPServer(("0.0.0.0", port), FinanzasHandler)
    server.serve_forever()
