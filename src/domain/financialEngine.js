/**
 * Motor Financiero Puro de Dominio (Sin dependencias de DOM ni almacenamiento local).
 * Centraliza el cálculo de presupuestos, Escudo CMR, Cuenta Mujer (Marie),
 * Ritmo de Gasto Diario (Burn Rate), Libro Mayor de Préstamos, Filtros Instantáneos
 * y Diagnóstico Ejecutivo Familiar en 0 ms.
 */

const FALLBACK_CATEGORIES = [
  { id: 'supermercado', name: 'Supermercado y Feria', icon: '🛒', group: 'esencial', defaultBudget: 420000 },
  { id: 'hija', name: 'Hija (Pañales, Leche, Ropa)', icon: '👶', group: 'esencial', defaultBudget: 140000 },
  { id: 'vivienda_fijos', name: 'Vivienda y Cuentas Fijas', icon: '🏠', group: 'fijo', defaultBudget: 850000 },
  { id: 'salud_farmacia', name: 'Salud y Farmacia', icon: '💊', group: 'esencial', defaultBudget: 80000 },
  { id: 'transporte', name: 'Transporte, Auto y Bencina', icon: '🚗', group: 'esencial', defaultBudget: 130000 },
  { id: 'delivery_salidas', name: 'Delivery, Salidas y Cafés', icon: '🍔', group: 'estilo_vida', defaultBudget: 100000 },
  { id: 'hogar_varios', name: 'Hogar, Aseo y Varios', icon: '🧹', group: 'esencial', defaultBudget: 60000 },
  { id: 'gustos_personales', name: 'Gustos y Compras Personales', icon: '🎁', group: 'estilo_vida', defaultBudget: 80000 },
  { id: 'imprevistos', name: 'Imprevistos y Otros', icon: '🚨', group: 'esencial', defaultBudget: 50000 }
];

const PAYMENT_METHOD_LABELS = {
  bch_ctacte: 'Banco de Chile Cta. Cte. Corriente',
  bch_vista: 'Banco de Chile Cta. Vista FAN',
  cmr_falabella: 'CMR Falabella Crédito',
  cuenta_mujer: 'Cuenta Mi Mujer Marie',
  efectivo: 'Efectivo'
};

/**
 * Formatea un monto numérico como pesos chilenos (ej: 150000 -> "$150.000").
 */
export function formatCLPAmount(value) {
  const num = Math.round(Number(value || 0));
  const sign = num < 0 ? '-' : '';
  return `${sign}$${Math.abs(num).toLocaleString('es-CL')}`;
}

/**
 * Normaliza un texto quitando tildes y pasándolo a minúsculas para búsquedas rápidas.
 */
function normalizeSearchText(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Extrae una clave normalizada de contacto desde una nota o glosa bancaria.
 */
export function normalizeLoanContactKey(rawNoteOrDesc) {
  if (!rawNoteOrDesc) return 'general';
  let cleaned = String(rawNoteOrDesc)
    .replace(/^(pago:|traspaso a:|traspaso de:|tef a:|transferencia a:|transferencia de:)\s*/i, '')
    .replace(/\(conciliado.*?\)/gi, '')
    .replace(/\(reembolso.*?\)/gi, '')
    .replace(/\(devolucion.*?\)/gi, '')
    .replace(/\(devolución.*?\)/gi, '')
    .replace(/\(prestamo.*?\)/gi, '')
    .replace(/\(préstamo.*?\)/gi, '')
    .replace(/\(por cobrar.*?\)/gi, '')
    .replace(/\(nuestra parte.*?\)/gi, '')
    .replace(/\(saldado.*?\)/gi, '')
    .trim();

  const splitParts = cleaned.split(/\s*[—\-:]\s*/);
  if (splitParts[0] && splitParts[0].trim().length >= 2) {
    cleaned = splitParts[0].trim();
  }

  const key = normalizeSearchText(cleaned)
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .join(' ');

  return key || 'general';
}

/**
 * Extrae el nombre visible de un contacto (capitalizado) desde una nota o glosa.
 */
export function extractLoanContactDisplayName(rawNoteOrDesc, learnedContacts = {}) {
  const key = normalizeLoanContactKey(rawNoteOrDesc);
  if (learnedContacts && learnedContacts[key]?.displayName) {
    return learnedContacts[key].displayName;
  }

  if (!rawNoteOrDesc) return 'General';
  let cleaned = String(rawNoteOrDesc)
    .replace(/^(pago:|traspaso a:|traspaso de:|tef a:|transferencia a:|transferencia de:)\s*/i, '')
    .replace(/\(conciliado.*?\)/gi, '')
    .replace(/\(reembolso.*?\)/gi, '')
    .replace(/\(devolucion.*?\)/gi, '')
    .replace(/\(devolución.*?\)/gi, '')
    .replace(/\(prestamo.*?\)/gi, '')
    .replace(/\(préstamo.*?\)/gi, '')
    .replace(/\(por cobrar.*?\)/gi, '')
    .replace(/\(nuestra parte.*?\)/gi, '')
    .trim();

  const splitParts = cleaned.split(/\s*[—\-:]\s*/);
  if (splitParts[0] && splitParts[0].trim().length >= 2) {
    cleaned = splitParts[0].trim();
  }
  if (!cleaned) return 'General';

  return cleaned
    .toLowerCase()
    .split(/\s+/)
    .slice(0, 3)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Resuelve la información de calendario (días del mes, día actual, días restantes)
 * a partir del mes activo ("YYYY-MM") y la fecha actual ("YYYY-MM-DD").
 */
export function resolveCalendarProgress(activeYearMonth, todayISO) {
  const now = new Date();
  const fallbackToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const effectiveTodayISO = typeof todayISO === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(todayISO)
    ? todayISO
    : fallbackToday;

  const effectiveYm = typeof activeYearMonth === 'string' && /^\d{4}-\d{2}$/.test(activeYearMonth)
    ? activeYearMonth
    : effectiveTodayISO.slice(0, 7);

  const [yearNum, monthNum] = effectiveYm.split('-').map(Number);
  const daysInMonth = new Date(yearNum, monthNum, 0).getDate();
  const todayYm = effectiveTodayISO.slice(0, 7);
  const todayDayNum = parseInt(effectiveTodayISO.slice(8, 10), 10) || 1;

  let currentDay = daysInMonth;
  if (effectiveYm === todayYm) {
    currentDay = Math.max(1, Math.min(daysInMonth, todayDayNum));
  } else if (effectiveYm > todayYm) {
    currentDay = 1;
  } else {
    currentDay = daysInMonth;
  }

  const daysElapsed = currentDay;
  const daysRemaining = Math.max(1, daysInMonth - currentDay + 1);
  const daysLeftAfterToday = Math.max(0, daysInMonth - currentDay);
  const monthProgressPct = Math.round((currentDay / daysInMonth) * 100);

  return {
    activeYearMonth: effectiveYm,
    todayISO: effectiveTodayISO,
    daysInMonth,
    currentDay,
    daysElapsed,
    daysRemaining,
    daysLeftAfterToday,
    monthProgressPct
  };
}

/**
 * Agrupa y calcula de forma determinista el libro mayor de préstamos recibidos
 * (`loan_received`, `loan_repaid`) y préstamos otorgados (`loan_given`, `loan_collected`) por contacto.
 *
 * @param {Array} transactions - Lista de transacciones históricas.
 * @param {Object} [learnedContacts={}] - Diccionario opcional de contactos aprendidos.
 */
export function calculateLoansLedger(transactions = [], learnedContacts = {}) {
  const LOAN_TYPES = new Set(['loan_received', 'loan_repaid', 'loan_given', 'loan_collected']);
  const safeTxs = Array.isArray(transactions) ? transactions : [];

  // Ordenar cronológicamente para que el cálculo de saldos sea 100% determinista
  const loanTxs = safeTxs
    .filter((tx) => tx && LOAN_TYPES.has(tx.type))
    .slice()
    .sort(
      (a, b) =>
        String(a.date || '').localeCompare(String(b.date || '')) ||
        String(a.createdAt || '').localeCompare(String(b.createdAt || '')) ||
        String(a.id || '').localeCompare(String(b.id || ''))
    );

  const byContactKey = {};

  for (const tx of loanTxs) {
    const amt = Math.max(0, Math.round(Number(tx.amount || 0)));
    if (amt <= 0) continue;

    const rawLabel = tx.contactName || tx.note || tx.description || 'General';
    const key = normalizeLoanContactKey(rawLabel);
    const displayName = extractLoanContactDisplayName(rawLabel, learnedContacts);

    if (!byContactKey[key]) {
      byContactKey[key] = {
        key,
        name: displayName,
        totalReceived: 0,
        totalRepaid: 0,
        totalGiven: 0,
        totalCollected: 0,
        owedByUs: 0,
        owedToUs: 0,
        netBalance: 0,
        status: 'settled',
        movementsCount: 0,
        lastDate: tx.date || '',
        lastNote: tx.note || '',
        movements: []
      };
    }

    const entry = byContactKey[key];
    entry.movementsCount += 1;
    entry.movements.push(tx);

    if (String(tx.date || '') >= String(entry.lastDate || '')) {
      entry.lastDate = tx.date || entry.lastDate;
      entry.lastNote = tx.note || entry.lastNote;
    }

    if (tx.type === 'loan_received') {
      entry.totalReceived += amt;
      entry.owedByUs += amt;
    } else if (tx.type === 'loan_repaid') {
      entry.totalRepaid += amt;
      entry.owedByUs = Math.max(0, entry.owedByUs - amt);
    } else if (tx.type === 'loan_given') {
      entry.totalGiven += amt;
      entry.owedToUs += amt;
    } else if (tx.type === 'loan_collected') {
      entry.totalCollected += amt;
      entry.owedToUs = Math.max(0, entry.owedToUs - amt);
    }

    entry.netBalance = entry.owedToUs - entry.owedByUs;
    if (entry.owedByUs > 0 && entry.owedToUs > 0) {
      entry.status = 'mutual';
    } else if (entry.owedByUs > 0) {
      entry.status = 'we_owe';
    } else if (entry.owedToUs > 0) {
      entry.status = 'they_owe';
    } else {
      entry.status = 'settled';
    }
  }

  const contacts = Object.values(byContactKey).sort((a, b) => {
    const activeA = a.owedByUs + a.owedToUs;
    const activeB = b.owedByUs + b.owedToUs;
    if (activeB !== activeA) return activeB - activeA;
    return a.name.localeCompare(b.name, 'es');
  });

  const activeContacts = contacts.filter((c) => c.owedByUs > 0 || c.owedToUs > 0);
  const settledContacts = contacts.filter((c) => c.owedByUs === 0 && c.owedToUs === 0);

  let totalOwedByUs = 0;
  let totalOwedToUs = 0;
  for (const c of activeContacts) {
    totalOwedByUs += c.owedByUs;
    totalOwedToUs += c.owedToUs;
  }

  return {
    contacts,
    activeContacts,
    loansByPerson: activeContacts,
    settledContacts,
    byContactKey,
    totalOwedByUs,
    totalOwedToUs,
    totalLoansOwedToOthers: totalOwedByUs,
    totalLoansReceivable: totalOwedToUs,
    netLoanPosition: totalOwedToUs - totalOwedByUs
  };
}

/**
 * Calcula el resumen financiero mensual completo:
 * ingresos reales vs meta, ahorro meta, gasto bruto, reembolsos, gasto neto por categoría,
 * semáforos ('ok' | 'warn' | 'danger'), Escudo CMR (cmrSpent, cmrPaid, cmrNetReserve),
 * Cuenta Mujer (transferredToWife, spentByWife, wifeRemainingBalance) y Gastos Fijos pendientes.
 *
 * @param {Object} state - Estado completo de la aplicación.
 * @param {string} activeYearMonth - Mes consultado en formato "YYYY-MM".
 * @param {string} [todayISO] - Fecha de referencia "YYYY-MM-DD".
 */
export function calculateMonthlyFinancialSummary(state = {}, activeYearMonth, todayISO) {
  const calendar = resolveCalendarProgress(activeYearMonth, todayISO);
  const ym = calendar.activeYearMonth;

  const categories = Array.isArray(state?.categories) && state.categories.length > 0
    ? state.categories
    : FALLBACK_CATEGORIES;

  const defaultCatBudgets = {};
  for (const cat of categories) {
    defaultCatBudgets[cat.id] = Number(cat.defaultBudget || 50000);
  }

  const rawMonthCfg = state?.monthlyBudgets?.[ym];
  const monthCfg = {
    incomeTarget: Number(rawMonthCfg?.incomeTarget ?? state?.familyConfig?.monthlyIncomeTarget ?? 2350000),
    savingsGoal: Number(rawMonthCfg?.savingsGoal ?? state?.familyConfig?.monthlySavingsGoal ?? 250000),
    categories: {
      ...defaultCatBudgets,
      ...(rawMonthCfg?.categories || {})
    }
  };

  const allTxs = Array.isArray(state?.transactions) ? state.transactions : [];
  const txs = allTxs.filter((t) => t && String(t.date || '').startsWith(ym));

  let realIncome = 0;
  let grossExpense = 0;
  let totalReimbursements = 0;
  let cmrSpent = 0;
  let cmrPaid = 0;
  let transferredToWife = 0;
  let spentByWife = 0;
  let savingsWithdrawnThisMonth = 0;
  let fixedGrossSpent = 0;
  let fixedReimbursed = 0;

  // Acumuladores multi-mes hasta el cierre de `ym` para arrastre inteligente
  let cmrCumulativeSpentUpToMonth = 0;
  let cmrCumulativePaidUpToMonth = 0;
  let cmrPrevMonthsSpent = 0;
  let cmrPrevMonthsPaid = 0;

  let wifeCumulativeTransferredUpToMonth = 0;
  let wifeCumulativeSpentUpToMonth = 0;
  let wifePrevMonthsTransferred = 0;
  let wifePrevMonthsSpent = 0;

  for (const tx of allTxs) {
    if (!tx) continue;
    const amt = Math.max(0, Math.round(Number(tx.amount || 0)));
    const txYm = String(tx.date || '').slice(0, 7);
    if (!txYm) continue;

    const isUpToActiveMonth = txYm <= ym;
    const isStrictlyBeforeActiveMonth = txYm < ym;

    if (isUpToActiveMonth) {
      if (tx.type === 'expense' && tx.paymentMethod === 'cmr_falabella') {
        cmrCumulativeSpentUpToMonth += amt;
        if (isStrictlyBeforeActiveMonth) cmrPrevMonthsSpent += amt;
      }
      if (tx.type === 'cmr_payment') {
        cmrCumulativePaidUpToMonth += amt;
        if (isStrictlyBeforeActiveMonth) cmrPrevMonthsPaid += amt;
      }
      if (tx.type === 'transfer_wife') {
        wifeCumulativeTransferredUpToMonth += amt;
        if (isStrictlyBeforeActiveMonth) wifePrevMonthsTransferred += amt;
      }
      if (tx.type === 'expense' && tx.paymentMethod === 'cuenta_mujer') {
        wifeCumulativeSpentUpToMonth += amt;
        if (isStrictlyBeforeActiveMonth) wifePrevMonthsSpent += amt;
      }
    }
  }

  const grossSpentByCategory = {};
  const reimbursedByCategory = {};
  const netSpentByCategory = {};

  for (const cat of categories) {
    grossSpentByCategory[cat.id] = 0;
    reimbursedByCategory[cat.id] = 0;
    netSpentByCategory[cat.id] = 0;
  }

  for (const tx of txs) {
    const amt = Math.max(0, Math.round(Number(tx.amount || 0)));
    if (tx.type === 'income') {
      realIncome += amt;
    } else if (tx.type === 'expense') {
      grossExpense += amt;
      const catId = tx.categoryId || 'imprevistos';
      grossSpentByCategory[catId] = (grossSpentByCategory[catId] || 0) + amt;

      if (tx.paymentMethod === 'cmr_falabella') {
        cmrSpent += amt;
      }
      if (tx.paymentMethod === 'cuenta_mujer') {
        spentByWife += amt;
      }
      if (tx.fixedTemplateId || catId === 'vivienda_fijos') {
        fixedGrossSpent += amt;
      }
    } else if (tx.type === 'reimbursement') {
      totalReimbursements += amt;
      const catId = tx.categoryId || 'imprevistos';
      reimbursedByCategory[catId] = (reimbursedByCategory[catId] || 0) + amt;
      if (tx.fixedTemplateId || catId === 'vivienda_fijos') {
        fixedReimbursed += amt;
      }
    } else if (tx.type === 'savings_withdrawal') {
      savingsWithdrawnThisMonth += amt;
    } else if (tx.type === 'transfer_wife') {
      transferredToWife += amt;
    } else if (tx.type === 'cmr_payment') {
      cmrPaid += amt;
    }
  }

  // Calcular gasto neto por categoría y semáforos ('ok' | 'warn' | 'danger')
  const categorySemaphores = {};
  const categoryBreakdown = [];
  let totalBudgetedCategories = 0;

  const allCategoryIds = new Set([
    ...categories.map((c) => c.id),
    ...Object.keys(grossSpentByCategory),
    ...Object.keys(reimbursedByCategory)
  ]);

  for (const catId of allCategoryIds) {
    const catMeta = categories.find((c) => c.id === catId) || {
      id: catId,
      name: catId,
      icon: '📌',
      group: 'esencial',
      defaultBudget: 0
    };
    const budget = Math.max(0, Math.round(Number(monthCfg.categories?.[catId] ?? catMeta.defaultBudget ?? 0)));
    if (categories.some((c) => c.id === catId)) {
      totalBudgetedCategories += budget;
    }

    const gross = grossSpentByCategory[catId] || 0;
    const reimb = reimbursedByCategory[catId] || 0;
    const net = Math.max(0, gross - reimb);
    netSpentByCategory[catId] = net;

    const remaining = budget - net;
    const usagePct = budget > 0 ? Math.round((net / budget) * 100) : net > 0 ? 100 : 0;

    let status = 'ok';
    if (usagePct >= 95 || (budget > 0 && net > budget)) {
      status = 'danger';
    } else if (usagePct >= 75) {
      status = 'warn';
    }
    categorySemaphores[catId] = status;

    if (categories.some((c) => c.id === catId) || net > 0) {
      categoryBreakdown.push({
        id: catId,
        name: catMeta.name,
        icon: catMeta.icon || '📌',
        group: catMeta.group || 'esencial',
        description: catMeta.description || '',
        budget,
        grossSpent: gross,
        reimbursed: reimb,
        netSpent: net,
        spent: net,
        remaining,
        usagePct,
        pct: usagePct,
        status
      });
    }
  }

  const netExpense = Math.max(0, grossExpense - totalReimbursements);
  const incomeTarget = monthCfg.incomeTarget;
  const savingsGoal = monthCfg.savingsGoal;
  const effectiveIncome = realIncome > 0 ? realIncome : incomeTarget;
  const incomeVsTargetDiff = realIncome - incomeTarget;
  const spendableAfterSavings = effectiveIncome - savingsGoal;
  const remainingSpendable = spendableAfterSavings - netExpense;
  const budgetUsedPct = spendableAfterSavings > 0 ? Math.round((netExpense / spendableAfterSavings) * 100) : 0;

  // Escudo CMR (del mes y con arrastre acumulado)
  const cmrCarryoverPrev = Math.max(0, cmrPrevMonthsSpent - cmrPrevMonthsPaid);
  const cmrNetReserve = Math.max(0, cmrCumulativeSpentUpToMonth - cmrCumulativePaidUpToMonth);

  // Cuenta Mujer (del mes y con arrastre acumulado)
  const wifeCarryoverPrev = wifePrevMonthsTransferred - wifePrevMonthsSpent;
  const wifeRemainingBalance = wifeCumulativeTransferredUpToMonth - wifeCumulativeSpentUpToMonth;

  // Gastos Fijos del mes (pagados vs pendientes)
  const fixedTemplates = Array.isArray(state?.fixedTemplates) ? state.fixedTemplates : [];
  const fixedTemplatesStatus = fixedTemplates.map((tpl) => {
    const paidTx = txs.find((t) => t.type === 'expense' && t.fixedTemplateId === tpl.id) || null;
    return {
      ...tpl,
      paid: Boolean(paidTx),
      paidTx,
      paidAmount: paidTx ? Math.round(Number(paidTx.amount || 0)) : 0,
      pendingAmount: paidTx ? 0 : Math.round(Number(tpl.estimatedAmount || 0))
    };
  });

  const pendingFixedExpenses = fixedTemplatesStatus.filter((f) => !f.paid);
  const paidFixedExpenses = fixedTemplatesStatus.filter((f) => f.paid);
  const pendingFixedTotal = pendingFixedExpenses.reduce((acc, f) => acc + f.pendingAmount, 0);
  const paidFixedTotal = paidFixedExpenses.reduce((acc, f) => acc + f.paidAmount, 0);

  const fixedSpent = Math.max(0, fixedGrossSpent - fixedReimbursed);
  const variableSpent = Math.max(0, netExpense - fixedSpent);

  // Libro de préstamos
  const loansLedger = calculateLoansLedger(allTxs, state?.learnedContacts || {});

  return {
    yearMonth: ym,
    todayISO: calendar.todayISO,
    monthCfg,
    txs,
    incomeTarget,
    realIncome,
    effectiveIncome,
    incomeVsTargetDiff,
    savingsGoal,
    savingsWithdrawnThisMonth,
    spendableAfterSavings,
    spendableBudget: spendableAfterSavings,
    totalBudgetedCategories,
    grossExpense,
    totalReimbursements,
    netExpense,
    totalExpense: netExpense,
    remainingSpendable,
    budgetUsedPct,
    fixedSpent,
    variableSpent,
    grossSpentByCategory,
    reimbursedByCategory,
    netSpentByCategory,
    spentByCategory: netSpentByCategory,
    categorySemaphores,
    categoryBreakdown,
    // Escudo CMR
    cmrSpent,
    cmrPaid,
    cmrCarryoverPrev,
    cmrNetReserve,
    cmrPendingReserve: cmrNetReserve,
    // Cuenta Mujer (Marie)
    transferredToWife,
    spentByWife,
    spentFromWifeAccount: spentByWife,
    wifeCarryoverPrev,
    wifeRemainingBalance,
    wifeWalletRemaining: wifeRemainingBalance,
    // Gastos Fijos
    fixedTemplatesStatus,
    pendingFixedExpenses,
    paidFixedExpenses,
    pendingFixedTotal,
    paidFixedTotal,
    // Préstamos
    loansLedger,
    loansByPerson: loansLedger.loansByPerson,
    totalLoansOwedToOthers: loansLedger.totalOwedByUs,
    totalLoansReceivable: loansLedger.totalOwedToUs,
    // Calendario
    daysInMonth: calendar.daysInMonth,
    currentDay: calendar.currentDay,
    daysElapsed: calendar.daysElapsed,
    daysRemaining: calendar.daysRemaining,
    daysLeftAfterToday: calendar.daysLeftAfterToday,
    monthProgressPct: calendar.monthProgressPct
  };
}

/**
 * Calcula el Ritmo de Gasto Diario (Burn Rate) del mes y la proyección de cierre:
 * - Días transcurridos vs días restantes del mes.
 * - Gasto variable diario promedio actual vs Presupuesto Diario Seguro (`dailySafeSpend`).
 * - Proyección de cierre de mes (`projectedMonthEndSpend`, `projectedSurplusOrDeficit`,
 *   `paceStatus`: `'bajo_control' | 'alerta_ritmo' | 'sobregiro_proyectado'`).
 *
 * @param {Object} summary - Resumen devuelto por `calculateMonthlyFinancialSummary`.
 * @param {string} [activeYearMonth] - Mes activo "YYYY-MM".
 * @param {string} [todayISO] - Fecha actual "YYYY-MM-DD".
 */
export function calculateBurnRateAndProjection(summary = {}, activeYearMonth, todayISO) {
  const ym = activeYearMonth || summary?.yearMonth;
  const refToday = todayISO || summary?.todayISO;
  const calendar = ym
    ? resolveCalendarProgress(ym, refToday)
    : {
        daysInMonth: Number(summary?.daysInMonth || 30),
        currentDay: Number(summary?.currentDay || summary?.daysElapsed || 15),
        daysElapsed: Number(summary?.daysElapsed || summary?.currentDay || 15),
        daysRemaining: Number(summary?.daysRemaining || 16),
        daysLeftAfterToday: Math.max(0, Number(summary?.daysInMonth || 30) - Number(summary?.daysElapsed || 15)),
        monthProgressPct: Number(summary?.monthProgressPct || 50)
      };

  const daysInMonth = calendar.daysInMonth;
  const daysElapsed = Math.max(1, calendar.daysElapsed);
  const daysRemaining = Math.max(1, calendar.daysRemaining);
  const monthProgressPct = calendar.monthProgressPct;

  const effectiveIncome = Number(summary?.effectiveIncome ?? summary?.incomeTarget ?? 2350000);
  const savingsGoal = Number(summary?.savingsGoal ?? 250000);
  const spendableAfterSavings = Number(
    summary?.spendableAfterSavings ?? summary?.spendableBudget ?? (effectiveIncome - savingsGoal)
  );
  const netExpense = Number(summary?.netExpense ?? summary?.totalExpense ?? 0);
  const remainingSpendable = Number(summary?.remainingSpendable ?? (spendableAfterSavings - netExpense));

  const fixedSpent = Number(summary?.fixedSpent ?? 0);
  const pendingFixedTotal = Number(summary?.pendingFixedTotal ?? 0);
  const variableSpent = Number(summary?.variableSpent ?? Math.max(0, netExpense - fixedSpent));

  // Ritmo diario bruto y variable
  const currentDailyBurnRate = Math.round(netExpense / daysElapsed);
  const variableDailyBurnRate = Math.round(variableSpent / daysElapsed);

  // Presupuesto diario seguro para llegar a fin de mes sin tocar el ahorro
  const dailySafeSpend = Math.max(0, Math.round(remainingSpendable / daysRemaining));
  const freeAfterPendingFixed = remainingSpendable - pendingFixedTotal;
  const dailySafeSpendAfterFixed = Math.max(0, Math.round(freeAfterPendingFixed / daysRemaining));

  // Proyección de cierre de mes:
  // Si hay separación entre gasto fijo y variable, proyectamos el variable linealmente + los fijos comprometidos.
  let projectedMonthEndSpend = 0;
  if (fixedSpent > 0 || pendingFixedTotal > 0) {
    const projectedVariableTotal = Math.round((variableSpent / daysElapsed) * daysInMonth);
    projectedMonthEndSpend = Math.max(netExpense, fixedSpent + pendingFixedTotal + projectedVariableTotal);
  } else {
    projectedMonthEndSpend = Math.max(netExpense, Math.round((netExpense / daysElapsed) * daysInMonth));
  }

  const projectedSurplusOrDeficit = spendableAfterSavings - projectedMonthEndSpend;
  const budgetUsedPct = spendableAfterSavings > 0 ? Math.round((netExpense / spendableAfterSavings) * 100) : 0;
  const paceDeltaPct = budgetUsedPct - monthProgressPct;

  let paceStatus = 'bajo_control';
  if (remainingSpendable < 0 || projectedSurplusOrDeficit < 0 || budgetUsedPct >= 100) {
    paceStatus = 'sobregiro_proyectado';
  } else if (
    paceDeltaPct > 8 ||
    budgetUsedPct >= 85 ||
    (variableDailyBurnRate > dailySafeSpend && daysElapsed >= 3)
  ) {
    paceStatus = 'alerta_ritmo';
  }

  return {
    daysInMonth,
    daysElapsed,
    daysRemaining,
    daysLeftAfterToday: calendar.daysLeftAfterToday,
    monthProgressPct,
    budgetUsedPct,
    paceDeltaPct,
    currentDailyBurnRate,
    variableDailyBurnRate,
    dailySafeSpend,
    dailySafeSpendAfterFixed,
    projectedMonthEndSpend,
    projectedSurplusOrDeficit,
    paceStatus
  };
}

/**
 * Filtra movimientos de forma ultrarrápida por `yearMonth`, `searchQuery` (nota, comercio,
 * monto, categoría), `categoryId`, `paymentMethod`, `author` ('all' | 'el' | 'ella'),
 * `reconciledStatus` ('all' | 'reconciled' | 'pending') y `type`.
 *
 * @param {Array} transactions - Lista de transacciones a filtrar.
 * @param {Object} [filterOptions={}] - Criterios de filtrado.
 */
export function filterTransactions(transactions = [], filterOptions = {}) {
  const safeTxs = Array.isArray(transactions) ? transactions : [];
  const {
    yearMonth = 'all',
    searchQuery = '',
    categoryId = 'all',
    paymentMethod = 'all',
    author = 'all',
    reconciledStatus = 'all',
    type = 'all',
    onlySplit = false,
    categories = FALLBACK_CATEGORIES
  } = filterOptions || {};

  const catNameMap = {};
  for (const c of FALLBACK_CATEGORIES) {
    catNameMap[c.id] = normalizeSearchText(c.name);
  }
  if (Array.isArray(categories)) {
    for (const c of categories) {
      if (c && c.id) catNameMap[c.id] = normalizeSearchText(c.name);
    }
  }

  const cleanQuery = normalizeSearchText(searchQuery);
  const queryDigits = String(searchQuery || '').replace(/\D/g, '');
  const hasDigitsQuery = queryDigits.length >= 2 && /^[\d$.\s,-]+$/.test(String(searchQuery || '').trim());

  const filtered = safeTxs.filter((tx) => {
    if (!tx) return false;

    if (yearMonth && yearMonth !== 'all') {
      if (!String(tx.date || '').startsWith(yearMonth)) return false;
    }

    if (categoryId && categoryId !== 'all') {
      if (tx.categoryId !== categoryId) return false;
    }

    if (paymentMethod && paymentMethod !== 'all') {
      if (paymentMethod === 'bch_all' || paymentMethod === 'banco_chile') {
        if (tx.paymentMethod !== 'bch_ctacte' && tx.paymentMethod !== 'bch_vista') return false;
      } else if (tx.paymentMethod !== paymentMethod) {
        return false;
      }
    }

    if (author && author !== 'all') {
      const txAuthor = tx.author || 'el';
      if (txAuthor !== author) return false;
    }

    if (reconciledStatus && reconciledStatus !== 'all') {
      const isRec = Boolean(tx.reconciled);
      if (reconciledStatus === 'reconciled' && !isRec) return false;
      if (reconciledStatus === 'pending' && isRec) return false;
    }

    if (type && type !== 'all') {
      if (Array.isArray(type)) {
        if (!type.includes(tx.type)) return false;
      } else if (tx.type !== type) {
        return false;
      }
    }

    if (onlySplit) {
      if (!tx.splitGroupId && !tx.receiptGroupId) return false;
    }

    if (cleanQuery) {
      const amtStr = String(Math.round(Number(tx.amount || 0)));
      if (hasDigitsQuery && amtStr.includes(queryDigits)) {
        return true;
      }

      const noteNorm = normalizeSearchText(tx.note);
      const merchantNorm = normalizeSearchText(tx.merchant || tx.description);
      const catIdNorm = normalizeSearchText(tx.categoryId);
      const catLabelNorm = catNameMap[tx.categoryId] || '';
      const pmLabelNorm = normalizeSearchText(PAYMENT_METHOD_LABELS[tx.paymentMethod] || tx.paymentMethod);
      const formattedAmtNorm = normalizeSearchText(formatCLPAmount(tx.amount));

      const matchesText =
        noteNorm.includes(cleanQuery) ||
        merchantNorm.includes(cleanQuery) ||
        catIdNorm.includes(cleanQuery) ||
        catLabelNorm.includes(cleanQuery) ||
        pmLabelNorm.includes(cleanQuery) ||
        amtStr.includes(cleanQuery) ||
        formattedAmtNorm.includes(cleanQuery);

      if (!matchesText) return false;
    }

    return true;
  });

  return filtered.sort(
    (a, b) =>
      String(b.date || '').localeCompare(String(a.date || '')) ||
      String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
  );
}

/**
 * Calcula los totales en CLP de una lista de transacciones filtradas.
 */
export function calculateFilteredTransactionsTotals(filteredTransactions = []) {
  const list = Array.isArray(filteredTransactions) ? filteredTransactions : [];
  let totalAmount = 0;
  let expenseTotal = 0;
  let incomeTotal = 0;
  let reimbursementTotal = 0;
  let internalTotal = 0;

  for (const tx of list) {
    if (!tx) continue;
    const amt = Math.max(0, Math.round(Number(tx.amount || 0)));
    totalAmount += amt;
    if (tx.type === 'expense') {
      expenseTotal += amt;
    } else if (tx.type === 'income') {
      incomeTotal += amt;
    } else if (tx.type === 'reimbursement') {
      reimbursementTotal += amt;
    } else {
      internalTotal += amt;
    }
  }

  return {
    count: list.length,
    totalAmount,
    netExpenseTotal: Math.max(0, expenseTotal - reimbursementTotal),
    expenseTotal,
    incomeTotal,
    reimbursementTotal,
    internalTotal
  };
}

/**
 * Genera en 0 ms un diagnóstico financiero ejecutivo completo:
 * `healthScore` (0-100), `statusBadge`, `headline`, `dailySafeSpend`,
 * `cmrShieldDiagnosis`, `wifeAccountDiagnosis`, `categoryAlerts`, `top3Actions`.
 *
 * @param {Object} summary - Resumen mensual de `calculateMonthlyFinancialSummary`.
 * @param {Object} [burnRate] - Ritmo de gasto de `calculateBurnRateAndProjection`.
 * @param {Object} [loansLedger] - Libro mayor de `calculateLoansLedger`.
 */
export function generateInstantFamilyDiagnosis(summary = {}, burnRate = null, loansLedger = null) {
  const effectiveBurn = burnRate || calculateBurnRateAndProjection(summary);
  const effectiveLoans = loansLedger || summary?.loansLedger || {
    totalOwedByUs: Number(summary?.totalLoansOwedToOthers || 0),
    totalOwedToUs: Number(summary?.totalLoansReceivable || 0),
    activeContacts: summary?.loansByPerson || []
  };

  const savingsGoal = Number(summary?.savingsGoal ?? 250000);
  const remainingSpendable = Number(summary?.remainingSpendable ?? 0);
  const cmrNetReserve = Number(summary?.cmrNetReserve ?? summary?.cmrPendingReserve ?? 0);
  const cmrCarryoverPrev = Number(summary?.cmrCarryoverPrev ?? 0);
  const cmrSpent = Number(summary?.cmrSpent ?? 0);
  const cmrPaid = Number(summary?.cmrPaid ?? 0);
  const transferredToWife = Number(summary?.transferredToWife ?? 0);
  const spentByWife = Number(summary?.spentByWife ?? summary?.spentFromWifeAccount ?? 0);
  const wifeRemainingBalance = Number(summary?.wifeRemainingBalance ?? summary?.wifeWalletRemaining ?? 0);
  const pendingFixedTotal = Number(summary?.pendingFixedTotal ?? 0);
  const pendingFixedCount = Array.isArray(summary?.pendingFixedExpenses) ? summary.pendingFixedExpenses.length : 0;

  const categories = Array.isArray(summary?.categoryBreakdown) ? summary.categoryBreakdown : [];
  const dangerCats = categories.filter((c) => c.status === 'danger');
  const warnCats = categories.filter((c) => c.status === 'warn');

  // 1. Puntaje de salud financiera (0 a 100)
  let score = 100;
  if (remainingSpendable < 0) {
    score -= 35;
  } else if (effectiveBurn.paceStatus === 'sobregiro_proyectado') {
    score -= 22;
  } else if (effectiveBurn.paceStatus === 'alerta_ritmo') {
    score -= 12;
  }

  score -= Math.min(24, dangerCats.length * 8);
  score -= Math.min(12, warnCats.length * 4);

  if (cmrCarryoverPrev > 0) score -= 5;
  if (wifeRemainingBalance < 0) score -= 5;
  if (Number(summary?.savingsWithdrawnThisMonth || 0) > 0) score -= 10;

  const healthScore = Math.max(0, Math.min(100, Math.round(score)));

  // 2. Badge de estado y titular ejecutivo
  let statusBadge = '🟢 Blindaje Sólido';
  if (healthScore < 60 || remainingSpendable < 0) {
    statusBadge = '🔴 Alerta de Ahorro';
  } else if (healthScore < 80 || effectiveBurn.paceStatus !== 'bajo_control') {
    statusBadge = '🟡 Atención al Ritmo';
  }

  let headline = '';
  if (remainingSpendable < 0) {
    headline = `El gasto del mes excedió el margen disponible por ${formatCLPAmount(Math.abs(remainingSpendable))}, tocando la meta de ahorro de ${formatCLPAmount(savingsGoal)}.`;
  } else if (effectiveBurn.paceStatus === 'sobregiro_proyectado') {
    headline = `Cuidado con la velocidad: proyectan cerrar el mes con un sobregiro de ${formatCLPAmount(Math.abs(effectiveBurn.projectedSurplusOrDeficit))}. Ajusten el gasto diario a ${formatCLPAmount(effectiveBurn.dailySafeSpend)}/día.`;
  } else if (effectiveBurn.paceStatus === 'alerta_ritmo') {
    headline = `Meta de ahorro de ${formatCLPAmount(savingsGoal)} protegida, pero el ritmo va adelantado (+${Math.max(1, effectiveBurn.paceDeltaPct)}% vs calendario). Tope seguro: ${formatCLPAmount(effectiveBurn.dailySafeSpend)}/día.`;
  } else {
    headline = `¡Excelente control familiar! Su ahorro de ${formatCLPAmount(savingsGoal)} está blindado y disponen de ${formatCLPAmount(effectiveBurn.dailySafeSpend)}/día por los próximos ${effectiveBurn.daysRemaining} días.`;
  }

  // 3. Diagnóstico Escudo CMR
  const cmrMessage =
    cmrNetReserve > 0
      ? `Mantener ${formatCLPAmount(cmrNetReserve)} intocables en Banco de Chile para pagar CMR (${formatCLPAmount(cmrSpent)} compras del mes${cmrCarryoverPrev > 0 ? ` + ${formatCLPAmount(cmrCarryoverPrev)} mes anterior` : ''}, pagado ${formatCLPAmount(cmrPaid)}).`
      : `Facturación CMR 100% cubierta ($0 pendiente de reserva en Banco de Chile).`;

  const cmrShieldDiagnosis = {
    status: cmrCarryoverPrev > 0 ? 'carryover_pending' : cmrNetReserve > 0 ? 'reserve_active' : 'paid_clear',
    reserveAmount: cmrNetReserve,
    cmrSpent,
    cmrPaid,
    carryoverPrev: cmrCarryoverPrev,
    message: cmrMessage,
    toString() {
      return this.message;
    }
  };

  // 4. Diagnóstico Cuenta Mujer (Marie)
  const wifeMessage =
    wifeRemainingBalance >= 0
      ? `Marie tiene ${formatCLPAmount(wifeRemainingBalance)} disponibles de fondos transferidos (${formatCLPAmount(transferredToWife)} transferidos este mes vs ${formatCLPAmount(spentByWife)} gastados).`
      : `Marie ha registrado ${formatCLPAmount(Math.abs(wifeRemainingBalance))} por encima de lo transferido; considera hacerle un traspaso interno o cuadrar cartola.`;

  const wifeAccountDiagnosis = {
    status: wifeRemainingBalance >= 0 ? 'positive' : 'needs_topup',
    remainingBalance: wifeRemainingBalance,
    transferredToWife,
    spentByWife,
    message: wifeMessage,
    toString() {
      return this.message;
    }
  };

  // 5. Alertas de categorías (ordenadas de mayor a menor % de uso)
  const categoryAlerts = [...dangerCats, ...warnCats]
    .sort((a, b) => b.usagePct - a.usagePct)
    .map((cat) => {
      const msg =
        cat.remaining < 0
          ? `${cat.icon} ${cat.name} superó su tope por ${formatCLPAmount(Math.abs(cat.remaining))} (${cat.usagePct}%).`
          : `${cat.icon} ${cat.name} va en ${cat.usagePct}% (quedan ${formatCLPAmount(cat.remaining)} para ${effectiveBurn.daysRemaining} días).`;
      const tip =
        cat.remaining < 0
          ? `Congelar compras no urgentes en ${cat.name} esta semana y compensar con categorías en verde.`
          : `Mantener tope de ${formatCLPAmount(Math.max(0, Math.round(cat.remaining / effectiveBurn.daysRemaining)))}/día en ${cat.name}.`;
      return {
        categoryId: cat.id,
        name: cat.name,
        categoryName: `${cat.icon} ${cat.name}`,
        icon: cat.icon,
        spent: cat.netSpent,
        budget: cat.budget,
        remaining: cat.remaining,
        usagePct: cat.usagePct,
        status: cat.status,
        severity: cat.status === 'danger' ? 'CRITICO' : 'ATENCION',
        message: msg,
        actionableTip: tip,
        recommendation: `${msg} ${tip}`
      };
    });

  // 6. Top 3 acciones concretas y priorizadas
  const top3Actions = [];

  if (cmrNetReserve > 0) {
    top3Actions.push(
      `🟢 Escudo CMR: Dejar ${formatCLPAmount(cmrNetReserve)} inmovilizados en Banco de Chile para pagar la facturación CMR al contado sin tocar ahorros.`
    );
  }

  if (categoryAlerts.length > 0) {
    const worst = categoryAlerts[0];
    top3Actions.push(
      `🚦 Freno en ${worst.icon} ${worst.name}: Lleva ${worst.usagePct}% del presupuesto (${formatCLPAmount(worst.spent)} de ${formatCLPAmount(worst.budget)}). Priorizar solo gastos esenciales.`
    );
  }

  if (pendingFixedTotal > 0) {
    top3Actions.push(
      `🏠 Gastos Fijos Pendientes: Reservar ${formatCLPAmount(pendingFixedTotal)} para ${pendingFixedCount} cuenta(s) fija(s) por confirmar este mes (presupuesto diario libre real: ${formatCLPAmount(effectiveBurn.dailySafeSpendAfterFixed)}/día).`
    );
  }

  if (effectiveLoans.totalOwedToUs > 0 && top3Actions.length < 3) {
    top3Actions.push(
      `🤝 Recuperar Cuentas por Cobrar: Tienen ${formatCLPAmount(effectiveLoans.totalOwedToUs)} pendientes de cobro en el Libro de Préstamos / Vaca.`
    );
  }

  if (wifeRemainingBalance < 25000 && top3Actions.length < 3) {
    top3Actions.push(
      `👩🏻 Cuenta Marie: Su saldo disponible es ${formatCLPAmount(wifeRemainingBalance)}. Coordinar si requiere nuevo traspaso interno familiar.`
    );
  }

  while (top3Actions.length < 3) {
    if (top3Actions.length === 0) {
      top3Actions.push(
        `🛡️ Meta Diaria: Mantener el gasto variable bajo ${formatCLPAmount(effectiveBurn.dailySafeSpend)}/día durante los ${effectiveBurn.daysRemaining} días restantes.`
      );
    } else if (top3Actions.length === 1) {
      top3Actions.push(
        `🏦 Ahorro Intocable: Transferir o asegurar los ${formatCLPAmount(savingsGoal)} de meta de ahorro en cuenta separada.`
      );
    } else {
      top3Actions.push(
        `🔍 Conciliación Semanal: Subir cartola de Banco de Chile y CMR el fin de semana para verificar que no existan cargos hormiga olvidados.`
      );
    }
  }

  return {
    healthScore,
    statusBadge,
    headline,
    dailySafeSpend: effectiveBurn.dailySafeSpend,
    dailySafeSpendAfterFixed: effectiveBurn.dailySafeSpendAfterFixed,
    paceStatus: effectiveBurn.paceStatus,
    projectedMonthEndSpend: effectiveBurn.projectedMonthEndSpend,
    projectedSurplusOrDeficit: effectiveBurn.projectedSurplusOrDeficit,
    cmrShieldDiagnosis,
    wifeAccountDiagnosis,
    categoryAlerts,
    top3Actions: top3Actions.slice(0, 3),
    generatedAt: new Date().toISOString()
  };
}
