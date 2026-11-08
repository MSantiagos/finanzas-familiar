import {
  DEFAULT_CATEGORIES,
  DEFAULT_FIXED_TEMPLATE
} from '../data/defaults.js';

export const STORAGE_KEY = 'finanzas_familiar_state_v1';
export const USER_PREFS_KEY = 'finanzas_familiar_prefs_v1';
export const PENDING_SYNC_KEY = 'finanzas_familiar_pending_sync_v1';

const DEFAULT_FIXED_ORDER = [
  'fix_arriendo',
  'fix_gGCC',
  'fix_luz',
  'fix_agua',
  'fix_gas',
  'fix_internet',
  'fix_suscripciones'
];

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
  const nowISO = new Date().toISOString();
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
      monthlySavingsGoal: 250000,
      updatedAt: nowISO
    },
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
    monthlyBudgets: {
      [ym]: {
        incomeTarget: 2350000,
        savingsGoal: 250000,
        categories: { ...budgetsByCategory },
        updatedAt: nowISO
      }
    },
    fixedTemplates: DEFAULT_FIXED_TEMPLATE.map((t) => ({ ...t })),
    annualSubscriptions: [],
    deletedAnnualSubscriptionIds: {},
    transactions: buildInitialSampleTransactions(ym),
    deletedTransactionIds: {},
    patrimonyItems: [],
    deletedPatrimonyIds: {},
    learnedContacts: {},
    sharedIntegrations: {
      googleSheetsWebhookUrl: '',
      geminiApiKey: ''
    },
    demoCleared: false,
    lastUpdated: nowISO
  };
}

function mergeTwoTransactions(prev, cand) {
  const prevStamp = String(prev.updatedAt || prev.createdAt || '');
  const candStamp = String(cand.updatedAt || cand.createdAt || '');
  const prevRec = Boolean(prev.reconciled);
  const candRec = Boolean(cand.reconciled);

  let winner;
  let loser;
  if (candStamp > prevStamp) {
    winner = cand;
    loser = prev;
  } else if (prevStamp > candStamp) {
    winner = prev;
    loser = cand;
  } else {
    if (prevRec && !candRec) {
      winner = prev;
      loser = cand;
    } else {
      winner = cand;
      loser = prev;
    }
  }

  const mergedTx = { ...loser, ...winner };
  if (prevRec || candRec) {
    mergedTx.reconciled = true;
    const fp = winner.bankFingerprint || loser.bankFingerprint;
    if (fp) {
      mergedTx.bankFingerprint = fp;
    }
  }
  return mergedTx;
}

/**
 * Fusiona de manera determinista, idempotente y conmutativa dos estados familiares (CRDT-Lite por ID + Tombstones).
 * Garantiza que si Mauricio y Marie registran gastos al mismo tiempo en sus iPhones,
 * ningún movimiento se pierda ni sobrescriba al otro.
 */
export function mergeFamilyStates(stateA, stateB) {
  if (!stateA || typeof stateA !== 'object') return stateB;
  if (!stateB || typeof stateB !== 'object') return stateA;

  // 1. Unir mapa de IDs eliminados (tombstones) conservando el timestamp más reciente
  const deletedTransactionIds = { ...(stateA.deletedTransactionIds || {}) };
  for (const [txId, delTs] of Object.entries(stateB.deletedTransactionIds || {})) {
    const prevTs = String(deletedTransactionIds[txId] || '');
    if (!prevTs || String(delTs) >= prevTs) {
      deletedTransactionIds[txId] = delTs;
    }
  }

  const txsA = Array.isArray(stateA.transactions) ? stateA.transactions : [];
  const txsB = Array.isArray(stateB.transactions) ? stateB.transactions : [];

  const hasDemoA = txsA.some((t) => Boolean(t && t.isDemo));
  const hasDemoB = txsB.some((t) => Boolean(t && t.isDemo));

  const demoCleared =
    Boolean(stateA.demoCleared) ||
    Boolean(stateB.demoCleared) ||
    (hasDemoA && Array.isArray(stateB.transactions) && !hasDemoB) ||
    (hasDemoB && Array.isArray(stateA.transactions) && !hasDemoA);

  // 2. Unir transacciones por ID respetando eliminados, ediciones más recientes y preservación de reconciled
  const txMap = new Map();
  for (const tx of [...txsA, ...txsB]) {
    if (!tx || !tx.id) continue;
    if (deletedTransactionIds[tx.id]) continue;
    if (demoCleared && tx.isDemo) continue;

    const existing = txMap.get(tx.id);
    if (!existing) {
      txMap.set(tx.id, { ...tx });
    } else {
      txMap.set(tx.id, mergeTwoTransactions(existing, tx));
    }
  }

  const mergedTransactions = Array.from(txMap.values()).sort(
    (a, b) =>
      String(b.date || '').localeCompare(String(a.date || '')) ||
      String(b.createdAt || '').localeCompare(String(a.createdAt || '')) ||
      String(b.id || '').localeCompare(String(a.id || ''))
  );

  // 3. Unir contactos aprendidos
  const learnedContacts = { ...(stateA.learnedContacts || {}) };
  for (const [ck, cval] of Object.entries(stateB.learnedContacts || {})) {
    const prevC = learnedContacts[ck];
    if (!prevC || typeof prevC !== 'object' || typeof cval !== 'object') {
      learnedContacts[ck] = cval;
    } else {
      const uA = String(prevC.updatedAt || '');
      const uB = String(cval.updatedAt || '');
      if (uB >= uA) {
        learnedContacts[ck] = cval;
      }
    }
  }

  // 4. Unir presupuestos mensuales por updatedAt (conservando unión de categorías)
  const monthlyBudgets = { ...(stateA.monthlyBudgets || {}) };
  for (const [ym, cfgB] of Object.entries(stateB.monthlyBudgets || {})) {
    if (!cfgB || typeof cfgB !== 'object') continue;
    const cfgA = monthlyBudgets[ym];
    if (!cfgA || typeof cfgA !== 'object') {
      monthlyBudgets[ym] = cfgB;
    } else {
      const uA = String(cfgA.updatedAt || '');
      const uB = String(cfgB.updatedAt || '');
      const lockUA = String(cfgA.lockedCategoriesUpdatedAt || cfgA.updatedAt || '');
      const lockUB = String(cfgB.lockedCategoriesUpdatedAt || cfgB.updatedAt || '');

      let mergedLocks;
      let mergedLocksUpdatedAt;
      if (lockUB > lockUA) {
        mergedLocks = { ...(cfgB.lockedCategories || {}) };
        mergedLocksUpdatedAt = cfgB.lockedCategoriesUpdatedAt || cfgB.updatedAt || '';
      } else if (lockUA > lockUB) {
        mergedLocks = { ...(cfgA.lockedCategories || {}) };
        mergedLocksUpdatedAt = cfgA.lockedCategoriesUpdatedAt || cfgA.updatedAt || '';
      } else {
        mergedLocks = {
          ...(cfgB.lockedCategories || {}),
          ...(cfgA.lockedCategories || {})
        };
        mergedLocksUpdatedAt = cfgA.lockedCategoriesUpdatedAt || cfgB.lockedCategoriesUpdatedAt || uA || uB;
      }

      if (uB > uA) {
        monthlyBudgets[ym] = {
          ...cfgA,
          ...cfgB,
          categories: {
            ...(cfgA.categories || {}),
            ...(cfgB.categories || {})
          },
          lockedCategories: mergedLocks,
          lockedCategoriesUpdatedAt: mergedLocksUpdatedAt
        };
      } else {
        monthlyBudgets[ym] = {
          ...cfgB,
          ...cfgA,
          categories: {
            ...(cfgB.categories || {}),
            ...(cfgA.categories || {})
          },
          lockedCategories: mergedLocks,
          lockedCategoriesUpdatedAt: mergedLocksUpdatedAt
        };
      }
    }
  }

  // 5. Unir plantillas de gastos fijos por ID y ordenar de forma determinista
  const tplMap = new Map();
  for (const tpl of [...(stateA.fixedTemplates || []), ...(stateB.fixedTemplates || [])]) {
    if (!tpl || !tpl.id) continue;
    const normalizedTpl =
      tpl.id === 'fix_suscripciones' && tpl.categoryId === 'gustos_personales'
        ? { ...tpl, categoryId: 'suscripciones' }
        : tpl;
    const prevTpl = tplMap.get(normalizedTpl.id);
    if (!prevTpl) {
      tplMap.set(normalizedTpl.id, normalizedTpl);
    } else {
      const uA = String(prevTpl.updatedAt || '');
      const uB = String(normalizedTpl.updatedAt || '');
      if (uB >= uA) {
        tplMap.set(normalizedTpl.id, normalizedTpl);
      }
    }
  }

  const mergedTemplates = Array.from(tplMap.values()).sort((a, b) => {
    const idxA = DEFAULT_FIXED_ORDER.indexOf(a.id);
    const idxB = DEFAULT_FIXED_ORDER.indexOf(b.id);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return String(a.id || '').localeCompare(String(b.id || ''));
  });

  // 5b. Unir Bóveda de Patrimonio Intocable (patrimonyItems + deletedPatrimonyIds)
  const deletedPatrimonyIds = { ...(stateA.deletedPatrimonyIds || {}) };
  for (const [pId, delTs] of Object.entries(stateB.deletedPatrimonyIds || {})) {
    const prevTs = String(deletedPatrimonyIds[pId] || '');
    if (!prevTs || String(delTs) >= prevTs) {
      deletedPatrimonyIds[pId] = delTs;
    }
  }

  const patMap = new Map();
  for (const item of [...(stateA.patrimonyItems || []), ...(stateB.patrimonyItems || [])]) {
    if (!item || !item.id) continue;
    if (deletedPatrimonyIds[item.id]) continue;
    const prevItem = patMap.get(item.id);
    if (!prevItem) {
      patMap.set(item.id, { ...item });
    } else {
      const uA = String(prevItem.updatedAt || prevItem.createdAt || '');
      const uB = String(item.updatedAt || item.createdAt || '');
      if (uB >= uA) {
        patMap.set(item.id, { ...prevItem, ...item });
      }
    }
  }

  const mergedPatrimonyItems = Array.from(patMap.values()).sort(
    (a, b) =>
      Number(b.amount || 0) - Number(a.amount || 0) ||
      String(a.id || '').localeCompare(String(b.id || ''))
  );

  // 5c. Unir familyConfig por updatedAt para evitar que valores por defecto pisen cambios reales
  let mergedFamilyConfig = stateB.familyConfig || stateA.familyConfig;
  if (stateA.familyConfig && stateB.familyConfig) {
    const fcUA = String(stateA.familyConfig.updatedAt || '');
    const fcUB = String(stateB.familyConfig.updatedAt || '');
    if (fcUA && fcUB) {
      mergedFamilyConfig = fcUB >= fcUA ? stateB.familyConfig : stateA.familyConfig;
    } else if (fcUA && !fcUB) {
      mergedFamilyConfig = stateA.familyConfig;
    } else {
      mergedFamilyConfig = stateB.familyConfig;
    }
  }

  // 5d. Unir Suscripciones Anuales Dinámicas (annualSubscriptions + deletedAnnualSubscriptionIds)
  const deletedAnnualSubscriptionIds = { ...(stateA.deletedAnnualSubscriptionIds || {}) };
  for (const [subId, delTs] of Object.entries(stateB.deletedAnnualSubscriptionIds || {})) {
    const prevTs = String(deletedAnnualSubscriptionIds[subId] || '');
    if (!prevTs || String(delTs) >= prevTs) {
      deletedAnnualSubscriptionIds[subId] = delTs;
    }
  }

  const annualSubMap = new Map();
  for (const sub of [...(stateA.annualSubscriptions || []), ...(stateB.annualSubscriptions || [])]) {
    if (!sub || !sub.id) continue;
    if (deletedAnnualSubscriptionIds[sub.id]) continue;
    const prevSub = annualSubMap.get(sub.id);
    if (!prevSub) {
      annualSubMap.set(sub.id, { ...sub });
    } else {
      const uA = String(prevSub.updatedAt || prevSub.createdAt || '');
      const uB = String(sub.updatedAt || sub.createdAt || '');
      if (uB >= uA) {
        annualSubMap.set(sub.id, { ...prevSub, ...sub });
      }
    }
  }

  const mergedAnnualSubscriptions = Array.from(annualSubMap.values()).sort(
    (a, b) =>
      Number(a.billingMonth || 1) - Number(b.billingMonth || 1) ||
      String(a.name || '').localeCompare(String(b.name || '')) ||
      String(a.id || '').localeCompare(String(b.id || ''))
  );

  // 6. Unir credenciales compartidas en red familiar conservando claves no vacías
  const sharedIntegrations = {
    googleSheetsWebhookUrl: '',
    geminiApiKey: ''
  };
  for (const src of [stateA.sharedIntegrations || {}, stateB.sharedIntegrations || {}]) {
    if (src && typeof src === 'object') {
      for (const [k, v] of Object.entries(src)) {
        if (v !== undefined && v !== null && String(v).trim() !== '') {
          sharedIntegrations[k] = v;
        } else if (!(k in sharedIntegrations)) {
          sharedIntegrations[k] = v;
        }
      }
    }
  }
  if (sharedIntegrations.googleSheetsUrl && !sharedIntegrations.googleSheetsWebhookUrl) {
    sharedIntegrations.googleSheetsWebhookUrl = sharedIntegrations.googleSheetsUrl;
  }
  if (sharedIntegrations.googleSheetsWebhookUrl && !sharedIntegrations.googleSheetsUrl) {
    sharedIntegrations.googleSheetsUrl = sharedIntegrations.googleSheetsWebhookUrl;
  }

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

  const stampA = String(stateA.lastUpdated || '');
  const stampB = String(stateB.lastUpdated || '');
  const latestStamp = stampB >= stampA ? (stateB.lastUpdated || stateA.lastUpdated) : stateA.lastUpdated;
  const fallbackStamp = latestStamp || '1970-01-01T00:00:00.000Z';

  return ensureMonthBudget(
    {
      ...stateA,
      ...stateB,
      version: 3,
      familyConfig: mergedFamilyConfig,
      categories: stateB.categories || stateA.categories || DEFAULT_CATEGORIES,
      monthlyBudgets,
      fixedTemplates: mergedTemplates,
      annualSubscriptions: mergedAnnualSubscriptions,
      deletedAnnualSubscriptionIds,
      transactions: mergedTransactions,
      deletedTransactionIds,
      patrimonyItems: mergedPatrimonyItems,
      deletedPatrimonyIds,
      learnedContacts,
      sharedIntegrations,
      demoCleared,
      lastUpdated: fallbackStamp
    },
    getCurrentYearMonth(),
    fallbackStamp
  );
}

/**
 * Cola resiliente en localStorage para reintentar sincronización cuando vuelve la conexión.
 */
export function getPendingSyncQueue() {
  try {
    const raw = localStorage.getItem(PENDING_SYNC_KEY);
    if (!raw) {
      return { localWifi: false, googleSheets: false, updatedAt: null };
    }
    const parsed = JSON.parse(raw);
    return {
      localWifi: Boolean(parsed?.localWifi),
      googleSheets: Boolean(parsed?.googleSheets),
      updatedAt: parsed?.updatedAt || null
    };
  } catch {
    return { localWifi: false, googleSheets: false, updatedAt: null };
  }
}

export function markPendingSync(target = 'all') {
  try {
    const current = getPendingSyncQueue();
    const next = {
      localWifi: target === 'all' || target === 'localWifi' ? true : current.localWifi,
      googleSheets: target === 'all' || target === 'googleSheets' ? true : current.googleSheets,
      updatedAt: new Date().toISOString()
    };
    localStorage.setItem(PENDING_SYNC_KEY, JSON.stringify(next));
    return next;
  } catch {
    return { localWifi: true, googleSheets: true, updatedAt: null };
  }
}

export function clearPendingSync(target = 'all') {
  try {
    if (target === 'all') {
      localStorage.removeItem(PENDING_SYNC_KEY);
      return { localWifi: false, googleSheets: false, updatedAt: null };
    }
    const current = getPendingSyncQueue();
    const next = {
      localWifi: target === 'localWifi' ? false : current.localWifi,
      googleSheets: target === 'googleSheets' ? false : current.googleSheets,
      updatedAt: new Date().toISOString()
    };
    if (!next.localWifi && !next.googleSheets) {
      localStorage.removeItem(PENDING_SYNC_KEY);
      return { localWifi: false, googleSheets: false, updatedAt: null };
    }
    localStorage.setItem(PENDING_SYNC_KEY, JSON.stringify(next));
    return next;
  } catch {
    return { localWifi: false, googleSheets: false, updatedAt: null };
  }
}

export function hasPendingSync() {
  const q = getPendingSyncQueue();
  return Boolean(q.localWifi || q.googleSheets);
}

export async function flushPendingSyncQueue(currentState = null) {
  const queue = getPendingSyncQueue();
  let state = currentState || loadState();
  const prefs = loadUserPrefs();

  if (queue.localWifi) {
    try {
      const resp = await fetch('/api/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload: state })
      });
      if (resp && resp.ok) {
        const res = await resp.json();
        if (res && res.status === 'ok' && res.payload) {
          state = mergeFamilyStates(state, res.payload);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        }
        clearPendingSync('localWifi');
      }
    } catch {
      // Mantiene localWifi en cola hasta que vuelva la red
    }
  }

  if (queue.googleSheets) {
    const webhookUrl =
      prefs.googleSheetsWebhookUrl ||
      state.sharedIntegrations?.googleSheetsWebhookUrl ||
      state.sharedIntegrations?.googleSheetsUrl ||
      '';
    if (webhookUrl) {
      try {
        await pushStateToGoogleSheets(state, webhookUrl);
        clearPendingSync('googleSheets');
      } catch {
        // Mantiene googleSheets en cola hasta que vuelva la red
      }
    } else {
      clearPendingSync('googleSheets');
    }
  }

  return {
    flushed: !hasPendingSync(),
    state,
    pending: getPendingSyncQueue()
  };
}

export function setupAutoOnlineSync(onSyncCallback = null) {
  const target = typeof window !== 'undefined' ? window : globalThis;
  if (!target || typeof target.addEventListener !== 'function') {
    return () => {};
  }
  const handler = async () => {
    const result = await flushPendingSyncQueue();
    if (typeof onSyncCallback === 'function') {
      onSyncCallback(result);
    }
  };
  target.addEventListener('online', handler);
  return () => {
    if (typeof target.removeEventListener === 'function') {
      target.removeEventListener('online', handler);
    }
  };
}

function notifyAsyncStateMerged(mergedState, source = 'sync') {
  try {
    const target = typeof window !== 'undefined' ? window : null;
    if (target && typeof target.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
      target.dispatchEvent(
        new CustomEvent('finanzas:state-merged', {
          detail: { state: mergedState, source }
        })
      );
    }
  } catch {
    // Entorno sin DOM (Node tests)
  }
}

function stableStringify(val) {
  if (val === null || val === undefined || typeof val !== 'object') {
    return JSON.stringify(val);
  }
  if (Array.isArray(val)) {
    return `[${val.map((item) => stableStringify(item)).join(',')}]`;
  }
  const keys = Object.keys(val).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(val[k])}`).join(',')}}`;
}

export function hasSignificantStateDiff(stateA, stateB) {
  if (!stateA || !stateB) return true;
  if (Boolean(stateA.demoCleared) !== Boolean(stateB.demoCleared)) return true;
  if (stableStringify(stateA.transactions || []) !== stableStringify(stateB.transactions || [])) return true;
  if (stableStringify(stateA.deletedTransactionIds || {}) !== stableStringify(stateB.deletedTransactionIds || {})) return true;
  if (stableStringify(stateA.learnedContacts || {}) !== stableStringify(stateB.learnedContacts || {})) return true;
  if (stableStringify(stateA.categories || []) !== stableStringify(stateB.categories || [])) return true;
  if (stableStringify(stateA.monthlyBudgets || {}) !== stableStringify(stateB.monthlyBudgets || {})) return true;
  if (stableStringify(stateA.fixedTemplates || []) !== stableStringify(stateB.fixedTemplates || [])) return true;
  if (stableStringify(stateA.annualSubscriptions || []) !== stableStringify(stateB.annualSubscriptions || [])) return true;
  if (stableStringify(stateA.deletedAnnualSubscriptionIds || {}) !== stableStringify(stateB.deletedAnnualSubscriptionIds || {})) return true;
  if (stableStringify(stateA.patrimonyItems || []) !== stableStringify(stateB.patrimonyItems || [])) return true;
  if (stableStringify(stateA.deletedPatrimonyIds || {}) !== stableStringify(stateB.deletedPatrimonyIds || {})) return true;
  if (stableStringify(stateA.familyConfig || {}) !== stableStringify(stateB.familyConfig || {})) return true;
  return false;
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const initial = createDefaultState();
      saveState(initial, { skipCloudSync: true, skipLocalServerSync: true });
      return initial;
    }
    const parsed = JSON.parse(raw);
    if (!parsed.learnedContacts) parsed.learnedContacts = {};
    if (!parsed.deletedTransactionIds) parsed.deletedTransactionIds = {};
    if (!Array.isArray(parsed.annualSubscriptions)) parsed.annualSubscriptions = [];
    if (!parsed.deletedAnnualSubscriptionIds) parsed.deletedAnnualSubscriptionIds = {};
    if (!Array.isArray(parsed.patrimonyItems)) parsed.patrimonyItems = [];
    if (!parsed.deletedPatrimonyIds) parsed.deletedPatrimonyIds = {};
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

function normalizeCategoriesCatalog(rawCategories) {
  const byId = new Map();
  DEFAULT_CATEGORIES.forEach((defCat) => {
    byId.set(defCat.id, { ...defCat });
  });
  if (Array.isArray(rawCategories)) {
    rawCategories.forEach((cat) => {
      if (cat && cat.id) {
        const base = byId.get(cat.id) || {};
        byId.set(cat.id, { ...base, ...cat });
      }
    });
  }
  const canonicalIds = DEFAULT_CATEGORIES.map((c) => c.id);
  return Array.from(byId.values()).sort((a, b) => {
    const idxA = canonicalIds.indexOf(a.id);
    const idxB = canonicalIds.indexOf(b.id);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return String(a.id || '').localeCompare(String(b.id || ''));
  });
}

export function ensureMonthBudget(state, ym, defaultUpdatedAt = null) {
  state.categories = normalizeCategoriesCatalog(state.categories);

  if (Array.isArray(state.fixedTemplates)) {
    state.fixedTemplates = state.fixedTemplates.map((tpl) =>
      tpl && tpl.id === 'fix_suscripciones' && tpl.categoryId === 'gustos_personales'
        ? { ...tpl, categoryId: 'suscripciones' }
        : tpl
    );
  }

  if (!state.monthlyBudgets) state.monthlyBudgets = {};
  if (!Array.isArray(state.annualSubscriptions)) state.annualSubscriptions = [];
  if (!state.deletedAnnualSubscriptionIds) state.deletedAnnualSubscriptionIds = {};

  if (!state.monthlyBudgets[ym]) {
    const categories = {};
    state.categories.forEach((cat) => {
      categories[cat.id] = cat.defaultBudget !== undefined ? cat.defaultBudget : 50000;
    });
    state.monthlyBudgets[ym] = {
      incomeTarget: state.familyConfig?.monthlyIncomeTarget || 2350000,
      savingsGoal: state.familyConfig?.monthlySavingsGoal || 250000,
      categories,
      lockedCategories: {},
      updatedAt: defaultUpdatedAt || state.lastUpdated || new Date().toISOString()
    };
  }

  // Asegurar que todos los meses existentes tengan inicializadas las categorías nuevas (ej. gatos_mascotas, suscripciones, suscripciones_anuales)
  for (const [mKey, mCfg] of Object.entries(state.monthlyBudgets)) {
    if (mCfg && typeof mCfg === 'object') {
      if (!mCfg.categories || typeof mCfg.categories !== 'object') {
        mCfg.categories = {};
      }
      if (!mCfg.lockedCategories || typeof mCfg.lockedCategories !== 'object') {
        mCfg.lockedCategories = {};
      }
      state.categories.forEach((cat) => {
        if (mCfg.categories[cat.id] === undefined) {
          mCfg.categories[cat.id] = cat.defaultBudget !== undefined ? cat.defaultBudget : 50000;
        }
      });
      // Sincronizar monto dinámico del mes para suscripciones_anuales si corresponde
      const mParts = String(mKey || '').split('-');
      const mNum = Number(mParts[1] || 0);
      if (mNum >= 1 && mNum <= 12) {
        const dueAnnual = (state.annualSubscriptions || [])
          .filter((s) => s && s.active !== false && Number(s.billingMonth) === mNum)
          .reduce((acc, s) => acc + Math.max(0, Math.round(Number(s.amount) || 0)), 0);
        if (dueAnnual === 0 && Number(mCfg.categories.suscripciones_anuales || 0) === 50000) {
          mCfg.categories.suscripciones_anuales = 0;
        }
      }
    }
  }

  return state;
}

export function clearDemoTransactions(currentState = null, options = {}) {
  const state = currentState || loadState();
  if (!state.deletedTransactionIds) state.deletedTransactionIds = {};
  const nowISO = new Date().toISOString();
  (state.transactions || []).forEach((tx) => {
    if (tx && tx.isDemo && tx.id) {
      state.deletedTransactionIds[tx.id] = nowISO;
    }
  });
  state.transactions = (state.transactions || []).filter((tx) => !tx?.isDemo);
  state.demoCleared = true;
  return saveState(state, options);
}

export function resetToFactory(options = {}) {
  const prefs = loadUserPrefs();
  const fresh = createDefaultState();
  if (options.preserveIntegrations !== false) {
    fresh.sharedIntegrations = {
      googleSheetsWebhookUrl: prefs.googleSheetsWebhookUrl || '',
      geminiApiKey: prefs.geminiApiKey || ''
    };
  }
  if (options.clearDemo) {
    const nowISO = new Date().toISOString();
    fresh.transactions.forEach((tx) => {
      if (tx.isDemo) fresh.deletedTransactionIds[tx.id] = nowISO;
    });
    fresh.transactions = [];
    fresh.demoCleared = true;
  }
  clearPendingSync('all');
  return saveState(fresh, {
    skipCloudSync: options.skipCloudSync ?? true,
    skipLocalServerSync: options.skipLocalServerSync ?? true
  });
}

let lastLocalSaveTimeMs = 0;

export function saveState(state, options = {}) {
  lastLocalSaveTimeMs = Date.now();
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

  if (!options.skipLocalServerSync && typeof fetch === 'function') {
    fetch('/api/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload: state })
    })
      .then((r) => {
        if (!r || !r.ok) {
          markPendingSync('localWifi');
          return null;
        }
        return r.json();
      })
      .then((res) => {
        if (res && res.status === 'ok' && res.payload) {
          const latestLocal = loadState();
          const merged = mergeFamilyStates(latestLocal, res.payload);
          const changed = hasSignificantStateDiff(latestLocal, merged);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
          clearPendingSync('localWifi');
          if (changed) {
            notifyAsyncStateMerged(merged, 'localWifi');
          }
        }
      })
      .catch(() => {
        markPendingSync('localWifi');
      });
  }

  if (!options.skipCloudSync) {
    if (prefs.googleSheetsWebhookUrl) {
      pushStateToGoogleSheets(state, prefs.googleSheetsWebhookUrl).catch((e) => {
        markPendingSync('googleSheets');
        console.warn('No se pudo sincronizar en segundo plano con Google Sheets:', e);
      });
    }
  }
  return state;
}

/**
 * Sincroniza y fusiona determinísticamente el estado con el servidor WiFi local (/api/state).
 */
export async function syncFromLocalWifiServer(currentState) {
  if (Date.now() - lastLocalSaveTimeMs < 3500) {
    return null;
  }
  try {
    const resp = await fetch(`/api/state?t=${Date.now()}`);
    if (!resp.ok) {
      markPendingSync('localWifi');
      return null;
    }
    const data = await resp.json();
    if (data.status === 'ok' && data.payload && Array.isArray(data.payload.transactions)) {
      const baseLocal = loadState() || currentState;
      const merged = mergeFamilyStates(baseLocal, data.payload);
      const changedVsLocal = hasSignificantStateDiff(baseLocal, merged);
      const changedVsServer = hasSignificantStateDiff(data.payload, merged);

      // Guardar en localStorage sin disparar bucle infinito
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      clearPendingSync('localWifi');

      // Si nuestra fusión local aportó cambios que el servidor aún no tenía, enviárselos
      if (changedVsServer) {
        fetch('/api/state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ payload: merged })
        }).catch(() => {
          markPendingSync('localWifi');
        });
      }

      const prefs = loadUserPrefs();
      prefs.lastSyncAt = new Date().toISOString();
      prefs.lastSyncStatus = 'wifi_ok';
      saveUserPrefs(prefs);

      return {
        state: merged,
        changed: changedVsLocal,
        localIp: data.localIp
      };
    } else if (data.status === 'empty' && currentState) {
      saveState(currentState, { skipCloudSync: true });
      return { state: currentState, changed: false, localIp: data.localIp };
    }
  } catch {
    // Si no está corriendo server.py, marca pendiente y continúa operando 100% normal en modo local / Google Sheets
    markPendingSync('localWifi');
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

  let response;
  try {
    response = await fetch(webhookUrl, {
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
  } catch (netErr) {
    markPendingSync('googleSheets');
    throw netErr;
  }

  if (!response.ok) {
    markPendingSync('googleSheets');
    throw new Error(`Error HTTP ${response.status} al sincronizar con Google Sheets`);
  }

  const data = await response.json();
  if (data && data.status === 'ok' && data.payload) {
    const latestLocal = loadState() || state;
    const merged = mergeFamilyStates(latestLocal, data.payload);
    const changed = hasSignificantStateDiff(latestLocal, merged);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    if (changed) {
      notifyAsyncStateMerged(merged, 'googleSheets');
    }
  }
  clearPendingSync('googleSheets');
  const prefs = loadUserPrefs();
  prefs.lastSyncAt = new Date().toISOString();
  prefs.lastSyncStatus = 'synced';
  saveUserPrefs(prefs);
  return data;
}

export async function syncFromCloudGoogleSheets(currentState) {
  if (Date.now() - lastLocalSaveTimeMs < 5000) {
    return null;
  }
  const prefs = loadUserPrefs();
  const webhookUrl =
    prefs.googleSheetsWebhookUrl || currentState?.sharedIntegrations?.googleSheetsWebhookUrl || '';
  if (!webhookUrl || !webhookUrl.startsWith('https://script.google.com/')) {
    return null;
  }

  try {
    const url = `${webhookUrl}${webhookUrl.includes('?') ? '&' : '?'}action=SYNC_DOWN&t=${Date.now()}`;
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow'
    });
    if (!response.ok) return null;

    const result = await response.json();
    if (result && result.status === 'ok' && result.payload && Array.isArray(result.payload.transactions)) {
      const baseLocal = loadState() || currentState;
      const merged = mergeFamilyStates(baseLocal, result.payload);
      const changedVsLocal = hasSignificantStateDiff(baseLocal, merged);
      const changedVsRemote = hasSignificantStateDiff(result.payload, merged);

      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      clearPendingSync('googleSheets');

      if (changedVsRemote) {
        pushStateToGoogleSheets(merged, webhookUrl).catch(() => {});
      }

      const latestPrefs = loadUserPrefs();
      latestPrefs.lastSyncAt = new Date().toISOString();
      latestPrefs.lastSyncStatus = 'synced';
      saveUserPrefs(latestPrefs);

      return {
        state: merged,
        changed: changedVsLocal
      };
    } else if (result && result.status === 'empty' && currentState) {
      await pushStateToGoogleSheets(currentState, webhookUrl).catch(() => {});
      return { state: currentState, changed: false };
    }
  } catch {
    markPendingSync('googleSheets');
  }
  return null;
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
    saveState(mergedState, { skipCloudSync: true, skipLocalServerSync: true });
    clearPendingSync('googleSheets');
    const prefs = loadUserPrefs();
    prefs.lastSyncAt = new Date().toISOString();
    prefs.lastSyncStatus = 'synced';
    saveUserPrefs(prefs);
    return mergedState;
  }
  return null;
}

export function exportStateToJsonString(state = null) {
  const effective = state || loadState();
  return JSON.stringify(effective, null, 2);
}

export function importStateFromJsonString(rawJson, currentState = null) {
  if (!rawJson || !String(rawJson).trim()) {
    throw new Error('El archivo JSON está vacío.');
  }
  let parsed;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error('El archivo seleccionado no es un JSON válido.');
  }
  const incoming = parsed?.payload && typeof parsed.payload === 'object' ? parsed.payload : parsed;
  if (!incoming || typeof incoming !== 'object' || !Array.isArray(incoming.transactions)) {
    throw new Error('El respaldo JSON no contiene una estructura válida de Finanzas Familiar.');
  }
  const base = currentState || loadState();
  const merged = mergeFamilyStates(base, incoming);
  return saveState(merged);
}
