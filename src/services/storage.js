import {
  DEFAULT_CATEGORIES,
  DEFAULT_FIXED_TEMPLATE
} from '../data/defaults.js?v=8';

const STORAGE_KEY = 'finanzas_familiar_state_v1';
const USER_PREFS_KEY = 'finanzas_familiar_prefs_v1';

export function getCurrentYearMonth() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function getTodayISO() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function buildInitialSampleTransactions(ym) {
  return [
    {
      id: 'tx_demo_income_1',
      date: `${ym}-01`,
      type: 'income',
      amount: 2350000,
      categoryId: 'ingreso_sueldo',
      paymentMethod: 'bch_ctacte',
      author: 'el',
      note: 'Sueldo mensual depositado en Banco de Chile',
      reconciled: true,
      isDemo: true,
      createdAt: `${ym}-01T09:00:00Z`,
      updatedAt: `${ym}-01T09:00:00Z`
    },
    {
      id: 'tx_demo_fix_arriendo',
      date: `${ym}-05`,
      type: 'expense',
      amount: 580000,
      categoryId: 'vivienda_fijos',
      paymentMethod: 'bch_ctacte',
      author: 'el',
      note: 'Arriendo Departamento (Gasto Fijo)',
      fixedTemplateId: 'fix_arriendo',
      reconciled: true,
      isDemo: true,
      createdAt: `${ym}-05T10:15:00Z`,
      updatedAt: `${ym}-05T10:15:00Z`
    },
    {
      id: 'tx_demo_fix_ggcc',
      date: `${ym}-10`,
      type: 'expense',
      amount: 95000,
      categoryId: 'vivienda_fijos',
      paymentMethod: 'bch_ctacte',
      author: 'el',
      note: 'Gastos Comunes (Gasto Fijo)',
      fixedTemplateId: 'fix_gGCC',
      reconciled: true,
      isDemo: true,
      createdAt: `${ym}-10T11:00:00Z`,
      updatedAt: `${ym}-10T11:00:00Z`
    },
    {
      id: 'tx_demo_transfer_wife',
      date: `${ym}-12`,
      type: 'transfer_wife',
      amount: 200000,
      categoryId: 'traspaso_interno',
      paymentMethod: 'bch_ctacte',
      author: 'el',
      note: 'Transferencia a Marie para gastos del mes (No duplica gasto)',
      reconciled: true,
      isDemo: true,
      createdAt: `${ym}-12T12:00:00Z`,
      updatedAt: `${ym}-12T12:00:00Z`
    },
    {
      id: 'tx_demo_exp_1',
      date: `${ym}-14`,
      type: 'expense',
      amount: 64500,
      categoryId: 'supermercado',
      paymentMethod: 'cuenta_mujer',
      author: 'ella',
      note: 'Feria + Verduras y carne para la semana',
      reconciled: true,
      isDemo: true,
      createdAt: `${ym}-14T13:30:00Z`,
      updatedAt: `${ym}-14T13:30:00Z`
    },
    {
      id: 'tx_demo_exp_2',
      date: `${ym}-18`,
      type: 'expense',
      amount: 42900,
      categoryId: 'hija',
      paymentMethod: 'cmr_falabella',
      author: 'ella',
      note: 'Pañales + Toallitas húmedas + Crema coceduras',
      reconciled: true,
      isDemo: true,
      createdAt: `${ym}-18T17:20:00Z`,
      updatedAt: `${ym}-18T17:20:00Z`
    },
    {
      id: 'tx_demo_exp_3',
      date: `${ym}-24`,
      type: 'expense',
      amount: 48500,
      categoryId: 'supermercado',
      paymentMethod: 'cmr_falabella',
      author: 'el',
      note: 'Compra Hiper Lider (registrada al salir de caja)',
      reconciled: false,
      isDemo: true,
      createdAt: `${ym}-24T19:45:00Z`,
      updatedAt: `${ym}-24T19:45:00Z`
    },
    {
      id: 'tx_demo_exp_4',
      date: `${ym}-25`,
      type: 'expense',
      amount: 22990,
      categoryId: 'salud_farmacia',
      paymentMethod: 'cmr_falabella',
      author: 'ella',
      note: 'Farmacias Cruz Verde — Jarabe y vitaminas hija',
      reconciled: false,
      isDemo: true,
      createdAt: `${ym}-25T16:10:00Z`,
      updatedAt: `${ym}-25T16:10:00Z`
    }
  ];
}

export function createDefaultState() {
  const ym = getCurrentYearMonth();
  const budgetsByCategory = {};
  DEFAULT_CATEGORIES.forEach((c) => {
    budgetsByCategory[c.id] = c.defaultBudget;
  });

  return {
    version: 3,
    familyConfig: {
      husbandName: 'Mauricio',
      wifeName: 'Marie',
      childName: 'Nuestra Hija (20m)',
      monthlyIncomeTarget: 2350000,
      monthlySavingsGoal: 250000
    },
    categories: DEFAULT_CATEGORIES,
    monthlyBudgets: {
      [ym]: {
        incomeTarget: 2350000,
        savingsGoal: 250000,
        categories: { ...budgetsByCategory },
        updatedAt: new Date().toISOString()
      }
    },
    fixedTemplates: DEFAULT_FIXED_TEMPLATE,
    transactions: buildInitialSampleTransactions(ym),
    deletedTransactionIds: {},
    learnedContacts: {},
    sharedIntegrations: {
      googleSheetsWebhookUrl: '',
      geminiApiKey: ''
    },
    demoCleared: false,
    lastUpdated: new Date().toISOString()
  };
}

/**
 * Fusiona de manera determinista dos estados familiares (CRDT-Lite por ID + Tombstones).
 * Garantiza que si Mauricio y Marie registran gastos al mismo tiempo en sus iPhones,
 * ningún movimiento se pierda ni sobrescriba al otro.
 */
export function mergeFamilyStates(stateA, stateB) {
  if (!stateA || typeof stateA !== 'object') return stateB;
  if (!stateB || typeof stateB !== 'object') return stateA;

  // 1. Unir mapa de IDs eliminados (tombstones)
  const deletedTransactionIds = {
    ...(stateA.deletedTransactionIds || {}),
    ...(stateB.deletedTransactionIds || {})
  };

  const txsA = Array.isArray(stateA.transactions) ? stateA.transactions : [];
  const txsB = Array.isArray(stateB.transactions) ? stateB.transactions : [];

  const demoCleared =
    Boolean(stateA.demoCleared) ||
    Boolean(stateB.demoCleared) ||
    (txsA.some((t) => t.isDemo) && txsB.length > 0 && !txsB.some((t) => t.isDemo)) ||
    (txsB.some((t) => t.isDemo) && txsA.length > 0 && !txsA.some((t) => t.isDemo));

  // 2. Unir transacciones por ID respetando eliminados y ediciones más recientes
  const txMap = new Map();
  for (const tx of [...txsA, ...txsB]) {
    if (!tx || !tx.id) continue;
    if (deletedTransactionIds[tx.id]) continue;
    if (demoCleared && tx.isDemo) continue;

    const existing = txMap.get(tx.id);
    if (!existing) {
      txMap.set(tx.id, tx);
    } else {
      const stampExisting = String(existing.updatedAt || existing.createdAt || '');
      const stampCandidate = String(tx.updatedAt || tx.createdAt || '');
      if (stampCandidate >= stampExisting || (tx.reconciled && !existing.reconciled)) {
        txMap.set(tx.id, tx);
      }
    }
  }

  const mergedTransactions = Array.from(txMap.values()).sort(
    (a, b) =>
      String(b.date || '').localeCompare(String(a.date || '')) ||
      String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
  );

  // 3. Unir contactos aprendidos
  const learnedContacts = {
    ...(stateA.learnedContacts || {}),
    ...(stateB.learnedContacts || {})
  };

  // 4. Unir presupuestos mensuales
  const monthlyBudgets = { ...(stateA.monthlyBudgets || {}) };
  for (const [ym, cfgB] of Object.entries(stateB.monthlyBudgets || {})) {
    const cfgA = monthlyBudgets[ym];
    if (!cfgA) {
      monthlyBudgets[ym] = cfgB;
    } else {
      const uA = String(cfgA.updatedAt || '');
      const uB = String(cfgB.updatedAt || '');
      if (uB >= uA) {
        monthlyBudgets[ym] = cfgB;
      }
    }
  }

  // 5. Unir plantillas de gastos fijos
  const tplMap = new Map();
  for (const tpl of [...(stateA.fixedTemplates || []), ...(stateB.fixedTemplates || [])]) {
    if (tpl && tpl.id) tplMap.set(tpl.id, tpl);
  }

  // 6. Unir credenciales compartidas en red familiar (Google Sheets + Gemini API Key)
  const sharedIntegrations = {
    googleSheetsWebhookUrl:
      stateB.sharedIntegrations?.googleSheetsWebhookUrl ||
      stateA.sharedIntegrations?.googleSheetsWebhookUrl ||
      '',
    geminiApiKey:
      stateB.sharedIntegrations?.geminiApiKey ||
      stateA.sharedIntegrations?.geminiApiKey ||
      ''
  };

  // Sincronizar hacia userPrefs locales si llegaron credenciales desde el otro dispositivo
  const prefs = loadUserPrefs();
  let prefsChanged = false;
  if (sharedIntegrations.googleSheetsWebhookUrl && !prefs.googleSheetsWebhookUrl) {
    prefs.googleSheetsWebhookUrl = sharedIntegrations.googleSheetsWebhookUrl;
    prefsChanged = true;
  }
  if (sharedIntegrations.geminiApiKey && !prefs.geminiApiKey) {
    prefs.geminiApiKey = sharedIntegrations.geminiApiKey;
    prefsChanged = true;
  }
  if (prefsChanged) {
    saveUserPrefs(prefs);
  }

  const latestStamp =
    String(stateB.lastUpdated || '') >= String(stateA.lastUpdated || '')
      ? stateB.lastUpdated
      : stateA.lastUpdated;

  return ensureMonthBudget(
    {
      ...stateA,
      ...stateB,
      version: 3,
      familyConfig: stateB.familyConfig || stateA.familyConfig,
      categories: stateB.categories || stateA.categories || DEFAULT_CATEGORIES,
      monthlyBudgets,
      fixedTemplates: Array.from(tplMap.values()),
      transactions: mergedTransactions,
      deletedTransactionIds,
      learnedContacts,
      sharedIntegrations,
      demoCleared,
      lastUpdated: latestStamp || new Date().toISOString()
    },
    getCurrentYearMonth()
  );
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const initial = createDefaultState();
      saveState(initial, { skipCloudSync: true });
      return initial;
    }
    const parsed = JSON.parse(raw);
    if (!parsed.learnedContacts) parsed.learnedContacts = {};
    if (!parsed.deletedTransactionIds) parsed.deletedTransactionIds = {};
    if (!parsed.sharedIntegrations) {
      const prefs = loadUserPrefs();
      parsed.sharedIntegrations = {
        googleSheetsWebhookUrl: prefs.googleSheetsWebhookUrl || '',
        geminiApiKey: prefs.geminiApiKey || ''
      };
    }
    return ensureMonthBudget(parsed, getCurrentYearMonth());
  } catch (err) {
    console.error('Error cargando estado local:', err);
    return createDefaultState();
  }
}

export function ensureMonthBudget(state, ym) {
  if (!state.monthlyBudgets) state.monthlyBudgets = {};
  if (!state.monthlyBudgets[ym]) {
    const categories = {};
    (state.categories || DEFAULT_CATEGORIES).forEach((cat) => {
      categories[cat.id] = cat.defaultBudget || 50000;
    });
    state.monthlyBudgets[ym] = {
      incomeTarget: state.familyConfig?.monthlyIncomeTarget || 2350000,
      savingsGoal: state.familyConfig?.monthlySavingsGoal || 250000,
      categories,
      updatedAt: new Date().toISOString()
    };
  }
  return state;
}

export function saveState(state, options = {}) {
  state.lastUpdated = new Date().toISOString();
  const prefs = loadUserPrefs();
  if (!state.sharedIntegrations) state.sharedIntegrations = {};
  if (prefs.googleSheetsWebhookUrl) {
    state.sharedIntegrations.googleSheetsWebhookUrl = prefs.googleSheetsWebhookUrl;
  }
  if (prefs.geminiApiKey) {
    state.sharedIntegrations.geminiApiKey = prefs.geminiApiKey;
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.error('Error guardando en localStorage:', err);
  }

  if (!options.skipLocalServerSync) {
    fetch('/api/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload: state })
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        if (res && res.status === 'ok' && res.payload) {
          const merged = mergeFamilyStates(state, res.payload);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
        }
      })
      .catch(() => {});
  }

  if (!options.skipCloudSync) {
    if (prefs.googleSheetsWebhookUrl) {
      pushStateToGoogleSheets(state, prefs.googleSheetsWebhookUrl).catch((e) =>
        console.warn('No se pudo sincronizar en segundo plano con Google Sheets:', e)
      );
    }
  }
  return state;
}

/**
 * Sincroniza y fusiona determinísticamente el estado con el servidor WiFi local (/api/state).
 */
export async function syncFromLocalWifiServer(currentState) {
  try {
    const resp = await fetch(`/api/state?t=${Date.now()}`);
    if (!resp.ok) return null;
    const data = await resp.json();
    if (data.status === 'ok' && data.payload && Array.isArray(data.payload.transactions)) {
      const merged = mergeFamilyStates(currentState, data.payload);
      const currentJson = JSON.stringify(currentState?.transactions || []);
      const serverJson = JSON.stringify(data.payload?.transactions || []);
      const mergedJson = JSON.stringify(merged.transactions || []);

      // Guardar en localStorage sin disparar bucle infinito
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));

      // Si nuestra fusión local aportó transacciones que el servidor aún no tenía, enviárselas
      if (mergedJson !== serverJson) {
        fetch('/api/state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ payload: merged })
        }).catch(() => {});
      }

      const prefs = loadUserPrefs();
      prefs.lastSyncAt = new Date().toISOString();
      prefs.lastSyncStatus = 'wifi_ok';
      saveUserPrefs(prefs);

      return {
        state: merged,
        changed:
          mergedJson !== currentJson ||
          JSON.stringify(merged.learnedContacts) !== JSON.stringify(currentState?.learnedContacts) ||
          JSON.stringify(merged.monthlyBudgets) !== JSON.stringify(currentState?.monthlyBudgets),
        localIp: data.localIp
      };
    } else if (data.status === 'empty' && currentState) {
      saveState(currentState, { skipCloudSync: true });
      return { state: currentState, changed: false, localIp: data.localIp };
    }
  } catch {
    // Si no está corriendo server.py, continúa operando 100% normal en modo local / Google Sheets
  }
  return null;
}

export function loadUserPrefs() {
  try {
    const raw = localStorage.getItem(USER_PREFS_KEY);
    if (!raw) {
      return {
        activeAuthor: 'el',
        defaultPaymentMethod: 'cmr_falabella',
        theme: 'light',
        googleSheetsWebhookUrl: '',
        geminiApiKey: '',
        lastSyncAt: null,
        lastSyncStatus: 'local'
      };
    }
    const parsed = JSON.parse(raw);
    if (!parsed.theme) parsed.theme = 'light';
    return parsed;
  } catch {
    return {
      activeAuthor: 'el',
      defaultPaymentMethod: 'cmr_falabella',
      theme: 'light',
      googleSheetsWebhookUrl: '',
      geminiApiKey: '',
      lastSyncAt: null,
      lastSyncStatus: 'local'
    };
  }
}

export function saveUserPrefs(prefs) {
  localStorage.setItem(USER_PREFS_KEY, JSON.stringify(prefs));
  return prefs;
}

export async function pushStateToGoogleSheets(state, webhookUrl) {
  if (!webhookUrl || !webhookUrl.startsWith('https://script.google.com/')) {
    throw new Error('URL de Google Apps Script inválida.');
  }

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8'
    },
    body: JSON.stringify({
      action: 'SYNC_UP',
      payload: state
    }),
    redirect: 'follow'
  });

  if (!response.ok) {
    throw new Error(`Error HTTP ${response.status} al sincronizar con Google Sheets`);
  }

  const data = await response.json();
  const prefs = loadUserPrefs();
  prefs.lastSyncAt = new Date().toISOString();
  prefs.lastSyncStatus = 'synced';
  saveUserPrefs(prefs);
  return data;
}

export async function pullStateFromGoogleSheets(webhookUrl, currentState = null) {
  if (!webhookUrl || !webhookUrl.startsWith('https://script.google.com/')) {
    throw new Error('URL de Google Apps Script inválida.');
  }

  const url = `${webhookUrl}${webhookUrl.includes('?') ? '&' : '?'}action=SYNC_DOWN&t=${Date.now()}`;
  const response = await fetch(url, {
    method: 'GET',
    redirect: 'follow'
  });

  if (!response.ok) {
    throw new Error(`Error HTTP ${response.status} al descargar de Google Sheets`);
  }

  const result = await response.json();
  if (result && result.status === 'ok' && result.payload && Array.isArray(result.payload.transactions)) {
    const base = currentState || loadState();
    const mergedState = mergeFamilyStates(base, result.payload);
    saveState(mergedState, { skipCloudSync: true });
    const prefs = loadUserPrefs();
    prefs.lastSyncAt = new Date().toISOString();
    prefs.lastSyncStatus = 'synced';
    saveUserPrefs(prefs);
    return mergedState;
  }
  return null;
}
