import json
import os
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import server


class TestCRDTMergeEngine(unittest.TestCase):
    def test_concurrent_iphone_transactions_mauricio_and_marie(self):
        """Mauricio y Marie registran gastos al mismo tiempo en sus iPhones: ninguno se pierde y el orden es determinista."""
        state_mauricio = {
            "version": 3,
            "lastUpdated": "2026-11-02T12:00:00Z",
            "transactions": [
                {
                    "id": "tx_mauricio_1",
                    "date": "2026-11-02",
                    "type": "expense",
                    "amount": 35000,
                    "categoryId": "transporte",
                    "paymentMethod": "cmr_falabella",
                    "author": "el",
                    "note": "Bencina Copec",
                    "reconciled": False,
                    "createdAt": "2026-11-02T11:50:00Z",
                    "updatedAt": "2026-11-02T11:50:00Z",
                }
            ],
            "deletedTransactionIds": {},
            "learnedContacts": {"copec": {"flow": "out", "suggestedCategoryId": "transporte"}},
            "monthlyBudgets": {},
            "fixedTemplates": [],
            "sharedIntegrations": {"googleSheetsWebhookUrl": "https://script.google.com/macros/s/abc/exec"},
            "demoCleared": True,
        }

        state_marie = {
            "version": 3,
            "lastUpdated": "2026-11-02T12:01:00Z",
            "transactions": [
                {
                    "id": "tx_marie_1",
                    "date": "2026-11-02",
                    "type": "expense",
                    "amount": 42900,
                    "categoryId": "hija",
                    "paymentMethod": "cuenta_mujer",
                    "author": "ella",
                    "note": "Pañales y crema",
                    "reconciled": False,
                    "createdAt": "2026-11-02T11:55:00Z",
                    "updatedAt": "2026-11-02T11:55:00Z",
                }
            ],
            "deletedTransactionIds": {},
            "learnedContacts": {"cruz verde": {"flow": "out", "suggestedCategoryId": "salud_farmacia"}},
            "monthlyBudgets": {},
            "fixedTemplates": [],
            "sharedIntegrations": {"geminiApiKey": "AIzaSyTestKey123"},
            "demoCleared": True,
        }

        merged_ab = server.merge_family_states(state_mauricio, state_marie)
        merged_ba = server.merge_family_states(state_marie, state_mauricio)

        self.assertEqual(len(merged_ab["transactions"]), 2)
        self.assertEqual(
            [t["id"] for t in merged_ab["transactions"]],
            ["tx_marie_1", "tx_mauricio_1"],
        )
        # Conmutatividad en transacciones, tombstones, contactos e integraciones
        self.assertEqual(merged_ab["transactions"], merged_ba["transactions"])
        self.assertEqual(merged_ab["learnedContacts"], merged_ba["learnedContacts"])
        self.assertEqual(merged_ab["sharedIntegrations"], merged_ba["sharedIntegrations"])
        self.assertEqual(
            merged_ab["sharedIntegrations"]["googleSheetsWebhookUrl"],
            "https://script.google.com/macros/s/abc/exec",
        )
        self.assertEqual(merged_ab["sharedIntegrations"]["geminiApiKey"], "AIzaSyTestKey123")

        # Idempotencia: fusionar nuevamente con cualquiera de los estados no altera el resultado
        merged_idemp = server.merge_family_states(merged_ab, state_marie)
        self.assertEqual(merged_idemp, merged_ab)

    def test_tombstones_win_against_stale_transactions_and_keep_latest_timestamp(self):
        """Un movimiento eliminado en un dispositivo no debe revivir cuando otro dispositivo sincroniza su copia antigua."""
        state_with_delete = {
            "lastUpdated": "2026-11-02T14:00:00Z",
            "transactions": [],
            "deletedTransactionIds": {
                "tx_1": "2026-11-02T14:00:00Z",
                "tx_2": "2026-11-02T10:00:00Z",
            },
            "demoCleared": True,
        }
        state_stale_device = {
            "lastUpdated": "2026-11-02T13:00:00Z",
            "transactions": [
                {
                    "id": "tx_1",
                    "date": "2026-11-01",
                    "type": "expense",
                    "amount": 15000,
                    "updatedAt": "2026-11-02T12:00:00Z",
                },
                {
                    "id": "tx_keep",
                    "date": "2026-11-02",
                    "type": "expense",
                    "amount": 25000,
                    "updatedAt": "2026-11-02T12:30:00Z",
                },
            ],
            "deletedTransactionIds": {
                "tx_2": "2026-11-02T15:30:00Z",
            },
            "demoCleared": True,
        }

        merged = server.merge_family_states(state_with_delete, state_stale_device)
        tx_ids = [t["id"] for t in merged["transactions"]]
        self.assertEqual(tx_ids, ["tx_keep"])
        self.assertEqual(merged["deletedTransactionIds"]["tx_1"], "2026-11-02T14:00:00Z")
        self.assertEqual(merged["deletedTransactionIds"]["tx_2"], "2026-11-02T15:30:00Z")

    def test_reconciled_preservation_and_updated_at_tie_breaking(self):
        """Si una transacción fue conciliada con el banco, preserva reconciled=True incluso si se edita la nota o llega desfasada."""
        tx_reconciled = {
            "id": "tx_lider",
            "date": "2026-11-01",
            "type": "expense",
            "amount": 48500,
            "note": "Compra Hiper Lider",
            "reconciled": True,
            "bankFingerprint": "fp_2026-11-01_out_48500_comprahiperlider",
            "createdAt": "2026-11-01T19:45:00Z",
            "updatedAt": "2026-11-01T20:00:00Z",
        }
        tx_newer_note_unreconciled = {
            "id": "tx_lider",
            "date": "2026-11-01",
            "type": "expense",
            "amount": 48500,
            "note": "Compra Hiper Lider (Semana 1)",
            "reconciled": False,
            "createdAt": "2026-11-01T19:45:00Z",
            "updatedAt": "2026-11-01T21:00:00Z",
        }

        state_a = {"transactions": [tx_reconciled], "demoCleared": True, "lastUpdated": "2026-11-01T20:00:00Z"}
        state_b = {"transactions": [tx_newer_note_unreconciled], "demoCleared": True, "lastUpdated": "2026-11-01T21:00:00Z"}

        merged_1 = server.merge_family_states(state_a, state_b)
        merged_2 = server.merge_family_states(state_b, state_a)

        self.assertEqual(merged_1["transactions"][0]["note"], "Compra Hiper Lider (Semana 1)")
        self.assertTrue(merged_1["transactions"][0]["reconciled"])
        self.assertEqual(
            merged_1["transactions"][0]["bankFingerprint"],
            "fp_2026-11-01_out_48500_comprahiperlider",
        )
        self.assertEqual(merged_1["transactions"], merged_2["transactions"])

    def test_demo_cleaning_propagation(self):
        """Cuando uno de los dispositivos limpia las transacciones isDemo, la limpieza se propaga al fusionar."""
        state_with_demo = {
            "transactions": [
                {"id": "tx_demo_1", "date": "2026-11-01", "amount": 580000, "isDemo": True},
                {"id": "tx_real_1", "date": "2026-11-02", "amount": 12990, "isDemo": False},
            ],
            "demoCleared": False,
            "lastUpdated": "2026-11-02T10:00:00Z",
        }
        state_cleaned = {
            "transactions": [
                {"id": "tx_real_2", "date": "2026-11-02", "amount": 8500, "isDemo": False},
            ],
            "demoCleared": False,  # Incluso si el flag no venía explícito pero ya no tiene demos
            "lastUpdated": "2026-11-02T10:05:00Z",
        }

        merged = server.merge_family_states(state_with_demo, state_cleaned)
        self.assertTrue(merged["demoCleared"])
        ids = [t["id"] for t in merged["transactions"]]
        self.assertNotIn("tx_demo_1", ids)
        self.assertCountEqual(ids, ["tx_real_1", "tx_real_2"])

    def test_monthly_budgets_and_fixed_templates_merge(self):
        """Presupuestos mensuales ganan por updatedAt y plantillas fijas se unen por id."""
        state_a = {
            "monthlyBudgets": {
                "2026-11": {
                    "incomeTarget": 2350000,
                    "savingsGoal": 250000,
                    "categories": {"supermercado": 420000},
                    "updatedAt": "2026-11-01T10:00:00Z",
                }
            },
            "fixedTemplates": [
                {"id": "fix_arriendo", "name": "Arriendo", "estimatedAmount": 580000, "updatedAt": "2026-11-01T08:00:00Z"},
                {"id": "fix_jardin", "name": "Jardín Infantil", "estimatedAmount": 280000},
            ],
            "transactions": [],
            "demoCleared": True,
            "lastUpdated": "2026-11-01T10:00:00Z",
        }
        state_b = {
            "monthlyBudgets": {
                "2026-11": {
                    "incomeTarget": 2500000,
                    "savingsGoal": 300000,
                    "categories": {"supermercado": 460000},
                    "updatedAt": "2026-11-02T09:00:00Z",
                },
                "2026-10": {
                    "incomeTarget": 2350000,
                    "savingsGoal": 250000,
                    "categories": {"supermercado": 400000},
                    "updatedAt": "2026-10-01T09:00:00Z",
                },
            },
            "fixedTemplates": [
                {"id": "fix_arriendo", "name": "Arriendo UF", "estimatedAmount": 595000, "updatedAt": "2026-11-02T08:00:00Z"},
                {"id": "fix_seguro", "name": "Seguro Auto", "estimatedAmount": 45000},
            ],
            "transactions": [],
            "demoCleared": True,
            "lastUpdated": "2026-11-02T09:00:00Z",
        }

        merged_ab = server.merge_family_states(state_a, state_b)
        merged_ba = server.merge_family_states(state_b, state_a)

        self.assertEqual(merged_ab["monthlyBudgets"]["2026-11"]["savingsGoal"], 300000)
        self.assertEqual(merged_ab["monthlyBudgets"]["2026-11"]["categories"]["supermercado"], 460000)
        self.assertIn("2026-10", merged_ab["monthlyBudgets"])

        tpl_map = {t["id"]: t for t in merged_ab["fixedTemplates"]}
        self.assertEqual(set(tpl_map.keys()), {"fix_arriendo", "fix_jardin", "fix_seguro"})
        self.assertEqual(tpl_map["fix_arriendo"]["estimatedAmount"], 595000)
        self.assertEqual(merged_ab["fixedTemplates"], merged_ba["fixedTemplates"])

    def test_patrimony_vault_tombstones_and_family_config_merge(self):
        """La Bóveda de Patrimonio (Cripto/Binance y Fondo de Emergencia) y familyConfig se fusionan por updatedAt y respetan tombstones."""
        state_mac = {
            "familyConfig": {
                "coupleNames": "Mauricio & Marie",
                "wifeName": "Marie",
                "monthlyIncomeTarget": 2600000,
                "monthlySavingsGoal": 350000,
                "updatedAt": "2026-11-07T20:00:00Z",
            },
            "patrimonyItems": [
                {
                    "id": "pat_btc_binance",
                    "name": "Bitcoin (BTC) — Reserva Largo Plazo",
                    "amountCLP": 5000000,
                    "category": "crypto_hold",
                    "institution": "Binance",
                    "owner": "el",
                    "createdAt": "2026-11-07T18:00:00Z",
                    "updatedAt": "2026-11-07T19:00:00Z",
                },
                {
                    "id": "pat_old_dap",
                    "name": "DAP Antiguo",
                    "amountCLP": 800000,
                    "category": "investment",
                    "createdAt": "2026-10-01T10:00:00Z",
                    "updatedAt": "2026-10-01T10:00:00Z",
                },
            ],
            "deletedPatrimonyIds": {},
            "transactions": [],
            "demoCleared": True,
            "lastUpdated": "2026-11-07T20:00:00Z",
        }

        state_iphone = {
            "familyConfig": {
                "coupleNames": "Mauricio & Marie",
                "wifeName": "Marie",
                "monthlyIncomeTarget": 2350000,
                "monthlySavingsGoal": 250000,
                "updatedAt": "2026-11-01T10:00:00Z",
            },
            "patrimonyItems": [
                {
                    "id": "pat_btc_binance",
                    "name": "Bitcoin (BTC) — Reserva Largo Plazo",
                    "amountCLP": 5250000,
                    "category": "crypto_hold",
                    "institution": "Binance",
                    "owner": "el",
                    "createdAt": "2026-11-07T18:00:00Z",
                    "updatedAt": "2026-11-07T21:00:00Z",
                },
                {
                    "id": "pat_emergency",
                    "name": "Fondo de Emergencia Familiar",
                    "amountCLP": 1500000,
                    "category": "emergency_fund",
                    "institution": "Banco de Chile",
                    "owner": "ambos",
                    "createdAt": "2026-11-07T21:05:00Z",
                    "updatedAt": "2026-11-07T21:05:00Z",
                },
            ],
            "deletedPatrimonyIds": {
                "pat_old_dap": "2026-11-07T21:10:00Z",
            },
            "transactions": [],
            "demoCleared": True,
            "lastUpdated": "2026-11-07T21:10:00Z",
        }

        merged_ab = server.merge_family_states(state_mac, state_iphone)
        merged_ba = server.merge_family_states(state_iphone, state_mac)

        # familyConfig más reciente gana sin importar el orden
        self.assertEqual(merged_ab["familyConfig"]["monthlyIncomeTarget"], 2600000)
        self.assertEqual(merged_ab["familyConfig"]["monthlySavingsGoal"], 350000)
        self.assertEqual(merged_ab["familyConfig"], merged_ba["familyConfig"])

        # patrimonyItems respeta tombstones y se queda con el monto más reciente de BTC ($5.250.000)
        pat_ids = [p["id"] for p in merged_ab["patrimonyItems"]]
        self.assertNotIn("pat_old_dap", pat_ids)
        self.assertCountEqual(pat_ids, ["pat_btc_binance", "pat_emergency"])
        btc_item = next(p for p in merged_ab["patrimonyItems"] if p["id"] == "pat_btc_binance")
        self.assertEqual(btc_item["amountCLP"], 5250000)
        self.assertEqual(merged_ab["patrimonyItems"], merged_ba["patrimonyItems"])

    def test_codebase_audit_invariants(self):
        """Verifica que todos los hallazgos de la auditoría técnica estén corregidos en los módulos JS y Apps Script."""
        root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

        with open(os.path.join(root_dir, "src", "app.js"), "r", encoding="utf-8") as f:
            app_js = f.read()
        self.assertNotIn("formatMonthLabel(", app_js)
        self.assertIn("getMonthNameLabel(res.clonedFrom)", app_js)
        self.assertIn("btn.dataset.msgKind || btn.dataset.msgType", app_js)
        self.assertIn("finanzas:state-merged", app_js)
        self.assertIn("setupAutoOnlineSync(", app_js)
        self.assertIn("renderPatrimonyVaultSection(", app_js)
        self.assertIn("preset-patrimony-btc", app_js)
        self.assertIn("export-json-backup", app_js)

        with open(os.path.join(root_dir, "src", "services", "storage.js"), "r", encoding="utf-8") as f:
            storage_js = f.read()
        self.assertIn("deletedPatrimonyIds", storage_js)
        self.assertIn("patrimonyItems", storage_js)
        self.assertIn("exportStateToJsonString", storage_js)
        self.assertIn("importStateFromJsonString", storage_js)

        with open(os.path.join(root_dir, "src", "services", "reconciler.js"), "r", encoding="utf-8") as f:
            reconciler_js = f.read()
        self.assertIn("matchFixedTemplateFromStatementRow", reconciler_js)
        self.assertIn("_occ", reconciler_js)

        with open(os.path.join(root_dir, "google-sheets-sync", "Code.gs"), "r", encoding="utf-8") as f:
            code_gs = f.read()
        self.assertIn("deletedPatrimonyIds", code_gs)
        self.assertIn("patrimonyItems", code_gs)

        # Verificar sintaxis JavaScript real de todos los módulos frontend con JavaScriptCore (si está disponible)
        jsc_path = "/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc"
        if os.path.exists(jsc_path):
            import re
            import subprocess

            js_files = [
                os.path.join(root_dir, "src", "data", "defaults.js"),
                os.path.join(root_dir, "src", "domain", "financialEngine.js"),
                os.path.join(root_dir, "src", "services", "reconciler.js"),
                os.path.join(root_dir, "src", "services", "storage.js"),
                os.path.join(root_dir, "src", "services", "geminiScanner.js"),
                os.path.join(root_dir, "src", "services", "excelExport.js"),
                os.path.join(root_dir, "src", "services", "smartInput.js"),
                os.path.join(root_dir, "src", "app.js"),
                os.path.join(root_dir, "sw.js"),
            ]
            for js_file in js_files:
                with open(js_file, "r", encoding="utf-8") as jf:
                    code = jf.read()
                out_lines = []
                skip_import = False
                for line in code.splitlines():
                    if skip_import:
                        out_lines.append("// " + line)
                        if "from " in line:
                            skip_import = False
                        continue
                    if re.match(r"^\s*import\b", line):
                        out_lines.append("// " + line)
                        if "from " not in line:
                            skip_import = True
                        continue
                    line2 = re.sub(r"^(\s*)export\s+default\s+", r"\1", line)
                    line2 = re.sub(
                        r"^(\s*)export\s+(async\s+function|function|const|let|var|class)\b",
                        r"\1\2",
                        line2,
                    )
                    line2 = re.sub(r"^(\s*)export\s*\{[^}]*\};?", r"\1", line2)
                    out_lines.append(line2)
                clean_code = "\n".join(out_lines)
                runner = f"new Function({json.dumps(clean_code)}); print('OK');"
                res = subprocess.run([jsc_path, "-e", runner], capture_output=True, text=True)
                self.assertEqual(
                    res.returncode,
                    0,
                    f"Syntax error in {js_file}: {res.stdout} {res.stderr}",
                )
                self.assertIn("OK", res.stdout, f"Syntax check failed for {js_file}: {res.stdout}")


class TestFinanzasHTTPServer(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.orig_data_dir = server.DATA_DIR
        self.orig_state_file = server.STATE_FILE
        server.DATA_DIR = self.temp_dir.name
        server.STATE_FILE = os.path.join(self.temp_dir.name, "family_state.json")

        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.FinanzasHandler)
        self.port = self.httpd.server_address[1]
        self.base_url = f"http://127.0.0.1:{self.port}"
        self.server_thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.server_thread.start()

    def tearDown(self):
        self.httpd.shutdown()
        self.httpd.server_close()
        server.DATA_DIR = self.orig_data_dir
        server.STATE_FILE = self.orig_state_file
        self.temp_dir.cleanup()

    def _get_json(self, path):
        with urlopen(f"{self.base_url}{path}", timeout=5) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))

    def _post_raw(self, path, raw_bytes):
        req = Request(
            f"{self.base_url}{path}",
            data=raw_bytes,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urlopen(req, timeout=5) as resp:
                return resp.status, json.loads(resp.read().decode("utf-8"))
        except HTTPError as err:
            return err.code, json.loads(err.read().decode("utf-8"))

    def test_endpoints_info_health_state_and_error_handling(self):
        # 1. GET /api/info
        status, info = self._get_json("/api/info")
        self.assertEqual(status, 200)
        self.assertEqual(info["status"], "ok")
        self.assertIn("localIp", info)

        # 2. GET /api/health cuando aún no hay archivo de estado
        status, health = self._get_json("/api/health")
        self.assertEqual(status, 200)
        self.assertEqual(health["status"], "ok")
        self.assertEqual(health["version"], 3)
        self.assertEqual(health["transactionCount"], 0)

        # 3. GET /api/state inicial -> empty
        status, st = self._get_json("/api/state")
        self.assertEqual(status, 200)
        self.assertEqual(st["status"], "empty")

        # 4. POST /api/state desde iPhone de Mauricio
        payload_el = {
            "payload": {
                "version": 3,
                "demoCleared": True,
                "lastUpdated": "2026-11-02T12:00:00Z",
                "transactions": [
                    {
                        "id": "tx_el_1",
                        "date": "2026-11-02",
                        "type": "expense",
                        "amount": 20000,
                        "author": "el",
                        "createdAt": "2026-11-02T12:00:00Z",
                    }
                ],
            }
        }
        status, post_res_1 = self._post_raw("/api/state", json.dumps(payload_el).encode("utf-8"))
        self.assertEqual(status, 200)
        self.assertEqual(post_res_1["status"], "ok")
        self.assertEqual(len(post_res_1["payload"]["transactions"]), 1)

        # 5. POST /api/state concurrente desde iPhone de Marie
        payload_ella = {
            "payload": {
                "version": 3,
                "demoCleared": True,
                "lastUpdated": "2026-11-02T12:02:00Z",
                "transactions": [
                    {
                        "id": "tx_ella_1",
                        "date": "2026-11-02",
                        "type": "expense",
                        "amount": 15000,
                        "author": "ella",
                        "createdAt": "2026-11-02T12:02:00Z",
                    }
                ],
            }
        }
        status, post_res_2 = self._post_raw("/api/state", json.dumps(payload_ella).encode("utf-8"))
        self.assertEqual(status, 200)
        self.assertEqual(len(post_res_2["payload"]["transactions"]), 2)

        # 6. GET /api/health y GET /api/state reflejan las 2 transacciones fusionadas
        status, health_after = self._get_json("/api/health")
        self.assertEqual(status, 200)
        self.assertEqual(health_after["transactionCount"], 2)

        status, state_after = self._get_json("/api/state")
        self.assertEqual(status, 200)
        self.assertEqual(state_after["status"], "ok")
        self.assertEqual(len(state_after["payload"]["transactions"]), 2)

        # 7. Manejo de errores JSON a prueba de balas
        status_bad, bad_res = self._post_raw("/api/state", b"{invalid_json:")
        self.assertEqual(status_bad, 400)
        self.assertEqual(bad_res["status"], "error")

        status_empty, empty_res = self._post_raw("/api/state", b"   ")
        self.assertEqual(status_empty, 400)
        self.assertEqual(empty_res["status"], "error")

        status_list, list_res = self._post_raw("/api/state", b"[1, 2, 3]")
        self.assertEqual(status_list, 400)
        self.assertEqual(list_res["status"], "error")


if __name__ == "__main__":
    unittest.main()
