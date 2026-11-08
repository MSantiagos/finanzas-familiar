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

DEFAULT_CATEGORIES_CATALOG = [
    {"id": "supermercado", "name": "Supermercado y Feria", "icon": "🛒", "color": "#10b981", "group": "esencial", "defaultBudget": 450000, "description": "Lider, Jumbo, Santa Isabel, feria libre, panadería, carnicería"},
    {"id": "hija", "name": "Hija (Pañales, Leche, Ropa)", "icon": "👶", "color": "#ec4899", "group": "esencial", "defaultBudget": 155000, "description": "Pañales, leche/fórmula, ropa bebé, controles pediátricos, juguetes"},
    {"id": "vivienda_fijos", "name": "Vivienda y Cuentas Fijas", "icon": "🏠", "color": "#3b82f6", "group": "fijo", "defaultBudget": 850000, "description": "Arriendo/Dividendo, Gastos Comunes, Luz, Agua, Gas, Internet"},
    {"id": "salud_farmacia", "name": "Salud y Farmacia", "icon": "💊", "color": "#06b6d4", "group": "esencial", "defaultBudget": 85000, "description": "Cruz Verde, Salcobrand, Ahumada, bonos médicos, exámenes"},
    {"id": "transporte", "name": "Transporte, Auto y Bencina", "icon": "🚗", "color": "#f59e0b", "group": "esencial", "defaultBudget": 140000, "description": "Copec, Shell, TAG, Bip!, Uber/Cabify, estacionamientos"},
    {"id": "delivery_salidas", "name": "Delivery, Salidas y Cafés", "icon": "🍔", "color": "#ef4444", "group": "estilo_vida", "defaultBudget": 105000, "description": "PedidosYa, Uber Eats, restaurantes, helados, cafés, paseos"},
    {"id": "hogar_varios", "name": "Hogar, Aseo y Varios", "icon": "🧹", "color": "#8b5cf6", "group": "esencial", "defaultBudget": 70000, "description": "Sodimac, Casaideas, artículos de aseo, reparaciones, regalos"},
    {"id": "gatos_mascotas", "name": "Gatos (Comida, Arena y Vet)", "icon": "🐱", "color": "#a855f7", "group": "esencial", "defaultBudget": 65000, "description": "Alimento gatos, arena sanitaria, Churu, veterinario, antiparasitarios"},
    {"id": "suscripciones", "name": "Suscripciones y Apps", "icon": "📺", "color": "#6366f1", "group": "fijo", "defaultBudget": 35000, "description": "Netflix, Spotify, iCloud, YouTube, Disney+, ChatGPT, almacenamiento nube"},
    {"id": "suscripciones_anuales", "name": "Suscripciones Anuales (Renovación del Mes)", "icon": "📅", "color": "#0ea5e9", "group": "fijo", "defaultBudget": 0, "isDynamicAnnual": True, "description": "Cobros de renovación anual programados en el mes correspondiente"},
    {"id": "gustos_personales", "name": "Gustos y Compras Personales", "icon": "🎁", "color": "#f97316", "group": "estilo_vida", "defaultBudget": 85000, "description": "Ropa adultos, Falabella, MercadoLibre, hobbies, antojos"},
    {"id": "imprevistos", "name": "Imprevistos y Otros", "icon": "🚨", "color": "#64748b", "group": "esencial", "defaultBudget": 60000, "description": "Gastos no planificados o emergencias menores del mes"},
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

    # 5. Fusionar presupuestos mensuales por updatedAt (conservando unión de categorías)
    monthly_budgets = dict(existing.get("monthlyBudgets") or {})
    for ym, cfg in (incoming.get("monthlyBudgets") or {}).items():
        if not isinstance(cfg, dict):
            continue
        if ym not in monthly_budgets or not isinstance(monthly_budgets.get(ym), dict):
            monthly_budgets[ym] = dict(cfg)
        else:
            prev_cfg = monthly_budgets[ym]
            prev_u = str(prev_cfg.get("updatedAt") or "")
            new_u = str(cfg.get("updatedAt") or "")
            prev_cats = dict(prev_cfg.get("categories") or {})
            new_cats = dict(cfg.get("categories") or {})
            prev_locks = dict(prev_cfg.get("lockedCategories") or {})
            new_locks = dict(cfg.get("lockedCategories") or {})
            lock_u_prev = str(prev_cfg.get("lockedCategoriesUpdatedAt") or prev_u or "")
            lock_u_new = str(cfg.get("lockedCategoriesUpdatedAt") or new_u or "")

            if lock_u_new > lock_u_prev:
                merged_locks = new_locks
                merged_lock_u = cfg.get("lockedCategoriesUpdatedAt") or new_u
            elif lock_u_prev > lock_u_new:
                merged_locks = prev_locks
                merged_lock_u = prev_cfg.get("lockedCategoriesUpdatedAt") or prev_u
            else:
                merged_locks = dict(prev_locks)
                merged_locks.update(new_locks)
                merged_lock_u = prev_cfg.get("lockedCategoriesUpdatedAt") or cfg.get("lockedCategoriesUpdatedAt") or prev_u or new_u

            if new_u >= prev_u:
                merged_cats = dict(prev_cats)
                merged_cats.update(new_cats)
                merged_m = dict(prev_cfg)
                merged_m.update(cfg)
                merged_m["categories"] = merged_cats
                merged_m["lockedCategories"] = merged_locks
                merged_m["lockedCategoriesUpdatedAt"] = merged_lock_u
                monthly_budgets[ym] = merged_m
            else:
                merged_cats = dict(new_cats)
                merged_cats.update(prev_cats)
                merged_m = dict(cfg)
                merged_m.update(prev_cfg)
                merged_m["categories"] = merged_cats
                merged_m["lockedCategories"] = merged_locks
                merged_m["lockedCategoriesUpdatedAt"] = merged_lock_u
                monthly_budgets[ym] = merged_m

    # Asegurar que todas las categorías del catálogo base estén presentes en categories y monthlyBudgets
    cats_by_id = {c["id"]: dict(c) for c in DEFAULT_CATEGORIES_CATALOG}
    for c_list in (existing.get("categories") or [], incoming.get("categories") or []):
        if isinstance(c_list, list):
            for c_item in c_list:
                if isinstance(c_item, dict) and c_item.get("id"):
                    cid = c_item["id"]
                    base_c = cats_by_id.get(cid, {})
                    merged_c = dict(base_c)
                    merged_c.update(c_item)
                    cats_by_id[cid] = merged_c

    canonical_ids = [c["id"] for c in DEFAULT_CATEGORIES_CATALOG]
    merged_categories = sorted(
        cats_by_id.values(),
        key=lambda x: (
            0 if x.get("id") in canonical_ids else 1,
            canonical_ids.index(x.get("id")) if x.get("id") in canonical_ids else 0,
            str(x.get("id") or ""),
        ),
    )

    for ym, m_cfg in monthly_budgets.items():
        if isinstance(m_cfg, dict):
            m_cats = dict(m_cfg.get("categories") or {})
            for c_def in merged_categories:
                cid = c_def["id"]
                if cid not in m_cats:
                    m_cats[cid] = c_def.get("defaultBudget", 50000)
            m_cfg["categories"] = m_cats

    # 6. Fusionar plantillas de gastos fijos por ID
    tpl_by_id = {}
    for t in (existing.get("fixedTemplates") or []) + (incoming.get("fixedTemplates") or []):
        if not isinstance(t, dict) or not t.get("id"):
            continue
        tid = t["id"]
        norm_t = dict(t)
        if tid == "fix_suscripciones" and norm_t.get("categoryId") == "gustos_personales":
            norm_t["categoryId"] = "suscripciones"
        if tid not in tpl_by_id:
            tpl_by_id[tid] = norm_t
        else:
            prev_u = str(tpl_by_id[tid].get("updatedAt") or "")
            new_u = str(norm_t.get("updatedAt") or "")
            if new_u >= prev_u:
                tpl_by_id[tid] = norm_t

    merged_templates = sorted(tpl_by_id.values(), key=_fixed_template_sort_key)

    # 6b. Fusionar Bóveda de Patrimonio Intocable (patrimonyItems + deletedPatrimonyIds)
    deleted_patrimony = dict(existing.get("deletedPatrimonyIds") or {})
    for p_id, del_ts in (incoming.get("deletedPatrimonyIds") or {}).items():
        prev_ts = str(deleted_patrimony.get(p_id, "") or "")
        if not prev_ts or str(del_ts) >= prev_ts:
            deleted_patrimony[p_id] = del_ts

    pat_by_id = {}
    for item in (existing.get("patrimonyItems") or []) + (incoming.get("patrimonyItems") or []):
        if not isinstance(item, dict) or not item.get("id"):
            continue
        pid = item["id"]
        if pid in deleted_patrimony:
            continue
        if pid not in pat_by_id:
            pat_by_id[pid] = dict(item)
        else:
            prev_u = str(pat_by_id[pid].get("updatedAt") or pat_by_id[pid].get("createdAt") or "")
            new_u = str(item.get("updatedAt") or item.get("createdAt") or "")
            if new_u >= prev_u:
                merged_item = dict(pat_by_id[pid])
                merged_item.update(item)
                pat_by_id[pid] = merged_item

    merged_patrimony = sorted(
        pat_by_id.values(),
        key=lambda x: (-float(x.get("amount") or 0), str(x.get("id") or "")),
    )

    # 6c. Fusionar familyConfig por updatedAt
    existing_fc = existing.get("familyConfig") if isinstance(existing.get("familyConfig"), dict) else None
    incoming_fc = incoming.get("familyConfig") if isinstance(incoming.get("familyConfig"), dict) else None
    merged_fc = incoming_fc or existing_fc
    if existing_fc and incoming_fc:
        fc_u_exist = str(existing_fc.get("updatedAt") or "")
        fc_u_inc = str(incoming_fc.get("updatedAt") or "")
        if fc_u_exist and fc_u_inc:
            merged_fc = incoming_fc if fc_u_inc >= fc_u_exist else existing_fc
        elif fc_u_exist and not fc_u_inc:
            merged_fc = existing_fc
        else:
            merged_fc = incoming_fc

    # 6d. Fusionar Suscripciones Anuales Dinámicas (annualSubscriptions + deletedAnnualSubscriptionIds)
    deleted_annual = dict(existing.get("deletedAnnualSubscriptionIds") or {})
    for sub_id, del_ts in (incoming.get("deletedAnnualSubscriptionIds") or {}).items():
        prev_ts = str(deleted_annual.get(sub_id, "") or "")
        if not prev_ts or str(del_ts) >= prev_ts:
            deleted_annual[sub_id] = del_ts

    annual_by_id = {}
    for sub in (existing.get("annualSubscriptions") or []) + (incoming.get("annualSubscriptions") or []):
        if not isinstance(sub, dict) or not sub.get("id"):
            continue
        sid = sub["id"]
        if sid in deleted_annual:
            continue
        if sid not in annual_by_id:
            annual_by_id[sid] = dict(sub)
        else:
            prev_u = str(annual_by_id[sid].get("updatedAt") or annual_by_id[sid].get("createdAt") or "")
            new_u = str(sub.get("updatedAt") or sub.get("createdAt") or "")
            if new_u >= prev_u:
                merged_sub = dict(annual_by_id[sid])
                merged_sub.update(sub)
                annual_by_id[sid] = merged_sub

    merged_annual_subs = sorted(
        annual_by_id.values(),
        key=lambda x: (int(x.get("billingMonth") or 1), str(x.get("name") or ""), str(x.get("id") or "")),
    )

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
            "familyConfig": merged_fc,
            "categories": merged_categories,
            "monthlyBudgets": monthly_budgets,
            "fixedTemplates": merged_templates,
            "annualSubscriptions": merged_annual_subs,
            "deletedAnnualSubscriptionIds": deleted_annual,
            "transactions": merged_txs,
            "deletedTransactionIds": deleted_map,
            "patrimonyItems": merged_patrimony,
            "deletedPatrimonyIds": deleted_patrimony,
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
                    tmp_file = f"{STATE_FILE}.tmp.{os.getpid()}.{threading.get_ident()}"
                    with open(tmp_file, "w", encoding="utf-8") as f:
                        json.dump(merged_payload, f, ensure_ascii=False, indent=2)
                    os.replace(tmp_file, STATE_FILE)

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
