import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateMonthlyFinancialSummary,
  calculateBurnRateAndProjection,
  calculateLoansLedger,
  filterTransactions,
  calculateFilteredTransactionsTotals,
  generateInstantFamilyDiagnosis,
  resolveCalendarProgress,
  normalizeLoanContactKey,
  extractLoanContactDisplayName,
  formatCLPAmount,
  detectAntExpensesAndSubscriptions,
  calculateMultiMonthComparison,
  clonePreviousMonthBudget,
  buildCoupleWhatsAppMessages
} from '../src/domain/financialEngine.js';

function createBaseTestState(ym = '2026-10') {
  return {
    familyConfig: {
      husbandName: 'Mauricio',
      wifeName: 'Marie',
      monthlyIncomeTarget: 2350000,
      monthlySavingsGoal: 250000
    },
    categories: [
      { id: 'supermercado', name: 'Supermercado y Feria', icon: '🛒', group: 'esencial', defaultBudget: 420000 },
      { id: 'hija', name: 'Hija (Pañales, Leche, Ropa)', icon: '👶', group: 'esencial', defaultBudget: 140000 },
      { id: 'vivienda_fijos', name: 'Vivienda y Cuentas Fijas', icon: '🏠', group: 'fijo', defaultBudget: 850000 },
      { id: 'salud_farmacia', name: 'Salud y Farmacia', icon: '💊', group: 'esencial', defaultBudget: 80000 },
      { id: 'delivery_salidas', name: 'Delivery, Salidas y Cafés', icon: '🍔', group: 'estilo_vida', defaultBudget: 100000 },
      { id: 'gustos_personales', name: 'Gustos y Compras Personales', icon: '🎁', group: 'estilo_vida', defaultBudget: 80000 }
    ],
    monthlyBudgets: {
      [ym]: {
        incomeTarget: 2350000,
        savingsGoal: 250000,
        categories: {
          supermercado: 420000,
          hija: 140000,
          vivienda_fijos: 850000,
          salud_farmacia: 80000,
          delivery_salidas: 100000,
          gustos_personales: 80000
        }
      }
    },
    fixedTemplates: [
      { id: 'fix_arriendo', name: 'Arriendo', categoryId: 'vivienda_fijos', estimatedAmount: 580000, dayOfMonth: 5 },
      { id: 'fix_ggcc', name: 'Gastos Comunes', categoryId: 'vivienda_fijos', estimatedAmount: 95000, dayOfMonth: 10 },
      { id: 'fix_luz', name: 'Luz Enel', categoryId: 'vivienda_fijos', estimatedAmount: 42000, dayOfMonth: 15 }
    ],
    learnedContacts: {},
    transactions: []
  };
}

// ============================================================================
// 1. PRUEBAS DE RESUMEN FINANCIERO MENSUAL (calculateMonthlyFinancialSummary)
// ============================================================================

test('1. calculateMonthlyFinancialSummary usa incomeTarget cuando no hay ingresos reales registrados', () => {
  const state = createBaseTestState('2026-10');
  const summary = calculateMonthlyFinancialSummary(state, '2026-10', '2026-10-10');

  assert.equal(summary.realIncome, 0);
  assert.equal(summary.incomeTarget, 2350000);
  assert.equal(summary.effectiveIncome, 2350000);
  assert.equal(summary.savingsGoal, 250000);
  assert.equal(summary.spendableAfterSavings, 2100000);
  assert.equal(summary.netExpense, 0);
  assert.equal(summary.remainingSpendable, 2100000);
});

test('2. calculateMonthlyFinancialSummary prioriza ingresos reales cuando son mayores a 0', () => {
  const state = createBaseTestState('2026-10');
  state.transactions.push(
    { id: 'tx1', date: '2026-10-01', type: 'income', amount: 2450000, paymentMethod: 'bch_ctacte', author: 'el' },
    { id: 'tx2', date: '2026-10-05', type: 'income', amount: 150000, paymentMethod: 'bch_ctacte', author: 'ella' }
  );

  const summary = calculateMonthlyFinancialSummary(state, '2026-10', '2026-10-10');
  assert.equal(summary.realIncome, 2600000);
  assert.equal(summary.effectiveIncome, 2600000);
  assert.equal(summary.incomeVsTargetDiff, 250000);
  assert.equal(summary.spendableAfterSavings, 2350000);
});

test('3. calculateMonthlyFinancialSummary calcula gasto bruto, reembolsos y gasto neto por categoría', () => {
  const state = createBaseTestState('2026-10');
  state.transactions.push(
    { id: 'e1', date: '2026-10-04', type: 'expense', amount: 80000, categoryId: 'salud_farmacia', paymentMethod: 'cmr_falabella' },
    { id: 'r1', date: '2026-10-06', type: 'reimbursement', amount: 55000, categoryId: 'salud_farmacia', paymentMethod: 'bch_ctacte' },
    { id: 'e2', date: '2026-10-07', type: 'expense', amount: 120000, categoryId: 'supermercado', paymentMethod: 'bch_ctacte' }
  );

  const summary = calculateMonthlyFinancialSummary(state, '2026-10', '2026-10-10');
  assert.equal(summary.grossExpense, 200000);
  assert.equal(summary.totalReimbursements, 55000);
  assert.equal(summary.netExpense, 145000);
  assert.equal(summary.grossSpentByCategory.salud_farmacia, 80000);
  assert.equal(summary.reimbursedByCategory.salud_farmacia, 55000);
  assert.equal(summary.netSpentByCategory.salud_farmacia, 25000);
  assert.equal(summary.netSpentByCategory.supermercado, 120000);
});

test('4. calculateMonthlyFinancialSummary asigna semáforos ok (<75%), warn (75-94%) y danger (>=95%)', () => {
  const state = createBaseTestState('2026-10');
  state.transactions.push(
    // supermercado: 200.000 / 420.000 = 48% -> 'ok'
    { id: 't1', date: '2026-10-03', type: 'expense', amount: 200000, categoryId: 'supermercado', paymentMethod: 'bch_ctacte' },
    // delivery_salidas: 80.000 / 100.000 = 80% -> 'warn'
    { id: 't2', date: '2026-10-05', type: 'expense', amount: 80000, categoryId: 'delivery_salidas', paymentMethod: 'cmr_falabella' },
    // gustos_personales: 78.000 / 80.000 = 98% -> 'danger'
    { id: 't3', date: '2026-10-08', type: 'expense', amount: 78000, categoryId: 'gustos_personales', paymentMethod: 'cmr_falabella' }
  );

  const summary = calculateMonthlyFinancialSummary(state, '2026-10', '2026-10-10');
  assert.equal(summary.categorySemaphores.supermercado, 'ok');
  assert.equal(summary.categorySemaphores.delivery_salidas, 'warn');
  assert.equal(summary.categorySemaphores.gustos_personales, 'danger');
});

test('5. calculateMonthlyFinancialSummary calcula Escudo CMR del mes y con arrastre multi-mes', () => {
  const state = createBaseTestState('2026-10');
  state.transactions.push(
    // Mes anterior (2026-09): compras CMR $150.000, abonado $100.000 -> arrastre $50.000
    { id: 'prev1', date: '2026-09-18', type: 'expense', amount: 150000, categoryId: 'supermercado', paymentMethod: 'cmr_falabella' },
    { id: 'prev2', date: '2026-09-28', type: 'cmr_payment', amount: 100000, paymentMethod: 'bch_ctacte' },
    // Mes actual (2026-10): compras CMR $90.000, pago CMR $40.000
    { id: 'cur1', date: '2026-10-05', type: 'expense', amount: 90000, categoryId: 'hija', paymentMethod: 'cmr_falabella' },
    { id: 'cur2', date: '2026-10-12', type: 'cmr_payment', amount: 40000, paymentMethod: 'bch_ctacte' }
  );

  const summary = calculateMonthlyFinancialSummary(state, '2026-10', '2026-10-15');
  assert.equal(summary.cmrSpent, 90000);
  assert.equal(summary.cmrPaid, 40000);
  assert.equal(summary.cmrCarryoverPrev, 50000);
  assert.equal(summary.cmrNetReserve, 100000); // 50k arrastre + 90k mes - 40k pagado
});

test('6. calculateMonthlyFinancialSummary calcula Cuenta Mujer sin duplicar el traspaso como gasto', () => {
  const state = createBaseTestState('2026-10');
  state.transactions.push(
    { id: 'w1', date: '2026-10-02', type: 'transfer_wife', amount: 250000, paymentMethod: 'bch_ctacte', author: 'el' },
    { id: 'w2', date: '2026-10-06', type: 'expense', amount: 65000, categoryId: 'supermercado', paymentMethod: 'cuenta_mujer', author: 'ella' },
    { id: 'w3', date: '2026-10-09', type: 'expense', amount: 35000, categoryId: 'hija', paymentMethod: 'cuenta_mujer', author: 'ella' }
  );

  const summary = calculateMonthlyFinancialSummary(state, '2026-10', '2026-10-10');
  assert.equal(summary.transferredToWife, 250000);
  assert.equal(summary.spentByWife, 100000);
  assert.equal(summary.wifeRemainingBalance, 150000);
  // El traspaso interno NO se suma al gasto familiar, solo las compras reales de Marie
  assert.equal(summary.netExpense, 100000);
});

test('7. calculateMonthlyFinancialSummary identifica Gastos Fijos pagados y pendientes', () => {
  const state = createBaseTestState('2026-10');
  state.transactions.push({
    id: 'fx1',
    date: '2026-10-05',
    type: 'expense',
    amount: 580000,
    categoryId: 'vivienda_fijos',
    fixedTemplateId: 'fix_arriendo',
    paymentMethod: 'bch_ctacte'
  });

  const summary = calculateMonthlyFinancialSummary(state, '2026-10', '2026-10-10');
  assert.equal(summary.paidFixedExpenses.length, 1);
  assert.equal(summary.pendingFixedExpenses.length, 2);
  assert.equal(summary.paidFixedTotal, 580000);
  assert.equal(summary.pendingFixedTotal, 95000 + 42000);
});

// ============================================================================
// 2. PRUEBAS DE RITMO DE GASTO DIARIO Y PROYECCIÓN (calculateBurnRateAndProjection)
// ============================================================================

test('8. calculateBurnRateAndProjection calcula días transcurridos, restantes y dailySafeSpend correctamente', () => {
  const state = createBaseTestState('2026-10'); // Octubre tiene 31 días
  state.transactions.push({
    id: 'e1',
    date: '2026-10-05',
    type: 'expense',
    amount: 500000,
    categoryId: 'supermercado',
    paymentMethod: 'cmr_falabella'
  });

  const summary = calculateMonthlyFinancialSummary(state, '2026-10', '2026-10-11');
  const burn = calculateBurnRateAndProjection(summary, '2026-10', '2026-10-11');

  assert.equal(burn.daysInMonth, 31);
  assert.equal(burn.daysElapsed, 11);
  assert.equal(burn.daysRemaining, 21); // del 11 al 31 inclusive = 21 días
  assert.equal(burn.dailySafeSpend, Math.round((2100000 - 500000) / 21));
});

test('9. calculateBurnRateAndProjection reporta paceStatus "bajo_control" cuando el gasto es moderado', () => {
  const state = createBaseTestState('2026-11'); // Noviembre tiene 30 días
  state.fixedTemplates = []; // sin fijos pendientes para prueba pura
  state.transactions.push({
    id: 'e1',
    date: '2026-11-10',
    type: 'expense',
    amount: 450000, // 21% del presupuesto en el 50% del mes (día 15)
    categoryId: 'supermercado',
    paymentMethod: 'bch_ctacte'
  });

  const summary = calculateMonthlyFinancialSummary(state, '2026-11', '2026-11-15');
  const burn = calculateBurnRateAndProjection(summary, '2026-11', '2026-11-15');

  assert.equal(burn.paceStatus, 'bajo_control');
  assert.ok(burn.projectedSurplusOrDeficit > 0);
  assert.equal(burn.projectedMonthEndSpend, 900000);
});

test('10. calculateBurnRateAndProjection reporta "alerta_ritmo" cuando el % usado supera al calendario por >8% sin sobregiro final', () => {
  const state = createBaseTestState('2026-11'); // 30 días
  // En día 10 (33% del mes), ya pagaron el arriendo de $580.000 + GGCC $95.000 + Luz $42.000 ($717.000 fijos)
  // y llevan $320.000 de gasto variable -> Total $1.037.000 (49% del presupuesto en el 33% del mes -> +16% delta)
  // Pero la proyección variable ($32.000 * 30 = $960.000) + $717.000 fijos = $1.677.000 <= $2.100.000
  state.transactions.push(
    { id: 'f1', date: '2026-11-02', type: 'expense', amount: 580000, categoryId: 'vivienda_fijos', fixedTemplateId: 'fix_arriendo' },
    { id: 'f2', date: '2026-11-04', type: 'expense', amount: 95000, categoryId: 'vivienda_fijos', fixedTemplateId: 'fix_ggcc' },
    { id: 'f3', date: '2026-11-05', type: 'expense', amount: 42000, categoryId: 'vivienda_fijos', fixedTemplateId: 'fix_luz' },
    { id: 'v1', date: '2026-11-08', type: 'expense', amount: 320000, categoryId: 'supermercado' }
  );

  const summary = calculateMonthlyFinancialSummary(state, '2026-11', '2026-11-10');
  const burn = calculateBurnRateAndProjection(summary, '2026-11', '2026-11-10');

  assert.ok(burn.projectedSurplusOrDeficit > 0);
  assert.ok(burn.paceDeltaPct > 8);
  assert.equal(burn.paceStatus, 'alerta_ritmo');
});

test('11. calculateBurnRateAndProjection reporta "sobregiro_proyectado" cuando el ritmo variable proyecta déficit a fin de mes', () => {
  const state = createBaseTestState('2026-11'); // 30 días
  state.transactions.push({
    id: 'v1',
    date: '2026-11-05',
    type: 'expense',
    amount: 900000, // En 6 días gastaron $900k variable -> $150k/día -> proyecta $4.5M
    categoryId: 'supermercado'
  });

  const summary = calculateMonthlyFinancialSummary(state, '2026-11', '2026-11-06');
  const burn = calculateBurnRateAndProjection(summary, '2026-11', '2026-11-06');

  assert.equal(burn.paceStatus, 'sobregiro_proyectado');
  assert.ok(burn.projectedSurplusOrDeficit < 0);
});

test('12. calculateBurnRateAndProjection reporta "sobregiro_proyectado" y dailySafeSpend = 0 cuando ya se excedió el presupuesto', () => {
  const state = createBaseTestState('2026-11');
  state.transactions.push({
    id: 'v1',
    date: '2026-11-12',
    type: 'expense',
    amount: 2250000, // Supera los $2.100.000 disponibles
    categoryId: 'vivienda_fijos'
  });

  const summary = calculateMonthlyFinancialSummary(state, '2026-11', '2026-11-15');
  const burn = calculateBurnRateAndProjection(summary, '2026-11', '2026-11-15');

  assert.equal(burn.dailySafeSpend, 0);
  assert.equal(burn.paceStatus, 'sobregiro_proyectado');
});

// ============================================================================
// 3. PRUEBAS DE LIBRO MAYOR DE PRÉSTAMOS (calculateLoansLedger)
// ============================================================================

test('13. calculateLoansLedger agrupa préstamos recibidos y abonos parciales por contacto (Juanito)', () => {
  const txs = [
    { id: 'l1', date: '2026-10-02', type: 'loan_received', amount: 80000, note: 'Juanito — préstamo emergencia' },
    { id: 'l2', date: '2026-10-10', type: 'loan_repaid', amount: 30000, note: 'Juanito — abono parcial' }
  ];

  const ledger = calculateLoansLedger(txs);
  assert.equal(ledger.totalOwedByUs, 50000);
  assert.equal(ledger.totalOwedToUs, 0);
  assert.equal(ledger.activeContacts.length, 1);
  assert.equal(ledger.activeContacts[0].name, 'Juanito');
  assert.equal(ledger.activeContacts[0].owedByUs, 50000);
  assert.equal(ledger.activeContacts[0].status, 'we_owe');
});

test('14. calculateLoansLedger agrupa préstamos otorgados / cuentas compartidas y cobros (Pedro Soto)', () => {
  const txs = [
    { id: 'g1', date: '2026-10-04', type: 'loan_given', amount: 45000, note: 'Pedro Soto — Asado compartido (Por cobrar)' },
    { id: 'g2', date: '2026-10-09', type: 'loan_collected', amount: 15000, note: 'TRASPASO DE: PEDRO SOTO' }
  ];

  const ledger = calculateLoansLedger(txs);
  assert.equal(ledger.totalOwedToUs, 30000);
  assert.equal(ledger.activeContacts.length, 1);
  assert.equal(ledger.activeContacts[0].name, 'Pedro Soto');
  assert.equal(ledger.activeContacts[0].owedToUs, 30000);
  assert.equal(ledger.activeContacts[0].status, 'they_owe');
});

test('15. calculateLoansLedger mueve un contacto a settledContacts cuando salda el 100% de la deuda', () => {
  const txs = [
    { id: 's1', date: '2026-10-01', type: 'loan_received', amount: 50000, note: 'Juanito — préstamo' },
    { id: 's2', date: '2026-10-15', type: 'loan_repaid', amount: 50000, note: 'Juanito — Saldado con 1 clic' }
  ];

  const ledger = calculateLoansLedger(txs);
  assert.equal(ledger.totalOwedByUs, 0);
  assert.equal(ledger.activeContacts.length, 0);
  assert.equal(ledger.settledContacts.length, 1);
  assert.equal(ledger.settledContacts[0].status, 'settled');
});

test('16. calculateLoansLedger es determinista sin importar el orden del arreglo de entrada', () => {
  const txA = { id: '1', date: '2026-10-01', type: 'loan_given', amount: 60000, note: 'Camila — entrada concierto' };
  const txB = { id: '2', date: '2026-10-05', type: 'loan_collected', amount: 25000, note: 'Camila — pago parcial' };

  const ledgerForward = calculateLoansLedger([txA, txB]);
  const ledgerReverse = calculateLoansLedger([txB, txA]);

  assert.equal(ledgerForward.totalOwedToUs, 35000);
  assert.equal(ledgerReverse.totalOwedToUs, 35000);
  assert.equal(ledgerForward.activeContacts[0].lastDate, '2026-10-05');
  assert.equal(ledgerReverse.activeContacts[0].lastDate, '2026-10-05');
});

// ============================================================================
// 4. PRUEBAS DE BUSCADOR Y FILTROS INSTANTÁNEOS (filterTransactions)
// ============================================================================

const SAMPLE_FILTER_TXS = [
  {
    id: 'tx_1',
    date: '2026-10-05',
    type: 'expense',
    amount: 48500,
    categoryId: 'supermercado',
    paymentMethod: 'cmr_falabella',
    author: 'el',
    note: 'Compra Hiper Líder verduras y pollo',
    reconciled: true
  },
  {
    id: 'tx_2',
    date: '2026-10-12',
    type: 'expense',
    amount: 24990,
    categoryId: 'hija',
    paymentMethod: 'cuenta_mujer',
    author: 'ella',
    note: 'Pañales Pampers XXG en Cruz Verde',
    reconciled: false,
    splitGroupId: 'split_100',
    splitTotalAmount: 54990
  },
  {
    id: 'tx_3',
    date: '2026-10-15',
    type: 'expense',
    amount: 95000,
    categoryId: 'vivienda_fijos',
    paymentMethod: 'bch_ctacte',
    author: 'el',
    note: 'Gastos Comunes edificio',
    reconciled: true
  },
  {
    id: 'tx_4',
    date: '2026-10-18',
    type: 'expense',
    amount: 18400,
    categoryId: 'delivery_salidas',
    paymentMethod: 'bch_vista',
    author: 'ella',
    note: 'PedidosYa Sushi viernes',
    reconciled: false
  },
  {
    id: 'tx_5',
    date: '2026-09-28',
    type: 'expense',
    amount: 32000,
    categoryId: 'supermercado',
    paymentMethod: 'cmr_falabella',
    author: 'el',
    note: 'Compra mes anterior',
    reconciled: true
  }
];

test('17. filterTransactions filtra por yearMonth correctamente', () => {
  const octTxs = filterTransactions(SAMPLE_FILTER_TXS, { yearMonth: '2026-10' });
  assert.equal(octTxs.length, 4);
  assert.ok(octTxs.every((t) => t.date.startsWith('2026-10')));
});

test('18. filterTransactions busca por texto ignorando tildes y mayúsculas (ej. "lider", "panales")', () => {
  const resLider = filterTransactions(SAMPLE_FILTER_TXS, { yearMonth: '2026-10', searchQuery: 'lider' });
  assert.equal(resLider.length, 1);
  assert.equal(resLider[0].id, 'tx_1');

  const resPanales = filterTransactions(SAMPLE_FILTER_TXS, { yearMonth: '2026-10', searchQuery: 'PANALES' });
  assert.equal(resPanales.length, 1);
  assert.equal(resPanales[0].id, 'tx_2');
});

test('19. filterTransactions busca por monto numérico directo o con formato CLP ("48.500" o "48500")', () => {
  const byFormatted = filterTransactions(SAMPLE_FILTER_TXS, { yearMonth: '2026-10', searchQuery: '$48.500' });
  assert.equal(byFormatted.length, 1);
  assert.equal(byFormatted[0].id, 'tx_1');

  const byRawDigits = filterTransactions(SAMPLE_FILTER_TXS, { yearMonth: '2026-10', searchQuery: '24990' });
  assert.equal(byRawDigits.length, 1);
  assert.equal(byRawDigits[0].id, 'tx_2');
});

test('20. filterTransactions filtra por medio de pago individual y agrupación Banco de Chile ("bch_all")', () => {
  const cmrOnly = filterTransactions(SAMPLE_FILTER_TXS, { yearMonth: '2026-10', paymentMethod: 'cmr_falabella' });
  assert.equal(cmrOnly.length, 1);
  assert.equal(cmrOnly[0].id, 'tx_1');

  const bchAll = filterTransactions(SAMPLE_FILTER_TXS, { yearMonth: '2026-10', paymentMethod: 'bch_all' });
  assert.equal(bchAll.length, 2); // bch_ctacte + bch_vista
  assert.deepEqual(bchAll.map((t) => t.id).sort(), ['tx_3', 'tx_4']);
});

test('21. filterTransactions filtra por autor ("el" vs "ella") y estado de conciliación ("pending" vs "reconciled")', () => {
  const mariePending = filterTransactions(SAMPLE_FILTER_TXS, {
    yearMonth: '2026-10',
    author: 'ella',
    reconciledStatus: 'pending'
  });
  assert.equal(mariePending.length, 2);
  assert.deepEqual(mariePending.map((t) => t.id).sort(), ['tx_2', 'tx_4']);

  const mauricioReconciled = filterTransactions(SAMPLE_FILTER_TXS, {
    yearMonth: '2026-10',
    author: 'el',
    reconciledStatus: 'reconciled'
  });
  assert.equal(mauricioReconciled.length, 2);
  assert.deepEqual(mauricioReconciled.map((t) => t.id).sort(), ['tx_1', 'tx_3']);
});

test('22. calculateFilteredTransactionsTotals suma correctamente los montos filtrados', () => {
  const octTxs = filterTransactions(SAMPLE_FILTER_TXS, { yearMonth: '2026-10' });
  const totals = calculateFilteredTransactionsTotals(octTxs);
  assert.equal(totals.count, 4);
  assert.equal(totals.expenseTotal, 48500 + 24990 + 95000 + 18400);
  assert.equal(totals.netExpenseTotal, 186890);
});

// ============================================================================
// 5. PRUEBAS DE DIAGNÓSTICO EJECUTIVO INSTANTÁNEO (generateInstantFamilyDiagnosis)
// ============================================================================

test('23. generateInstantFamilyDiagnosis entrega healthScore alto (>=85) y 3 acciones cuando todo está bajo control', () => {
  const state = createBaseTestState('2026-10');
  state.fixedTemplates = [];
  state.transactions.push(
    { id: 'i1', date: '2026-10-01', type: 'income', amount: 2350000, paymentMethod: 'bch_ctacte' },
    { id: 'e1', date: '2026-10-10', type: 'expense', amount: 300000, categoryId: 'supermercado', paymentMethod: 'cmr_falabella' },
    { id: 'w1', date: '2026-10-05', type: 'transfer_wife', amount: 200000, paymentMethod: 'bch_ctacte' },
    { id: 'w2', date: '2026-10-12', type: 'expense', amount: 50000, categoryId: 'hija', paymentMethod: 'cuenta_mujer' }
  );

  const summary = calculateMonthlyFinancialSummary(state, '2026-10', '2026-10-15');
  const burn = calculateBurnRateAndProjection(summary, '2026-10', '2026-10-15');
  const diag = generateInstantFamilyDiagnosis(summary, burn, summary.loansLedger);

  assert.ok(diag.healthScore >= 85);
  assert.equal(diag.statusBadge, '🟢 Blindaje Sólido');
  assert.ok(diag.headline.includes('$250.000'));
  assert.equal(diag.cmrShieldDiagnosis.reserveAmount, 300000);
  assert.equal(diag.wifeAccountDiagnosis.remainingBalance, 150000);
  assert.equal(diag.categoryAlerts.length, 0);
  assert.equal(diag.top3Actions.length, 3);
});

test('24. generateInstantFamilyDiagnosis detecta categoryAlerts y reduce healthScore cuando hay categorías críticas', () => {
  const state = createBaseTestState('2026-10');
  state.transactions.push(
    // Delivery al 110% (excedido)
    { id: 'd1', date: '2026-10-08', type: 'expense', amount: 110000, categoryId: 'delivery_salidas', paymentMethod: 'cmr_falabella' },
    // Gustos al 85% (warn)
    { id: 'g1', date: '2026-10-09', type: 'expense', amount: 68000, categoryId: 'gustos_personales', paymentMethod: 'cmr_falabella' }
  );

  const summary = calculateMonthlyFinancialSummary(state, '2026-10', '2026-10-10');
  const diag = generateInstantFamilyDiagnosis(summary);

  assert.equal(diag.categoryAlerts.length, 2);
  assert.equal(diag.categoryAlerts[0].categoryId, 'delivery_salidas');
  assert.equal(diag.categoryAlerts[0].status, 'danger');
  assert.equal(diag.categoryAlerts[1].categoryId, 'gustos_personales');
  assert.equal(diag.categoryAlerts[1].status, 'warn');
  assert.ok(diag.healthScore < 95);
  assert.ok(diag.top3Actions.some((a) => a.includes('Delivery')));
});

test('25. generateInstantFamilyDiagnosis emite "🔴 Alerta de Ahorro" cuando remainingSpendable es negativo', () => {
  const state = createBaseTestState('2026-10');
  state.transactions.push({
    id: 'big1',
    date: '2026-10-20',
    type: 'expense',
    amount: 2200000, // Gasto mayor a $2.100.000 disponibles
    categoryId: 'vivienda_fijos',
    paymentMethod: 'bch_ctacte'
  });

  const summary = calculateMonthlyFinancialSummary(state, '2026-10', '2026-10-20');
  const diag = generateInstantFamilyDiagnosis(summary);

  assert.equal(diag.statusBadge, '🔴 Alerta de Ahorro');
  assert.ok(diag.healthScore <= 60);
  assert.equal(diag.dailySafeSpend, 0);
});

test('26. Utilitarios de calendario, contactos y formato CLP operan con precisión en casos borde', () => {
  const febLeap = resolveCalendarProgress('2028-02', '2028-02-15');
  assert.equal(febLeap.daysInMonth, 29);
  assert.equal(febLeap.currentDay, 15);
  assert.equal(febLeap.daysRemaining, 15);

  assert.equal(normalizeLoanContactKey('TRASPASO DE: Juanito Pérez (Conciliado)'), 'juanito perez');
  assert.equal(extractLoanContactDisplayName('TEF A: MARÍA JOSÉ SOTO — Regalo'), 'María José Soto');
  assert.equal(formatCLPAmount(1250000), '$1.250.000');
  assert.equal(formatCLPAmount(-45000), '-$45.000');
});

// ============================================================================
// 6. PRUEBAS DE GASTOS HORMIGA Y SUSCRIPCIONES (detectAntExpensesAndSubscriptions)
// ============================================================================

test('27. detectAntExpensesAndSubscriptions identifica gastos hormiga (<= $15.000), proyección anual y topMerchants', () => {
  const txs = [
    { id: 'a1', date: '2026-10-03', type: 'expense', amount: 4800, categoryId: 'delivery_salidas', note: 'Starbucks Latte' },
    { id: 'a2', date: '2026-10-07', type: 'expense', amount: 5200, categoryId: 'delivery_salidas', note: 'Starbucks Croissant' },
    { id: 'a3', date: '2026-10-10', type: 'expense', amount: 6500, categoryId: 'transporte', note: 'Uber viaje oficina' },
    { id: 'a4', date: '2026-10-12', type: 'expense', amount: 3500, categoryId: 'gustos_personales', note: 'Oxxo bebida y snack' },
    // Gasto grande de supermercado (NO es gasto hormiga)
    { id: 'big1', date: '2026-10-15', type: 'expense', amount: 80000, categoryId: 'supermercado', note: 'Líder compra mensual' }
  ];

  const report = detectAntExpensesAndSubscriptions(txs, '2026-10');
  assert.equal(report.antExpenses.count, 4);
  assert.equal(report.antExpenses.totalAmount, 20000);
  assert.equal(report.antExpenses.annualizedProjection, 240000);
  assert.equal(report.antExpenses.percentOfTotalSpend, 20); // 20.000 de 100.000 total
  assert.equal(report.antExpenses.topMerchants[0].name, 'Starbucks');
  assert.equal(report.antExpenses.topMerchants[0].count, 2);
  assert.equal(report.antExpenses.topMerchants[0].totalAmount, 10000);
});

test('28. detectAntExpensesAndSubscriptions detecta micro-compras repetidas (<= $12.000) en un mismo comercio', () => {
  const txs = [
    { id: 'm1', date: '2026-10-04', type: 'expense', amount: 7500, categoryId: 'hogar_varios', note: 'Ferretería El Martillo' },
    { id: 'm2', date: '2026-10-18', type: 'expense', amount: 8500, categoryId: 'hogar_varios', note: 'Ferretería El Martillo' },
    { id: 'm3', date: '2026-10-20', type: 'expense', amount: 9000, categoryId: 'hogar_varios', note: 'Compra única Bazar' }
  ];

  const report = detectAntExpensesAndSubscriptions(txs, '2026-10');
  assert.equal(report.antExpenses.count, 2);
  assert.equal(report.antExpenses.totalAmount, 16000);
  assert.equal(report.antExpenses.topMerchants.length, 1);
  assert.equal(report.antExpenses.topMerchants[0].count, 2);
});

test('29. detectAntExpensesAndSubscriptions detecta suscripciones digitales y calcula proyección anual sin mezclarlas con hormiga', () => {
  const txs = [
    { id: 's1', date: '2026-10-02', type: 'expense', amount: 10990, categoryId: 'gustos_personales', note: 'Netflix.com' },
    { id: 's2', date: '2026-10-05', type: 'expense', amount: 6550, categoryId: 'gustos_personales', note: 'Spotify Duo' },
    { id: 's3', date: '2026-10-09', type: 'expense', amount: 3490, categoryId: 'vivienda_fijos', note: 'APPLE.COM/BILL iCloud' },
    { id: 's4', date: '2026-10-12', type: 'expense', amount: 18900, categoryId: 'gustos_personales', note: 'OpenAI ChatGPT Plus' }
  ];

  const report = detectAntExpensesAndSubscriptions(txs, '2026-10');
  assert.equal(report.subscriptions.items.length, 4);
  assert.equal(report.subscriptions.totalMonthlySubscriptions, 39930);
  assert.equal(report.subscriptions.annualizedSubscriptions, 39930 * 12);
  assert.equal(report.subscriptions.duplicateAlerts.length, 0);
  // Ninguna suscripción debe contaminar la bolsa de gastos hormiga
  assert.equal(report.antExpenses.count, 0);
});

test('30. detectAntExpensesAndSubscriptions alerta posibles cobros duplicados de suscripciones en el mismo mes', () => {
  const txs = [
    { id: 'd1', date: '2026-10-03', type: 'expense', amount: 10990, categoryId: 'gustos_personales', note: 'Cargo Netflix.com' },
    { id: 'd2', date: '2026-10-19', type: 'expense', amount: 10990, categoryId: 'gustos_personales', note: 'NETFLIX tarjeta CMR' },
    { id: 'd3', date: '2026-10-08', type: 'expense', amount: 7500, categoryId: 'gustos_personales', note: 'Disney Plus' }
  ];

  const report = detectAntExpensesAndSubscriptions(txs, '2026-10');
  assert.equal(report.subscriptions.duplicateAlerts.length, 1);
  assert.equal(report.subscriptions.duplicateAlerts[0].name, 'Netflix');
  assert.equal(report.subscriptions.duplicateAlerts[0].count, 2);
  assert.equal(report.subscriptions.duplicateAlerts[0].totalAmount, 21980);
});

test('31. detectAntExpensesAndSubscriptions filtra estrictamente por activeYearMonth y maneja listas vacías', () => {
  const txs = [
    { id: 'sep1', date: '2026-09-15', type: 'expense', amount: 4500, categoryId: 'delivery_salidas', note: 'Starbucks' },
    { id: 'oct1', date: '2026-10-15', type: 'expense', amount: 3900, categoryId: 'delivery_salidas', note: 'Starbucks' }
  ];

  const octReport = detectAntExpensesAndSubscriptions(txs, '2026-10');
  assert.equal(octReport.antExpenses.count, 1);
  assert.equal(octReport.antExpenses.totalAmount, 3900);

  const emptyReport = detectAntExpensesAndSubscriptions([], '2026-10');
  assert.equal(emptyReport.antExpenses.count, 0);
  assert.equal(emptyReport.antExpenses.percentOfTotalSpend, 0);
  assert.equal(emptyReport.subscriptions.totalMonthlySubscriptions, 0);
});

// ============================================================================
// 7. PRUEBAS DE COMPARATIVA MULTI-MES (calculateMultiMonthComparison)
// ============================================================================

test('32. calculateMultiMonthComparison calcula deltas vs mes anterior y serie histórica de 6 meses', () => {
  const state = createBaseTestState('2026-10');
  state.transactions.push(
    // Septiembre 2026: gasto neto $1.000.000 (CMR $400.000)
    { id: 'sep_i', date: '2026-09-01', type: 'income', amount: 2350000, paymentMethod: 'bch_ctacte' },
    { id: 'sep_e1', date: '2026-09-05', type: 'expense', amount: 600000, categoryId: 'vivienda_fijos', paymentMethod: 'bch_ctacte' },
    { id: 'sep_e2', date: '2026-09-12', type: 'expense', amount: 400000, categoryId: 'supermercado', paymentMethod: 'cmr_falabella' },
    // Octubre 2026: gasto neto $1.250.000 (CMR $500.000) -> +$250.000 (+25%)
    { id: 'oct_i', date: '2026-10-01', type: 'income', amount: 2350000, paymentMethod: 'bch_ctacte' },
    { id: 'oct_e1', date: '2026-10-05', type: 'expense', amount: 750000, categoryId: 'vivienda_fijos', paymentMethod: 'bch_ctacte' },
    { id: 'oct_e2', date: '2026-10-14', type: 'expense', amount: 500000, categoryId: 'supermercado', paymentMethod: 'cmr_falabella' }
  );

  const comp = calculateMultiMonthComparison(state, '2026-10', 6);
  assert.equal(comp.currentMonth.yearMonth, '2026-10');
  assert.equal(comp.currentMonth.netExpense, 1250000);
  assert.equal(comp.currentMonth.savingsAchieved, 1100000);
  assert.equal(comp.previousMonth.yearMonth, '2026-09');
  assert.equal(comp.previousMonth.netExpense, 1000000);
  assert.equal(comp.previousMonth.hasData, true);
  assert.equal(comp.deltaExpense, 250000);
  assert.equal(comp.deltaExpensePct, 25);
  assert.equal(comp.historySeries.length, 6);
  assert.equal(comp.historySeries[0].yearMonth, '2026-05');
  assert.equal(comp.historySeries[5].yearMonth, '2026-10');
});

test('33. calculateMultiMonthComparison ordena categoryDeltas por mayor incremento de gasto', () => {
  const state = createBaseTestState('2026-10');
  state.transactions.push(
    { id: 's1', date: '2026-09-10', type: 'expense', amount: 200000, categoryId: 'supermercado' },
    { id: 's2', date: '2026-09-12', type: 'expense', amount: 50000, categoryId: 'delivery_salidas' },
    // En octubre supermercado sube +$40.000 y delivery sube +$70.000
    { id: 'o1', date: '2026-10-10', type: 'expense', amount: 240000, categoryId: 'supermercado' },
    { id: 'o2', date: '2026-10-12', type: 'expense', amount: 120000, categoryId: 'delivery_salidas' }
  );

  const comp = calculateMultiMonthComparison(state, '2026-10', 6);
  assert.equal(comp.categoryDeltas[0].categoryId, 'delivery_salidas');
  assert.equal(comp.categoryDeltas[0].deltaAmount, 70000);
  assert.equal(comp.categoryDeltas[0].deltaPct, 140);
  assert.equal(comp.categoryDeltas[1].categoryId, 'supermercado');
  assert.equal(comp.categoryDeltas[1].deltaAmount, 40000);
});

test('34. calculateMultiMonthComparison maneja cruces de año (enero -> diciembre previo) y previousMonth sin datos', () => {
  const state = createBaseTestState('2026-01');
  state.transactions.push({
    id: 'jan1',
    date: '2026-01-10',
    type: 'expense',
    amount: 300000,
    categoryId: 'supermercado'
  });

  const comp = calculateMultiMonthComparison(state, '2026-01', 4);
  assert.equal(comp.previousMonth.yearMonth, '2025-12');
  assert.equal(comp.previousMonth.hasData, false);
  assert.equal(comp.previousMonth.netExpense, 0);
  assert.equal(comp.deltaExpense, 300000);
  assert.deepEqual(
    comp.historySeries.map((h) => h.yearMonth),
    ['2025-10', '2025-11', '2025-12', '2026-01']
  );
});

// ============================================================================
// 8. PRUEBAS DE CLONACIÓN DE PRESUPUESTO (clonePreviousMonthBudget)
// ============================================================================

test('35. clonePreviousMonthBudget copia el presupuesto del mes anterior inmediato y registra updatedAt', () => {
  const state = createBaseTestState('2026-10');
  state.monthlyBudgets['2026-10'].incomeTarget = 2500000;
  state.monthlyBudgets['2026-10'].savingsGoal = 350000;
  state.monthlyBudgets['2026-10'].categories.supermercado = 460000;

  const result = clonePreviousMonthBudget(state, '2026-11');
  assert.equal(result.clonedFrom, '2026-10');
  assert.equal(result.budgetConfig.incomeTarget, 2500000);
  assert.equal(result.budgetConfig.savingsGoal, 350000);
  assert.equal(result.budgetConfig.categories.supermercado, 460000);
  assert.ok(Boolean(result.budgetConfig.updatedAt));
  assert.deepEqual(state.monthlyBudgets['2026-11'], result.budgetConfig);
});

test('36. clonePreviousMonthBudget busca el mes configurado más reciente o usa DEFAULT_CATEGORIES si no hay previos', () => {
  const state = createBaseTestState('2026-08');
  state.monthlyBudgets['2026-08'].savingsGoal = 310000;

  // Salto de 2026-08 a 2026-11 (sin 09 ni 10)
  const fromAug = clonePreviousMonthBudget(state, '2026-11');
  assert.equal(fromAug.clonedFrom, '2026-08');
  assert.equal(fromAug.budgetConfig.savingsGoal, 310000);

  // Mes anterior a cualquier presupuesto existente (2026-05) -> usa DEFAULT_CATEGORIES
  const fromDefault = clonePreviousMonthBudget(state, '2026-05');
  assert.equal(fromDefault.clonedFrom, 'DEFAULT_CATEGORIES');
  assert.equal(fromDefault.budgetConfig.incomeTarget, 2350000);
  assert.equal(fromDefault.budgetConfig.categories.supermercado, 420000);
});

// ============================================================================
// 9. PRUEBAS DE MENSAJES DE EQUIPO EN PAREJA Y TONO CÁLIDO (WhatsApp & Diagnosis)
// ============================================================================

test('37. buildCoupleWhatsAppMessages genera los 3 mensajes empáticos de equipo y sus URLs wa.me para iPhone', () => {
  const state = createBaseTestState('2026-10');
  state.transactions.push(
    { id: 't1', date: '2026-10-02', type: 'transfer_wife', amount: 200000, paymentMethod: 'bch_ctacte' },
    { id: 't2', date: '2026-10-08', type: 'expense', amount: 185000, categoryId: 'supermercado', paymentMethod: 'cuenta_mujer' },
    { id: 't3', date: '2026-10-10', type: 'expense', amount: 150000, categoryId: 'hija', paymentMethod: 'cmr_falabella' }
  );

  const summary = calculateMonthlyFinancialSummary(state, '2026-10', '2026-10-12');
  const wa = buildCoupleWhatsAppMessages(summary, state, '2026-10');

  // 1. Solicitud de recarga de Marie a Mauricio ($15.000 disponibles)
  assert.ok(wa.lowWifeWalletRequest.text.includes('Amor ❤️ me van quedando $15.000 en el Fondo Familiar de mi cuenta'));
  assert.ok(wa.lowWifeWalletRequest.url.startsWith('https://wa.me/?text='));

  // 2. Confirmación de transferencia de Mauricio a Marie
  assert.ok(wa.transferConfirmationToMarie.text.includes('Amor ❤️ te acabo de transferir al Fondo Familiar'));
  assert.ok(wa.transferConfirmationToMarie.text.includes('tienes $15.000 disponibles en tu cuenta'));
  assert.ok(wa.transferConfirmationToMarie.url.startsWith('https://wa.me/?text='));

  // 3. Resumen Ejecutivo Semanal de Equipo
  assert.ok(wa.weeklyTeamSummary.text.includes('🛡️ Resumen Familiar (2026-10):'));
  assert.ok(wa.weeklyTeamSummary.text.includes('• Ahorro del mes: $250.000 protegido'));
  assert.ok(wa.weeklyTeamSummary.text.includes('• Reserva Escudo CMR: $150.000'));
  assert.ok(wa.weeklyTeamSummary.text.includes('• Fondo Familiar Marie: $15.000 disponible'));
  assert.ok(wa.weeklyTeamSummary.text.includes('¡Vamos súper bien equipo! ❤️'));
  assert.ok(wa.weeklyTeamSummary.url.startsWith('https://wa.me/?text='));
});

test('38. generateInstantFamilyDiagnosis utiliza lenguaje cálido ("Fondo Familiar en Cuenta de Marie") sin términos fiscalizadores', () => {
  const state = createBaseTestState('2026-10');
  state.transactions.push(
    { id: 'w1', date: '2026-10-02', type: 'transfer_wife', amount: 180000, paymentMethod: 'bch_ctacte' },
    { id: 'w2', date: '2026-10-06', type: 'expense', amount: 80000, categoryId: 'supermercado', paymentMethod: 'cuenta_mujer' }
  );

  const summary = calculateMonthlyFinancialSummary(state, '2026-10', '2026-10-10');
  const diag = generateInstantFamilyDiagnosis(summary);

  assert.ok(diag.wifeAccountDiagnosis.message.includes('Fondo Familiar en Cuenta de Marie'));
  assert.ok(!diag.wifeAccountDiagnosis.message.toLowerCase().includes('por rendir'));
});
