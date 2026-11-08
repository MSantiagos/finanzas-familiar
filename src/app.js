import {
  PAYMENT_METHODS,
  SAMPLE_BANK_STATEMENT_TEXT
} from './data/defaults.js?v=14';
import {
  loadState,
  saveState,
  loadUserPrefs,
  saveUserPrefs,
  ensureMonthBudget,
  getCurrentYearMonth,
  getTodayISO,
  pushStateToGoogleSheets,
  pullStateFromGoogleSheets,
  syncFromLocalWifiServer,
  syncFromCloudGoogleSheets,
  setupAutoOnlineSync,
  exportStateToJsonString,
  importStateFromJsonString
} from './services/storage.js?v=14';
import {
  parseBankStatementText,
  reconcileStatementRows,
  cleanChileanAmount,
  formatLiveCLPInput,
  normalizeContactKey,
  extractContactDisplayName
} from './services/reconciler.js?v=14';
import {
  scanReceiptWithGemini,
  classifyStatementRowsWithGemini,
  getDemoScannedReceipt,
  generateMonthlyFamilyAuditWithGemini
} from './services/geminiScanner.js?v=14';
import { exportStateToExcel } from './services/excelExport.js?v=14';
import {
  parseQuickNaturalExpense,
  buildInstallmentTransactions,
  getQuickPresetsForAuthor
} from './services/smartInput.js?v=14';
import {
  calculateMonthlyFinancialSummary,
  calculateBurnRateAndProjection,
  calculateLoansLedger,
  calculatePatrimonySummary,
  filterTransactions,
  calculateFilteredTransactionsTotals,
  generateInstantFamilyDiagnosis,
  detectAntExpensesAndSubscriptions,
  calculateMultiMonthComparison,
  clonePreviousMonthBudget,
  distributeBudgetProportionally,
  buildCoupleWhatsAppMessages
} from './domain/financialEngine.js?v=14';

// Estado global en memoria de la aplicación
let appState = loadState();
let userPrefs = loadUserPrefs();

function extractWebhookUrl(rawInput) {
  const trimmed = String(rawInput || '').trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    const embeddedSync = parsed.searchParams.get('sync');
    if (embeddedSync && embeddedSync.startsWith('https://script.google.com/')) {
      return embeddedSync.trim();
    }
  } catch {}
  return trimmed;
}

function applyMagicLinkFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const syncParam = extractWebhookUrl(params.get('sync') || '');
    const geminiParam = (params.get('gemini') || '').trim();
    const authorParam = (params.get('author') || params.get('user') || '').trim().toLowerCase();

    let prefsChanged = false;
    let stateChanged = false;

    if (syncParam && syncParam.startsWith('https://script.google.com/')) {
      userPrefs.googleSheetsWebhookUrl = syncParam;
      if (!appState.sharedIntegrations) appState.sharedIntegrations = {};
      appState.sharedIntegrations.googleSheetsWebhookUrl = syncParam;
      prefsChanged = true;
      stateChanged = true;
    }

    if (geminiParam) {
      userPrefs.geminiApiKey = geminiParam;
      if (!appState.sharedIntegrations) appState.sharedIntegrations = {};
      appState.sharedIntegrations.geminiApiKey = geminiParam;
      prefsChanged = true;
      stateChanged = true;
    }

    if (authorParam === 'ella' || authorParam === 'marie') {
      userPrefs.activeAuthor = 'ella';
      userPrefs.defaultPaymentMethod = 'cuenta_mujer';
      prefsChanged = true;
    } else if (authorParam === 'el' || authorParam === 'mauricio') {
      userPrefs.activeAuthor = 'el';
      userPrefs.defaultPaymentMethod = 'cmr_falabella';
      prefsChanged = true;
    }

    if (prefsChanged) saveUserPrefs(userPrefs);
    if (stateChanged) saveState(appState, { skipCloudSync: true, skipLocalServerSync: true });
  } catch (e) {
    console.warn('No se pudo leer parámetros del Link Mágico:', e);
  }
}

applyMagicLinkFromUrl();

function getPublicOnlineBaseUrl() {
  if (window.location.hostname.endsWith('github.io')) {
    return window.location.origin + window.location.pathname;
  }
  return 'https://msantiagos.github.io/finanzas-familiar/';
}

function buildMagicInstallLink(targetAuthor = 'ella') {
  const baseUrl = getPublicOnlineBaseUrl();
  const url = new URL(baseUrl);
  url.searchParams.set('author', targetAuthor === 'ella' ? 'ella' : 'el');
  const webhook =
    userPrefs.googleSheetsWebhookUrl || appState.sharedIntegrations?.googleSheetsWebhookUrl || '';
  const geminiKey =
    userPrefs.geminiApiKey || appState.sharedIntegrations?.geminiApiKey || '';
  if (webhook) url.searchParams.set('sync', webhook);
  if (geminiKey) url.searchParams.set('gemini', geminiKey);
  return url.toString();
}
let activeTab = 'register'; // 'register' | 'budget' | 'fixed' | 'reconcile' | 'cloud'
let registerMode = 'quick'; // 'quick' | 'split' | 'internal'
let internalSubTab = 'wife'; // 'wife' | 'cmr' | 'income' | 'loans'
let activeYearMonth = getCurrentYearMonth();
let detectedLocalIp = '192.168.100.84';
let pendingSyncRender = false;

// Estado de edición rápida en modal (1 toque) y último borrado para "Deshacer"
let editingTxId = null;
let lastDeletedTx = null;
let lastDeletedBatch = null;

// Estado de la Bóveda de Patrimonio Intocable & Cripto (pestaña Presupuestos)
let isAddingPatrimonyItem = false;
let editingPatrimonyId = null;

// Estado del buscador y filtros instantáneos del historial de movimientos
let txFilterState = {
  searchQuery: '',
  paymentMethod: 'all', // 'all' | 'cmr_falabella' | 'bch_all' | 'cuenta_mujer' | 'efectivo'
  author: 'all', // 'all' | 'el' | 'ella'
  reconciledStatus: 'all', // 'all' | 'pending' | 'reconciled'
  categoryId: 'all'
};

// Estado del Diagnóstico Ejecutivo Familiar (0 ms + enriquecimiento opcional con Gemini IA)
let diagnosisState = {
  isOpen: false,
  isLoadingAI: false,
  aiAuditResult: null,
  aiAuditMonth: null,
  aiError: ''
};

// Estado del formulario de Gasto Rápido (5 segundos)
let quickForm = {
  amount: '',
  categoryId: 'supermercado',
  paymentMethod: userPrefs.defaultPaymentMethod || 'cmr_falabella',
  author: userPrefs.activeAuthor || 'el',
  installments: 1,
  isSharedBill: false,
  myRealShare: '',
  date: getTodayISO(),
  note: '',
  naturalInputText: ''
};

// Estado del divisor de boletas (manual + IA)
let splitForm = {
  merchant: '',
  date: getTodayISO(),
  totalAmount: 0,
  paymentMethod: 'cmr_falabella',
  isScanning: false,
  scanError: '',
  splits: [
    { categoryId: 'supermercado', amount: 0, summary: 'Compra general supermercado' },
    { categoryId: 'hija', amount: 0, summary: 'Pañales / cosas hija' }
  ]
};

// Estado del Conciliador Antiduplicados con sub-filtros inteligentes
let reconcileState = {
  rawText: '',
  defaultSourceMethod: 'cmr_falabella',
  analyzedRows: null,
  filterTab: 'review' // 'review' | 'internal' | 'matched' | 'all'
};

let isEditingBudgets = false;

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
}

function addMonthsToISO(dateISO, monthsOffset) {
  const [y, m, d] = String(dateISO).split('-').map(Number);
  const dt = new Date(y, (m - 1) + monthsOffset, Math.min(d || 15, 28));
  const ny = dt.getFullYear();
  const nm = String(dt.getMonth() + 1).padStart(2, '0');
  const nd = String(dt.getDate()).padStart(2, '0');
  return `${ny}-${nm}-${nd}`;
}

export function formatCLP(value) {
  const num = Math.round(Number(value || 0));
  const sign = num < 0 ? '-' : '';
  return `${sign}$${Math.abs(num).toLocaleString('es-CL')}`;
}

function getMonthNameLabel(ym) {
  const [y, m] = String(ym).split('-');
  const months = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
  const idx = parseInt(m, 10) - 1;
  return `${months[idx] || m} ${y}`;
}

/**
 * Detecta si el usuario tiene el cursor activo escribiendo en un input/select/textarea
 * para NUNCA interrumpir el teclado del iPhone con un re-render en segundo plano.
 */
function isUserTyping() {
  if (editingTxId) return true;
  const el = document.activeElement;
  if (!el) return false;
  const tag = (el.tagName || '').toUpperCase();
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = (el.type || 'text').toLowerCase();
    return ['text', 'number', 'password', 'url', 'date', 'month', 'search', 'tel'].includes(type);
  }
  return false;
}

/**
 * Motor Contable Familiar con Arrastre Multi-Mes (Rollover), Burn Rate, Gastos Hormiga,
 * Comparativa Multi-Mes, Mensajes de Equipo por WhatsApp y Diagnóstico Ejecutivo (0 ms).
 * Delega la lógica matemática pura a `src/domain/financialEngine.js`.
 */
function getMonthMetrics(ym) {
  ensureMonthBudget(appState, ym);
  const todayISO = getTodayISO();
  const summary = calculateMonthlyFinancialSummary(appState, ym, todayISO);
  const burnRate = calculateBurnRateAndProjection(summary, ym, todayISO);
  const loansLedger = summary.loansLedger || calculateLoansLedger(appState.transactions || [], appState.learnedContacts || {});
  const instantDiagnosis = generateInstantFamilyDiagnosis(summary, burnRate, loansLedger);
  const antReport =
    typeof detectAntExpensesAndSubscriptions === 'function'
      ? detectAntExpensesAndSubscriptions(appState.transactions || [], ym)
      : null;
  const monthComparison =
    typeof calculateMultiMonthComparison === 'function'
      ? calculateMultiMonthComparison(appState, ym, 6)
      : null;
  const coupleWhatsApp =
    typeof buildCoupleWhatsAppMessages === 'function'
      ? buildCoupleWhatsAppMessages(summary, appState, ym)
      : null;

  return {
    ...summary,
    burnRate,
    loansLedger,
    instantDiagnosis,
    antReport,
    monthComparison,
    coupleWhatsApp
  };
}

function showToast(message, type = 'success', undoAction = null) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast-item toast-${type}`;
  toast.innerHTML = `
    <span>${message}</span>
    ${undoAction ? `<button type="button" class="btn-toast-undo" data-action="${undoAction}">↩️ Deshacer</button>` : ''}
  `;
  container.appendChild(toast);
  const duration = undoAction ? 6000 : 3400;
  setTimeout(() => {
    toast.classList.add('toast-hide');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/**
 * Actualiza solo el banner de impacto en vivo y el desglose de cuenta compartida
 * sin re-renderizar el DOM ni cerrar el teclado del iPhone.
 */
function updateQuickFormLivePreview() {
  const metrics = getMonthMetrics(activeYearMonth);
  const categories = appState.categories || [];
  const selectedCat = categories.find((c) => c.id === quickForm.categoryId) || categories[0];
  const amountNum = cleanChileanAmount(quickForm.amount);

  const effectiveExpenseAmt = quickForm.isSharedBill
    ? Math.min(amountNum, cleanChileanAmount(quickForm.myRealShare))
    : quickForm.paymentMethod === 'cmr_falabella' && Number(quickForm.installments || 1) > 1
      ? Math.round(amountNum / Number(quickForm.installments))
      : amountNum;

  const impactEl = document.getElementById('live-impact-banner');
  if (impactEl && selectedCat) {
    const budget = Number(metrics.monthCfg.categories?.[selectedCat.id] ?? selectedCat.defaultBudget ?? 0);
    const currentSpent = Number(metrics.spentByCategory[selectedCat.id] || 0);
    const afterRemaining = budget - (currentSpent + effectiveExpenseAmt);
    const afterPct = budget > 0 ? Math.round(((currentSpent + effectiveExpenseAmt) / budget) * 100) : 0;

    if (amountNum > 0) {
      impactEl.style.display = 'flex';
      impactEl.innerHTML = `
        <span>⚡ <strong>Impacto en ${selectedCat.icon} ${selectedCat.name}:</strong></span>
        <span>${
          afterRemaining >= 0
            ? `Quedarán <strong>${formatCLP(afterRemaining)}</strong> libres (${afterPct}% usado)`
            : `⚠️ Excederá por <strong>${formatCLP(Math.abs(afterRemaining))}</strong> (${afterPct}%)`
        }</span>
      `;
    } else {
      impactEl.style.display = 'none';
    }
  }

  const sharedSummaryEl = document.getElementById('live-shared-summary');
  if (sharedSummaryEl) {
    const myShare = Math.min(amountNum, cleanChileanAmount(quickForm.myRealShare));
    const owedBack = Math.max(0, amountNum - myShare);
    sharedSummaryEl.innerHTML = `💡 <span>Se descontarán solo <strong>${formatCLP(myShare)}</strong> de tu presupuesto y <strong>${formatCLP(owedBack)}</strong> quedarán en <em>"🤝 Nos deben devolver"</em>.</span>`;
  }
}

function updateSplitFormLiveBalance() {
  const barEl = document.getElementById('live-split-balance-bar');
  if (!barEl) return;
  const assignedSum = splitForm.splits.reduce((acc, s) => acc + Number(s.amount || 0), 0);
  const diff = Number(splitForm.totalAmount || 0) - assignedSum;
  barEl.className = `split-balance-bar ${diff === 0 && splitForm.totalAmount > 0 ? 'balanced' : 'unbalanced'}`;
  barEl.innerHTML = `
    <div>
      <span>Asignado: <strong>${formatCLP(assignedSum)}</strong> de <strong>${formatCLP(splitForm.totalAmount)}</strong></span>
      ${
        diff !== 0
          ? `<span class="diff-badge"> • ${diff > 0 ? `Faltan ${formatCLP(diff)}` : `Te pasaste por ${formatCLP(Math.abs(diff))}`}</span>`
          : `<span class="diff-ok"> • ✅ ¡Cuadrado al peso!</span>`
      }
    </div>
    ${
      diff !== 0 && splitForm.splits.length > 0
        ? `<button type="button" class="btn-secondary-sm" data-action="auto-balance-split">⚖️ Cuadrar en 1ª fila</button>`
        : ''
    }
  `;
}

// ============================================================================
// RENDERIZADO PRINCIPAL 2026
// ============================================================================
export function renderApp() {
  applyTheme(userPrefs.theme);
  const root = document.getElementById('app-root');
  if (!root) return;

  quickForm.author = userPrefs.activeAuthor || 'el';
  const metrics = getMonthMetrics(activeYearMonth);
  const hasDemoData = (appState.transactions || []).some((t) => t.isDemo);

  root.innerHTML = `
    <!-- Header Compacto 2026 con Cinta Deslizable de Escudos -->
    <header class="top-header">
      <div class="header-inner">
        <div class="brand-block">
          <div class="brand-logo">🛡️</div>
          <div>
            <div class="brand-title-row">
              <h1 class="brand-title">Finanzas Familiar</h1>
              <button
                type="button"
                class="sync-live-pill"
                data-action="header-sync-click"
                style="cursor:pointer;border:none;"
                title="Toca para sincronizar ahora con Google Sheets o configurar el link de Marie"
              >
                <span class="sync-dot"></span>
                <span>${
                  (userPrefs.googleSheetsWebhookUrl || appState.sharedIntegrations?.googleSheetsWebhookUrl)
                    ? '☁️ Online Vivo'
                    : '☁️ Conectar Online'
                }</span>
              </button>
            </div>
            <p class="brand-subtitle">Control Anti-Fuga de Ahorros • Banco de Chile & CMR</p>
          </div>
        </div>

        <div class="header-controls">
          <div class="author-toggle" title="Selecciona quién usa este dispositivo">
            <button type="button" class="author-btn ${userPrefs.activeAuthor === 'el' ? 'active-el' : ''}" data-action="set-author" data-author="el">
              🧔‍♂️ ${appState.familyConfig?.husbandName || 'Mauricio'}
            </button>
            <button type="button" class="author-btn ${userPrefs.activeAuthor === 'ella' ? 'active-ella' : ''}" data-action="set-author" data-author="ella">
              👩🏻 ${appState.familyConfig?.wifeName || 'Marie'}
            </button>
          </div>

          <input type="month" id="month-picker" class="month-picker-input" value="${activeYearMonth}" />

          <button type="button" class="btn-theme-toggle" data-action="toggle-theme" title="Cambiar modo Claro / Oscuro OLED">
            ${userPrefs.theme === 'dark' ? '☀️' : '🌙'}
          </button>

          <button type="button" class="btn-excel-top" data-action="export-excel" title="Descargar libro Excel (.xlsx)">
            📊 Excel
          </button>
        </div>
      </div>

      ${hasDemoData ? `
        <div class="demo-banner">
          <span>✨ <strong>Modo Demostración:</strong> Datos de ejemplo activos para probar escudos y conciliador.</span>
          <button type="button" class="btn-clear-demo" data-action="clear-demo-data">
            🧹 Limpiar y partir en cero
          </button>
        </div>
      ` : ''}

      <!-- Cinta Horizontal Interactiva de Escudos (Toca cualquiera para ir a su acción rápida) -->
      <div class="quick-shields-bar">
        <div class="shield-pill ${metrics.remainingSpendable < 0 ? 'shield-danger' : 'shield-ok'}" data-action="jump-shield" data-target="budget" title="Toca para ver el detalle de tus presupuestos">
          <div class="shield-label">
            <span>🛡️ Disponible Mes</span>
            <span class="shield-sub">${formatCLP(Math.max(0, Math.round(metrics.remainingSpendable / metrics.daysRemaining)))}/día libre</span>
          </div>
          <strong class="shield-value">${formatCLP(metrics.remainingSpendable)}</strong>
        </div>

        <div class="shield-pill shield-cmr" data-action="jump-shield" data-target="cmr" title="Toca para registrar el pago de facturación CMR">
          <div class="shield-label">
            <span>🟢 Reserva pagar CMR</span>
            <span class="shield-sub">${metrics.cmrCarryoverPrev > 0 ? `Incluye ${formatCLP(metrics.cmrCarryoverPrev)} mes ant.` : 'Guardar en B. Chile'}</span>
          </div>
          <strong class="shield-value">${formatCLP(metrics.cmrPendingReserve)}</strong>
        </div>

        <div class="shield-pill shield-wife" data-action="jump-shield" data-target="wife" title="Toca para abrir el Fondo Familiar de Marie">
          <div class="shield-label">
            <span>💖 Fondo Familiar de Marie</span>
            <span class="shield-sub">${metrics.wifeCarryoverPrev !== 0 ? `Arrastre: ${formatCLP(metrics.wifeCarryoverPrev)}` : 'Disponible en Fondo Familiar de Marie'}</span>
          </div>
          <strong class="shield-value">${formatCLP(metrics.wifeWalletRemaining)}</strong>
        </div>

        ${metrics.totalLoansOwedToOthers > 0 || metrics.totalLoansReceivable > 0 ? `
          <div class="shield-pill shield-loan" data-action="jump-shield" data-target="loans" title="Toca para ver el desglose por persona y saldar con 1 clic">
            <div class="shield-label">
              <span>🤝 Préstamos / Vaca</span>
              <span class="shield-sub">Por cobrar: ${formatCLP(metrics.totalLoansReceivable)}</span>
            </div>
            <strong class="shield-value">${
              metrics.totalLoansOwedToOthers > 0
                ? `Debemos ${formatCLP(metrics.totalLoansOwedToOthers)}`
                : `Nos deben ${formatCLP(metrics.totalLoansReceivable)}`
            }</strong>
          </div>
        ` : ''}
      </div>
    </header>

    <!-- Navegación Principal (Segmented en Desktop / Floating Glass Dock en iPhone) -->
    <nav class="main-tabs">
      <button type="button" class="tab-btn ${activeTab === 'register' ? 'active' : ''}" data-action="switch-tab" data-tab="register">
        <span class="tab-icon">⚡</span>
        <span class="tab-text">Registrar</span>
      </button>
      <button type="button" class="tab-btn ${activeTab === 'budget' ? 'active' : ''}" data-action="switch-tab" data-tab="budget">
        <span class="tab-icon">🚦</span>
        <span class="tab-text">Presupuestos</span>
      </button>
      <button type="button" class="tab-btn ${activeTab === 'fixed' ? 'active' : ''}" data-action="switch-tab" data-tab="fixed">
        <span class="tab-icon">🏠</span>
        <span class="tab-text">Fijos</span>
      </button>
      <button type="button" class="tab-btn ${activeTab === 'reconcile' ? 'active' : ''}" data-action="switch-tab" data-tab="reconcile">
        <span class="tab-icon">🔍</span>
        <span class="tab-text">Conciliar</span>
      </button>
      <button type="button" class="tab-btn ${activeTab === 'cloud' ? 'active' : ''}" data-action="switch-tab" data-tab="cloud">
        <span class="tab-icon">☁️</span>
        <span class="tab-text">iPhone & IA</span>
      </button>
    </nav>

    <main class="main-container">
      ${activeTab === 'register' ? renderRegisterTab(metrics) : ''}
      ${activeTab === 'budget' ? renderBudgetTab(metrics) : ''}
      ${activeTab === 'fixed' ? renderFixedTab(metrics) : ''}
      ${activeTab === 'reconcile' ? renderReconcileTab(metrics) : ''}
      ${activeTab === 'cloud' ? renderCloudTab(metrics) : ''}
    </main>

    ${editingTxId ? renderEditTransactionModal() : ''}
  `;

  attachDynamicInputListeners();
  updateQuickFormLivePreview();
}

// ============================================================================
// WIDGET DE RITMO DEL MES (BURN RATE), GASTOS HORMIGA, COMPARATIVA & DIAGNÓSTICO IA
// ============================================================================
function renderBurnRateAndDiagnosisWidget(metrics) {
  const burn = metrics.burnRate || calculateBurnRateAndProjection(metrics, activeYearMonth, getTodayISO());
  const hasAiForMonth = diagnosisState.aiAuditResult && diagnosisState.aiAuditMonth === activeYearMonth;
  const diag = hasAiForMonth ? diagnosisState.aiAuditResult : metrics.instantDiagnosis;
  const ant = metrics.antReport?.antExpenses || { count: 0, totalAmount: 0, percentOfTotalSpend: 0 };
  const subs = metrics.antReport?.subscriptions || { count: 0, totalMonthlySubscriptions: 0, duplicateAlerts: [] };
  const comp = metrics.monthComparison;

  const paceBadgeMap = {
    bajo_control: { label: '🟢 Ritmo Bajo Control', cls: 'bar-green' },
    alerta_ritmo: { label: '🟡 Alerta de Ritmo', cls: 'bar-yellow' },
    sobregiro_proyectado: { label: '🔴 Sobregiro Proyectado', cls: 'bar-red' }
  };
  const paceMeta = paceBadgeMap[burn.paceStatus] || paceBadgeMap.bajo_control;
  const barWidth = Math.min(100, Math.max(0, burn.budgetUsedPct));
  const hasApiKey = Boolean(userPrefs.geminiApiKey || appState.sharedIntegrations?.geminiApiKey);

  return `
    <section class="card-panel" style="margin-bottom:16px;padding:14px 16px;">
      <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:10px;">
        <div>
          <div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;">
            <strong style="font-size:0.92rem;">🔥 Ritmo del Mes y Presupuesto Diario Seguro</strong>
            <span class="sem-badge ${paceMeta.cls}">${paceMeta.label}</span>
          </div>
          <p style="font-size:0.78rem;color:var(--text-secondary);margin-top:3px;">
            Día <strong>${burn.daysElapsed} de ${burn.daysInMonth}</strong> (${burn.daysRemaining} días restantes) •
            Pueden gastar hasta <strong>${formatCLP(burn.dailySafeSpend)}/día</strong> sin tocar el ahorro de <strong>${formatCLP(metrics.savingsGoal)}</strong>
            ${metrics.pendingFixedTotal > 0 ? ` • <em>Libre tras fijos pendientes: <strong>${formatCLP(burn.dailySafeSpendAfterFixed)}/día</strong></em>` : ''}
          </p>
        </div>

        <div style="display:flex;flex-wrap:wrap;align-items:center;gap:7px;">
          <button
            type="button"
            class="btn-whatsapp-couple"
            data-action="send-couple-whatsapp"
            data-msg-type="weeklyTeamSummary"
            title="Enviar Resumen Familiar de 10 segundos por WhatsApp"
          >
            💬 Avisar por WhatsApp
          </button>
          <button
            type="button"
            class="${diagnosisState.isOpen ? 'btn-secondary-sm' : 'btn-primary'}"
            data-action="toggle-family-diagnosis"
            style="white-space:nowrap;font-size:0.79rem;padding:8px 13px;"
          >
            ${diagnosisState.isOpen ? '🔼 Ocultar Diagnóstico' : '🧠 Ver Diagnóstico Familiar & Plan de Acción'}
          </button>
        </div>
      </div>

      <div class="progress-track-wrapper" style="margin:12px 0 6px;">
        <div class="pace-marker-line" style="left:${burn.monthProgressPct}%" title="Avance del calendario: ${burn.monthProgressPct}%">
          <span class="pace-marker-label">📍Hoy (${burn.monthProgressPct}%)</span>
        </div>
        <div class="progress-track">
          <div class="progress-fill ${paceMeta.cls}" style="width:${barWidth}%"></div>
        </div>
      </div>

      <div style="display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;font-size:0.74rem;color:var(--text-muted);">
        <span>Gastado: <strong>${formatCLP(metrics.totalExpense)}</strong> (${burn.budgetUsedPct}% del disponible) • Promedio variable: <strong>${formatCLP(burn.variableDailyBurnRate)}/día</strong></span>
        <span>
          Proyección fin de mes: <strong>${formatCLP(burn.projectedMonthEndSpend)}</strong>
          (${burn.projectedSurplusOrDeficit >= 0
            ? `✅ Holgura +${formatCLP(burn.projectedSurplusOrDeficit)}`
            : `⚠️ Excede por ${formatCLP(Math.abs(burn.projectedSurplusOrDeficit))}`})
        </span>
      </div>

      <!-- Cinta compacta de Gastos Hormiga & Comparativa vs Mes Anterior -->
      <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:8px;margin-top:10px;padding-top:9px;border-top:1px dashed var(--border-color);font-size:0.75rem;color:var(--text-secondary);">
        <span>
          🐜 <strong>Gastos Hormiga:</strong> ${ant.count} micro-compras por <strong>${formatCLP(ant.totalAmount)}</strong> (${ant.percentOfTotalSpend}% del gasto)
          ${subs.count > 0 ? ` • 📺 <strong>Suscripciones:</strong> ${formatCLP(subs.totalMonthlySubscriptions)}/mes` : ''}
          ${subs.duplicateAlerts?.length > 0 ? ` <span class="sem-badge bar-red">⚠️ ${subs.duplicateAlerts.length} cobro(s) repetido(s)</span>` : ''}
        </span>
        ${comp ? `
          <span>
            📈 <strong>vs ${getMonthNameLabel(comp.previousMonth.yearMonth)}:</strong>
            ${comp.previousMonth.hasData
              ? `${comp.deltaExpense <= 0 ? '🟢' : '🟡'} ${comp.deltaExpense > 0 ? '+' : ''}${formatCLP(comp.deltaExpense)} (${comp.deltaExpensePct > 0 ? '+' : ''}${comp.deltaExpensePct}%)`
              : 'Primer mes con registros'}
          </span>
        ` : ''}
      </div>

      ${diagnosisState.isOpen && diag ? `
        <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border-color);">
          <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px;">
            <div style="display:flex;align-items:center;gap:10px;">
              <div style="background:var(--primary-accent);color:#fff;font-weight:900;font-size:0.95rem;padding:6px 11px;border-radius:11px;">
                ${diag.healthScore}/100
              </div>
              <div>
                <div style="display:flex;align-items:center;gap:6px;">
                  <strong style="font-size:0.88rem;">Diagnóstico Ejecutivo Familiar</strong>
                  <span class="sem-badge ${diag.healthScore >= 80 ? 'bar-green' : diag.healthScore >= 60 ? 'bar-yellow' : 'bar-red'}">${diag.statusBadge}</span>
                  ${hasAiForMonth ? `<span class="badge-split">✨ Gemini 3.8 Flash</span>` : `<span class="badge-reconciled">⚡ Instantáneo 0 ms</span>`}
                </div>
                <p style="font-size:0.8rem;color:var(--text-main);margin-top:2px;">${diag.headline}</p>
              </div>
            </div>

            <button
              type="button"
              class="btn-secondary-sm"
              data-action="run-ai-family-diagnosis"
              ${diagnosisState.isLoadingAI ? 'disabled' : ''}
              title="${hasApiKey ? 'Analizar en profundidad con Gemini 3.8 Flash' : 'Configura tu clave gratuita en la pestaña iPhone & IA'}"
            >
              ${diagnosisState.isLoadingAI
                ? '⏳ Consultando a Gemini 3.8 Flash...'
                : hasAiForMonth
                  ? '🔄 Actualizar Análisis IA'
                  : '✨ Enriquecer con Gemini 3.8 Flash'}
            </button>
          </div>

          ${diagnosisState.aiError ? `
            <div class="scan-error-box" style="margin-bottom:10px;">
              ⚠️ ${diagnosisState.aiError}
            </div>
          ` : ''}

          <div class="insights-grid" style="margin-bottom:12px;">
            <div class="insight-box insight-cmr">
              <h4>🟢 Diagnóstico Escudo CMR</h4>
              <p>${String(diag.cmrShieldDiagnosis)}</p>
            </div>
            <div class="insight-box insight-wife">
              <h4>💖 Fondo Familiar de Marie</h4>
              <p>${String(diag.wifeAccountDiagnosis)}</p>
            </div>
          </div>

          ${Array.isArray(diag.categoryAlerts) && diag.categoryAlerts.length > 0 ? `
            <div style="margin-bottom:12px;">
              <strong style="font-size:0.78rem;display:block;margin-bottom:6px;color:var(--text-secondary);">🚦 Alertas de Categorías (${diag.categoryAlerts.length}):</strong>
              <div style="display:flex;flex-direction:column;gap:6px;">
                ${diag.categoryAlerts.slice(0, 3).map((alert) => `
                  <div style="font-size:0.78rem;padding:8px 11px;border-radius:10px;background:var(--bg-subtle);border-left:3px solid ${alert.status === 'danger' || alert.severity === 'CRITICO' ? '#ef4444' : '#f59e0b'};">
                    <strong>${alert.categoryName || `${alert.icon || ''} ${alert.name || ''}`}:</strong>
                    <span>${alert.recommendation || `${alert.message || ''} ${alert.actionableTip || ''}`}</span>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}

          <div style="background:var(--bg-subtle);border:1px solid var(--border-color);border-radius:12px;padding:10px 13px;">
            <strong style="font-size:0.8rem;display:block;margin-bottom:6px;">🎯 Top 3 Acciones Prioritarias para esta Semana:</strong>
            <ol style="margin-left:18px;font-size:0.79rem;display:flex;flex-direction:column;gap:4px;color:var(--text-main);">
              ${(diag.top3Actions || []).map((act) => `<li>${act}</li>`).join('')}
            </ol>
          </div>
        </div>
      ` : ''}
    </section>
  `;
}

// ============================================================================
// PESTAÑA 1: REGISTRAR (REGLA DE LOS 5 SEGUNDOS SIEMPRE PRIMERO EN EL IPHONE)
// ============================================================================
function renderRegisterTab(metrics) {
  return `
    <section class="card-panel" style="margin-bottom:16px;">
      <div class="mode-pills">
        <button type="button" class="mode-pill ${registerMode === 'quick' ? 'active' : ''}" data-action="set-register-mode" data-mode="quick">
          ⚡ Gasto (5 seg)
        </button>
        <button type="button" class="mode-pill ${registerMode === 'split' ? 'active' : ''}" data-action="set-register-mode" data-mode="split">
          📸 Dividir Boleta IA
        </button>
        <button type="button" class="mode-pill ${registerMode === 'internal' ? 'active' : ''}" data-action="set-register-mode" data-mode="internal">
          💖 Fondo Marie / CMR / Préstamos
        </button>
      </div>

      ${registerMode === 'quick' ? renderQuickExpenseForm(metrics) : ''}
      ${registerMode === 'split' ? renderSplitReceiptForm(metrics) : ''}
      ${registerMode === 'internal' ? renderInternalAndIncomeForm(metrics) : ''}
    </section>

    ${renderBurnRateAndDiagnosisWidget(metrics)}

    ${renderRecentTransactionsList(metrics)}
  `;
}

function renderQuickExpenseForm(metrics) {
  const categories = appState.categories || [];
  const selectedCat = categories.find((c) => c.id === quickForm.categoryId) || categories[0];
  const displayAmount = formatLiveCLPInput(quickForm.amount);
  const displayMyShare = formatLiveCLPInput(quickForm.myRealShare);
  const activeAuthor = quickForm.author || userPrefs.activeAuthor || 'el';
  const authorPresets =
    typeof getQuickPresetsForAuthor === 'function' ? getQuickPresetsForAuthor(activeAuthor) : [];

  return `
    <form id="quick-expense-form" class="quick-form">
      <!-- 🎙️ Barra de Dictado por Voz / Frase Rápida estilo WhatsApp -->
      <div class="smart-natural-bar">
        <div class="smart-natural-header">
          <span>🎙️ <strong>Escribe o dicta en 1 frase</strong> (ej: <em>"15 lucas feria"</em> o <em>"60 mil zapatos hija en 3 cuotas"</em>)</span>
          <span class="smart-natural-badge">⚡ 0 ms</span>
        </div>
        <div class="smart-natural-row">
          <input
            type="text"
            id="smart-natural-input"
            class="text-input smart-natural-input"
            autocomplete="off"
            placeholder="🎙️ Dicta o escribe: '15 lucas feria' o '24500 pañales cmr'..."
            value="${quickForm.naturalInputText || ''}"
          />
          <button type="button" class="btn-smart-parse" data-action="apply-smart-natural-input">
            ✨ Autocompletar
          </button>
        </div>
      </div>

      <!-- ⚡ Atajos Frecuentes de 1 Toque personalizados según quién usa el iPhone -->
      <div class="author-presets-wrap">
        <div class="author-presets-label">
          <span>⚡ Atajos de 1 toque para <strong>${activeAuthor === 'ella' ? '👩🏻 Marie' : '🧔‍♂️ Mauricio'}</strong>:</span>
          <small>Elige categoría y cuenta al instante</small>
        </div>
        <div class="author-presets-row">
          ${authorPresets.map((preset) => `
            <button
              type="button"
              class="author-preset-chip ${activeAuthor === 'ella' ? 'preset-ella' : 'preset-el'}"
              data-action="apply-author-preset"
              data-cat="${preset.categoryId}"
              data-pm="${preset.paymentMethod}"
              data-note="${preset.defaultNote || preset.label}"
            >
              <span>${preset.icon}</span>
              <span>${preset.label}</span>
            </button>
          `).join('')}
        </div>
      </div>

      <!-- Paso 1: Hero Visor de Monto con Formato de Miles en Vivo -->
      <div class="amount-box">
        <div class="step-label">
          <span>1. ¿Cuánto costó? (CLP)</span>
          <span>Registrando como: <strong>${activeAuthor === 'ella' ? '👩🏻 Marie' : '🧔‍♂️ Mauricio'}</strong></span>
        </div>
        <div class="amount-input-row">
          <span class="currency-prefix">$</span>
          <input
            type="text"
            inputmode="numeric"
            autocomplete="off"
            id="quick-amount-input"
            class="amount-giant-input"
            placeholder="0"
            value="${displayAmount}"
            required
          />
          <button type="button" class="btn-clear-amount" data-action="quick-add-amount" data-val="clear" title="Limpiar monto">✕</button>
        </div>
        <div class="quick-chips">
          <button type="button" class="chip-btn" data-action="quick-add-amount" data-val="2000">+$2.000</button>
          <button type="button" class="chip-btn" data-action="quick-add-amount" data-val="5000">+$5.000</button>
          <button type="button" class="chip-btn" data-action="quick-add-amount" data-val="10000">+$10.000</button>
          <button type="button" class="chip-btn" data-action="quick-add-amount" data-val="20000">+$20.000</button>
          <button type="button" class="chip-btn" data-action="quick-add-amount" data-val="50000">+$50.000</button>
          <button type="button" class="chip-btn" data-action="quick-add-amount" data-val="clear">🧹 Limpiar</button>
        </div>
      </div>

      <!-- Paso 2: Categoría con Mini-Barra y Semáforo en Vivo -->
      <div class="form-section">
        <label class="step-label">2. Categoría (Muestra cuánto les queda este mes)</label>
        <div class="category-grid">
          ${categories.map((cat) => {
            const budget = Number(metrics.monthCfg.categories?.[cat.id] ?? cat.defaultBudget ?? 0);
            const spent = Number(metrics.spentByCategory[cat.id] || 0);
            const rem = budget - spent;
            const pct = budget > 0 ? Math.round((spent / budget) * 100) : 0;
            const barW = Math.min(100, Math.max(0, pct));
            const statusClass = pct >= 95 ? 'cat-red' : pct >= 75 ? 'cat-yellow' : 'cat-green';
            const isSelected = quickForm.categoryId === cat.id;

            return `
              <button
                type="button"
                class="category-tile ${isSelected ? 'selected' : ''} ${statusClass}"
                data-action="select-quick-cat"
                data-cat="${cat.id}"
              >
                <div class="cat-tile-top">
                  <span class="cat-tile-icon">${cat.icon}</span>
                  <span class="cat-tile-dot"></span>
                </div>
                <div class="cat-tile-name">${cat.name}</div>
                <div class="cat-tile-rem">
                  ${rem >= 0 ? `Quedan ${formatCLP(rem)}` : `Excedido ${formatCLP(Math.abs(rem))}`}
                </div>
                <div class="cat-mini-bar">
                  <div class="cat-mini-fill" style="width:${barW}%"></div>
                </div>
              </button>
            `;
          }).join('')}
        </div>
      </div>

      <!-- Paso 3: Con qué cuenta se pagó -->
      <div class="form-section">
        <label class="step-label">3. ¿Con qué cuenta o tarjeta se pagó?</label>
        <div class="payment-pills">
          ${PAYMENT_METHODS.map((pm) => `
            <button
              type="button"
              class="pm-pill ${quickForm.paymentMethod === pm.id ? 'selected' : ''}"
              data-action="select-quick-pm"
              data-pm="${pm.id}"
            >
              <span>${pm.icon}</span>
              <span>${pm.shortName}</span>
            </button>
          `).join('')}
        </div>
        ${quickForm.paymentMethod === 'cmr_falabella' ? `
          <div class="cmr-installments-bar">
            <span class="cmr-installments-label">💳 Cuotas CMR:</span>
            <div class="cmr-installments-pills">
              ${[
                { count: 1, label: '1 cuota (mes)' },
                { count: 3, label: '3 cuotas' },
                { count: 6, label: '6 cuotas' },
                { count: 12, label: '12 cuotas' }
              ].map((opt) => `
                <button
                  type="button"
                  class="cmr-inst-pill ${Number(quickForm.installments || 1) === opt.count ? 'active' : ''}"
                  data-action="set-quick-installments"
                  data-installments="${opt.count}"
                >
                  ${opt.label}
                </button>
              `).join('')}
            </div>
          </div>
          <div class="helper-hint cmr-hint">
            <span>🟢 <strong>Escudo CMR:</strong> ${
              Number(quickForm.installments || 1) > 1
                ? `Se dividirá en <strong>${quickForm.installments} cuotas mensuales sin interés</strong>; la Cuota 1 entra al presupuesto y reserva CMR de este mes.`
                : `Se descuenta hoy del presupuesto y se suma a tu <em>Reserva para pagar CMR</em>.`
            }</span>
          </div>
        ` : ''}
        ${quickForm.paymentMethod === 'cuenta_mujer' ? `
          <p class="helper-hint wife-hint">
            💖 <strong>Fondo Familiar de Marie:</strong> Se suma a <em>Compras Familiares desde Cuenta de Marie</em> y actualiza el <em>Disponible en Fondo Familiar de Marie</em>.
          </p>
        ` : ''}
      </div>

      <!-- Paso 4: Opción para Cuenta Compartida / Encargo -->
      <div class="shared-bill-box">
        <label style="display:flex;align-items:center;gap:8px;font-size:0.82rem;font-weight:700;cursor:pointer;">
          <input type="checkbox" id="quick-shared-check" ${quickForm.isSharedBill ? 'checked' : ''} />
          <span>🍕 ¿Pagaste una cuenta compartida y te van a transferir una parte? (Asado, regalo, encargo)</span>
        </label>
        ${quickForm.isSharedBill ? `
          <div style="margin-top:10px;padding-top:10px;border-top:1px dashed var(--border-strong);" class="form-row-two">
            <div class="input-group">
              <label>¿Cuánto es gasto REAL de ustedes dos? (CLP)</label>
              <input
                type="text"
                inputmode="numeric"
                id="quick-myshare-input"
                class="text-input"
                placeholder="Ej: 20.000 (Pon 0 si fue 100% encargo)"
                value="${displayMyShare}"
              />
            </div>
            <div id="live-shared-summary" style="font-size:0.78rem;color:var(--text-secondary);display:flex;align-items:center;"></div>
          </div>
        ` : ''}
      </div>

      <!-- Paso 5: Nota opcional y fecha -->
      <div class="form-row-two">
        <div class="input-group">
          <label for="quick-note-input">Detalle corto (o nombre de la persona si es compartido)</label>
          <input
            type="text"
            id="quick-note-input"
            class="text-input"
            placeholder="Ej: Lider, Feria, Pañales, Asado con Pedro..."
            value="${quickForm.note}"
          />
        </div>
        <div class="input-group">
          <label for="quick-date-input">Fecha</label>
          <input
            type="date"
            id="quick-date-input"
            class="text-input"
            value="${quickForm.date}"
          />
        </div>
      </div>

      <!-- Vista previa en vivo del impacto antes de guardar -->
      <div id="live-impact-banner" class="live-impact-banner" style="display:none;"></div>

      <button type="submit" class="btn-primary-giant" data-action="save-quick-expense">
        ✅ Guardar en ${selectedCat?.icon || ''} ${selectedCat?.name || 'Categoría'}
      </button>
    </form>
  `;
}

function renderSplitReceiptForm() {
  const categories = appState.categories || [];
  const assignedSum = splitForm.splits.reduce((acc, s) => acc + Number(s.amount || 0), 0);
  const diff = Number(splitForm.totalAmount || 0) - assignedSum;

  return `
    <div class="split-receipt-wrapper">
      <div class="split-intro-banner">
        <div>
          <h3>📸 Divisor de Boletas Mixtas (Supermercado / Farmacia)</h3>
          <p>Cuando una sola boleta incluye <strong>Supermercado + Pañales Hija + Gustos</strong>. Toma una foto con <strong>Gemini 3.8 Flash</strong> o divídela aquí.</p>
        </div>
        <div class="split-ai-actions">
          <label class="btn-upload-receipt">
            📷 Escanear Foto Boleta (IA)
            <input type="file" id="receipt-photo-input" accept="image/*" capture="environment" hidden />
          </label>
          <button type="button" class="btn-secondary-sm" data-action="load-demo-receipt">
            ✨ Ejemplo ($89.400)
          </button>
        </div>
      </div>

      ${splitForm.isScanning ? `
        <div class="scanning-status">
          ⏳ Analizando los ítems de la boleta con <strong>Gemini 3.8 Flash</strong>...
        </div>
      ` : ''}
      ${splitForm.scanError ? `
        <div class="scan-error-box">
          ⚠️ ${splitForm.scanError}
        </div>
      ` : ''}

      <div class="form-row-three">
        <div class="input-group">
          <label>Comercio / Lugar</label>
          <input type="text" id="split-merchant-input" class="text-input" placeholder="Ej: Jumbo / Hiper Lider" value="${splitForm.merchant}" />
        </div>
        <div class="input-group">
          <label>Total Exacto Boleta (CLP)</label>
          <input type="text" inputmode="numeric" id="split-total-input" class="text-input" placeholder="Ej: 89.400" value="${formatLiveCLPInput(splitForm.totalAmount)}" />
        </div>
        <div class="input-group">
          <label>Pagado con</label>
          <select id="split-pm-select" class="text-input">
            ${PAYMENT_METHODS.map((pm) => `
              <option value="${pm.id}" ${splitForm.paymentMethod === pm.id ? 'selected' : ''}>${pm.icon} ${pm.name}</option>
            `).join('')}
          </select>
        </div>
      </div>

      <div class="splits-list">
        <div class="splits-header">
          <span>Desglose por Categoría</span>
          <button type="button" class="btn-link" data-action="add-split-row">+ Agregar otra categoría</button>
        </div>

        ${splitForm.splits.map((s, idx) => `
          <div class="split-row-item">
            <select class="text-input split-cat-select" data-idx="${idx}">
              ${categories.map((c) => `
                <option value="${c.id}" ${s.categoryId === c.id ? 'selected' : ''}>${c.icon} ${c.name}</option>
              `).join('')}
            </select>
            <input
              type="text"
              inputmode="numeric"
              class="text-input split-amt-input"
              data-idx="${idx}"
              placeholder="Monto CLP"
              value="${formatLiveCLPInput(s.amount)}"
            />
            <input
              type="text"
              class="text-input split-sum-input"
              data-idx="${idx}"
              placeholder="Qué incluye (ej. Pañales Pampers)"
              value="${s.summary || ''}"
            />
            ${splitForm.splits.length > 1 ? `
              <button type="button" class="btn-icon-danger" data-action="remove-split-row" data-idx="${idx}" title="Quitar fila">✕</button>
            ` : ''}
          </div>
        `).join('')}
      </div>

      <div id="live-split-balance-bar" class="split-balance-bar ${diff === 0 && splitForm.totalAmount > 0 ? 'balanced' : 'unbalanced'}">
        <div>
          <span>Asignado: <strong>${formatCLP(assignedSum)}</strong> de <strong>${formatCLP(splitForm.totalAmount)}</strong></span>
          ${diff !== 0 ? `
            <span class="diff-badge"> • ${diff > 0 ? `Faltan ${formatCLP(diff)}` : `Te pasaste por ${formatCLP(Math.abs(diff))}`}</span>
          ` : `<span class="diff-ok"> • ✅ ¡Cuadrado al peso!</span>`}
        </div>
        ${diff !== 0 && splitForm.splits.length > 0 ? `
          <button type="button" class="btn-secondary-sm" data-action="auto-balance-split">
            ⚖️ Cuadrar en 1ª fila
          </button>
        ` : ''}
      </div>

      <button type="button" class="btn-primary-giant" data-action="save-split-receipt">
        ✅ Guardar Boleta Dividida (${splitForm.splits.length} categorías)
      </button>
    </div>
  `;
}

function renderInternalAndIncomeForm(metrics) {
  return `
    <!-- Selector limpio de 4 tarjetas para no saturar la pantalla del iPhone -->
    <div class="internal-subnav">
      <button type="button" class="internal-nav-card ${internalSubTab === 'wife' ? 'active' : ''}" data-action="set-internal-subtab" data-sub="wife">
        <span class="internal-nav-title">💖 Fondo de Marie</span>
        <span class="internal-nav-sub">Disponible: ${formatCLP(metrics.wifeWalletRemaining)}</span>
      </button>
      <button type="button" class="internal-nav-card ${internalSubTab === 'cmr' ? 'active' : ''}" data-action="set-internal-subtab" data-sub="cmr">
        <span class="internal-nav-title">🟢💳 Pagar CMR</span>
        <span class="internal-nav-sub">Reserva: ${formatCLP(metrics.cmrPendingReserve)}</span>
      </button>
      <button type="button" class="internal-nav-card ${internalSubTab === 'income' ? 'active' : ''}" data-action="set-internal-subtab" data-sub="income">
        <span class="internal-nav-title">💰🏦 Ingreso / Sueldo</span>
        <span class="internal-nav-sub">Mes: ${formatCLP(metrics.realIncome)}</span>
      </button>
      <button type="button" class="internal-nav-card ${internalSubTab === 'loans' ? 'active' : ''}" data-action="set-internal-subtab" data-sub="loans">
        <span class="internal-nav-title">🤝⏳ Préstamos</span>
        <span class="internal-nav-sub">${metrics.loansByPerson.length} activos</span>
      </button>
    </div>

    ${internalSubTab === 'wife' ? `
      <div class="internal-card">
        <div class="internal-card-header">
          <span class="internal-icon">💖💸</span>
          <div>
            <h3>💖 Fondo Familiar de Marie (Recarga sin Duplicar Gasto)</h3>
            <p>
              Cuando transfieres desde Banco de Chile al <strong>💖 Fondo Familiar de Marie</strong>, <strong>NO se cobra como gasto</strong> para jamás duplicar.
              Suma a su <strong>Disponible en Fondo Familiar de Marie (${formatCLP(metrics.wifeWalletRemaining)})</strong> y el presupuesto familiar se actualiza cuando se anotan las <strong>Compras Familiares desde Cuenta de Marie (${formatCLP(metrics.spentFromWifeAccount)})</strong>.
            </p>
          </div>
        </div>
        <div class="form-row-two">
          <div class="input-group">
            <label>Monto Recargado al Fondo Familiar de Marie (CLP)</label>
            <input type="text" inputmode="numeric" id="wife-transfer-amount" class="text-input live-clp-input" placeholder="Ej: 150.000" />
          </div>
          <div class="input-group">
            <label>Desde cuenta</label>
            <select id="wife-transfer-from" class="text-input">
              <option value="bch_ctacte">🏦 Banco de Chile (Cta. Corriente)</option>
              <option value="bch_vista">💳 Banco de Chile (Cta. Vista / FAN)</option>
            </select>
          </div>
        </div>
        <button type="button" class="btn-internal-wife" data-action="save-wife-transfer">
          💸 Registrar Recarga al Fondo Familiar de Marie
        </button>

        <div class="whatsapp-couple-bar">
          <span style="font-size:0.75rem;font-weight:700;color:var(--text-secondary);">💬 Avisar por WhatsApp con 1 toque:</span>
          <button type="button" class="btn-whatsapp-couple" data-action="send-couple-whatsapp" data-msg-type="transferConfirmationToMarie">
            💬 Avisar por WhatsApp que ya transferí
          </button>
          <button type="button" class="btn-whatsapp-couple btn-wa-pink" data-action="send-couple-whatsapp" data-msg-type="lowWifeWalletRequest">
            💖 Pedir recarga cariñosa por WhatsApp
          </button>
          <button type="button" class="btn-secondary-sm" data-action="send-couple-whatsapp" data-msg-type="weeklyTeamSummary">
            🛡️ Resumen Familiar (10 seg)
          </button>
        </div>
      </div>
    ` : ''}

    ${internalSubTab === 'cmr' ? `
      <div class="internal-card">
        <div class="internal-card-header">
          <span class="internal-icon">🟢💳</span>
          <div>
            <h3>Pagar Estado de Cuenta CMR Falabella</h3>
            <p>
              Tienes <strong>${formatCLP(metrics.cmrPendingReserve)}</strong> reservados por pagar (${formatCLP(metrics.cmrSpent)} de compras de este mes${metrics.cmrCarryoverPrev > 0 ? ` + ${formatCLP(metrics.cmrCarryoverPrev)} de facturación del mes anterior` : ''}).
              Al registrar el pago aquí, se libera tu reserva sin volver a cobrar los gastos.
            </p>
          </div>
        </div>
        <div class="form-row-two">
          <div class="input-group">
            <label>Monto Pagado a CMR (CLP)</label>
            <input type="text" inputmode="numeric" id="cmr-pay-amount" class="text-input live-clp-input" value="${formatLiveCLPInput(metrics.cmrPendingReserve)}" placeholder="Ej: 185.000" />
          </div>
          <div class="input-group">
            <label>Pagado desde</label>
            <select id="cmr-pay-from" class="text-input">
              <option value="bch_ctacte">🏦 Banco de Chile (Cta. Corriente)</option>
              <option value="bch_vista">💳 Banco de Chile (Cta. Vista / FAN)</option>
            </select>
          </div>
        </div>
        <button type="button" class="btn-internal-cmr" data-action="save-cmr-payment">
          🟢 Confirmar Pago de Facturación CMR
        </button>
      </div>
    ` : ''}

    ${internalSubTab === 'income' ? `
      <div class="internal-card">
        <div class="internal-card-header">
          <span class="internal-icon">💰🏦</span>
          <div>
            <h3>Registrar Sueldo o Ingreso Extra del Mes</h3>
            <p>Anota el sueldo líquido recibido, bonos laborales o ingresos adicionales reales del hogar.</p>
          </div>
        </div>
        <div class="form-row-two">
          <div class="input-group">
            <label>Monto del Ingreso (CLP)</label>
            <input type="text" inputmode="numeric" id="income-amount" class="text-input live-clp-input" placeholder="Ej: 2.350.000" />
          </div>
          <div class="input-group">
            <label>Concepto</label>
            <input type="text" id="income-note" class="text-input" placeholder="Ej: Sueldo mensual / Bono" />
          </div>
        </div>
        <button type="button" class="btn-internal-income" data-action="save-income">
          💰 Sumar Ingreso al Mes
        </button>
      </div>
    ` : ''}

    ${internalSubTab === 'loans' ? `
      <div class="internal-card">
        <div class="internal-card-header">
          <span class="internal-icon">🤝⏳</span>
          <div>
            <h3>Libro de Préstamos Informales y Cuentas Compartidas</h3>
            <p>
              Controla por persona quién les prestó plata (ej. <em>"Juanito $50.000"</em>) o quién les debe su parte de un asado/encargo, sin alterar sus ingresos ni sus presupuestos.
            </p>
          </div>
        </div>

        ${metrics.loansByPerson.length > 0 ? `
          <div class="person-loans-grid" style="margin-bottom:16px;">
            ${metrics.loansByPerson.map((p) => `
              <div class="person-loan-card">
                <div class="person-loan-info">
                  <strong>👤 ${p.name}</strong>
                  ${p.owedByUs > 0 ? `<small style="color:#ef4444;font-weight:700;">⏳ Le debemos: ${formatCLP(p.owedByUs)}</small>` : ''}
                  ${p.owedToUs > 0 ? `<small style="color:#10b981;font-weight:700;">🤝 Nos debe: ${formatCLP(p.owedToUs)}</small>` : ''}
                </div>
                <div>
                  ${p.owedByUs > 0 ? `
                    <button type="button" class="btn-secondary-sm" data-action="settle-person-loan" data-person="${p.name}" data-amt="${p.owedByUs}" data-kind="repay">
                      📤 Ya le pagué
                    </button>
                  ` : `
                    <button type="button" class="btn-secondary-sm" data-action="settle-person-loan" data-person="${p.name}" data-amt="${p.owedToUs}" data-kind="collect">
                      💵 Ya me pagó
                    </button>
                  `}
                </div>
              </div>
            `).join('')}
          </div>
        ` : ''}

        <div class="form-row-three">
          <div class="input-group">
            <label>¿Qué ocurrió?</label>
            <select id="loan-type-select" class="text-input">
              <option value="loan_received">📥 Me prestaron plata (Debo devolverla luego)</option>
              <option value="loan_repaid">📤 Devolví plata que me habían prestado</option>
              <option value="loan_given">🤝 Presté plata / Encargo (Me deben devolver)</option>
              <option value="loan_collected">💵 Me devolvieron plata que me debían</option>
            </select>
          </div>
          <div class="input-group">
            <label>Monto (CLP)</label>
            <input type="text" inputmode="numeric" id="loan-amount-input" class="text-input live-clp-input" placeholder="Ej: 50.000" />
          </div>
          <div class="input-group">
            <label>Nombre de la Persona — Detalle</label>
            <input type="text" id="loan-note-input" class="text-input" placeholder="Ej: Juanito — préstamo" />
          </div>
        </div>
        <button type="button" class="btn-primary-giant" data-action="save-loan-movement">
          🤝 Registrar Movimiento en Libro de Préstamos
        </button>
      </div>
    ` : ''}
  `;
}

function hasActiveTxFilters() {
  return (
    Boolean(txFilterState.searchQuery && txFilterState.searchQuery.trim()) ||
    txFilterState.paymentMethod !== 'all' ||
    txFilterState.author !== 'all' ||
    txFilterState.reconciledStatus !== 'all' ||
    txFilterState.categoryId !== 'all'
  );
}

function renderFilteredSummaryBarHtml(filteredTxs, totalMonthCount) {
  const totals = calculateFilteredTransactionsTotals(filteredTxs);
  const isFiltered = hasActiveTxFilters();

  return `
    <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:8px;">
      <span>
        Mostrando <strong>${totals.count}</strong> de ${totalMonthCount} movimientos •
        Total filtrado: <strong>${formatCLP(totals.totalAmount)}</strong>
        ${totals.netExpenseTotal !== totals.totalAmount ? `<span class="text-muted">(Gasto neto: ${formatCLP(totals.netExpenseTotal)})</span>` : ''}
      </span>
      ${isFiltered ? `
        <button type="button" class="btn-secondary-sm" data-action="clear-tx-filters">
          ✕ Limpiar filtros
        </button>
      ` : ''}
    </div>
  `;
}

function renderTransactionRowsHtml(filteredTxs, totalMonthCount) {
  if (totalMonthCount === 0) {
    return `
      <div class="empty-state">
        No hay movimientos en ${getMonthNameLabel(activeYearMonth)}. ¡Usa el visor de arriba para registrar el primero en 5 segundos!
      </div>
    `;
  }

  if (filteredTxs.length === 0) {
    return `
      <div class="empty-state">
        🔍 No se encontraron movimientos con los filtros actuales.
        <div style="margin-top:8px;">
          <button type="button" class="btn-secondary-sm" data-action="clear-tx-filters">Restablecer búsqueda y filtros</button>
        </div>
      </div>
    `;
  }

  const categoriesMap = {};
  (appState.categories || []).forEach((c) => {
    categoriesMap[c.id] = c;
  });
  const pmMap = {};
  PAYMENT_METHODS.forEach((p) => {
    pmMap[p.id] = p;
  });

  return `
    <div class="tx-list">
      ${filteredTxs.map((tx) => {
        const cat = categoriesMap[tx.categoryId];
        const pm = pmMap[tx.paymentMethod];
        const isIncome = tx.type === 'income';
        const isWifeTransfer = tx.type === 'transfer_wife';

        let icon = cat?.icon || '📌';
        let title = cat?.name || 'Movimiento';
        let amountClass = 'tx-amt-expense';
        let prefix = '-';

        if (isIncome) {
          icon = '💰';
          title = 'Ingreso Familiar';
          amountClass = 'tx-amt-income';
          prefix = '+';
        } else if (tx.type === 'reimbursement') {
          icon = '↩️';
          title = `Reembolso a ${cat?.name || 'Categoría'}`;
          amountClass = 'tx-amt-income';
          prefix = '+';
        } else if (isWifeTransfer) {
          icon = '💖💸';
          title = 'Recarga a 💖 Fondo Familiar de Marie (No duplica gasto)';
          amountClass = 'tx-amt-internal';
          prefix = '⇄ ';
        } else if (tx.type === 'cmr_payment') {
          icon = '🟢💳';
          title = 'Pago Facturación CMR';
          amountClass = 'tx-amt-internal';
          prefix = '⇄ ';
        } else if (tx.type === 'loan_received') {
          icon = '📥⏳';
          title = 'Préstamo Recibido (Por devolver)';
          amountClass = 'tx-amt-internal';
          prefix = '⏳ ';
        } else if (tx.type === 'loan_repaid') {
          icon = '📤✅';
          title = 'Devolución de Préstamo Pagada';
          amountClass = 'tx-amt-internal';
          prefix = '⇄ ';
        } else if (tx.type === 'loan_given') {
          icon = '🤝📤';
          title = 'Por Cobrar (Nos deben devolver)';
          amountClass = 'tx-amt-internal';
          prefix = '🤝 ';
        } else if (tx.type === 'loan_collected') {
          icon = '🤝💵';
          title = 'Préstamo / Vaca Cobrada';
          amountClass = 'tx-amt-internal';
          prefix = '⇄ ';
        } else if (tx.type === 'savings_withdrawal') {
          icon = '🚨🏦';
          title = 'Rescate desde Ahorros';
          amountClass = 'tx-amt-internal';
          prefix = '⚠️ ';
        }

        const isSplitTx = Boolean(tx.splitGroupId || tx.receiptGroupId);
        const splitTotalBadge = tx.splitTotalAmount ? ` (de ${formatCLP(tx.splitTotalAmount)})` : '';

        return `
          <div class="tx-row">
            <div class="tx-left" data-action="open-edit-tx" data-id="${tx.id}" title="Toca para editar este movimiento">
              <div class="tx-icon-circle">${icon}</div>
              <div class="tx-info">
                <div class="tx-title-line">
                  <strong>${title}</strong>
                  ${isSplitTx ? `<span class="badge-split" title="Boleta dividida vinculada (${tx.splitGroupId || tx.receiptGroupId})">✂️ Dividida${splitTotalBadge}</span>` : ''}
                  ${tx.fixedTemplateId ? `<span class="badge-fixed">🏠 Fijo</span>` : ''}
                  ${tx.reconciled ? `<span class="badge-reconciled">✅ Banco OK</span>` : ''}
                </div>
                <div class="tx-note-line">${tx.note || 'Sin nota adicional'}</div>
                <div class="tx-meta-line">
                  <span>📅 ${tx.date}</span>
                  <span>•</span>
                  <span>${pm ? `${pm.icon} ${pm.shortName}` : tx.paymentMethod}</span>
                  <span>•</span>
                  <span>${tx.author === 'ella' ? '👩🏻 Marie' : '🧔‍♂️ Mauricio'}</span>
                </div>
              </div>
            </div>
            <div class="tx-right">
              <div class="tx-amount ${amountClass}">${prefix}${formatCLP(tx.amount)}</div>
              <button type="button" class="btn-edit-tx" data-action="open-edit-tx" data-id="${tx.id}" title="Editar">
                ✏️
              </button>
              <button type="button" class="btn-delete-tx" data-action="delete-tx" data-id="${tx.id}" title="Eliminar">
                🗑️
              </button>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

/**
 * Actualiza solo el contenedor de resultados filtrados sin desmontar `#tx-search-input`
 * para mantener el teclado del iPhone abierto mientras se escribe.
 */
function updateFilteredTransactionsDOM() {
  const summaryEl = document.getElementById('tx-filtered-summary-bar');
  const listEl = document.getElementById('tx-filtered-list-container');
  if (!summaryEl || !listEl) return;

  const monthTxs = (appState.transactions || []).filter((t) =>
    String(t.date || '').startsWith(activeYearMonth)
  );
  const filteredTxs = filterTransactions(monthTxs, {
    ...txFilterState,
    yearMonth: activeYearMonth,
    categories: appState.categories || []
  });

  summaryEl.innerHTML = renderFilteredSummaryBarHtml(filteredTxs, monthTxs.length);
  listEl.innerHTML = renderTransactionRowsHtml(filteredTxs, monthTxs.length);
}

function renderRecentTransactionsList(metrics) {
  const monthTxs = metrics.txs || [];
  const totalAllMonthsCount = (appState.transactions || []).length;
  const filteredTxs = filterTransactions(monthTxs, {
    ...txFilterState,
    yearMonth: activeYearMonth,
    categories: appState.categories || []
  });

  return `
    <section class="card-panel mt-section">
      <div class="section-header-row">
        <div>
          <h2 class="section-title">📋 Movimientos de ${getMonthNameLabel(activeYearMonth)} (${monthTxs.length})</h2>
          <p class="section-subtitle">Busca al instante o toca cualquier movimiento para editarlo en 1 segundo</p>
        </div>
        ${totalAllMonthsCount > 0 ? `
          <button
            type="button"
            class="btn-outline-danger-sm"
            data-action="clear-all-transactions"
            title="Borra todos los movimientos de prueba (incluyendo meses anteriores) en todos tus dispositivos"
          >
            🧹 Vaciar Todo y Dejar en $0 (${totalAllMonthsCount})
          </button>
        ` : ''}
      </div>

      <!-- Barra de Búsqueda Instantánea y Filtros Rápidos (Mejora 3) -->
      <div style="background:var(--bg-subtle);border:1px solid var(--border-color);border-radius:14px;padding:12px;margin-bottom:12px;">
        <div class="form-row-two" style="margin-bottom:8px;">
          <div class="input-group">
            <input
              type="search"
              id="tx-search-input"
              class="text-input"
              placeholder="🔎 Buscar por nota, comercio, categoría o monto (ej: Lider, 48.500)..."
              value="${txFilterState.searchQuery}"
              autocomplete="off"
            />
          </div>
          <div class="input-group">
            <select id="tx-filter-category" class="text-input">
              <option value="all" ${txFilterState.categoryId === 'all' ? 'selected' : ''}>📂 Todas las categorías</option>
              ${(appState.categories || []).map((c) => `
                <option value="${c.id}" ${txFilterState.categoryId === c.id ? 'selected' : ''}>${c.icon} ${c.name}</option>
              `).join('')}
            </select>
          </div>
        </div>

        <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:6px;">
          <span style="font-size:0.72rem;font-weight:700;color:var(--text-muted);margin-right:2px;">Cuenta:</span>
          <button type="button" class="chip-btn" style="${txFilterState.paymentMethod === 'all' ? 'background:var(--primary-accent);color:#fff;border-color:var(--primary-accent);' : ''}" data-action="set-tx-filter-pm" data-pm="all">Todos</button>
          <button type="button" class="chip-btn" style="${txFilterState.paymentMethod === 'cmr_falabella' ? 'background:var(--primary-accent);color:#fff;border-color:var(--primary-accent);' : ''}" data-action="set-tx-filter-pm" data-pm="cmr_falabella">🟢 CMR</button>
          <button type="button" class="chip-btn" style="${txFilterState.paymentMethod === 'bch_all' ? 'background:var(--primary-accent);color:#fff;border-color:var(--primary-accent);' : ''}" data-action="set-tx-filter-pm" data-pm="bch_all">🏦 B. Chile</button>
          <button type="button" class="chip-btn" style="${txFilterState.paymentMethod === 'cuenta_mujer' ? 'background:var(--primary-accent);color:#fff;border-color:var(--primary-accent);' : ''}" data-action="set-tx-filter-pm" data-pm="cuenta_mujer">💖 Fondo Marie</button>
          <button type="button" class="chip-btn" style="${txFilterState.paymentMethod === 'efectivo' ? 'background:var(--primary-accent);color:#fff;border-color:var(--primary-accent);' : ''}" data-action="set-tx-filter-pm" data-pm="efectivo">💵 Efectivo</button>
        </div>

        <div style="display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;align-items:center;">
          <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;">
            <span style="font-size:0.72rem;font-weight:700;color:var(--text-muted);margin-right:2px;">Autor:</span>
            <button type="button" class="chip-btn" style="${txFilterState.author === 'all' ? 'background:var(--primary-accent);color:#fff;border-color:var(--primary-accent);' : ''}" data-action="set-tx-filter-author" data-author="all">Ambos</button>
            <button type="button" class="chip-btn" style="${txFilterState.author === 'el' ? 'background:var(--primary-accent);color:#fff;border-color:var(--primary-accent);' : ''}" data-action="set-tx-filter-author" data-author="el">🧔‍♂️ Mauricio</button>
            <button type="button" class="chip-btn" style="${txFilterState.author === 'ella' ? 'background:var(--primary-accent);color:#fff;border-color:var(--primary-accent);' : ''}" data-action="set-tx-filter-author" data-author="ella">👩🏻 Marie</button>
          </div>

          <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;">
            <span style="font-size:0.72rem;font-weight:700;color:var(--text-muted);margin-right:2px;">Estado:</span>
            <button type="button" class="chip-btn" style="${txFilterState.reconciledStatus === 'all' ? 'background:var(--primary-accent);color:#fff;border-color:var(--primary-accent);' : ''}" data-action="set-tx-filter-rec" data-rec="all">Todos</button>
            <button type="button" class="chip-btn" style="${txFilterState.reconciledStatus === 'pending' ? 'background:var(--primary-accent);color:#fff;border-color:var(--primary-accent);' : ''}" data-action="set-tx-filter-rec" data-rec="pending">⏳ Pendientes de Conciliar</button>
          </div>
        </div>

        <div id="tx-filtered-summary-bar" style="margin-top:10px;padding-top:8px;border-top:1px dashed var(--border-strong);font-size:0.79rem;color:var(--text-secondary);">
          ${renderFilteredSummaryBarHtml(filteredTxs, monthTxs.length)}
        </div>
      </div>

      <div id="tx-filtered-list-container">
        ${renderTransactionRowsHtml(filteredTxs, monthTxs.length)}
      </div>
    </section>
  `;
}

function renderEditTransactionModal() {
  const tx = (appState.transactions || []).find((t) => t.id === editingTxId);
  if (!tx) return '';
  const categories = appState.categories || [];
  const fixedTemplates = appState.fixedTemplates || [];
  const showCategory = tx.type === 'expense' || tx.type === 'reimbursement';
  const showFixedLink = tx.type === 'expense';

  return `
    <div class="modal-backdrop" data-action="close-edit-modal-backdrop">
      <div class="modal-sheet" onclick="event.stopPropagation()">
        <div class="modal-header">
          <h3>✏️ Editar Movimiento</h3>
          <button type="button" class="btn-clear-amount" data-action="close-edit-tx">✕</button>
        </div>

        <form id="edit-tx-form">
          <div class="form-row-two">
            <div class="input-group">
              <label>Monto (CLP)</label>
              <input type="text" inputmode="numeric" id="edit-tx-amount" class="text-input live-clp-input" value="${formatLiveCLPInput(tx.amount)}" required />
            </div>
            <div class="input-group">
              <label>Fecha</label>
              <input type="date" id="edit-tx-date" class="text-input" value="${tx.date}" required />
            </div>
          </div>

          <div class="input-group" style="margin-bottom:10px;">
            <label>Naturaleza del Movimiento</label>
            <select id="edit-tx-type" class="text-input">
              <option value="expense" ${tx.type === 'expense' ? 'selected' : ''}>💸 Gasto Familiar Real</option>
              <option value="reimbursement" ${tx.type === 'reimbursement' ? 'selected' : ''}>↩️ Reembolso / Devolución (Suma cupo)</option>
              <option value="income" ${tx.type === 'income' ? 'selected' : ''}>💰 Ingreso del Mes</option>
              <option value="transfer_wife" ${tx.type === 'transfer_wife' ? 'selected' : ''}>💖 Recarga a Fondo Familiar de Marie</option>
              <option value="cmr_payment" ${tx.type === 'cmr_payment' ? 'selected' : ''}>🟢 Pago Facturación CMR Falabella</option>
              <option value="loan_given" ${tx.type === 'loan_given' ? 'selected' : ''}>🤝 Presté plata / Encargo por cobrar</option>
              <option value="loan_collected" ${tx.type === 'loan_collected' ? 'selected' : ''}>🤝 Me devolvieron préstamo que me debían</option>
              <option value="loan_received" ${tx.type === 'loan_received' ? 'selected' : ''}>📥 Me prestaron plata (Debo devolver)</option>
              <option value="loan_repaid" ${tx.type === 'loan_repaid' ? 'selected' : ''}>📤 Devolución de préstamo que debía</option>
              <option value="savings_withdrawal" ${tx.type === 'savings_withdrawal' ? 'selected' : ''}>🚨 Rescate desde Ahorros</option>
            </select>
          </div>

          <div id="edit-tx-cat-group" class="input-group" style="margin-bottom:10px;${showCategory ? '' : 'display:none;'}">
            <label>Categoría</label>
            <select id="edit-tx-category" class="text-input">
              ${categories.map((c) => `
                <option value="${c.id}" ${tx.categoryId === c.id ? 'selected' : ''}>${c.icon} ${c.name}</option>
              `).join('')}
            </select>
          </div>

          <div id="edit-tx-fixed-group" class="input-group" style="margin-bottom:10px;${showFixedLink ? '' : 'display:none;'}">
            <label>🏠 Vincular a Cuenta Fija del Mes (Opcional)</label>
            <select id="edit-tx-fixed-tpl" class="text-input">
              <option value="">— Gasto variable normal (No es cuenta fija) —</option>
              ${fixedTemplates.map((tpl) => `
                <option value="${tpl.id}" ${tx.fixedTemplateId === tpl.id ? 'selected' : ''}>🏠 ${tpl.name} (~${formatCLP(tpl.estimatedAmount)})</option>
              `).join('')}
            </select>
          </div>

          <div class="form-row-two">
            <div class="input-group">
              <label>Cuenta / Medio de Pago</label>
              <select id="edit-tx-pm" class="text-input">
                ${PAYMENT_METHODS.map((pm) => `
                  <option value="${pm.id}" ${tx.paymentMethod === pm.id ? 'selected' : ''}>${pm.icon} ${pm.name}</option>
                `).join('')}
              </select>
            </div>
            <div class="input-group">
              <label>Registrado por</label>
              <select id="edit-tx-author" class="text-input">
                <option value="el" ${tx.author !== 'ella' ? 'selected' : ''}>🧔‍♂️ Mauricio</option>
                <option value="ella" ${tx.author === 'ella' ? 'selected' : ''}>👩🏻 Marie</option>
              </select>
            </div>
          </div>

          <div class="input-group" style="margin-bottom:14px;">
            <label>Nota / Detalle</label>
            <input type="text" id="edit-tx-note" class="text-input" value="${tx.note || ''}" />
          </div>

          <button type="submit" class="btn-primary-giant">
            💾 Guardar Cambios
          </button>
        </form>
      </div>
    </div>
  `;
}

// ============================================================================
// TARJETA COMPACTA: DETECTOR DE GASTOS HORMIGA & SUSCRIPCIONES + COMPARATIVA MENSUAL
// ============================================================================
function renderAntExpensesAndComparisonCard(metrics) {
  const antReport = metrics.antReport || (
    typeof detectAntExpensesAndSubscriptions === 'function'
      ? detectAntExpensesAndSubscriptions(appState.transactions || [], activeYearMonth)
      : null
  );
  const comp = metrics.monthComparison || (
    typeof calculateMultiMonthComparison === 'function'
      ? calculateMultiMonthComparison(appState, activeYearMonth, 6)
      : null
  );

  const ant = antReport?.antExpenses || {
    count: 0,
    totalAmount: 0,
    annualizedProjection: 0,
    percentOfTotalSpend: 0,
    topMerchants: []
  };
  const subs = antReport?.subscriptions || {
    count: 0,
    totalMonthlySubscriptions: 0,
    annualizedSubscriptions: 0,
    items: [],
    duplicateAlerts: []
  };

  const prevMonthLabel = comp?.previousMonth?.yearMonth
    ? getMonthNameLabel(comp.previousMonth.yearMonth)
    : 'Mes anterior';
  const topCatChanges = (comp?.categoryDeltas || [])
    .filter((c) => c.currentSpent > 0 || c.prevSpent > 0)
    .slice(0, 4);

  return `
    <section class="card-panel mt-section">
      <div class="section-header-row" style="margin-bottom:12px;">
        <div>
          <h2 class="section-title">🐜 Detector de Gastos Hormiga & Suscripciones + 📈 Comparativa Mensual</h2>
          <p class="section-subtitle">Identifica micro-fugas silenciosas (≤ $15.000), suscripciones recurrentes y evolución frente a ${prevMonthLabel}</p>
        </div>
      </div>

      <div class="ant-comparison-grid">
        <!-- Columna 1: Gastos Hormiga & Suscripciones -->
        <div class="ant-card">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
            <strong style="font-size:0.88rem;">🐜 Gastos Hormiga & Suscripciones</strong>
            <span class="sem-badge ${ant.percentOfTotalSpend >= 15 ? 'bar-red' : ant.percentOfTotalSpend >= 8 ? 'bar-yellow' : 'bar-green'}">
              ${ant.count} micro-compras (${ant.percentOfTotalSpend}% del gasto)
            </span>
          </div>

          <p style="font-size:0.79rem;color:var(--text-secondary);">
            Total hormiga este mes: <strong>${formatCLP(ant.totalAmount)}</strong>
            (Proyección anual: <strong>${formatCLP(ant.annualizedProjection)}/año</strong>) •
            Suscripciones detectadas: <strong>${subs.count}</strong> por <strong>${formatCLP(subs.totalMonthlySubscriptions)}/mes</strong>.
          </p>

          ${ant.topMerchants && ant.topMerchants.length > 0 ? `
            <div class="ant-merchant-list">
              ${ant.topMerchants.slice(0, 4).map((m) => `
                <span class="ant-merchant-pill">
                  ${m.name}: <strong>${formatCLP(m.totalAmount)}</strong> (${m.count}x)
                </span>
              `).join('')}
            </div>
          ` : `
            <p style="font-size:0.76rem;color:var(--text-muted);">✅ Sin fugas de gastos hormiga registradas en ${getMonthNameLabel(activeYearMonth)}.</p>
          `}

          ${subs.duplicateAlerts && subs.duplicateAlerts.length > 0 ? `
            ${subs.duplicateAlerts.map((dup) => `
              <div class="sub-duplicate-alert">
                🚨 <strong>${dup.message}</strong>
              </div>
            `).join('')}
          ` : ''}
        </div>

        <!-- Columna 2: Comparativa vs Mes Anterior -->
        <div class="comparison-card">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
            <strong style="font-size:0.88rem;">📈 Comparativa vs ${prevMonthLabel}</strong>
            ${comp && comp.previousMonth.hasData ? `
              <span class="sem-badge ${comp.deltaExpense <= 0 ? 'bar-green' : 'bar-yellow'}">
                ${comp.deltaExpense > 0 ? '+' : ''}${formatCLP(comp.deltaExpense)} (${comp.deltaExpensePct > 0 ? '+' : ''}${comp.deltaExpensePct}%)
              </span>
            ` : `
              <span class="sem-badge bar-green">📊 Mes Base Activo</span>
            `}
          </div>

          ${comp ? `
            <p style="font-size:0.79rem;color:var(--text-secondary);">
              Gasto actual: <strong>${formatCLP(comp.currentMonth.netExpense)}</strong> vs
              ${prevMonthLabel}: <strong>${formatCLP(comp.previousMonth.netExpense)}</strong> •
              Ahorro estimado este mes: <strong>${formatCLP(comp.currentMonth.savingsAchieved)}</strong>.
            </p>
            ${topCatChanges.length > 0 ? `
              <div class="comparison-cat-list">
                ${topCatChanges.map((cd) => `
                  <span class="ant-merchant-pill">
                    ${cd.icon} ${cd.name}: <strong>${formatCLP(cd.currentSpent)}</strong>
                    (${cd.deltaAmount >= 0 ? `+${formatCLP(cd.deltaAmount)}` : formatCLP(cd.deltaAmount)})
                  </span>
                `).join('')}
              </div>
            ` : ''}
          ` : ''}
        </div>
      </div>
    </section>
  `;
}

// ============================================================================
// PESTAÑA 2: PRESUPUESTOS CON AGUJA DE RITMO ("📍 HOY") Y ARRASTRE MULTI-MES
// ============================================================================
function renderBudgetTab(metrics) {
  const categories = appState.categories || [];
  const paceDiff = metrics.budgetUsedPct - metrics.monthProgressPct;

  return `
    ${renderBurnRateAndDiagnosisWidget(metrics)}

    <section class="kpi-grid">
      <div class="kpi-card kpi-income">
        <span class="kpi-title">💰 Ingresos de ${getMonthNameLabel(activeYearMonth)}</span>
        <strong class="kpi-num">${formatCLP(metrics.effectiveIncome)}</strong>
        <span class="kpi-sub">Meta de ahorro blindada: <strong>${formatCLP(metrics.savingsGoal)}</strong></span>
      </div>

      <div class="kpi-card kpi-spent">
        <span class="kpi-title">📉 Total Gastado en el Mes</span>
        <strong class="kpi-num">${formatCLP(metrics.totalExpense)}</strong>
        <span class="kpi-sub">De ${formatCLP(metrics.spendableAfterSavings)} disponibles tras ahorro (${metrics.budgetUsedPct}%)</span>
      </div>

      <div class="kpi-card ${metrics.remainingSpendable >= 0 ? 'kpi-safe' : 'kpi-alert'}">
        <span class="kpi-title">🛡️ Margen Libre antes de tocar Ahorros</span>
        <strong class="kpi-num">${formatCLP(metrics.remainingSpendable)}</strong>
        <span class="kpi-sub">Equivale a <strong>${formatCLP(Math.max(0, Math.round(metrics.remainingSpendable / metrics.daysRemaining)))} / día</strong> por los ${metrics.daysRemaining} días restantes</span>
      </div>
    </section>

    <section class="card-panel mt-section">
      <div class="insights-grid">
        <div class="insight-box ${paceDiff > 8 ? 'insight-warn' : 'insight-good'}">
          <h4>⏱️ Velocidad del Gasto vs. Calendario</h4>
          <p>
            Hoy vamos en el <strong>${metrics.monthProgressPct}% del mes</strong> (día ${metrics.currentDay} de ${metrics.daysInMonth}) y llevan consumido el <strong>${metrics.budgetUsedPct}%</strong> del presupuesto.
            ${paceDiff > 8
              ? `⚠️ <strong>Cuidado:</strong> Van +${paceDiff}% más rápido que el calendario. Frenar Delivery/Gustos esta semana protege el ahorro.`
              : `✅ <strong>¡Ritmo impecable!</strong> Van por debajo de la aguja del calendario.`}
          </p>
        </div>

        <div class="insight-box insight-cmr">
          <h4>🟢 Escudo Anti-Trampa CMR (Con Arrastre Mensual)</h4>
          <p>
            Compras CMR de este mes: <strong>${formatCLP(metrics.cmrSpent)}</strong>${metrics.cmrCarryoverPrev > 0 ? ` + Facturación pendiente mes ant.: <strong>${formatCLP(metrics.cmrCarryoverPrev)}</strong>` : ''}.
            <br/>Pagado este mes: <strong>${formatCLP(metrics.cmrPaid)}</strong>.
            <br/>👉 <strong>Mantén ${formatCLP(metrics.cmrPendingReserve)} intocables en tu Banco de Chile</strong> para pagar la tarjeta.
          </p>
        </div>

        <div class="insight-box insight-wife">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px;">
            <h4 style="margin:0;">💖 Fondo Familiar de Marie (Con Arrastre)</h4>
            <button
              type="button"
              class="btn-whatsapp-couple btn-wa-pink"
              data-action="send-couple-whatsapp"
              data-msg-type="lowWifeWalletRequest"
              style="padding:4px 10px;font-size:0.72rem;"
            >
              💬 Avisar por WhatsApp
            </button>
          </div>
          <p>
            Recargado este mes: <strong>${formatCLP(metrics.transferredToWife)}</strong>${metrics.wifeCarryoverPrev !== 0 ? ` (Arrastre ant.: ${formatCLP(metrics.wifeCarryoverPrev)})` : ''}.
            <br/>Compras Familiares desde Cuenta de Marie: <strong>${formatCLP(metrics.spentFromWifeAccount)}</strong>.
            <br/>👉 Disponible en Fondo Familiar de Marie: <strong>${formatCLP(metrics.wifeWalletRemaining)}</strong>.
          </p>
        </div>
      </div>
    </section>

    ${renderAntExpensesAndComparisonCard(metrics)}

    <section class="card-panel mt-section">
      ${(() => {
        const spendableTarget = Math.max(
          0,
          Math.round(Number(metrics.monthCfg.incomeTarget || 2350000) - Number(metrics.monthCfg.savingsGoal || 250000))
        );
        const totalCatBudgeted = categories.reduce(
          (acc, c) => acc + Math.round(Number(metrics.monthCfg.categories?.[c.id] ?? c.defaultBudget ?? 0)),
          0
        );
        const diff = spendableTarget - totalCatBudgeted;
        const diffClass = diff === 0 ? 'bar-green' : diff > 0 ? 'bar-yellow' : 'bar-red';
        const diffLabel =
          diff === 0
            ? '✅ 100% Cuadrado con el Disponible'
            : diff > 0
              ? `💡 Faltan ${formatCLP(diff)} por distribuir`
              : `⚠️ Excede el disponible en ${formatCLP(Math.abs(diff))}`;

        return `
          <div class="section-header-row">
            <div>
              <div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;">
                <h2 class="section-title" style="margin:0;">🚦 Semáforo por Categoría (Aguja 📍 = Día ${metrics.currentDay})</h2>
                <span class="sem-badge ${diffClass}" style="font-size:0.75rem;">
                  Suma Presupuestos: ${formatCLP(totalCatBudgeted)} / ${formatCLP(spendableTarget)} (${diffLabel})
                </span>
              </div>
              <p class="section-subtitle" style="margin-top:4px;">Si la barra de color está a la izquierda de la aguja 📍 Hoy, vas ganándole al mes</p>
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;">
              <button
                type="button"
                class="btn-secondary"
                data-action="quick-distribute-budgets"
                style="border-color:var(--accent-primary);color:var(--accent-primary);font-weight:600;"
                title="Distribuye automáticamente el Ingreso Disponible (Ingreso - Ahorro) entre todas las categorías en base a proporciones"
              >
                ⚖️ Distribuir Ingreso por Proporciones
              </button>
              <button type="button" class="btn-secondary" data-action="clone-prev-budget">
                📋 Copiar Mes Anterior
              </button>
              <button type="button" class="btn-secondary" data-action="toggle-edit-budgets">
                ${isEditingBudgets ? '✖️ Cerrar Editor' : '✏️ Ajustar Presupuestos'}
              </button>
            </div>
          </div>
        `;
      })()}

      ${isEditingBudgets ? renderBudgetEditorForm(metrics) : `
        <div class="budget-bars-list">
          ${categories.map((cat) => {
            const budget = Number(metrics.monthCfg.categories?.[cat.id] ?? cat.defaultBudget ?? 0);
            const spent = Number(metrics.spentByCategory[cat.id] || 0);
            const rem = budget - spent;
            const pct = budget > 0 ? Math.round((spent / budget) * 100) : 0;
            const barWidth = Math.min(100, Math.max(0, pct));
            const colorClass = pct >= 95 ? 'bar-red' : pct >= 75 ? 'bar-yellow' : 'bar-green';
            const badgeText = pct >= 100 ? '🚨 Excedido' : pct >= 90 ? '🔴 Al Tope' : pct >= 75 ? '🟡 Cuidado' : '🟢 Saludable';
            const perDayRem = rem > 0 ? Math.round(rem / metrics.daysRemaining) : 0;
            const showPaceNeedle = cat.group !== 'fijo';

            return `
              <div class="budget-item-card">
                <div class="budget-item-top">
                  <div class="budget-cat-title">
                    <span class="budget-cat-icon">${cat.icon}</span>
                    <div>
                      <strong>${cat.name}</strong>
                      <small class="budget-cat-desc">${cat.description}</small>
                    </div>
                  </div>
                  <div class="budget-cat-numbers">
                    <span class="sem-badge ${colorClass}">${badgeText} (${pct}%)</span>
                    <div class="budget-amounts-pair">
                      <strong>${formatCLP(spent)}</strong> <span class="text-muted">de ${formatCLP(budget)}</span>
                    </div>
                  </div>
                </div>

                <div class="progress-track-wrapper">
                  ${showPaceNeedle ? `
                    <div class="pace-marker-line" style="left:${metrics.monthProgressPct}%" title="Hoy vamos en el ${metrics.monthProgressPct}% del mes">
                      <span class="pace-marker-label">📍Hoy</span>
                    </div>
                  ` : ''}
                  <div class="progress-track">
                    <div class="progress-fill ${colorClass}" style="width: ${barWidth}%"></div>
                  </div>
                </div>

                <div class="budget-item-footer">
                  <span>
                    ${rem >= 0
                      ? `✅ Quedan <strong>${formatCLP(rem)}</strong> disponibles`
                      : `⚠️ Excedido por <strong>${formatCLP(Math.abs(rem))}</strong>`}
                  </span>
                  ${rem > 0 && showPaceNeedle ? `
                    <span class="daily-allowance">Sugerido: ${formatCLP(perDayRem)} / día</span>
                  ` : ''}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `}
    </section>

    ${renderPatrimonyVaultSection(metrics)}
  `;
}

function renderPatrimonyVaultSection(metrics) {
  const patrimony = metrics.patrimonySummary || calculatePatrimonySummary(appState);
  const items = patrimony.items || [];
  const editingItem = editingPatrimonyId ? items.find((i) => i.id === editingPatrimonyId) : null;
  const showForm = isAddingPatrimonyItem || Boolean(editingItem) || items.length === 0;
  const hasBtcPresetAlready = items.some((i) => /bitcoin|btc|binance/i.test(`${i.name || ''} ${i.institution || ''}`));

  const categoryLabels = {
    crypto_hold: { icon: '₿', label: 'Cripto / Bitcoin (Hold Intocable)' },
    emergency_fund: { icon: '🛡️', label: 'Fondo de Emergencia / Colchón' },
    investment: { icon: '📈', label: 'Inversión / DAP / Fondos Mutuos / APV' },
    historical_savings: { icon: '🏦', label: 'Ahorro Histórico / Cuenta de Ahorro' }
  };

  return `
    <section class="card-panel mt-section" style="border:1.5px solid var(--border-strong);">
      <div class="section-header-row">
        <div>
          <div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;">
            <h2 class="section-title" style="margin:0;">🏦 Bóveda de Patrimonio Intocable & Cripto</h2>
            <span class="sem-badge bar-green" style="font-size:0.73rem;">🔒 100% Aislada del Presupuesto Mensual</span>
          </div>
          <p class="section-subtitle" style="margin-top:4px;">
            Registra tus ahorros históricos, Fondo de Emergencia o tu Bitcoin en Binance (~$5.000.000).
            <strong>Estos fondos están blindados: jamás inflan tu cupo diario ni se mezclan con la plata para gastar este mes.</strong>
          </p>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;">
          ${!hasBtcPresetAlready ? `
            <button type="button" class="btn-secondary" data-action="preset-patrimony-btc" style="border-color:#f59e0b;color:#b45309;">
              ₿ Cargar Bitcoin Binance ($5.000.000)
            </button>
          ` : ''}
          <button type="button" class="btn-secondary" data-action="toggle-add-patrimony">
            ${isAddingPatrimonyItem || editingItem ? '✖️ Cerrar Formulario' : '➕ Agregar Ahorro / Activo'}
          </button>
        </div>
      </div>

      <div class="kpi-grid" style="margin-top:12px;margin-bottom:14px;">
        <div class="kpi-card kpi-safe" style="padding:12px 14px;">
          <span class="kpi-title">💎 Patrimonio Total Acumulado</span>
          <strong class="kpi-num" style="font-size:1.35rem;">${formatCLP(patrimony.totalPatrimonyCLP)}</strong>
          <span class="kpi-sub">${patrimony.count} activo(s) fuera del gasto mensual</span>
        </div>
        <div class="kpi-card kpi-income" style="padding:12px 14px;">
          <span class="kpi-title">₿ Cripto / Hold Largo Plazo</span>
          <strong class="kpi-num" style="font-size:1.35rem;">${formatCLP(patrimony.cryptoHoldCLP)}</strong>
          <span class="kpi-sub">Reserva intocable (Binance / BTC)</span>
        </div>
        <div class="kpi-card kpi-spent" style="padding:12px 14px;">
          <span class="kpi-title">🛡️ Fondo Emergencia & Inversiones</span>
          <strong class="kpi-num" style="font-size:1.35rem;">${formatCLP(patrimony.emergencyFundCLP + patrimony.investmentsCLP)}</strong>
          <span class="kpi-sub">Liquidez de respaldo familiar</span>
        </div>
      </div>

      ${showForm ? `
        <form id="patrimony-item-form" class="budget-editor-box" style="margin-bottom:14px;">
          <h4 style="margin:0 0 10px;font-size:0.88rem;">
            ${editingItem ? `✏️ Editar Activo: ${editingItem.name}` : '➕ Registrar Activo en la Bóveda Patrimonial'}
          </h4>
          <div class="form-row-two">
            <div class="input-group">
              <label>Nombre del Activo / Ahorro</label>
              <input
                type="text"
                id="pat-name-input"
                class="text-input"
                placeholder="Ej: Bitcoin (BTC) — Hold Largo Plazo"
                value="${editingItem ? editingItem.name : ''}"
                required
              />
            </div>
            <div class="input-group">
              <label>Monto Estimado en Pesos (CLP)</label>
              <input
                type="text"
                inputmode="numeric"
                id="pat-amt-input"
                class="text-input live-clp-input"
                placeholder="5.000.000"
                value="${editingItem ? formatLiveCLPInput(editingItem.amountCLP) : ''}"
                required
              />
            </div>
          </div>

          <div class="form-row-two">
            <div class="input-group">
              <label>Tipo de Reserva</label>
              <select id="pat-cat-select" class="text-input">
                <option value="crypto_hold" ${editingItem?.category === 'crypto_hold' ? 'selected' : ''}>₿ Cripto / Bitcoin (Hold Intocable Largo Plazo)</option>
                <option value="emergency_fund" ${editingItem?.category === 'emergency_fund' ? 'selected' : ''}>🛡️ Fondo de Emergencia / Colchón Familiar</option>
                <option value="investment" ${editingItem?.category === 'investment' ? 'selected' : ''}>📈 Inversión / DAP / Fondos Mutuos / APV</option>
                <option value="historical_savings" ${!editingItem || editingItem?.category === 'historical_savings' ? 'selected' : ''}>🏦 Ahorro Histórico / Cuenta de Ahorro</option>
              </select>
            </div>
            <div class="input-group">
              <label>Institución / Custodia</label>
              <input
                type="text"
                id="pat-inst-input"
                class="text-input"
                placeholder="Ej: Binance, Banco de Chile, Fintual..."
                value="${editingItem ? editingItem.institution || '' : ''}"
              />
            </div>
          </div>

          <div class="form-row-two">
            <div class="input-group">
              <label>Titular</label>
              <select id="pat-owner-select" class="text-input">
                <option value="ambos" ${!editingItem || editingItem?.owner === 'ambos' ? 'selected' : ''}>👨‍👩‍👧 Familiar (Ambos)</option>
                <option value="el" ${editingItem?.owner === 'el' ? 'selected' : ''}>🧔‍♂️ Mauricio</option>
                <option value="ella" ${editingItem?.owner === 'ella' ? 'selected' : ''}>👩🏻 Marie</option>
              </select>
            </div>
            <div class="input-group">
              <label>Nota / Regla de Oro (Opcional)</label>
              <input
                type="text"
                id="pat-note-input"
                class="text-input"
                placeholder="Ej: No retirar nunca — ahorro largo plazo"
                value="${editingItem ? editingItem.note || '' : ''}"
              />
            </div>
          </div>

          <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;">
            <button type="submit" class="btn-primary">
              💾 ${editingItem ? 'Actualizar Activo Patrimonial' : 'Guardar en Bóveda Intocable'}
            </button>
            ${editingItem || isAddingPatrimonyItem ? `
              <button type="button" class="btn-secondary" data-action="cancel-patrimony-edit">
                Cancelar
              </button>
            ` : ''}
          </div>
        </form>
      ` : ''}

      ${items.length > 0 ? `
        <div class="tx-list">
          ${items.map((item) => {
            const catMeta = categoryLabels[item.category] || categoryLabels.historical_savings;
            const ownerBadge = item.owner === 'ella' ? '👩🏻 Marie' : item.owner === 'el' ? '🧔‍♂️ Mauricio' : '👨‍👩‍👧 Familiar';
            return `
              <div class="tx-row">
                <div class="tx-left" data-action="edit-patrimony-item" data-id="${item.id}" title="Toca para actualizar el valor de este activo">
                  <div class="tx-icon-circle">${catMeta.icon}</div>
                  <div class="tx-info">
                    <div class="tx-title-line">
                      <strong>${item.name}</strong>
                      ${item.institution ? `<span class="badge-fixed">🏛️ ${item.institution}</span>` : ''}
                      <span class="badge-reconciled">🔒 Intocable</span>
                    </div>
                    <div class="tx-note-line">${item.note || catMeta.label}</div>
                    <div class="tx-meta-line">
                      <span>${catMeta.label}</span>
                      <span>•</span>
                      <span>${ownerBadge}</span>
                    </div>
                  </div>
                </div>
                <div class="tx-right">
                  <div class="tx-amount tx-amt-income">${formatCLP(item.amountCLP)}</div>
                  <button type="button" class="btn-edit-tx" data-action="edit-patrimony-item" data-id="${item.id}" title="Editar monto o detalle">
                    ✏️
                  </button>
                  <button type="button" class="btn-delete-tx" data-action="delete-patrimony-item" data-id="${item.id}" title="Eliminar de la bóveda">
                    🗑️
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      ` : `
        <p style="font-size:0.82rem;color:var(--text-muted);margin:4px 0 0;">
          Aún no has registrado activos en tu bóveda patrimonial. Usa el botón <strong>"₿ Cargar Bitcoin Binance ($5.000.000)"</strong> o completa el formulario arriba.
        </p>
      `}
    </section>
  `;
}

function renderBudgetEditorForm(metrics) {
  const categories = appState.categories || [];
  const incomeTarget = Math.round(Number(metrics.monthCfg.incomeTarget || 2350000));
  const savingsGoal = Math.round(Number(metrics.monthCfg.savingsGoal || 250000));
  const spendableTarget = Math.max(0, incomeTarget - savingsGoal);
  const currentSum = categories.reduce(
    (acc, cat) => acc + Math.round(Number(metrics.monthCfg.categories?.[cat.id] ?? cat.defaultBudget ?? 0)),
    0
  );
  const diff = spendableTarget - currentSum;
  const allocatedPct = spendableTarget > 0 ? Math.round((currentSum / spendableTarget) * 100) : 0;
  const barWidth = Math.min(100, Math.max(0, allocatedPct));
  const diffClass = diff === 0 ? 'bar-green' : diff > 0 ? 'bar-yellow' : 'bar-red';
  const diffText =
    diff === 0
      ? '✅ ¡100% Cuadrado! La suma calza exacto con tu ingreso disponible'
      : diff > 0
        ? `💡 Quedan ${formatCLP(diff)} sin asignar (toca "Distribuir por Proporciones" para repartirlos)`
        : `⚠️ Te pasaste por ${formatCLP(Math.abs(diff))} sobre tu ingreso disponible tras ahorro`;

  return `
    <form id="budget-editor-form" class="budget-editor-box">
      <div class="form-row-two">
        <div class="input-group">
          <label>💰 Ingreso Familiar Mensual Esperado (CLP)</label>
          <input type="text" inputmode="numeric" id="budget-income-input" name="incomeTarget" class="text-input live-clp-input" value="${formatLiveCLPInput(incomeTarget)}" required />
        </div>
        <div class="input-group">
          <label>🛡️ Meta de Ahorro Mensual Intocable (CLP)</label>
          <input type="text" inputmode="numeric" id="budget-savings-input" name="savingsGoal" class="text-input live-clp-input" value="${formatLiveCLPInput(savingsGoal)}" required />
        </div>
      </div>

      <!-- Barra de Suma Dinámica y Distribución Proporcional en Tiempo Real -->
      <div id="budget-live-balance-box" style="background:var(--bg-subtle);border:1.5px solid var(--border-strong);border-radius:12px;padding:12px 14px;margin:12px 0;">
        <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px;">
          <div style="font-size:0.84rem;">
            <span>Disponible tras Ahorro: <strong id="budget-live-spendable">${formatCLP(spendableTarget)}</strong></span>
            <span style="margin:0 6px;">•</span>
            <span>Suma Categorías: <strong id="budget-live-sum">${formatCLP(currentSum)}</strong> (<span id="budget-live-pct">${allocatedPct}%</span>)</span>
          </div>
          <span id="budget-live-diff-badge" class="sem-badge ${diffClass}" style="font-size:0.78rem;">
            ${diffText}
          </span>
        </div>

        <div class="progress-track" style="height:8px;margin-bottom:10px;">
          <div id="budget-live-progress-bar" class="progress-fill ${diffClass}" style="width:${barWidth}%;"></div>
        </div>

        <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:10px;">
          <label style="display:flex;align-items:center;gap:6px;font-size:0.8rem;cursor:pointer;font-weight:500;">
            <input type="checkbox" id="budget-auto-adjust-check" checked style="width:16px;height:16px;accent-color:var(--accent-primary);" />
            <span>🔄 <strong>Auto-cuadrar dinámicamente:</strong> al editar un monto, reajustar el resto proporcionalmente para que siempre sume el disponible</span>
          </label>
          <div style="display:flex;flex-wrap:wrap;gap:8px;">
            <button
              type="button"
              class="btn-secondary"
              data-action="editor-distribute-proportional"
              data-mode="current"
              style="padding:6px 12px;font-size:0.78rem;border-color:var(--accent-primary);color:var(--accent-primary);font-weight:600;"
            >
              ⚖️ Distribuir según Proporciones Actuales (100%)
            </button>
            <button
              type="button"
              class="btn-secondary"
              data-action="editor-distribute-proportional"
              data-mode="recommended"
              style="padding:6px 12px;font-size:0.78rem;"
            >
              📊 Aplicar Proporción Ideal Recomendada
            </button>
          </div>
        </div>
      </div>

      <h4 style="margin:12px 0 8px;font-size:0.88rem;">Presupuesto Máximo por Categoría para ${getMonthNameLabel(activeYearMonth)}</h4>
      <div class="editor-cats-grid">
        ${categories.map((cat) => {
          const catAmt = Math.round(Number(metrics.monthCfg.categories?.[cat.id] ?? cat.defaultBudget ?? 0));
          const catPct = spendableTarget > 0 ? Math.round((catAmt / spendableTarget) * 1000) / 10 : 0;
          return `
            <div class="input-group">
              <label style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
                <span>${cat.icon} ${cat.name}</span>
                <span style="display:flex;align-items:center;gap:4px;">
                  <span data-cat-lock-badge="${cat.id}" style="display:none;font-size:0.68rem;background:#e0e7ff;color:#4338ca;padding:1px 6px;border-radius:999px;cursor:pointer;" title="Fijado manualmente (toca para desbloquear)">📌 Fijo</span>
                  <span class="sem-badge bar-green" data-cat-pct-badge="${cat.id}" style="font-size:0.7rem;padding:1px 6px;">${catPct}%</span>
                </span>
              </label>
              <input
                type="text"
                inputmode="numeric"
                name="cat_${cat.id}"
                data-cat-id="${cat.id}"
                class="text-input live-clp-input budget-cat-input"
                value="${formatLiveCLPInput(catAmt)}"
                required
              />
            </div>
          `;
        }).join('')}
      </div>

      <button type="submit" class="btn-primary-giant" style="margin-top:12px;">
        💾 Guardar Presupuestos de ${getMonthNameLabel(activeYearMonth)}
      </button>
    </form>
  `;
}

// ============================================================================
// PESTAÑA 3: PLANTILLA DE GASTOS FIJOS DEL MES (1 CLIC)
// ============================================================================
function renderFixedTab(metrics) {
  const templates = appState.fixedTemplates || [];

  return `
    <section class="card-panel">
      <div class="section-header-row">
        <div>
          <h2 class="section-title">🏠 Gastos Fijos de ${getMonthNameLabel(activeYearMonth)}</h2>
          <p class="section-subtitle">
            Confirma con 1 toque las cuentas del mes (Arriendo, GGCC, Luz, Agua, Gas, Internet). Jamás se olvidan ni se duplican.
          </p>
        </div>
      </div>

      <div class="fixed-checklist">
        ${templates.map((tpl) => {
          const paidTx = metrics.txs.find((t) => t.fixedTemplateId === tpl.id);
          return `
            <div class="fixed-row ${paidTx ? 'fixed-paid' : 'fixed-pending'}">
              <div class="fixed-info">
                <div class="fixed-status-icon">${paidTx ? '✅' : '⏳'}</div>
                <div>
                  <strong class="fixed-name">${tpl.name}</strong>
                  <div class="fixed-meta">
                    <span>Vence día ~${tpl.dayOfMonth || 5}</span>
                    <span>•</span>
                    <span>Estimado: ${formatCLP(tpl.estimatedAmount)}</span>
                  </div>
                </div>
              </div>

              ${paidTx ? `
                <div style="display:flex;align-items:center;gap:10px;">
                  <span style="font-size:0.82rem;">Pagado (${paidTx.date}): <strong>${formatCLP(paidTx.amount)}</strong></span>
                  <button type="button" class="btn-outline-danger-sm" data-action="delete-tx" data-id="${paidTx.id}">
                    Deshacer
                  </button>
                </div>
              ` : `
                <div class="fixed-confirm-controls">
                  <input
                    type="text"
                    inputmode="numeric"
                    id="fix-amt-${tpl.id}"
                    class="text-input fixed-amt-input live-clp-input"
                    value="${formatLiveCLPInput(tpl.estimatedAmount)}"
                    title="Monto exacto de la cuenta este mes"
                  />
                  <select id="fix-pm-${tpl.id}" class="text-input fixed-pm-select">
                    ${PAYMENT_METHODS.map((pm) => `
                      <option value="${pm.id}" ${tpl.defaultPaymentMethod === pm.id ? 'selected' : ''}>${pm.icon} ${pm.shortName}</option>
                    `).join('')}
                  </select>
                  <button
                    type="button"
                    class="btn-confirm-fixed"
                    data-action="confirm-fixed-item"
                    data-tpl="${tpl.id}"
                  >
                    Confirmar
                  </button>
                </div>
              `}
            </div>
          `;
        }).join('')}
      </div>

      <form id="add-fixed-template-form" class="add-fixed-form">
        <h4>➕ Agregar nuevo Gasto Fijo a la Plantilla (ej. Sala Cuna, Seguro)</h4>
        <div class="form-row-three">
          <input type="text" id="new-fix-name" class="text-input" placeholder="Nombre (ej. Sala Cuna)" required />
          <input type="text" inputmode="numeric" id="new-fix-amount" class="text-input live-clp-input" placeholder="Monto estimado CLP" required />
          <button type="submit" class="btn-secondary">Agregar Fijo</button>
        </div>
      </form>
    </section>
  `;
}

// ============================================================================
// PESTAÑA 4: CONCILIADOR CON FILTROS INTELIGENTES PARA MARIE Y MAURICIO
// ============================================================================
function renderReconcileTab() {
  const categories = appState.categories || [];
  const analyzed = reconcileState.analyzedRows;

  const matchedCount = analyzed ? analyzed.filter((r) => r.status === 'matched_duplicate').length : 0;
  const internalCount = analyzed ? analyzed.filter((r) => r.status === 'internal').length : 0;
  const incomingCount = analyzed ? analyzed.filter((r) => r.status === 'incoming_abono').length : 0;
  const forgottenCount = analyzed ? analyzed.filter((r) => r.status === 'forgotten_new').length : 0;
  const reviewCount = forgottenCount + incomingCount;

  const filteredRows = analyzed
    ? analyzed
        .map((row, originalIdx) => ({ row, originalIdx }))
        .filter(({ row }) => {
          if (reconcileState.filterTab === 'review') {
            return row.status === 'forgotten_new' || row.status === 'incoming_abono';
          }
          if (reconcileState.filterTab === 'internal') {
            return row.status === 'internal';
          }
          if (reconcileState.filterTab === 'matched') {
            return row.status === 'matched_duplicate';
          }
          return true;
        })
    : [];

  return `
    <section class="card-panel">
      <div class="section-header-row">
        <div>
          <h2 class="section-title">🔍 Conciliador Inteligente (Banco de Chile & CMR)</h2>
          <p class="section-subtitle">
            Sube tu archivo <code>.xls</code> o <code>.xlsx</code>: bloquea duplicados, cruza préstamos de Juanito y pre-clasifica abonos para que solo confirmes con 1 clic.
          </p>
        </div>
        <button type="button" class="btn-secondary" data-action="load-sample-statement">
          📋 Probar Cartola Ejemplo
        </button>
      </div>

      <div class="reconcile-input-area">
        <div class="reconcile-toolbar">
          <label class="btn-upload-csv">
            📂 Subir Cartola Banco de Chile / CMR (.xls, .xlsx, .csv)
            <input type="file" id="statement-file-input" accept=".csv,.txt,.xlsx,.xls" hidden />
          </label>
          <div class="source-default-wrap">
            <span>Cuenta de la cartola:</span>
            <select id="reconcile-default-pm" class="text-input" style="width:auto;">
              ${PAYMENT_METHODS.map((pm) => `
                <option value="${pm.id}" ${reconcileState.defaultSourceMethod === pm.id ? 'selected' : ''}>${pm.icon} ${pm.name}</option>
              `).join('')}
            </select>
          </div>
        </div>

        <textarea
          id="statement-textarea"
          class="statement-textarea"
          rows="4"
          placeholder="Sube el archivo arriba o pega aquí las líneas de tu cartola..."
        >${reconcileState.rawText}</textarea>

        <button type="button" class="btn-primary-giant" data-action="analyze-statement">
          🔍 Analizar Cartola Ahora
        </button>
      </div>

      ${analyzed ? `
        <div class="reconcile-results">
          <!-- Sub-pestañas de filtrado para evitar ruido visual -->
          <div class="reconcile-filter-tabs">
            <button type="button" class="rec-filter-btn ${reconcileState.filterTab === 'review' ? 'active' : ''}" data-action="set-rec-filter" data-filter="review">
              🎯 Por Confirmar (${reviewCount})
            </button>
            <button type="button" class="rec-filter-btn ${reconcileState.filterTab === 'internal' ? 'active' : ''}" data-action="set-rec-filter" data-filter="internal">
              🔄 Traspasos Propios / Marie (${internalCount})
            </button>
            <button type="button" class="rec-filter-btn ${reconcileState.filterTab === 'matched' ? 'active' : ''}" data-action="set-rec-filter" data-filter="matched">
              ✅ Ya Registrados (${matchedCount})
            </button>
            <button type="button" class="rec-filter-btn ${reconcileState.filterTab === 'all' ? 'active' : ''}" data-action="set-rec-filter" data-filter="all">
              📋 Todos (${analyzed.length})
            </button>
            ${forgottenCount > 0 ? `
              <button type="button" class="btn-secondary-sm" data-action="ai-classify-statement" style="margin-left:auto;">
                ✨ Refinar comercios con Gemini IA
              </button>
            ` : ''}
          </div>

          ${filteredRows.length === 0 ? `
            <div class="empty-state">
              🎉 No hay movimientos pendientes en esta vista. Puedes cambiar de filtro arriba o confirmar la conciliación abajo.
            </div>
          ` : `
            <div class="reconcile-rows-list">
              ${filteredRows.map(({ row, originalIdx: idx }) => {
                if (row.status === 'matched_duplicate') {
                  return `
                    <div class="rec-row rec-row-matched">
                      <div class="rec-row-left">
                        <span class="rec-status-pill pill-matched">✅ YA REGISTRADO (NO SE DUPLICA)</span>
                        <strong>${row.description}</strong>
                        <small>📅 ${row.date} • ${row.matchReason}</small>
                      </div>
                      <div class="rec-row-right">
                        <strong class="rec-amount">${formatCLP(row.amount)}</strong>
                      </div>
                    </div>
                  `;
                }

                if (row.status === 'internal') {
                  const isToWife = row.internalType === 'transfer_wife';
                  const isSelf = row.internalType === 'transfer_self';
                  const badgeTitle = isToWife
                    ? '💖 RECARGA A FONDO FAMILIAR DE MARIE'
                    : isSelf
                      ? '🔄 ENTRE MIS CUENTAS (IGNORADO)'
                      : '🟢 PAGO FACTURACIÓN CMR';
                  const subText = isToWife
                    ? 'No suma como gasto; recarga el saldo disponible del Fondo Familiar de Marie.'
                    : isSelf
                      ? 'Traspaso entre tus propias cuentas (ej. Cta. Cte. ↔ FAN). Se ignora automáticamente.'
                      : 'Pago de tarjeta CMR.';

                  return `
                    <div class="rec-row rec-row-internal">
                      <div class="rec-row-left">
                        <span class="rec-status-pill pill-internal">${badgeTitle}</span>
                        <strong>${row.description}</strong>
                        <small>📅 ${row.date} • ${subText}</small>
                      </div>
                      <div class="rec-row-controls">
                        <select class="text-input rec-internal-type-select" data-idx="${idx}" style="width:auto;">
                          <option value="transfer_self" ${row.internalType === 'transfer_self' ? 'selected' : ''}>🔄 Entre mis cuentas (Ignorar)</option>
                          <option value="transfer_wife" ${row.internalType === 'transfer_wife' ? 'selected' : ''}>💖 Recarga a Fondo Familiar de Marie</option>
                          <option value="cmr_payment" ${row.internalType === 'cmr_payment' ? 'selected' : ''}>🟢 Pago Facturación CMR</option>
                          <option value="convert_to_expense">💸 Es un Gasto Real (Pago a 3º)</option>
                        </select>
                        ${row.internalType !== 'transfer_self' ? `
                          <label class="rec-checkbox-label">
                            <input type="checkbox" class="rec-select-check" data-idx="${idx}" ${row.selectedToImport ? 'checked' : ''} />
                            <strong>Registrar (${formatCLP(row.amount)})</strong>
                          </label>
                        ` : `
                          <strong class="rec-amount text-muted">${formatCLP(row.amount)}</strong>
                        `}
                      </div>
                    </div>
                  `;
                }

                if (row.status === 'incoming_abono') {
                  return `
                    <div class="rec-row rec-row-incoming">
                      <div class="rec-row-left">
                        <span class="rec-status-pill pill-matched">💰 ABONO RECIBIDO (+${formatCLP(row.amount)})</span>
                        <strong>${row.description}</strong>
                        <small>📅 ${row.date} • ${row.smartHint || ''}</small>
                      </div>
                      <div class="rec-row-controls">
                        <select class="text-input rec-abono-action-select" data-idx="${idx}" style="width:auto;">
                          <option value="income" ${row.abonoAction === 'income' ? 'selected' : ''}>💰 Ingreso Extra del Mes</option>
                          <option value="reimburse" ${row.abonoAction === 'reimburse' ? 'selected' : ''}>↩️ Reembolso / Cuenta Compartida (Suma cupo)</option>
                          <option value="loan_received" ${row.abonoAction === 'loan_received' ? 'selected' : ''}>📥 Me prestaron plata (Debo devolverlo)</option>
                          <option value="loan_collected" ${row.abonoAction === 'loan_collected' ? 'selected' : ''}>🤝 Me devolvieron plata que me debían</option>
                          <option value="savings_withdrawal" ${row.abonoAction === 'savings_withdrawal' ? 'selected' : ''}>🚨 Rescate desde mis Ahorros</option>
                          <option value="ignore" ${row.abonoAction === 'ignore' ? 'selected' : ''}>🙈 Ignorar este abono</option>
                        </select>
                        ${row.abonoAction === 'reimburse' ? `
                          <select class="text-input rec-reimburse-cat-select" data-idx="${idx}" style="width:auto;">
                            ${categories.map((c) => `
                              <option value="${c.id}" ${row.reimburseCategoryId === c.id ? 'selected' : ''}>Devolver a: ${c.icon} ${c.name}</option>
                            `).join('')}
                          </select>
                        ` : ''}
                        ${row.abonoAction !== 'ignore' ? `
                          <label class="rec-checkbox-label">
                            <input type="checkbox" class="rec-select-check" data-idx="${idx}" ${row.selectedToImport ? 'checked' : ''} />
                            <strong>Confirmar ${formatCLP(row.amount)}</strong>
                          </label>
                        ` : `
                          <strong class="rec-amount text-muted">Ignorado</strong>
                        `}
                      </div>
                    </div>
                  `;
                }

                return `
                  <div class="rec-row rec-row-forgotten">
                    <div class="rec-row-left">
                      <span class="rec-status-pill pill-forgotten">🚨 CARGO NO REGISTRADO (-${formatCLP(row.amount)})</span>
                      <strong>${row.description}</strong>
                      <small>📅 ${row.date} • ${row.smartHint || ''}</small>
                    </div>
                    <div class="rec-row-controls">
                      <select class="text-input rec-cat-select" data-idx="${idx}" style="width:auto;">
                        <optgroup label="Categorías de Gasto Familiar">
                          ${categories.map((c) => `
                            <option value="${c.id}" ${row.suggestedCategoryId === c.id ? 'selected' : ''}>${c.icon} ${c.name}</option>
                          `).join('')}
                        </optgroup>
                        <optgroup label="Préstamos y Devoluciones (No suman gasto)">
                          <option value="__loan_repaid__" ${row.suggestedCategoryId === '__loan_repaid__' ? 'selected' : ''}>📤 Devolución de Préstamo (Ej: Pagarle a Juanito)</option>
                          <option value="__loan_given__" ${row.suggestedCategoryId === '__loan_given__' ? 'selected' : ''}>🤝 Presté plata / Encargo (Me deben devolver)</option>
                        </optgroup>
                      </select>
                      <label class="rec-checkbox-label">
                        <input type="checkbox" class="rec-select-check" data-idx="${idx}" ${row.selectedToImport ? 'checked' : ''} />
                        <strong>Incorporar ${formatCLP(row.amount)}</strong>
                      </label>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          `}

          <button type="button" class="btn-primary-giant mt-btn" data-action="import-reconciled-rows">
            ✅ Confirmar Seleccionados y Guardar en Memoria Familiar
          </button>
        </div>
      ` : ''}
    </section>
  `;
}

// ============================================================================
// PESTAÑA 5: IPHONE WIFI QR, GOOGLE SHEETS (4G/5G), EXCEL & GEMINI IA
// ============================================================================
function renderCloudTab() {
  const webhookUrl =
    userPrefs.googleSheetsWebhookUrl || appState.sharedIntegrations?.googleSheetsWebhookUrl || '';
  const hasCloudConnected = Boolean(webhookUrl && webhookUrl.startsWith('https://script.google.com/'));
  const marieMagicUrl = buildMagicInstallLink('ella');
  const localWifiUrl = `http://${detectedLocalIp}:8090`;
  const qrImgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(marieMagicUrl)}`;

  return `
    <section class="card-panel" style="margin-bottom:16px;border:2px solid var(--primary-accent);">
      <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:18px;">
        <div style="flex:1;min-width:260px;">
          <div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:6px;">
            <h2 class="section-title" style="margin:0;">🌍 Modo Online iPhone: Santiago ↔ Algarrobo</h2>
            <span class="rec-status-pill ${hasCloudConnected ? 'pill-matched' : 'pill-internal'}" style="font-size:0.75rem;">
              ${hasCloudConnected ? '🟢 Nube Conectada en Vivo' : '🟡 Paso 1: Conecta tu Google Sheet abajo'}
            </span>
          </div>
          <p class="section-subtitle" style="margin-top:4px;">
            ${
              hasCloudConnected
                ? '¡Todo listo! El Link Mágico de abajo ya lleva tu Google Sheets integrado y el perfil de 👩🏻 Marie pre-seleccionado para que ella lo abra en Algarrobo sin configurar nada:'
                : 'Para que tu iPhone en Santiago y el de Marie en Algarrobo sincronicen solos con 4G/5G/WiFi, primero pega abajo la URL de tu Google Sheet y luego envíale el Link Mágico por WhatsApp:'
            }
          </p>
          <ol class="setup-steps" style="margin-top:10px;font-size:0.84rem;">
            <li>Toca <strong>"💬 Enviar App Lista por WhatsApp a Marie"</strong> abajo.</li>
            <li>Marie abre ese link en <strong>Safari</strong> en su iPhone en Algarrobo y toca <strong>Compartir → "Agregar a pantalla de inicio"</strong>.</li>
            <li>¡Listo! Cada vez que tú en Santiago o ella en Algarrobo anoten un gasto, ambos iPhones se actualizan solos en segundos sin pisarse los datos.</li>
          </ol>

          <div class="cloud-actions-row" style="margin-top:14px;display:flex;flex-wrap:wrap;gap:10px;">
            <button type="button" class="btn-primary" data-action="share-whatsapp-marie" style="background:#16a34a;border-color:#16a34a;">
              💬 Enviar App Lista por WhatsApp a Marie
            </button>
            <button type="button" class="btn-secondary" data-action="copy-marie-link">
              📋 Copiar Link Mágico de Marie
            </button>
            <button type="button" class="btn-secondary" data-action="copy-mauricio-link">
              🧔‍♂️ Copiar Mi Link (Mauricio)
            </button>
          </div>
        </div>
        <div style="text-align:center;background:#ffffff;padding:12px;border-radius:16px;border:1px solid #cbd5e1;min-width:170px;">
          <img src="${qrImgUrl}" alt="QR iPhone Online" width="144" height="144" style="display:block;margin:0 auto 6px;border-radius:8px;" />
          <strong style="font-size:0.74rem;color:#0f172a;display:block;">QR Directo para Marie</strong>
          <small style="font-size:0.68rem;color:#475569;display:block;margin-top:2px;">WiFi Casa: ${localWifiUrl}</small>
        </div>
      </div>
    </section>

    <div class="cloud-grid">
      <section class="card-panel">
        <h2 class="section-title">☁️ Motor en la Nube (Google Sheets 4G/5G Automático)</h2>
        <p class="section-subtitle">
          Sincroniza automáticamente cada 10 segundos entre Santiago y Algarrobo y respalda todo en tu Google Drive.
        </p>

        <div class="input-group mt-sm">
          <label>URL de tu Web App de Google Apps Script (Se incluye sola en el Link Mágico de Marie)</label>
          <input
            type="url"
            id="gsheets-url-input"
            class="text-input"
            placeholder="https://script.google.com/macros/s/.../exec"
            value="${webhookUrl}"
          />
        </div>

        <div class="cloud-actions-row">
          <button type="button" class="btn-primary" data-action="save-and-sync-up">
            ☁️ Guardar y Activar Sincronización Online
          </button>
          <button type="button" class="btn-secondary" data-action="sync-down-sheets">
            🔄 Fusionar Ahora
          </button>
        </div>

        <div class="setup-guide-box">
          <h4>📋 Actívalo gratis en 90 segundos (solo 1 vez):</h4>
          <ol class="setup-steps">
            <li>Crea una hoja en <a href="https://sheets.new" target="_blank" rel="noopener" style="color:var(--primary-accent);">sheets.new</a> y entra a <strong>Extensiones → Apps Script</strong>.</li>
            <li>Copia el código con el botón de abajo, pégalo en Apps Script y dale a <strong>Implementar → Nueva implementación → Aplicación web (Acceso: Cualquier persona)</strong>.</li>
            <li>Pega la URL generada arriba, toca <strong>Guardar</strong> y mándale el botón verde de WhatsApp a Marie.</li>
          </ol>
          <button type="button" class="btn-secondary-sm" data-action="copy-apps-script-code">
            📋 Copiar Código Google Apps Script (Con Fusión Anticolisión)
          </button>
        </div>
      </section>

      <section class="card-panel">
        <h2 class="section-title">🤖 Escáner IA (Gemini 3.8 Flash) & Excel (.xlsx)</h2>
        <p class="section-subtitle">
          Se usa en 2 funciones opcionales: <strong>Escanear fotos de boletas</strong> y <strong>Clasificar comercios raros de cartola</strong>.
        </p>

        <div class="input-group mt-sm">
          <label>Gemini API Key (Se comparte automáticamente en tus dispositivos familiares)</label>
          <input
            type="password"
            id="gemini-key-input"
            class="text-input"
            placeholder="AIzaSy..."
            value="${userPrefs.geminiApiKey || appState.sharedIntegrations?.geminiApiKey || ''}"
          />
        </div>
        <button type="button" class="btn-secondary mt-xs" data-action="save-gemini-key">
          🔑 Guardar Clave Gemini API
        </button>

        <hr class="divider" />

        <h3 class="section-title">📊 Exportar Libro Microsoft Excel (.xlsx)</h3>
        <p class="section-subtitle">
          Descarga tu respaldo con 3 hojas listas: <strong>Resumen_Presupuesto</strong>, <strong>Movimientos_${activeYearMonth}</strong> y <strong>Gastos_Fijos</strong>.
        </p>
        <button type="button" class="btn-primary-giant mt-sm" data-action="export-excel">
          📥 Descargar Libro Excel Completo (.xlsx)
        </button>

        <hr class="divider" />

        <h3 class="section-title">💾 Respaldo y Restauración Instantánea (.json)</h3>
        <p class="section-subtitle">
          Guarda una copia íntegra de toda tu historia financiera (movimientos, presupuestos, bóveda cripto y contactos aprendidos) o fusiónala en 1 clic sin perder nada.
        </p>
        <div class="cloud-actions-row mt-sm" style="display:flex;flex-wrap:wrap;gap:8px;">
          <button type="button" class="btn-secondary" data-action="export-json-backup">
            💾 Descargar Respaldo (.json)
          </button>
          <button type="button" class="btn-secondary" data-action="trigger-import-json-backup">
            📂 Restaurar / Fusionar Respaldo (.json)
          </button>
          <input type="file" id="import-json-backup-input" accept=".json,application/json" style="display:none;" />
        </div>
      </section>
    </div>
  `;
}

// ============================================================================
// CONTROLADORES Y EVENTOS (SIN PÉRDIDA DE FOCO EN IPHONE)
// ============================================================================
function applySmartNaturalInput() {
  const inputEl = document.getElementById('smart-natural-input');
  const rawVal = String(inputEl ? inputEl.value : quickForm.naturalInputText || '').trim();
  if (!rawVal) {
    showToast('Dicta o escribe una frase como "Jumbo 45mil cmr 3 cuotas" o "Feria 15000"', 'error');
    return;
  }

  const parsed = parseQuickNaturalExpense(rawVal, userPrefs.activeAuthor || 'el');
  if (parsed.amount > 0) {
    quickForm.amount = String(parsed.amount);
  }
  if (parsed.categoryId && parsed.categoryId !== 'traspaso_interno') {
    quickForm.categoryId = parsed.categoryId;
  }
  if (parsed.paymentMethod) {
    quickForm.paymentMethod = parsed.paymentMethod;
  }
  quickForm.installments =
    quickForm.paymentMethod === 'cmr_falabella' ? Math.max(1, Number(parsed.installments || 1)) : 1;
  if (parsed.cleanNote) {
    quickForm.note = parsed.cleanNote;
  }
  quickForm.naturalInputText = '';

  const catObj = (appState.categories || []).find((c) => c.id === quickForm.categoryId);
  const catName = catObj ? `${catObj.icon} ${catObj.name}` : quickForm.categoryId;

  showToast(
    `✨ Detectado: ${parsed.amount > 0 ? formatCLP(parsed.amount) : 'Monto por completar'} → ${catName}${
      quickForm.paymentMethod === 'cmr_falabella' && quickForm.installments > 1
        ? ` (${quickForm.installments} cuotas)`
        : ''
    }`,
    'success'
  );
  renderApp();
}

function attachDynamicInputListeners() {
  const monthPicker = document.getElementById('month-picker');
  if (monthPicker) {
    monthPicker.onchange = (e) => {
      if (e.target.value) {
        activeYearMonth = e.target.value;
        ensureMonthBudget(appState, activeYearMonth);
        renderApp();
      }
    };
  }

  // Barra de Frase Rápida / Dictado de Voz iPhone (#smart-natural-input)
  const naturalInput = document.getElementById('smart-natural-input');
  if (naturalInput) {
    naturalInput.oninput = (e) => {
      quickForm.naturalInputText = e.target.value;
    };
    naturalInput.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        applySmartNaturalInput();
      }
    };
  }

  // Formateo en vivo de todos los inputs de pesos chilenos (.live-clp-input)
  document.querySelectorAll('.live-clp-input').forEach((inp) => {
    inp.oninput = (e) => {
      const formatted = formatLiveCLPInput(e.target.value);
      if (e.target.value !== formatted) {
        e.target.value = formatted;
      }
    };
  });

  // Visor de monto rápido: formatea en vivo $150.000 y actualiza el impacto SIN llamar a renderApp()
  const amtInput = document.getElementById('quick-amount-input');
  if (amtInput) {
    amtInput.oninput = (e) => {
      const cleanDigits = String(e.target.value || '').replace(/\D/g, '');
      quickForm.amount = cleanDigits;
      const formatted = formatLiveCLPInput(cleanDigits);
      if (e.target.value !== formatted) {
        e.target.value = formatted;
      }
      updateQuickFormLivePreview();
    };
  }

  const noteInput = document.getElementById('quick-note-input');
  if (noteInput) {
    noteInput.oninput = (e) => {
      quickForm.note = e.target.value;
    };
  }

  const dateInput = document.getElementById('quick-date-input');
  if (dateInput) {
    dateInput.onchange = (e) => {
      quickForm.date = e.target.value;
    };
  }

  const instSelect = document.getElementById('quick-installments-select');
  if (instSelect) {
    instSelect.onchange = (e) => {
      quickForm.installments = Number(e.target.value || 1);
      updateQuickFormLivePreview();
    };
  }

  const sharedCheck = document.getElementById('quick-shared-check');
  if (sharedCheck) {
    sharedCheck.onchange = (e) => {
      quickForm.isSharedBill = e.target.checked;
      if (quickForm.isSharedBill && !quickForm.myRealShare) {
        const half = Math.round(cleanChileanAmount(quickForm.amount) / 2);
        quickForm.myRealShare = half > 0 ? String(half) : '';
      }
      renderApp();
    };
  }

  // Sin llamar a renderApp() en oninput para no cerrar jamás el teclado del iPhone
  const myShareInput = document.getElementById('quick-myshare-input');
  if (myShareInput) {
    myShareInput.oninput = (e) => {
      const cleanDigits = String(e.target.value || '').replace(/\D/g, '');
      quickForm.myRealShare = cleanDigits;
      const formatted = formatLiveCLPInput(cleanDigits);
      if (e.target.value !== formatted) {
        e.target.value = formatted;
      }
      updateQuickFormLivePreview();
    };
  }

  // Guardar Gasto Rápido (con soporte de cuotas CMR a través de buildInstallmentTransactions)
  const quickFormEl = document.getElementById('quick-expense-form');
  if (quickFormEl) {
    quickFormEl.onsubmit = (e) => {
      e.preventDefault();
      const amountNum = cleanChileanAmount(quickForm.amount);
      if (amountNum <= 0) {
        showToast('Ingresa un monto mayor a $0', 'error');
        return;
      }

      const baseDate = quickForm.date || getTodayISO();
      const nowISO = new Date().toISOString();

      if (quickForm.isSharedBill) {
        const myShare = Math.min(amountNum, cleanChileanAmount(quickForm.myRealShare));
        const owedBack = Math.max(0, amountNum - myShare);
        const groupId = `rcpt_shared_${Date.now()}`;

        if (myShare > 0) {
          appState.transactions.push({
            id: `tx_${Date.now()}_own`,
            splitGroupId: groupId,
            receiptGroupId: groupId,
            splitTotalAmount: amountNum,
            date: baseDate,
            type: 'expense',
            amount: myShare,
            categoryId: quickForm.categoryId,
            paymentMethod: quickForm.paymentMethod,
            author: userPrefs.activeAuthor || 'el',
            note: `${quickForm.note.trim() || 'Cuenta compartida'} (Nuestra parte)`,
            reconciled: false,
            createdAt: nowISO,
            updatedAt: nowISO
          });
        }
        if (owedBack > 0) {
          appState.transactions.push({
            id: `tx_${Date.now()}_owed`,
            splitGroupId: groupId,
            receiptGroupId: groupId,
            splitTotalAmount: amountNum,
            date: baseDate,
            type: 'loan_given',
            amount: owedBack,
            categoryId: 'prestamo_encargo',
            paymentMethod: quickForm.paymentMethod,
            author: userPrefs.activeAuthor || 'el',
            note: `${quickForm.note.trim() || 'Cuenta compartida'} (Por cobrar)`,
            reconciled: false,
            createdAt: nowISO,
            updatedAt: nowISO
          });
        }

        saveState(appState);
        quickForm.amount = '';
        quickForm.note = '';
        quickForm.naturalInputText = '';
        quickForm.isSharedBill = false;
        quickForm.myRealShare = '';
        showToast(
          `✅ Guardado: ${formatCLP(myShare)} en gasto y ${formatCLP(owedBack)} por cobrar`,
          'success'
        );
        renderApp();
        return;
      }

      const totalInstallments =
        quickForm.paymentMethod === 'cmr_falabella' ? Math.max(1, Number(quickForm.installments || 1)) : 1;

      const baseTx = {
        id: `tx_${Date.now()}`,
        date: baseDate,
        type: 'expense',
        amount: amountNum,
        categoryId: quickForm.categoryId,
        paymentMethod: quickForm.paymentMethod,
        author: userPrefs.activeAuthor || 'el',
        note: quickForm.note.trim() || (totalInstallments > 1 ? 'Compra en cuotas' : 'Registro rápido'),
        reconciled: false,
        createdAt: nowISO,
        updatedAt: nowISO
      };

      if (totalInstallments === 1) {
        appState.transactions.push(baseTx);
      } else {
        const installmentTxs = buildInstallmentTransactions(baseTx, totalInstallments);
        installmentTxs.forEach((instTx) => appState.transactions.push(instTx));
      }

      const cuotaMonto = Math.round(amountNum / totalInstallments);
      saveState(appState);
      quickForm.amount = '';
      quickForm.note = '';
      quickForm.naturalInputText = '';
      quickForm.installments = 1;
      showToast(
        totalInstallments > 1
          ? `✅ Compra en ${totalInstallments} cuotas de ${formatCLP(cuotaMonto)}/mes guardada (Cuota 1 en este mes)`
          : `✅ Guardado: ${formatCLP(amountNum)}`,
        'success'
      );
      renderApp();
    };
  }

  // Modal de Edición Rápida (1 toque)
  const editTxTypeSel = document.getElementById('edit-tx-type');
  if (editTxTypeSel) {
    editTxTypeSel.onchange = (e) => {
      const val = e.target.value;
      const catGrp = document.getElementById('edit-tx-cat-group');
      const fixGrp = document.getElementById('edit-tx-fixed-group');
      if (catGrp) catGrp.style.display = val === 'expense' || val === 'reimbursement' ? '' : 'none';
      if (fixGrp) fixGrp.style.display = val === 'expense' ? '' : 'none';
    };
  }

  const editTxForm = document.getElementById('edit-tx-form');
  if (editTxForm) {
    editTxForm.onsubmit = (e) => {
      e.preventDefault();
      const target = (appState.transactions || []).find((t) => t.id === editingTxId);
      if (!target) {
        editingTxId = null;
        renderApp();
        return;
      }
      const newAmt = cleanChileanAmount(document.getElementById('edit-tx-amount')?.value);
      if (newAmt <= 0) {
        showToast('Ingresa un monto mayor a $0', 'error');
        return;
      }
      target.amount = newAmt;
      target.date = document.getElementById('edit-tx-date')?.value || target.date;
      const typeEl = document.getElementById('edit-tx-type');
      if (typeEl && typeEl.value) {
        target.type = typeEl.value;
      }
      const catEl = document.getElementById('edit-tx-category');
      if (catEl && (target.type === 'expense' || target.type === 'reimbursement')) {
        target.categoryId = catEl.value;
      } else if (target.type === 'transfer_wife') {
        target.categoryId = 'traspaso_interno';
      } else if (target.type === 'cmr_payment') {
        target.categoryId = 'pago_tarjeta';
      } else if (target.type === 'income') {
        target.categoryId = 'ingreso_sueldo';
      } else if (['loan_given', 'loan_collected', 'loan_received', 'loan_repaid'].includes(target.type)) {
        target.categoryId = 'prestamo_encargo';
      }

      const fixedTplEl = document.getElementById('edit-tx-fixed-tpl');
      if (fixedTplEl) {
        const tplVal = fixedTplEl.value || '';
        if (target.type === 'expense' && tplVal) {
          target.fixedTemplateId = tplVal;
        } else {
          delete target.fixedTemplateId;
        }
      }

      target.paymentMethod = document.getElementById('edit-tx-pm')?.value || target.paymentMethod;
      target.author = document.getElementById('edit-tx-author')?.value || target.author;
      target.note = document.getElementById('edit-tx-note')?.value?.trim() || target.note;
      target.updatedAt = new Date().toISOString();

      editingTxId = null;
      saveState(appState);
      showToast('✏️ Movimiento actualizado en todos tus dispositivos', 'success');
      renderApp();
    };
  }

  // Divisor de Boletas (Sin perder el foco del teclado en oninput)
  const splitMerchant = document.getElementById('split-merchant-input');
  if (splitMerchant) {
    splitMerchant.oninput = (e) => {
      splitForm.merchant = e.target.value;
    };
  }
  const splitTotal = document.getElementById('split-total-input');
  if (splitTotal) {
    splitTotal.oninput = (e) => {
      splitForm.totalAmount = cleanChileanAmount(e.target.value);
      const formatted = formatLiveCLPInput(e.target.value);
      if (e.target.value !== formatted) e.target.value = formatted;
      updateSplitFormLiveBalance();
    };
  }
  const splitPm = document.getElementById('split-pm-select');
  if (splitPm) {
    splitPm.onchange = (e) => {
      splitForm.paymentMethod = e.target.value;
    };
  }

  document.querySelectorAll('.split-cat-select').forEach((sel) => {
    sel.onchange = (e) => {
      const idx = Number(sel.dataset.idx);
      splitForm.splits[idx].categoryId = e.target.value;
    };
  });
  document.querySelectorAll('.split-amt-input').forEach((inp) => {
    inp.oninput = (e) => {
      const idx = Number(inp.dataset.idx);
      splitForm.splits[idx].amount = cleanChileanAmount(e.target.value);
      const formatted = formatLiveCLPInput(e.target.value);
      if (e.target.value !== formatted) e.target.value = formatted;
      updateSplitFormLiveBalance();
    };
  });
  document.querySelectorAll('.split-sum-input').forEach((inp) => {
    inp.oninput = (e) => {
      const idx = Number(inp.dataset.idx);
      splitForm.splits[idx].summary = e.target.value;
    };
  });

  // Escáner de foto de boleta con Gemini 3.8 Flash
  const photoInput = document.getElementById('receipt-photo-input');
  if (photoInput) {
    photoInput.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      splitForm.isScanning = true;
      splitForm.scanError = '';
      renderApp();
      try {
        const apiKey = userPrefs.geminiApiKey || appState.sharedIntegrations?.geminiApiKey || '';
        const result = await scanReceiptWithGemini(file, apiKey);
        splitForm.merchant = result.merchant || 'Boleta Escaneada';
        splitForm.totalAmount = Number(result.totalAmount || 0);
        if (result.date) splitForm.date = result.date;
        if (Array.isArray(result.splits) && result.splits.length > 0) {
          splitForm.splits = result.splits;
        }
        splitForm.isScanning = false;
        showToast('✨ Boleta desglosada con Gemini 3.8 Flash', 'success');
      } catch (err) {
        splitForm.isScanning = false;
        splitForm.scanError = err.message || 'No se pudo analizar la foto.';
      }
      renderApp();
    };
  }

  // Editor de Presupuestos con Suma Dinámica en Vivo y Auto-Ajuste Proporcional
  const budgetEditorForm = document.getElementById('budget-editor-form');
  if (budgetEditorForm) {
    const categories = appState.categories || [];
    const baselineAmounts = {};
    const lockedCategoryIds = new Set();

    const readFormAmounts = () => {
      const incInput = document.getElementById('budget-income-input');
      const savInput = document.getElementById('budget-savings-input');
      const incomeTarget = cleanChileanAmount(incInput ? incInput.value : 2350000);
      const savingsGoal = cleanChileanAmount(savInput ? savInput.value : 250000);
      const currentAmounts = {};
      categories.forEach((cat) => {
        const el = budgetEditorForm.querySelector(`input[name="cat_${cat.id}"]`);
        currentAmounts[cat.id] = cleanChileanAmount(el ? el.value : 0);
      });
      return { incomeTarget, savingsGoal, currentAmounts };
    };

    // Inicializar baseline con los valores iniciales del formulario
    const initRead = readFormAmounts();
    Object.assign(baselineAmounts, initRead.currentAmounts);

    const refreshLiveBudgetSummaryDOM = () => {
      const { incomeTarget, savingsGoal, currentAmounts } = readFormAmounts();
      const spendableTarget = Math.max(0, incomeTarget - savingsGoal);
      const currentSum = Object.values(currentAmounts).reduce((acc, v) => acc + Number(v || 0), 0);
      const diff = spendableTarget - currentSum;
      const allocatedPct = spendableTarget > 0 ? Math.round((currentSum / spendableTarget) * 100) : 0;
      const barWidth = Math.min(100, Math.max(0, allocatedPct));
      const diffClass = diff === 0 ? 'bar-green' : diff > 0 ? 'bar-yellow' : 'bar-red';
      const diffText =
        diff === 0
          ? '✅ ¡100% Cuadrado! La suma calza exacto con tu ingreso disponible'
          : diff > 0
            ? `💡 Quedan ${formatCLP(diff)} sin asignar (toca "Distribuir por Proporciones" para repartirlos)`
            : `⚠️ Te pasaste por ${formatCLP(Math.abs(diff))} sobre tu ingreso disponible tras ahorro`;

      const spendableEl = document.getElementById('budget-live-spendable');
      const sumEl = document.getElementById('budget-live-sum');
      const pctEl = document.getElementById('budget-live-pct');
      const badgeEl = document.getElementById('budget-live-diff-badge');
      const barEl = document.getElementById('budget-live-progress-bar');

      if (spendableEl) spendableEl.textContent = formatCLP(spendableTarget);
      if (sumEl) sumEl.textContent = formatCLP(currentSum);
      if (pctEl) pctEl.textContent = `${allocatedPct}%`;
      if (badgeEl) {
        badgeEl.className = `sem-badge ${diffClass}`;
        badgeEl.textContent = diffText;
      }
      if (barEl) {
        barEl.className = `progress-fill ${diffClass}`;
        barEl.style.width = `${barWidth}%`;
      }

      categories.forEach((cat) => {
        const amt = Number(currentAmounts[cat.id] || 0);
        const catPct = spendableTarget > 0 ? Math.round((amt / spendableTarget) * 1000) / 10 : 0;
        const pctBadge = budgetEditorForm.querySelector(`[data-cat-pct-badge="${cat.id}"]`);
        if (pctBadge) {
          pctBadge.textContent = `${catPct}%`;
        }
        const lockBadge = budgetEditorForm.querySelector(`[data-cat-lock-badge="${cat.id}"]`);
        if (lockBadge) {
          lockBadge.style.display = lockedCategoryIds.has(cat.id) ? 'inline-block' : 'none';
        }
      });
    };

    budgetEditorForm.querySelectorAll('[data-cat-lock-badge]').forEach((badge) => {
      badge.onclick = (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const cid = badge.getAttribute('data-cat-lock-badge');
        if (cid && lockedCategoryIds.has(cid)) {
          lockedCategoryIds.delete(cid);
          refreshLiveBudgetSummaryDOM();
        }
      };
    });

    budgetEditorForm.addEventListener('input', (e) => {
      const target = e.target;
      if (!target || target.tagName !== 'INPUT' || target.type === 'checkbox') return;

      const autoAdjust = Boolean(document.getElementById('budget-auto-adjust-check')?.checked);
      const editedCatId = target.dataset?.catId || null;

      if (editedCatId) {
        const typedVal = cleanChileanAmount(target.value);
        baselineAmounts[editedCatId] = typedVal;
        if (autoAdjust) {
          lockedCategoryIds.add(editedCatId);
          // Si el usuario ya fijó todas las categorías, liberar todas menos la actual para poder cuadrar el resto
          if (lockedCategoryIds.size >= categories.length) {
            lockedCategoryIds.clear();
            lockedCategoryIds.add(editedCatId);
          }
          const { incomeTarget, savingsGoal } = readFormAmounts();
          const dist = distributeBudgetProportionally({
            incomeTarget,
            savingsGoal,
            categories,
            currentAmounts: baselineAmounts,
            mode: 'current',
            lockedCategoryIds: Array.from(lockedCategoryIds)
          });
          categories.forEach((cat) => {
            if (cat.id !== editedCatId && !lockedCategoryIds.has(cat.id)) {
              const inp = budgetEditorForm.querySelector(`input[name="cat_${cat.id}"]`);
              if (inp) {
                inp.value = formatLiveCLPInput(dist.allocations[cat.id]);
              }
            }
          });
        }
      } else if (target.name === 'incomeTarget' || target.name === 'savingsGoal') {
        if (autoAdjust) {
          const { incomeTarget, savingsGoal } = readFormAmounts();
          const dist = distributeBudgetProportionally({
            incomeTarget,
            savingsGoal,
            categories,
            currentAmounts: baselineAmounts,
            mode: 'current',
            lockedCategoryIds: Array.from(lockedCategoryIds)
          });
          categories.forEach((cat) => {
            if (!lockedCategoryIds.has(cat.id)) {
              const inp = budgetEditorForm.querySelector(`input[name="cat_${cat.id}"]`);
              if (inp) {
                inp.value = formatLiveCLPInput(dist.allocations[cat.id]);
                baselineAmounts[cat.id] = dist.allocations[cat.id];
              }
            }
          });
        }
      }

      refreshLiveBudgetSummaryDOM();
    });

    budgetEditorForm._distributeProportionally = (mode = 'current') => {
      lockedCategoryIds.clear();
      const { incomeTarget, savingsGoal, currentAmounts } = readFormAmounts();
      const dist = distributeBudgetProportionally({
        incomeTarget,
        savingsGoal,
        categories,
        currentAmounts,
        mode,
        lockedCategoryIds: []
      });
      categories.forEach((cat) => {
        const inp = budgetEditorForm.querySelector(`input[name="cat_${cat.id}"]`);
        const newAmt = dist.allocations[cat.id] ?? 0;
        if (inp) {
          inp.value = formatLiveCLPInput(newAmt);
        }
        baselineAmounts[cat.id] = newAmt;
      });
      refreshLiveBudgetSummaryDOM();
    };

    budgetEditorForm.onsubmit = (e) => {
      e.preventDefault();
      const fd = new FormData(budgetEditorForm);
      const nowISO = new Date().toISOString();
      const monthCfg = appState.monthlyBudgets[activeYearMonth];
      const newIncomeTarget = cleanChileanAmount(fd.get('incomeTarget'));
      const newSavingsGoal = cleanChileanAmount(fd.get('savingsGoal'));
      monthCfg.incomeTarget = newIncomeTarget;
      monthCfg.savingsGoal = newSavingsGoal;
      monthCfg.updatedAt = nowISO;

      if (!appState.familyConfig) appState.familyConfig = {};
      appState.familyConfig.monthlyIncomeTarget = newIncomeTarget;
      appState.familyConfig.monthlySavingsGoal = newSavingsGoal;
      appState.familyConfig.updatedAt = nowISO;

      (appState.categories || []).forEach((cat) => {
        monthCfg.categories[cat.id] = cleanChileanAmount(fd.get(`cat_${cat.id}`));
      });

      isEditingBudgets = false;
      saveState(appState);
      showToast('✅ Presupuestos y meta de ahorro actualizados y sincronizados', 'success');
      renderApp();
    };
  }

  // Formulario de la Bóveda de Patrimonio Intocable & Cripto
  const patrimonyForm = document.getElementById('patrimony-item-form');
  if (patrimonyForm) {
    patrimonyForm.onsubmit = (e) => {
      e.preventDefault();
      const name = document.getElementById('pat-name-input')?.value?.trim() || '';
      const amountCLP = cleanChileanAmount(document.getElementById('pat-amt-input')?.value);
      const category = document.getElementById('pat-cat-select')?.value || 'historical_savings';
      const institution = document.getElementById('pat-inst-input')?.value?.trim() || '';
      const owner = document.getElementById('pat-owner-select')?.value || 'ambos';
      const note = document.getElementById('pat-note-input')?.value?.trim() || '';

      if (!name || amountCLP <= 0) {
        showToast('Ingresa el nombre del activo y un monto mayor a $0', 'error');
        return;
      }

      const nowISO = new Date().toISOString();
      if (!Array.isArray(appState.patrimonyItems)) appState.patrimonyItems = [];

      if (editingPatrimonyId) {
        const existing = appState.patrimonyItems.find((i) => i.id === editingPatrimonyId);
        if (existing) {
          existing.name = name;
          existing.amountCLP = amountCLP;
          existing.category = category;
          existing.institution = institution;
          existing.owner = owner;
          existing.note = note;
          existing.updatedAt = nowISO;
        }
      } else {
        appState.patrimonyItems.push({
          id: `pat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name,
          amountCLP,
          category,
          institution,
          owner,
          note,
          createdAt: nowISO,
          updatedAt: nowISO
        });
      }

      editingPatrimonyId = null;
      isAddingPatrimonyItem = false;
      saveState(appState);
      showToast(`🏦 "${name}" (${formatCLP(amountCLP)}) guardado en la Bóveda Intocable`, 'success');
      renderApp();
    };
  }

  // Agregar plantilla de gasto fijo
  const addFixedForm = document.getElementById('add-fixed-template-form');
  if (addFixedForm) {
    addFixedForm.onsubmit = (e) => {
      e.preventDefault();
      const name = document.getElementById('new-fix-name').value.trim();
      const amount = cleanChileanAmount(document.getElementById('new-fix-amount').value);
      if (!name || amount <= 0) return;

      appState.fixedTemplates.push({
        id: `fix_${Date.now()}`,
        name,
        categoryId: 'vivienda_fijos',
        estimatedAmount: amount,
        defaultPaymentMethod: 'bch_ctacte',
        dayOfMonth: 10
      });
      saveState(appState);
      showToast(`🏠 "${name}" agregado a tu plantilla mensual`, 'success');
      renderApp();
    };
  }

  // Subir archivo CSV/Excel de cartola bancaria
  const stmtFileInput = document.getElementById('statement-file-input');
  if (stmtFileInput) {
    stmtFileInput.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const ext = file.name.split('.').pop().toLowerCase();

      if ((ext === 'xlsx' || ext === 'xls') && window.XLSX) {
        const data = await file.arrayBuffer();
        const wb = window.XLSX.read(data, { type: 'array' });
        const firstSheet = wb.Sheets[wb.SheetNames[0]];
        const csvText = window.XLSX.utils.sheet_to_csv(firstSheet, { FS: ';' });
        reconcileState.rawText = csvText;
      } else {
        reconcileState.rawText = await file.text();
      }

      if (/;CENTRAL;|;PAGO:|BANCO DE CHILE/i.test(reconcileState.rawText)) {
        reconcileState.defaultSourceMethod = 'bch_vista';
      }

      const rows = parseBankStatementText(
        reconcileState.rawText,
        activeYearMonth,
        reconcileState.defaultSourceMethod
      );
      if (rows.length > 0) {
        const monthTxs = (appState.transactions || []).filter((t) =>
          String(t.date || '').startsWith(activeYearMonth)
        );
        reconcileState.analyzedRows = reconcileStatementRows(
          rows,
          monthTxs,
          appState.familyConfig?.wifeName,
          appState.transactions,
          appState.learnedContacts || {},
          appState.fixedTemplates || []
        );
        const needReview = reconcileState.analyzedRows.filter(
          (r) => r.status === 'forgotten_new' || r.status === 'incoming_abono'
        ).length;
        reconcileState.filterTab = needReview > 0 ? 'review' : 'all';
        showToast(`✅ Cartola analizada: ${rows.length} movimientos procesados`, 'success');
      } else {
        showToast('📂 Archivo cargado. Haz clic en "Analizar Cartola"', 'success');
      }
      renderApp();
    };
  }

  // Importar archivo de respaldo JSON (1 clic)
  const jsonBackupInput = document.getElementById('import-json-backup-input');
  if (jsonBackupInput) {
    jsonBackupInput.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const rawJson = await file.text();
        const merged = importStateFromJsonString(rawJson, appState);
        appState = merged;
        userPrefs = loadUserPrefs();
        showToast('✅ Respaldo JSON restaurado y fusionado sin pérdida de datos', 'success');
        renderApp();
      } catch (err) {
        showToast(err.message || 'No se pudo leer el archivo JSON de respaldo', 'error');
      }
    };
  }

  const stmtTextarea = document.getElementById('statement-textarea');
  if (stmtTextarea) {
    stmtTextarea.oninput = (e) => {
      reconcileState.rawText = e.target.value;
    };
  }

  document.querySelectorAll('.rec-cat-select').forEach((sel) => {
    sel.onchange = (e) => {
      const idx = Number(sel.dataset.idx);
      if (reconcileState.analyzedRows?.[idx]) {
        reconcileState.analyzedRows[idx].suggestedCategoryId = e.target.value;
      }
    };
  });
  document.querySelectorAll('.rec-internal-type-select').forEach((sel) => {
    sel.onchange = (e) => {
      const idx = Number(sel.dataset.idx);
      const row = reconcileState.analyzedRows?.[idx];
      if (!row) return;
      const val = e.target.value;
      if (val === 'convert_to_expense') {
        row.status = 'forgotten_new';
        row.internalType = null;
        row.selectedToImport = true;
      } else {
        row.status = 'internal';
        row.internalType = val;
        row.selectedToImport = val === 'transfer_wife' || val === 'cmr_payment';
      }
      renderApp();
    };
  });
  document.querySelectorAll('.rec-abono-action-select').forEach((sel) => {
    sel.onchange = (e) => {
      const idx = Number(sel.dataset.idx);
      const row = reconcileState.analyzedRows?.[idx];
      if (!row) return;
      row.abonoAction = e.target.value;
      row.selectedToImport = e.target.value !== 'ignore';
      renderApp();
    };
  });
  document.querySelectorAll('.rec-reimburse-cat-select').forEach((sel) => {
    sel.onchange = (e) => {
      const idx = Number(sel.dataset.idx);
      const row = reconcileState.analyzedRows?.[idx];
      if (!row) return;
      row.reimburseCategoryId = e.target.value;
    };
  });
  document.querySelectorAll('.rec-select-check').forEach((chk) => {
    chk.onchange = (e) => {
      const idx = Number(chk.dataset.idx);
      if (reconcileState.analyzedRows?.[idx]) {
        reconcileState.analyzedRows[idx].selectedToImport = e.target.checked;
      }
    };
  });

  // Buscador instantáneo del historial de movimientos (sin desmontar el input ni cerrar teclado iPhone)
  const txSearchInput = document.getElementById('tx-search-input');
  if (txSearchInput) {
    txSearchInput.oninput = (e) => {
      txFilterState.searchQuery = e.target.value;
      updateFilteredTransactionsDOM();
    };
  }

  const txFilterCat = document.getElementById('tx-filter-category');
  if (txFilterCat) {
    txFilterCat.onchange = (e) => {
      txFilterState.categoryId = e.target.value || 'all';
      renderApp();
    };
  }
}

// ============================================================================
// DELEGACIÓN GLOBAL DE ACCIONES
// ============================================================================
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;

  const action = btn.dataset.action;

  if (action === 'switch-tab') {
    activeTab = btn.dataset.tab;
    renderApp();
    return;
  }

  if (action === 'toggle-family-diagnosis') {
    diagnosisState.isOpen = !diagnosisState.isOpen;
    diagnosisState.aiError = '';
    renderApp();
    return;
  }

  if (action === 'run-ai-family-diagnosis') {
    const apiKey = userPrefs.geminiApiKey || appState.sharedIntegrations?.geminiApiKey || '';
    if (!apiKey.trim()) {
      diagnosisState.aiError =
        'Para consultar a Gemini 3.8 Flash en vivo, guarda tu clave gratuita en la pestaña "☁️ iPhone & IA". Mientras tanto, estás viendo el Diagnóstico Instantáneo 0 ms.';
      renderApp();
      return;
    }
    try {
      diagnosisState.isLoadingAI = true;
      diagnosisState.aiError = '';
      renderApp();

      const metrics = getMonthMetrics(activeYearMonth);
      const auditInput = {
        activeYearMonth,
        income: metrics.effectiveIncome,
        savingsGoal: metrics.savingsGoal,
        totalExpenses: metrics.totalExpense,
        availableReal: metrics.remainingSpendable,
        cmrSpent: metrics.cmrSpent,
        cmrPaid: metrics.cmrPaid,
        cmrReserveNeeded: metrics.cmrPendingReserve,
        wifeTransferred: metrics.transferredToWife,
        wifeSpent: metrics.spentFromWifeAccount,
        wifeBalance: metrics.wifeWalletRemaining,
        categoriesBreakdown: metrics.categoryBreakdown,
        pendingLoansSummary: {
          owedByUs: metrics.totalLoansOwedToOthers,
          owedToUs: metrics.totalLoansReceivable,
          people: metrics.loansByPerson
        },
        unpaidFixedCount: (metrics.pendingFixedExpenses || []).length,
        daysRemaining: metrics.daysRemaining
      };

      const aiResult = await generateMonthlyFamilyAuditWithGemini(auditInput, apiKey);
      diagnosisState.aiAuditResult = aiResult;
      diagnosisState.aiAuditMonth = activeYearMonth;
      diagnosisState.isLoadingAI = false;
      showToast('✨ Diagnóstico enriquecido con Gemini 3.8 Flash', 'success');
    } catch (err) {
      diagnosisState.isLoadingAI = false;
      diagnosisState.aiError = err.message || 'No se pudo conectar con Gemini IA.';
    }
    renderApp();
    return;
  }

  if (action === 'set-tx-filter-pm') {
    txFilterState.paymentMethod = btn.dataset.pm || 'all';
    renderApp();
    return;
  }

  if (action === 'set-tx-filter-author') {
    txFilterState.author = btn.dataset.author || 'all';
    renderApp();
    return;
  }

  if (action === 'set-tx-filter-rec') {
    txFilterState.reconciledStatus = btn.dataset.rec || 'all';
    renderApp();
    return;
  }

  if (action === 'clear-tx-filters') {
    txFilterState.searchQuery = '';
    txFilterState.paymentMethod = 'all';
    txFilterState.author = 'all';
    txFilterState.reconciledStatus = 'all';
    txFilterState.categoryId = 'all';
    renderApp();
    return;
  }

  if (action === 'toggle-theme') {
    userPrefs.theme = userPrefs.theme === 'dark' ? 'light' : 'dark';
    saveUserPrefs(userPrefs);
    applyTheme(userPrefs.theme);
    renderApp();
    return;
  }

  if (action === 'jump-shield') {
    const target = btn.dataset.target;
    if (target === 'budget') {
      activeTab = 'budget';
    } else if (target === 'cmr') {
      activeTab = 'register';
      registerMode = 'internal';
      internalSubTab = 'cmr';
    } else if (target === 'wife') {
      activeTab = 'register';
      registerMode = 'internal';
      internalSubTab = 'wife';
    } else if (target === 'loans') {
      activeTab = 'register';
      registerMode = 'internal';
      internalSubTab = 'loans';
    }
    renderApp();
    return;
  }

  if (action === 'set-author') {
    userPrefs.activeAuthor = btn.dataset.author;
    if (userPrefs.activeAuthor === 'ella' && quickForm.paymentMethod === 'bch_ctacte') {
      quickForm.paymentMethod = 'cuenta_mujer';
    }
    saveUserPrefs(userPrefs);
    showToast(
      userPrefs.activeAuthor === 'ella'
        ? '👩🏻 Perfil activo en este teléfono: Marie'
        : '🧔‍♂️ Perfil activo en este teléfono: Mauricio',
      'success'
    );
    renderApp();
    return;
  }

  if (action === 'clear-demo-data' || action === 'clear-all-transactions') {
    const allTxs = appState.transactions || [];
    if (allTxs.length > 0) {
      lastDeletedBatch = allTxs.map((t) => ({ ...t }));
      lastDeletedTx = lastDeletedBatch[0] || null;
    }
    if (!appState.deletedTransactionIds) appState.deletedTransactionIds = {};
    const nowISO = new Date().toISOString();
    allTxs.forEach((t) => {
      if (t && t.id) appState.deletedTransactionIds[t.id] = nowISO;
    });
    appState.transactions = [];
    appState.demoCleared = true;
    saveState(appState);
    showToast(
      '🧹 Todos los movimientos de prueba fueron borrados (Historial en $0 en todos tus dispositivos)',
      'success',
      lastDeletedBatch && lastDeletedBatch.length > 0 ? 'undo-delete-tx' : null
    );
    renderApp();
    return;
  }

  if (action === 'set-register-mode') {
    registerMode = btn.dataset.mode;
    renderApp();
    return;
  }

  if (action === 'set-internal-subtab') {
    internalSubTab = btn.dataset.sub;
    renderApp();
    return;
  }

  if (action === 'set-rec-filter') {
    reconcileState.filterTab = btn.dataset.filter;
    renderApp();
    return;
  }

  if (action === 'apply-smart-natural-input') {
    applySmartNaturalInput();
    return;
  }

  if (action === 'apply-author-preset') {
    const cat = btn.dataset.cat;
    const pm = btn.dataset.pm;
    const note = btn.dataset.note;
    if (cat) quickForm.categoryId = cat;
    if (pm) {
      quickForm.paymentMethod = pm;
      if (pm !== 'cmr_falabella') quickForm.installments = 1;
    }
    if (note) quickForm.note = note;
    renderApp();
    const amtEl = document.getElementById('quick-amount-input');
    if (amtEl) amtEl.focus();
    showToast(`⚡ Atajo listo: ${note || 'Gasto frecuente'} — solo ingresa el monto`, 'success');
    return;
  }

  if (action === 'set-quick-installments') {
    quickForm.installments = Math.max(1, Number(btn.dataset.installments || 1));
    renderApp();
    return;
  }

  if (action === 'quick-add-amount') {
    const val = btn.dataset.val;
    if (val === 'clear') {
      quickForm.amount = '';
    } else {
      const current = cleanChileanAmount(quickForm.amount);
      quickForm.amount = String(current + Number(val));
    }
    const amtInput = document.getElementById('quick-amount-input');
    if (amtInput) {
      amtInput.value = formatLiveCLPInput(quickForm.amount);
      updateQuickFormLivePreview();
    } else {
      renderApp();
    }
    return;
  }

  if (action === 'select-quick-cat') {
    quickForm.categoryId = btn.dataset.cat;
    renderApp();
    return;
  }

  if (action === 'select-quick-pm') {
    quickForm.paymentMethod = btn.dataset.pm;
    if (btn.dataset.pm !== 'cmr_falabella') {
      quickForm.installments = 1;
    }
    userPrefs.defaultPaymentMethod = btn.dataset.pm;
    saveUserPrefs(userPrefs);
    renderApp();
    return;
  }

  if (action === 'open-edit-tx') {
    editingTxId = btn.dataset.id;
    renderApp();
    return;
  }

  if (action === 'close-edit-tx' || action === 'close-edit-modal-backdrop') {
    editingTxId = null;
    renderApp();
    return;
  }

  if (action === 'load-demo-receipt') {
    const demo = getDemoScannedReceipt(getTodayISO());
    splitForm.merchant = demo.merchant;
    splitForm.date = demo.date;
    splitForm.totalAmount = demo.totalAmount;
    splitForm.splits = demo.splits;
    splitForm.scanError = '';
    showToast('✨ Boleta mixta de ejemplo cargada ($89.400)', 'success');
    renderApp();
    return;
  }

  if (action === 'add-split-row') {
    splitForm.splits.push({
      categoryId: 'hogar_varios',
      amount: 0,
      summary: ''
    });
    renderApp();
    return;
  }

  if (action === 'remove-split-row') {
    const idx = Number(btn.dataset.idx);
    splitForm.splits.splice(idx, 1);
    renderApp();
    return;
  }

  if (action === 'auto-balance-split') {
    const assigned = splitForm.splits.reduce((acc, s) => acc + Number(s.amount || 0), 0);
    const diff = Number(splitForm.totalAmount || 0) - assigned;
    if (splitForm.splits.length > 0) {
      splitForm.splits[0].amount = Math.max(0, Number(splitForm.splits[0].amount || 0) + diff);
      renderApp();
    }
    return;
  }

  if (action === 'save-split-receipt') {
    const validSplits = splitForm.splits.filter((s) => Number(s.amount) > 0);
    if (validSplits.length === 0) {
      showToast('Ingresa montos mayores a $0 en el desglose', 'error');
      return;
    }
    const groupId = `split_${Date.now()}`;
    const splitsSum = validSplits.reduce((acc, s) => acc + Number(s.amount || 0), 0);
    const splitTotalAmount = Number(splitForm.totalAmount || 0) > 0 ? Number(splitForm.totalAmount) : splitsSum;
    const nowISO = new Date().toISOString();

    validSplits.forEach((s) => {
      appState.transactions.push({
        id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        splitGroupId: groupId,
        receiptGroupId: groupId,
        splitTotalAmount,
        merchant: splitForm.merchant || 'Boleta dividida',
        date: splitForm.date || getTodayISO(),
        type: 'expense',
        amount: Number(s.amount),
        categoryId: s.categoryId,
        paymentMethod: splitForm.paymentMethod,
        author: userPrefs.activeAuthor || 'el',
        note: `${splitForm.merchant || 'Boleta dividida'}: ${s.summary || 'Desglose'}`,
        reconciled: false,
        createdAt: nowISO,
        updatedAt: nowISO
      });
    });

    saveState(appState);
    showToast(`✅ Boleta dividida (${formatCLP(splitTotalAmount)}) guardada en ${validSplits.length} categorías`, 'success');
    registerMode = 'quick';
    renderApp();
    return;
  }

  if (action === 'save-wife-transfer') {
    const amt = cleanChileanAmount(document.getElementById('wife-transfer-amount')?.value);
    const fromPm = document.getElementById('wife-transfer-from')?.value || 'bch_ctacte';
    if (amt <= 0) {
      showToast('Ingresa el monto a recargar en el Fondo Familiar de Marie', 'error');
      return;
    }
    const nowISO = new Date().toISOString();
    appState.transactions.push({
      id: `tx_${Date.now()}`,
      date: getTodayISO(),
      type: 'transfer_wife',
      amount: amt,
      categoryId: 'traspaso_interno',
      paymentMethod: fromPm,
      author: 'el',
      note: 'Recarga a 💖 Fondo Familiar de Marie (Traspaso interno familiar)',
      reconciled: true,
      createdAt: nowISO,
      updatedAt: nowISO
    });
    saveState(appState);
    showToast(`💖 Recarga de ${formatCLP(amt)} al Fondo Familiar de Marie registrada`, 'success');
    renderApp();
    return;
  }

  if (action === 'send-couple-whatsapp') {
    const kind = btn.dataset.msgKind || btn.dataset.msgType || 'weeklyTeamSummary';
    const metrics = getMonthMetrics(activeYearMonth);
    const msgs = metrics.coupleWhatsApp || buildCoupleWhatsAppMessages(metrics, appState, activeYearMonth);
    const chosen = msgs?.[kind] || msgs?.weeklyTeamSummary;
    const url = chosen?.url || chosen?.waUrl;
    if (url) {
      window.open(url, '_blank');
    } else if (chosen?.text) {
      window.open(`https://wa.me/?text=${encodeURIComponent(chosen.text)}`, '_blank');
    }
    return;
  }

  if (action === 'clone-prev-budget') {
    const res = clonePreviousMonthBudget(appState, activeYearMonth);
    saveState(appState);
    if (res && res.clonedFrom) {
      showToast(`📋 Presupuesto copiado desde ${getMonthNameLabel(res.clonedFrom)}`, 'success');
    } else {
      showToast('📋 Presupuesto base aplicado para este mes', 'success');
    }
    renderApp();
    return;
  }

  if (action === 'quick-distribute-budgets') {
    const monthCfg = appState.monthlyBudgets?.[activeYearMonth];
    if (!monthCfg) return;
    const categories = appState.categories || [];
    const dist = distributeBudgetProportionally({
      incomeTarget: monthCfg.incomeTarget || 2350000,
      savingsGoal: monthCfg.savingsGoal || 250000,
      categories,
      currentAmounts: monthCfg.categories || {},
      mode: 'current'
    });
    const nowISO = new Date().toISOString();
    monthCfg.categories = { ...dist.allocations };
    monthCfg.updatedAt = nowISO;
    saveState(appState);
    showToast(
      `⚖️ ${formatCLP(dist.spendableTarget)} distribuidos proporcionalmente en tus ${categories.length} categorías (100% cuadrado)`,
      'success'
    );
    renderApp();
    return;
  }

  if (action === 'editor-distribute-proportional') {
    const mode = btn.dataset.mode === 'recommended' ? 'recommended' : 'current';
    const formEl = document.getElementById('budget-editor-form');
    if (formEl && typeof formEl._distributeProportionally === 'function') {
      formEl._distributeProportionally(mode);
      showToast(
        mode === 'recommended'
          ? '📊 Proporción ideal recomendada aplicada al 100% de tu ingreso disponible'
          : '⚖️ Presupuestos ajustados proporcionalmente al 100% de tu ingreso disponible',
        'success'
      );
    }
    return;
  }

  if (action === 'toggle-add-patrimony') {
    if (isAddingPatrimonyItem || editingPatrimonyId) {
      isAddingPatrimonyItem = false;
      editingPatrimonyId = null;
    } else {
      isAddingPatrimonyItem = true;
      editingPatrimonyId = null;
    }
    renderApp();
    return;
  }

  if (action === 'cancel-patrimony-edit') {
    isAddingPatrimonyItem = false;
    editingPatrimonyId = null;
    renderApp();
    return;
  }

  if (action === 'edit-patrimony-item') {
    editingPatrimonyId = btn.dataset.id || null;
    isAddingPatrimonyItem = false;
    renderApp();
    return;
  }

  if (action === 'delete-patrimony-item') {
    const id = btn.dataset.id;
    if (!id) return;
    const nowISO = new Date().toISOString();
    if (!appState.deletedPatrimonyIds) appState.deletedPatrimonyIds = {};
    appState.deletedPatrimonyIds[id] = nowISO;
    appState.patrimonyItems = (appState.patrimonyItems || []).filter((i) => i.id !== id);
    if (editingPatrimonyId === id) editingPatrimonyId = null;
    saveState(appState);
    showToast('🗑️ Activo eliminado de la Bóveda Patrimonial', 'success');
    renderApp();
    return;
  }

  if (action === 'preset-patrimony-btc') {
    const nowISO = new Date().toISOString();
    if (!Array.isArray(appState.patrimonyItems)) appState.patrimonyItems = [];
    appState.patrimonyItems.push({
      id: `pat_btc_${Date.now()}`,
      name: 'Bitcoin (BTC) — Reserva Largo Plazo',
      amountCLP: 5000000,
      category: 'crypto_hold',
      institution: 'Binance',
      owner: 'el',
      note: 'Hold intocable a largo plazo — 100% fuera del presupuesto mensual',
      createdAt: nowISO,
      updatedAt: nowISO
    });
    isAddingPatrimonyItem = false;
    editingPatrimonyId = null;
    saveState(appState);
    showToast('₿ Bitcoin en Binance ($5.000.000) agregado a tu Bóveda Intocable', 'success');
    renderApp();
    return;
  }

  if (action === 'save-cmr-payment') {
    const amt = cleanChileanAmount(document.getElementById('cmr-pay-amount')?.value);
    const fromPm = document.getElementById('cmr-pay-from')?.value || 'bch_ctacte';
    if (amt <= 0) {
      showToast('Ingresa el monto pagado a la CMR', 'error');
      return;
    }
    const nowISO = new Date().toISOString();
    appState.transactions.push({
      id: `tx_${Date.now()}`,
      date: getTodayISO(),
      type: 'cmr_payment',
      amount: amt,
      categoryId: 'pago_tarjeta',
      paymentMethod: fromPm,
      author: 'el',
      note: 'Pago de facturación CMR Falabella desde Banco de Chile',
      reconciled: true,
      createdAt: nowISO,
      updatedAt: nowISO
    });
    saveState(appState);
    showToast(`🟢 Pago CMR por ${formatCLP(amt)} registrado`, 'success');
    renderApp();
    return;
  }

  if (action === 'save-income') {
    const amt = cleanChileanAmount(document.getElementById('income-amount')?.value);
    const note = document.getElementById('income-note')?.value?.trim() || 'Ingreso familiar';
    if (amt <= 0) {
      showToast('Ingresa un monto de ingreso válido', 'error');
      return;
    }
    const nowISO = new Date().toISOString();
    appState.transactions.push({
      id: `tx_${Date.now()}`,
      date: getTodayISO(),
      type: 'income',
      amount: amt,
      categoryId: 'ingreso_sueldo',
      paymentMethod: 'bch_ctacte',
      author: userPrefs.activeAuthor || 'el',
      note,
      reconciled: true,
      createdAt: nowISO,
      updatedAt: nowISO
    });
    saveState(appState);
    showToast(`💰 Ingreso de ${formatCLP(amt)} sumado al mes`, 'success');
    renderApp();
    return;
  }

  if (action === 'save-loan-movement') {
    const loanType = document.getElementById('loan-type-select')?.value || 'loan_received';
    const amt = cleanChileanAmount(document.getElementById('loan-amount-input')?.value);
    const note = document.getElementById('loan-note-input')?.value?.trim() || 'Préstamo / Encargo';
    if (amt <= 0) {
      showToast('Ingresa un monto válido para el préstamo', 'error');
      return;
    }
    const nowISO = new Date().toISOString();
    appState.transactions.push({
      id: `tx_loan_${Date.now()}`,
      date: getTodayISO(),
      type: loanType,
      amount: amt,
      categoryId: 'prestamo_encargo',
      paymentMethod: 'bch_vista',
      author: userPrefs.activeAuthor || 'el',
      note,
      reconciled: true,
      createdAt: nowISO,
      updatedAt: nowISO
    });
    saveState(appState);
    showToast(`🤝 Préstamo (${formatCLP(amt)}) registrado`, 'success');
    renderApp();
    return;
  }

  if (action === 'settle-person-loan') {
    const person = btn.dataset.person || 'Contacto';
    const amt = cleanChileanAmount(btn.dataset.amt);
    const kind = btn.dataset.kind; // 'repay' | 'collect'
    if (amt <= 0) return;
    const nowISO = new Date().toISOString();
    appState.transactions.push({
      id: `tx_loan_settle_${Date.now()}`,
      date: getTodayISO(),
      type: kind === 'repay' ? 'loan_repaid' : 'loan_collected',
      amount: amt,
      categoryId: 'prestamo_encargo',
      paymentMethod: 'bch_vista',
      author: userPrefs.activeAuthor || 'el',
      note: `${person} — Saldado con 1 clic`,
      reconciled: true,
      createdAt: nowISO,
      updatedAt: nowISO
    });
    saveState(appState);
    showToast(`✅ Cuenta con ${person} (${formatCLP(amt)}) saldada`, 'success');
    renderApp();
    return;
  }

  if (action === 'delete-tx') {
    const id = btn.dataset.id;
    const allTxs = appState.transactions || [];
    const found = allTxs.find((t) => t.id === id);
    if (!found) return;

    const nowISO = new Date().toISOString();
    if (!appState.deletedTransactionIds) appState.deletedTransactionIds = {};

    const instGroupId = found.installmentGroupId || null;
    const splitGrpId = found.splitGroupId || found.receiptGroupId || null;

    let batchToDelete = [found];
    let toastMsg = '🗑️ Movimiento eliminado';

    if (instGroupId) {
      const siblings = allTxs.filter((t) => t.installmentGroupId === instGroupId);
      if (siblings.length > 1) {
        batchToDelete = siblings;
        toastMsg = `🗑️ Compra en cuotas (${siblings.length} cuotas) eliminada completa`;
      }
    } else if (splitGrpId) {
      const siblings = allTxs.filter((t) => (t.splitGroupId || t.receiptGroupId) === splitGrpId);
      if (siblings.length > 1) {
        batchToDelete = siblings;
        toastMsg = `🗑️ Boleta dividida (${siblings.length} partes) eliminada completa`;
      }
    }

    lastDeletedBatch = batchToDelete.map((t) => ({ ...t }));
    lastDeletedTx = lastDeletedBatch[0] || null;

    const deletedIdsSet = new Set(batchToDelete.map((t) => t.id));
    batchToDelete.forEach((t) => {
      appState.deletedTransactionIds[t.id] = nowISO;
    });
    appState.transactions = allTxs.filter((t) => !deletedIdsSet.has(t.id));

    saveState(appState);
    showToast(toastMsg, 'success', 'undo-delete-tx');
    renderApp();
    return;
  }

  if (action === 'undo-delete-tx') {
    const batch = Array.isArray(lastDeletedBatch) && lastDeletedBatch.length > 0
      ? lastDeletedBatch
      : lastDeletedTx
        ? [lastDeletedTx]
        : [];
    if (batch.length === 0) return;

    const nowISO = new Date().toISOString();
    batch.forEach((item) => {
      if (appState.deletedTransactionIds) {
        delete appState.deletedTransactionIds[item.id];
      }
      item.updatedAt = nowISO;
      appState.transactions.push(item);
    });
    const restoredCount = batch.length;
    lastDeletedTx = null;
    lastDeletedBatch = null;
    saveState(appState);
    showToast(
      restoredCount > 1 ? `↩️ ${restoredCount} movimientos vinculados restaurados` : '↩️ Movimiento restaurado',
      'success'
    );
    renderApp();
    return;
  }

  if (action === 'toggle-edit-budgets') {
    isEditingBudgets = !isEditingBudgets;
    renderApp();
    return;
  }

  if (action === 'confirm-fixed-item') {
    const tplId = btn.dataset.tpl;
    const tpl = (appState.fixedTemplates || []).find((t) => t.id === tplId);
    if (!tpl) return;
    const amtInput = document.getElementById(`fix-amt-${tplId}`);
    const pmSelect = document.getElementById(`fix-pm-${tplId}`);
    const amt = cleanChileanAmount(amtInput ? amtInput.value : tpl.estimatedAmount);
    const pm = pmSelect ? pmSelect.value : tpl.defaultPaymentMethod;
    const nowISO = new Date().toISOString();

    appState.transactions.push({
      id: `tx_fix_${Date.now()}`,
      date: getTodayISO().startsWith(activeYearMonth) ? getTodayISO() : `${activeYearMonth}-05`,
      type: 'expense',
      amount: amt,
      categoryId: tpl.categoryId || 'vivienda_fijos',
      paymentMethod: pm,
      author: userPrefs.activeAuthor || 'el',
      note: `${tpl.name} (Gasto Fijo Mensual)`,
      fixedTemplateId: tpl.id,
      reconciled: true,
      createdAt: nowISO,
      updatedAt: nowISO
    });
    saveState(appState);
    showToast(`✅ ${tpl.name} confirmado por ${formatCLP(amt)}`, 'success');
    renderApp();
    return;
  }

  if (action === 'load-sample-statement') {
    reconcileState.rawText = SAMPLE_BANK_STATEMENT_TEXT;
    const rows = parseBankStatementText(
      reconcileState.rawText,
      activeYearMonth,
      reconcileState.defaultSourceMethod
    );
    const monthTxs = (appState.transactions || []).filter((t) =>
      String(t.date || '').startsWith(activeYearMonth)
    );
    reconcileState.analyzedRows = reconcileStatementRows(
      rows,
      monthTxs,
      appState.familyConfig?.wifeName,
      appState.transactions,
      appState.learnedContacts || {},
      appState.fixedTemplates || []
    );
    reconcileState.filterTab = 'review';
    showToast('🔍 Cartola ejemplo analizada: revisa la pestaña "Por Confirmar"', 'success');
    renderApp();
    return;
  }

  if (action === 'analyze-statement') {
    const pmSel = document.getElementById('reconcile-default-pm');
    if (pmSel) reconcileState.defaultSourceMethod = pmSel.value;

    const rows = parseBankStatementText(
      reconcileState.rawText,
      activeYearMonth,
      reconcileState.defaultSourceMethod
    );
    if (rows.length === 0) {
      showToast('No se detectaron líneas válidas en la cartola', 'error');
      return;
    }
    const monthTxs = (appState.transactions || []).filter((t) =>
      String(t.date || '').startsWith(activeYearMonth)
    );
    reconcileState.analyzedRows = reconcileStatementRows(
      rows,
      monthTxs,
      appState.familyConfig?.wifeName,
      appState.transactions,
      appState.learnedContacts || {},
      appState.fixedTemplates || []
    );
    const needReview = reconcileState.analyzedRows.filter(
      (r) => r.status === 'forgotten_new' || r.status === 'incoming_abono'
    ).length;
    reconcileState.filterTab = needReview > 0 ? 'review' : 'all';
    showToast(`✅ ${rows.length} movimientos cruzados con tu historial`, 'success');
    renderApp();
    return;
  }

  if (action === 'ai-classify-statement') {
    if (!reconcileState.analyzedRows) return;
    try {
      showToast('🤖 Consultando a Gemini 3.8 Flash...', 'success');
      const apiKey = userPrefs.geminiApiKey || appState.sharedIntegrations?.geminiApiKey || '';
      await classifyStatementRowsWithGemini(reconcileState.analyzedRows, apiKey);
      showToast('✨ Comercios clasificados con Gemini 3.8 Flash', 'success');
      renderApp();
    } catch (err) {
      showToast(err.message || 'Error al clasificar con Gemini IA', 'error');
    }
    return;
  }

  if (action === 'import-reconciled-rows') {
    if (!reconcileState.analyzedRows) return;
    let importedCount = 0;
    let verifiedCount = 0;
    const nowISO = new Date().toISOString();

    if (!appState.learnedContacts) appState.learnedContacts = {};

    reconcileState.analyzedRows.forEach((row) => {
      const contactKey = normalizeContactKey(row.description);

      if (row.status === 'matched_duplicate' && row.matchedTx) {
        const target = appState.transactions.find((t) => t.id === row.matchedTx.id);
        if (target) {
          const grpId = target.splitGroupId || target.receiptGroupId;
          if (grpId) {
            appState.transactions.forEach((t) => {
              if ((t.splitGroupId || t.receiptGroupId) === grpId) {
                t.reconciled = true;
                t.bankFingerprint = row.fingerprint;
                t.updatedAt = nowISO;
              }
            });
          } else {
            target.reconciled = true;
            target.bankFingerprint = row.fingerprint;
            target.updatedAt = nowISO;
            if (target.type === 'expense') {
              target.amount = row.amount;
            }
          }
          verifiedCount++;
        }
      } else if (row.selectedToImport) {
        if (row.status === 'internal' && row.internalType !== 'transfer_self') {
          appState.transactions.push({
            id: `tx_rec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            bankFingerprint: row.fingerprint,
            date: row.date,
            type: row.internalType || 'transfer_wife',
            amount: row.amount,
            categoryId: 'traspaso_interno',
            paymentMethod: row.paymentMethod,
            author: 'el',
            note: `${row.description} (Conciliado de cartola)`,
            reconciled: true,
            createdAt: nowISO,
            updatedAt: nowISO
          });
          importedCount++;
        } else if (row.status === 'incoming_abono' && row.abonoAction !== 'ignore') {
          if (contactKey) {
            appState.learnedContacts[contactKey] = {
              flow: 'in',
              abonoAction: row.abonoAction,
              reimburseCategoryId: row.reimburseCategoryId || 'supermercado',
              updatedAt: nowISO
            };
          }
          if (row.abonoAction === 'reimburse') {
            appState.transactions.push({
              id: `tx_rec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              bankFingerprint: row.fingerprint,
              date: row.date,
              type: 'reimbursement',
              amount: row.amount,
              categoryId: row.reimburseCategoryId || 'supermercado',
              paymentMethod: row.paymentMethod,
              author: userPrefs.activeAuthor || 'el',
              note: `${row.description} (Reembolso en cartola)`,
              reconciled: true,
              createdAt: nowISO,
              updatedAt: nowISO
            });
          } else if (
            row.abonoAction === 'loan_received' ||
            row.abonoAction === 'loan_collected' ||
            row.abonoAction === 'savings_withdrawal'
          ) {
            appState.transactions.push({
              id: `tx_rec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              bankFingerprint: row.fingerprint,
              date: row.date,
              type: row.abonoAction,
              amount: row.amount,
              categoryId: 'prestamo_encargo',
              paymentMethod: row.paymentMethod,
              author: userPrefs.activeAuthor || 'el',
              note: `${row.description} (Conciliado de cartola)`,
              reconciled: true,
              createdAt: nowISO,
              updatedAt: nowISO
            });
          } else {
            appState.transactions.push({
              id: `tx_rec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              bankFingerprint: row.fingerprint,
              date: row.date,
              type: 'income',
              amount: row.amount,
              categoryId: 'ingreso_extra',
              paymentMethod: row.paymentMethod,
              author: userPrefs.activeAuthor || 'el',
              note: `${row.description} (Abono en cartola)`,
              reconciled: true,
              createdAt: nowISO,
              updatedAt: nowISO
            });
          }
          importedCount++;
        } else if (row.status === 'forgotten_new') {
          if (contactKey) {
            appState.learnedContacts[contactKey] = {
              flow: 'out',
              suggestedCategoryId: row.suggestedCategoryId || 'imprevistos',
              updatedAt: nowISO
            };
          }
          if (row.suggestedCategoryId === '__loan_repaid__') {
            appState.transactions.push({
              id: `tx_rec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              bankFingerprint: row.fingerprint,
              date: row.date,
              type: 'loan_repaid',
              amount: row.amount,
              categoryId: 'prestamo_encargo',
              paymentMethod: row.paymentMethod,
              author: userPrefs.activeAuthor || 'el',
              note: `${row.description} (Devolución de préstamo)`,
              reconciled: true,
              createdAt: nowISO,
              updatedAt: nowISO
            });
          } else if (row.suggestedCategoryId === '__loan_given__') {
            appState.transactions.push({
              id: `tx_rec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              bankFingerprint: row.fingerprint,
              date: row.date,
              type: 'loan_given',
              amount: row.amount,
              categoryId: 'prestamo_encargo',
              paymentMethod: row.paymentMethod,
              author: userPrefs.activeAuthor || 'el',
              note: `${row.description} (Por cobrar)`,
              reconciled: true,
              createdAt: nowISO,
              updatedAt: nowISO
            });
          } else {
            const newExpenseTx = {
              id: `tx_rec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              bankFingerprint: row.fingerprint,
              date: row.date,
              type: 'expense',
              amount: row.amount,
              categoryId: row.suggestedCategoryId || 'imprevistos',
              paymentMethod: row.paymentMethod,
              author: userPrefs.activeAuthor || 'el',
              note: `${row.description} (Rescatado en conciliación)`,
              reconciled: true,
              createdAt: nowISO,
              updatedAt: nowISO
            };
            if (row.suggestedFixedTemplateId) {
              newExpenseTx.fixedTemplateId = row.suggestedFixedTemplateId;
            }
            appState.transactions.push(newExpenseTx);
          }
          importedCount++;
        }
      }
    });

    reconcileState.analyzedRows = null;
    reconcileState.rawText = '';
    saveState(appState);
    showToast(
      `✅ Conciliación lista: ${importedCount} incorporados y ${verifiedCount} verificados`,
      'success'
    );
    activeTab = 'budget';
    renderApp();
    return;
  }

  if (action === 'export-excel') {
    exportStateToExcel(appState, activeYearMonth);
    showToast('📊 Archivo Excel (.xlsx) descargado', 'success');
    return;
  }

  if (action === 'export-json-backup') {
    const jsonStr = exportStateToJsonString(appState);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Finanzas_Familiar_Respaldo_${getTodayISO()}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 200);
    showToast('💾 Respaldo JSON completo descargado', 'success');
    return;
  }

  if (action === 'trigger-import-json-backup') {
    const inp = document.getElementById('import-json-backup-input');
    if (inp) {
      inp.value = '';
      inp.click();
    }
    return;
  }

  if (action === 'header-sync-click') {
    const url =
      userPrefs.googleSheetsWebhookUrl || appState.sharedIntegrations?.googleSheetsWebhookUrl || '';
    if (!url) {
      activeTab = 'cloud';
      renderApp();
      showToast('☁️ Conecta aquí tu Google Sheet y envíale el link por WhatsApp a Marie', 'success');
      return;
    }
    try {
      showToast('🔄 Sincronizando en vivo (Santiago ↔ Algarrobo)...', 'success');
      const res = await syncFromCloudGoogleSheets(appState);
      if (res && res.state) {
        appState = res.state;
        renderApp();
      }
      showToast('✅ ¡Sincronizado al día con Marie!', 'success');
    } catch (err) {
      showToast(`Error al sincronizar: ${err.message}`, 'error');
    }
    return;
  }

  if (action === 'share-whatsapp-marie') {
    const rawInputUrl = extractWebhookUrl(document.getElementById('gsheets-url-input')?.value);
    if (rawInputUrl && rawInputUrl.startsWith('https://script.google.com/')) {
      userPrefs.googleSheetsWebhookUrl = rawInputUrl;
      saveUserPrefs(userPrefs);
      if (!appState.sharedIntegrations) appState.sharedIntegrations = {};
      appState.sharedIntegrations.googleSheetsWebhookUrl = rawInputUrl;
      saveState(appState, { skipCloudSync: true });
    }
    const marieLink = buildMagicInstallLink('ella');
    const hasCloud = Boolean(
      userPrefs.googleSheetsWebhookUrl || appState.sharedIntegrations?.googleSheetsWebhookUrl
    );
    const msg = [
      '🛡️ *App Finanzas Familiar (Lista para tu iPhone)*',
      '',
      'Amor, abre este link en *Safari* en tu iPhone:',
      marieLink,
      '',
      '📲 *Para dejarla como App en tu iPhone:*',
      '1. Ábrelo en Safari',
      '2. Toca el botón *Compartir* (abajo al centro) y elige *"Agregar a inicio"*',
      hasCloud
        ? '✨ Ya viene lista con tu nombre (👩🏻 Marie) y conectada en vivo conmigo entre Santiago y Algarrobo.'
        : '✨ Ya viene lista con tu nombre (👩🏻 Marie).'
    ].join('\n');
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
    return;
  }

  if (action === 'copy-marie-link') {
    const rawInputUrl = extractWebhookUrl(document.getElementById('gsheets-url-input')?.value);
    if (rawInputUrl && rawInputUrl.startsWith('https://script.google.com/')) {
      userPrefs.googleSheetsWebhookUrl = rawInputUrl;
      saveUserPrefs(userPrefs);
      if (!appState.sharedIntegrations) appState.sharedIntegrations = {};
      appState.sharedIntegrations.googleSheetsWebhookUrl = rawInputUrl;
      saveState(appState, { skipCloudSync: true });
    }
    const marieLink = buildMagicInstallLink('ella');
    try {
      await navigator.clipboard.writeText(marieLink);
      showToast('📋 Link Mágico de Marie copiado al portapapeles', 'success');
    } catch {
      prompt('Copia este Link Mágico para Marie:', marieLink);
    }
    return;
  }

  if (action === 'copy-mauricio-link') {
    const mauricioLink = buildMagicInstallLink('el');
    try {
      await navigator.clipboard.writeText(mauricioLink);
      showToast('📋 Tu Link Mágico (Mauricio) copiado para abrirlo en tu iPhone', 'success');
    } catch {
      prompt('Copia tu Link Mágico (Mauricio):', mauricioLink);
    }
    return;
  }

  if (action === 'save-and-sync-up') {
    const url = extractWebhookUrl(document.getElementById('gsheets-url-input')?.value);
    userPrefs.googleSheetsWebhookUrl = url;
    saveUserPrefs(userPrefs);
    if (!appState.sharedIntegrations) appState.sharedIntegrations = {};
    appState.sharedIntegrations.googleSheetsWebhookUrl = url;
    saveState(appState, { skipCloudSync: true });

    if (!url) {
      showToast('URL vaciada. Operando en modo WiFi / local.', 'success');
      renderApp();
      return;
    }
    try {
      showToast('☁️ Sincronizando con Google Sheets...', 'success');
      await pushStateToGoogleSheets(appState, url);
      appState = loadState();
      showToast('✅ ¡Nube conectada! Ahora envíale el Link Mágico por WhatsApp a Marie', 'success');
      renderApp();
    } catch (err) {
      showToast(`Error al sincronizar: ${err.message}`, 'error');
    }
    return;
  }

  if (action === 'sync-down-sheets') {
    const url =
      extractWebhookUrl(document.getElementById('gsheets-url-input')?.value) ||
      userPrefs.googleSheetsWebhookUrl ||
      appState.sharedIntegrations?.googleSheetsWebhookUrl;
    if (!url) {
      showToast('Primero pega la URL de tu Google Apps Script', 'error');
      return;
    }
    try {
      const updated = await pullStateFromGoogleSheets(url, appState);
      if (updated) {
        appState = updated;
        showToast('✅ Datos fusionados desde Google Sheets', 'success');
        renderApp();
      } else {
        showToast('La hoja de Google Sheets aún no tenía registros.', 'success');
      }
    } catch (err) {
      showToast(`Error al descargar: ${err.message}`, 'error');
    }
    return;
  }

  if (action === 'save-gemini-key') {
    const key = document.getElementById('gemini-key-input')?.value?.trim() || '';
    userPrefs.geminiApiKey = key;
    saveUserPrefs(userPrefs);
    if (!appState.sharedIntegrations) appState.sharedIntegrations = {};
    appState.sharedIntegrations.geminiApiKey = key;
    saveState(appState);
    showToast('🔑 Clave Gemini guardada y sincronizada en tus dispositivos familiares', 'success');
    renderApp();
    return;
  }

  if (action === 'copy-apps-script-code') {
    try {
      const resp = await fetch('./google-sheets-sync/Code.gs');
      const code = await resp.text();
      await navigator.clipboard.writeText(code);
      showToast('📋 Código copiado. Pégalo en Extensiones → Apps Script de tu Google Sheet.', 'success');
    } catch {
      showToast('Abre el archivo google-sheets-sync/Code.gs en la carpeta del proyecto.', 'error');
    }
  }
});

// Escuchar fusiones asíncronas completadas tras saveState() o pushStateToGoogleSheets()
window.addEventListener('finanzas:state-merged', (ev) => {
  if (ev?.detail?.state) {
    appState = ev.detail.state;
    userPrefs = loadUserPrefs();
    if (!isUserTyping()) {
      renderApp();
    } else {
      pendingSyncRender = true;
    }
  }
});

// Si hubo una sincronización en segundo plano mientras el usuario escribía, aplicarla al salir del input
document.addEventListener('focusout', () => {
  setTimeout(() => {
    if (pendingSyncRender && !isUserTyping()) {
      pendingSyncRender = false;
      renderApp();
    }
  }, 150);
});

let isSyncingInBackground = false;
async function runBackgroundSync(forceRenderOnFirstLoad = false) {
  if (isSyncingInBackground) return;
  isSyncingInBackground = true;
  try {
    let anyChanged = false;

    const wifiSynced = await syncFromLocalWifiServer(appState);
    if (wifiSynced) {
      if (wifiSynced.localIp) detectedLocalIp = wifiSynced.localIp;
      if (wifiSynced.changed || forceRenderOnFirstLoad) {
        appState = wifiSynced.state;
        anyChanged = true;
      }
    }

    const cloudSynced = await syncFromCloudGoogleSheets(appState);
    if (cloudSynced) {
      if (cloudSynced.changed || forceRenderOnFirstLoad) {
        appState = cloudSynced.state;
        anyChanged = true;
      }
    }

    if (anyChanged) {
      userPrefs = loadUserPrefs();
      if (!isUserTyping()) {
        renderApp();
      } else {
        pendingSyncRender = true;
      }
    }
  } finally {
    isSyncingInBackground = false;
  }
}

// Inicializar y activar sincronización inteligente (WiFi local + Google Sheets 4G/5G entre ciudades + reconexión online)
window.addEventListener('DOMContentLoaded', async () => {
  applyTheme(userPrefs.theme);
  quickForm.paymentMethod = userPrefs.defaultPaymentMethod || 'cmr_falabella';
  renderApp();
  await runBackgroundSync(true);

  setupAutoOnlineSync((res) => {
    if (res?.state && res.changed) {
      appState = res.state;
      userPrefs = loadUserPrefs();
      if (!isUserTyping()) {
        renderApp();
      } else {
        pendingSyncRender = true;
      }
    }
  });

  setInterval(() => {
    if (document.hidden) return;
    runBackgroundSync(false);
  }, 10000);
});

// Al desbloquear el iPhone o volver a abrir la App desde la pantalla de inicio, sincronizar al instante
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    runBackgroundSync(false);
  }
});
