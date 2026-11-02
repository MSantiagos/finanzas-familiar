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


def merge_family_states(existing, incoming):
    """
    Fusiona de forma determinista el estado guardado en disco con el estado entrante
    de cualquiera de los iPhones o del Mac, evitando que un dispositivo sobrescriba
    transacciones nuevas creadas en otro dispositivo.
    """
    if not existing or not isinstance(existing, dict):
        return incoming
    if not incoming or not isinstance(incoming, dict):
        return existing

    # 1. Fusionar registro de eliminados (tombstones: { tx_id: iso_timestamp })
    deleted_map = dict(existing.get("deletedTransactionIds") or {})
    for tx_id, del_ts in (incoming.get("deletedTransactionIds") or {}).items():
        prev_ts = deleted_map.get(tx_id, "")
        if str(del_ts) >= str(prev_ts):
            deleted_map[tx_id] = del_ts

    # Si el usuario limpió los datos de demostración en el cliente entrante, propagar esa limpieza
    incoming_txs = incoming.get("transactions") or []
    existing_txs = existing.get("transactions") or []
    incoming_Cleared_demo = bool(incoming.get("demoCleared")) or (
        any(t.get("isDemo") for t in existing_txs)
        and not any(t.get("isDemo") for t in incoming_txs)
    )
    demo_cleared = bool(existing.get("demoCleared")) or incoming_Cleared_demo

    # 2. Fusionar transacciones por ID (gana el updatedAt/createdAt más reciente y respeta tombstones)
    tx_by_id = {}
    for tx in existing_txs:
        tx_id = tx.get("id")
        if not tx_id:
            continue
        if tx_id in deleted_map:
            continue
        if demo_cleared and tx.get("isDemo"):
            continue
        tx_by_id[tx_id] = tx

    for tx in incoming_txs:
        tx_id = tx.get("id")
        if not tx_id:
            continue
        if tx_id in deleted_map:
            continue
        if demo_cleared and tx.get("isDemo"):
            continue
        prev = tx_by_id.get(tx_id)
        if not prev:
            tx_by_id[tx_id] = tx
        else:
            prev_stamp = str(prev.get("updatedAt") or prev.get("createdAt") or "")
            new_stamp = str(tx.get("updatedAt") or tx.get("createdAt") or "")
            # Si fue conciliado o editado más recientemente, conservar el más nuevo
            if new_stamp >= prev_stamp or (tx.get("reconciled") and not prev.get("reconciled")):
                tx_by_id[tx_id] = tx

    merged_txs = list(tx_by_id.values())
    merged_txs.sort(
        key=lambda t: (str(t.get("date") or ""), str(t.get("createdAt") or "")),
        reverse=True,
    )

    # 3. Fusionar contactos aprendidos (Memoria Familiar)
    learned_contacts = dict(existing.get("learnedContacts") or {})
    learned_contacts.update(incoming.get("learnedContacts") or {})

    # 4. Fusionar presupuestos mensuales
    monthly_budgets = dict(existing.get("monthlyBudgets") or {})
    for ym, cfg in (incoming.get("monthlyBudgets") or {}).items():
        if ym not in monthly_budgets:
            monthly_budgets[ym] = cfg
        else:
            prev_u = str(monthly_budgets[ym].get("updatedAt") or "")
            new_u = str(cfg.get("updatedAt") or "")
            if new_u >= prev_u:
                monthly_budgets[ym] = cfg

    # 5. Fusionar plantillas de gastos fijos por ID
    tpl_by_id = {t.get("id"): t for t in (existing.get("fixedTemplates") or []) if t.get("id")}
    for t in incoming.get("fixedTemplates") or []:
        if t.get("id"):
            tpl_by_id[t["id"]] = t

    # 6. Fusionar integraciones compartidas (Google Sheets URL & Gemini API Key)
    shared_integrations = dict(existing.get("sharedIntegrations") or {})
    for k, v in (incoming.get("sharedIntegrations") or {}).items():
        if v:
            shared_integrations[k] = v

    merged = dict(existing)
    merged.update(
        {
            "version": 3,
            "familyConfig": incoming.get("familyConfig") or existing.get("familyConfig"),
            "categories": incoming.get("categories") or existing.get("categories"),
            "monthlyBudgets": monthly_budgets,
            "fixedTemplates": list(tpl_by_id.values()),
            "transactions": merged_txs,
            "deletedTransactionIds": deleted_map,
            "learnedContacts": learned_contacts,
            "sharedIntegrations": shared_integrations,
            "demoCleared": demo_cleared,
            "lastUpdated": max(
                str(existing.get("lastUpdated") or ""),
                str(incoming.get("lastUpdated") or ""),
                iso_now(),
            ),
        }
    )
    return merged


class FinanzasHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/state":
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            with STATE_LOCK:
                if os.path.exists(STATE_FILE):
                    try:
                        with open(STATE_FILE, "r", encoding="utf-8") as f:
                            data = json.load(f)
                        resp = {"status": "ok", "localIp": get_local_ip(), "payload": data}
                    except Exception as e:
                        resp = {"status": "error", "localIp": get_local_ip(), "message": str(e)}
                else:
                    resp = {"status": "empty", "localIp": get_local_ip()}
            self.wfile.write(json.dumps(resp, ensure_ascii=False).encode("utf-8"))
            return

        if parsed.path == "/api/info":
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            resp = {"status": "ok", "localIp": get_local_ip(), "port": 8090}
            self.wfile.write(json.dumps(resp).encode("utf-8"))
            return

        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/state":
            length = int(self.headers.get("Content-Length", 0))
            raw_body = self.rfile.read(length).decode("utf-8") if length > 0 else "{}"
            try:
                body = json.loads(raw_body)
                incoming_payload = body.get("payload", body)
                os.makedirs(DATA_DIR, exist_ok=True)
                with STATE_LOCK:
                    existing_payload = None
                    if os.path.exists(STATE_FILE):
                        try:
                            with open(STATE_FILE, "r", encoding="utf-8") as f:
                                existing_payload = json.load(f)
                        except Exception:
                            existing_payload = None
                    merged_payload = merge_family_states(existing_payload, incoming_payload)
                    with open(STATE_FILE, "w", encoding="utf-8") as f:
                        json.dump(merged_payload, f, ensure_ascii=False, indent=2)

                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(
                    json.dumps(
                        {
                            "status": "ok",
                            "localIp": get_local_ip(),
                            "savedAt": merged_payload.get("lastUpdated"),
                            "payload": merged_payload,
                        },
                        ensure_ascii=False,
                    ).encode("utf-8")
                )
            except Exception as e:
                self.send_response(500)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"status": "error", "message": str(e)}).encode("utf-8"))
            return

        self.send_response(404)
        self.end_headers()


if __name__ == "__main__":
    os.chdir(BASE_DIR)
    port = 8090
    ip = get_local_ip()
    print(f"Servidor Finanzas Familiar activo en http://localhost:{port} y http://{ip}:{port}", flush=True)
    server = ThreadingHTTPServer(("0.0.0.0", port), FinanzasHandler)
    server.serve_forever()
