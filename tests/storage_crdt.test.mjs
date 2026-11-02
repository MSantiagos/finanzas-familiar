import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

// Simular localStorage y eventos online en globalThis antes de importar storage.js
const memoryStore = new Map();
const eventListeners = new Map();

globalThis.localStorage = {
  getItem(key) {
    return memoryStore.has(key) ? memoryStore.get(key) : null;
  },
  setItem(key, value) {
    memoryStore.set(key, String(value));
  },
  removeItem(key) {
    memoryStore.delete(key);
  },
  clear() {
    memoryStore.clear();
  }
};

globalThis.addEventListener = (evt, fn) => {
  if (!eventListeners.has(evt)) eventListeners.set(evt, new Set());
  eventListeners.get(evt).add(fn);
};

globalThis.removeEventListener = (evt, fn) => {
  eventListeners.get(evt)?.delete(fn);
};

async function dispatchGlobalEvent(evt) {
  const handlers = Array.from(eventListeners.get(evt) || []);
  for (const fn of handlers) {
    await fn();
  }
}

globalThis.fetch = async () => ({
  ok: true,
  status: 200,
  json: async () => ({ status: 'empty', localIp: '192.168.1.50' })
});

const storage = await import('../src/services/storage.js');

test('loadState y saveState inicializan estado por defecto con versión 3 y presupuesto del mes', () => {
  memoryStore.clear();
  const state = storage.loadState();
  assert.equal(state.version, 3);
  assert.ok(Array.isArray(state.transactions));
  assert.ok(state.transactions.length > 0);
  assert.ok(state.transactions.every((t) => t.isDemo));

  const ym = storage.getCurrentYearMonth();
  assert.ok(state.monthlyBudgets[ym]);
  assert.equal(state.monthlyBudgets[ym].incomeTarget, 2350000);
  assert.equal(state.monthlyBudgets[ym].savingsGoal, 250000);
});

test('mergeFamilyStates es determinista, conmutativo e idempotente entre el iPhone de Mauricio y el de Marie', () => {
  memoryStore.clear();
  const base = storage.createDefaultState();

  const stateMauricio = structuredClone(base);
  stateMauricio.demoCleared = true;
  stateMauricio.lastUpdated = '2026-11-02T14:00:00Z';
  stateMauricio.transactions = [
    {
      id: 'tx_el_101',
      date: '2026-11-02',
      type: 'expense',
      amount: 48500,
      categoryId: 'supermercado',
      paymentMethod: 'cmr_falabella',
      author: 'el',
      note: 'Lider Express',
      reconciled: true,
      bankFingerprint: 'fp_lider_48500',
      createdAt: '2026-11-02T12:00:00Z',
      updatedAt: '2026-11-02T12:10:00Z'
    },
    {
      id: 'tx_old_deleted',
      date: '2026-11-01',
      type: 'expense',
      amount: 9900,
      categoryId: 'delivery_salidas',
      paymentMethod: 'cmr_falabella',
      author: 'el',
      note: 'Café borrado por Marie',
      reconciled: false,
      createdAt: '2026-11-01T09:00:00Z',
      updatedAt: '2026-11-01T09:00:00Z'
    }
  ];
  stateMauricio.fixedTemplates.push({
    id: 'fix_jardin',
    name: 'Sala Cuna / Jardín',
    categoryId: 'hija',
    estimatedAmount: 290000,
    defaultPaymentMethod: 'bch_ctacte',
    dayOfMonth: 5
  });
  stateMauricio.sharedIntegrations = {
    googleSheetsWebhookUrl: 'https://script.google.com/macros/s/deployment123/exec',
    geminiApiKey: ''
  };

  const stateMarie = structuredClone(base);
  stateMarie.demoCleared = true;
  stateMarie.lastUpdated = '2026-11-02T14:05:00Z';
  stateMarie.deletedTransactionIds = {
    tx_old_deleted: '2026-11-02T13:00:00Z'
  };
  stateMarie.transactions = [
    {
      // Misma transacción editada más recientemente en nota por Marie pero sin flag reconciled
      id: 'tx_el_101',
      date: '2026-11-02',
      type: 'expense',
      amount: 48500,
      categoryId: 'supermercado',
      paymentMethod: 'cmr_falabella',
      author: 'el',
      note: 'Lider Express + Pan y Leche',
      reconciled: false,
      createdAt: '2026-11-02T12:00:00Z',
      updatedAt: '2026-11-02T13:30:00Z'
    },
    {
      id: 'tx_ella_202',
      date: '2026-11-02',
      type: 'expense',
      amount: 22990,
      categoryId: 'salud_farmacia',
      paymentMethod: 'cuenta_mujer',
      author: 'ella',
      note: 'Cruz Verde',
      reconciled: false,
      createdAt: '2026-11-02T13:45:00Z',
      updatedAt: '2026-11-02T13:45:00Z'
    }
  ];
  stateMarie.sharedIntegrations = {
    googleSheetsWebhookUrl: '',
    geminiApiKey: 'AIzaSyMarieSecretKey'
  };

  const mergedAB = storage.mergeFamilyStates(stateMauricio, stateMarie);
  const mergedBA = storage.mergeFamilyStates(stateMarie, stateMauricio);

  // Ambas transacciones activas están presentes y la eliminada por tombstone NO revive
  assert.equal(mergedAB.transactions.length, 2);
  assert.deepEqual(
    mergedAB.transactions.map((t) => t.id),
    ['tx_ella_202', 'tx_el_101']
  );

  // La edición más reciente de nota gana Y preserva reconciled === true + bankFingerprint
  const liderTx = mergedAB.transactions.find((t) => t.id === 'tx_el_101');
  assert.equal(liderTx.note, 'Lider Express + Pan y Leche');
  assert.equal(liderTx.reconciled, true);
  assert.equal(liderTx.bankFingerprint, 'fp_lider_48500');

  // Conmutatividad e idempotencia
  assert.deepEqual(mergedAB.transactions, mergedBA.transactions);
  assert.deepEqual(mergedAB.deletedTransactionIds, mergedBA.deletedTransactionIds);
  assert.deepEqual(mergedAB.fixedTemplates, mergedBA.fixedTemplates);
  assert.deepEqual(mergedAB.sharedIntegrations, mergedBA.sharedIntegrations);

  const reMerged = storage.mergeFamilyStates(mergedAB, stateMauricio);
  assert.deepEqual(reMerged, mergedAB);

  // Credenciales compartidas se copiaron automáticamente a userPrefs
  const prefs = storage.loadUserPrefs();
  assert.equal(prefs.googleSheetsWebhookUrl, 'https://script.google.com/macros/s/deployment123/exec');
  assert.equal(prefs.geminiApiKey, 'AIzaSyMarieSecretKey');
});

test('clearDemoTransactions y resetToFactory limpian transacciones demo y restauran estado fábrica', () => {
  memoryStore.clear();
  const initial = storage.loadState();
  assert.ok(initial.transactions.some((t) => t.isDemo));

  // Agregar un movimiento real y limpiar demos
  initial.transactions.push({
    id: 'tx_real_keep',
    date: storage.getTodayISO(),
    type: 'expense',
    amount: 15000,
    categoryId: 'supermercado',
    paymentMethod: 'cmr_falabella',
    author: 'el',
    isDemo: false
  });

  const cleaned = storage.clearDemoTransactions(initial, {
    skipCloudSync: true,
    skipLocalServerSync: true
  });
  assert.equal(cleaned.demoCleared, true);
  assert.equal(cleaned.transactions.length, 1);
  assert.equal(cleaned.transactions[0].id, 'tx_real_keep');
  assert.ok(cleaned.deletedTransactionIds['tx_demo_income_1']);

  // Reset a fábrica
  const factory = storage.resetToFactory({ clearDemo: false });
  assert.equal(factory.demoCleared, false);
  assert.ok(factory.transactions.some((t) => t.isDemo));
});

test('syncFromLocalWifiServer, pushStateToGoogleSheets, pullStateFromGoogleSheets y cola offline resiliente', async () => {
  memoryStore.clear();
  const state = storage.resetToFactory({ clearDemo: true });
  state.transactions.push({
    id: 'tx_local_wifi_1',
    date: '2026-11-02',
    type: 'expense',
    amount: 19990,
    categoryId: 'hija',
    paymentMethod: 'cmr_falabella',
    author: 'el',
    createdAt: '2026-11-02T10:00:00Z',
    updatedAt: '2026-11-02T10:00:00Z'
  });

  // 1. Simular caída de red al guardar estado -> debe marcar cola pendiente en localStorage
  const webhookUrl = 'https://script.google.com/macros/s/test_webhook/exec';
  storage.saveUserPrefs({
    ...storage.loadUserPrefs(),
    googleSheetsWebhookUrl: webhookUrl
  });

  globalThis.fetch = async () => {
    throw new Error('Network offline');
  };

  storage.saveState(state);
  await new Promise((r) => setTimeout(r, 30));

  assert.equal(storage.hasPendingSync(), true);
  const pendingBefore = storage.getPendingSyncQueue();
  assert.equal(pendingBefore.localWifi, true);
  assert.equal(pendingBefore.googleSheets, true);

  // 2. Simular que vuelve la red y se dispara el evento 'online' con setupAutoOnlineSync
  let syncedCallbackResult = null;
  const unsubscribe = storage.setupAutoOnlineSync((res) => {
    syncedCallbackResult = res;
  });

  globalThis.fetch = async (url, opts) => {
    const urlStr = String(url);
    if (urlStr.startsWith('/api/state')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          status: 'ok',
          localIp: '192.168.100.84',
          payload: {
            ...state,
            transactions: [
              ...state.transactions,
              {
                id: 'tx_from_server_2',
                date: '2026-11-02',
                type: 'expense',
                amount: 12000,
                categoryId: 'transporte',
                paymentMethod: 'bch_vista',
                author: 'ella',
                createdAt: '2026-11-02T11:00:00Z',
                updatedAt: '2026-11-02T11:00:00Z'
              }
            ]
          }
        })
      };
    }
    if (urlStr.startsWith(webhookUrl)) {
      if (opts?.method === 'POST') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ status: 'ok', syncedAt: '2026-11-02T15:00:00Z' })
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          status: 'ok',
          payload: {
            ...state,
            transactions: [
              {
                id: 'tx_from_cloud_3',
                date: '2026-11-02',
                type: 'income',
                amount: 150000,
                categoryId: 'ingreso_extra',
                paymentMethod: 'bch_ctacte',
                author: 'el',
                createdAt: '2026-11-02T12:00:00Z',
                updatedAt: '2026-11-02T12:00:00Z'
              }
            ]
          }
        })
      };
    }
    throw new Error(`Unexpected URL: ${urlStr}`);
  };

  await dispatchGlobalEvent('online');
  unsubscribe();

  assert.ok(syncedCallbackResult);
  assert.equal(syncedCallbackResult.flushed, true);
  assert.equal(storage.hasPendingSync(), false);

  // 3. Probar syncFromLocalWifiServer y pullStateFromGoogleSheets
  const wifiSync = await storage.syncFromLocalWifiServer(state);
  assert.ok(wifiSync);
  assert.equal(wifiSync.localIp, '192.168.100.84');
  assert.ok(wifiSync.state.transactions.some((t) => t.id === 'tx_from_server_2'));

  const cloudMerged = await storage.pullStateFromGoogleSheets(webhookUrl, wifiSync.state);
  assert.ok(cloudMerged);
  assert.ok(cloudMerged.transactions.some((t) => t.id === 'tx_from_cloud_3'));
  assert.ok(cloudMerged.transactions.some((t) => t.id === 'tx_local_wifi_1'));
});

test('google-sheets-sync/Code.gs ejecuta mergeFamilyStates_ y genera las 4 hojas ejecutivas sin errores', () => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const codeGsPath = path.resolve(__dirname, '../google-sheets-sync/Code.gs');
  const codeGsSource = fs.readFileSync(codeGsPath, 'utf8');

  const sheetsStore = {};
  function createMockSheet(name) {
    const sheet = {
      name,
      lastRangeValues: null,
      clearContents() {
        this.lastRangeValues = null;
      },
      getRange() {
        const rangeObj = {
          getValue: () => '',
          setValues: (vals) => {
            sheet.lastRangeValues = vals;
            return rangeObj;
          },
          setFontWeight: () => rangeObj,
          setBackground: () => rangeObj,
          setFontColor: () => rangeObj
        };
        return rangeObj;
      }
    };
    return sheet;
  }

  const mockSpreadsheet = {
    getSheetByName(name) {
      return sheetsStore[name] || null;
    },
    insertSheet(name) {
      sheetsStore[name] = createMockSheet(name);
      return sheetsStore[name];
    }
  };

  const sandbox = {
    Object,
    Array,
    String,
    Number,
    Boolean,
    Math,
    Date,
    JSON,
    SpreadsheetApp: {
      getActiveSpreadsheet: () => mockSpreadsheet
    },
    LockService: {
      getScriptLock: () => ({
        waitLock: () => {},
        releaseLock: () => {}
      })
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (txt) => ({
        setMimeType: () => txt
      })
    }
  };

  vm.createContext(sandbox);
  vm.runInContext(codeGsSource, sandbox);

  const stateA = storage.createDefaultState();
  const stateB = structuredClone(stateA);
  stateB.transactions.push({
    id: 'tx_loan_test_1',
    date: `${storage.getCurrentYearMonth()}-15`,
    type: 'loan_given',
    amount: 35000,
    categoryId: 'prestamo_encargo',
    paymentMethod: 'bch_vista',
    author: 'el',
    note: 'Pedro Soto — Cuenta compartida asado',
    reconciled: true,
    createdAt: '2026-11-02T15:00:00Z',
    updatedAt: '2026-11-02T15:00:00Z'
  });

  const mergedGs = sandbox.mergeFamilyStates_(stateA, stateB);
  assert.ok(mergedGs.transactions.some((t) => t.id === 'tx_loan_test_1'));

  sandbox.updateReadableSheets_(mockSpreadsheet, mergedGs);

  // Verificar que se crearon y poblaron las 4 hojas legibles requeridas
  assert.ok(sheetsStore['Movimientos'], 'Falta hoja Movimientos');
  assert.ok(sheetsStore['Resumen_Mensual'], 'Falta hoja Resumen_Mensual');
  assert.ok(sheetsStore['Escudo_CMR_y_Mujer'], 'Falta hoja Escudo_CMR_y_Mujer');
  assert.ok(sheetsStore['Prestamos_y_Fijos'], 'Falta hoja Prestamos_y_Fijos');

  assert.ok(sheetsStore['Resumen_Mensual'].lastRangeValues.length >= 10);
  assert.ok(sheetsStore['Escudo_CMR_y_Mujer'].lastRangeValues.length >= 10);
  assert.ok(sheetsStore['Prestamos_y_Fijos'].lastRangeValues.length >= 8);
});
