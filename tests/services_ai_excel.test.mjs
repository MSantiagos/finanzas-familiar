import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getDemoScannedReceipt,
  reconcileReceiptSplits,
  getLocalSmartFamilyAudit,
  FAMILY_AUDIT_SCHEMA,
  RECEIPT_JSON_SCHEMA,
  scanReceiptWithGemini,
  classifyStatementRowsWithGemini,
  generateMonthlyFamilyAuditWithGemini
} from '../src/services/geminiScanner.js';

import {
  buildExcelWorkbookData,
  exportStateToExcel,
  extractLoanContactName,
  TX_TYPE_LABELS
} from '../src/services/excelExport.js';

import { DEFAULT_CATEGORIES, DEFAULT_FIXED_TEMPLATE } from '../src/data/defaults.js';

test('getDemoScannedReceipt devuelve boleta cuyos splits suman exactamente totalAmount', () => {
  const demo = getDemoScannedReceipt('2026-10-25');
  assert.equal(demo.merchant, 'Supermercado Jumbo');
  assert.equal(demo.date, '2026-10-25');
  assert.equal(demo.totalAmount, 89400);
  assert.equal(demo.splitDifferenceAdjusted, 0);
  assert.equal(Array.isArray(demo.splits), true);
  assert.equal(demo.splits.length, 3);

  const sumSplits = demo.splits.reduce((acc, s) => acc + s.amount, 0);
  assert.equal(sumSplits, demo.totalAmount);
});

test('reconcileReceiptSplits ajusta automáticamente diferencias de pesos entre splits y totalAmount', () => {
  const mismatched = {
    merchant: 'Hiper Lider',
    date: '2026-10-26',
    totalAmount: 50000,
    splits: [
      { categoryId: 'supermercado', amount: 35000, summary: 'Abarrotes' },
      { categoryId: 'hija', amount: 14990, summary: 'Toallitas húmedas' }
    ]
  };

  const fixed = reconcileReceiptSplits(mismatched);
  assert.equal(fixed.totalAmount, 50000);
  assert.equal(fixed.splitDifferenceAdjusted, 10);
  const sum = fixed.splits.reduce((acc, s) => acc + s.amount, 0);
  assert.equal(sum, 50000);
  assert.equal(fixed.splits[0].amount, 35010);
});

test('Funciones con Gemini 3.8 Flash validan presencia de API Key antes de invocar red', async () => {
  assert.equal(typeof FAMILY_AUDIT_SCHEMA, 'object');
  assert.equal(typeof RECEIPT_JSON_SCHEMA, 'object');

  await assert.rejects(
    () => scanReceiptWithGemini({}, ''),
    /Ingresa tu clave gratuita de Gemini API/
  );
  await assert.rejects(
    () => classifyStatementRowsWithGemini([], '   '),
    /Primero guarda tu Gemini API Key/
  );
  await assert.rejects(
    () => generateMonthlyFamilyAuditWithGemini({ activeYearMonth: '2026-10' }, ''),
    /Ingresa tu clave gratuita de Gemini API/
  );
});

test('getLocalSmartFamilyAudit — Escenario 1: Mes saludable con ahorro blindado y Escudo CMR cubierto', () => {
  const audit = getLocalSmartFamilyAudit({
    activeYearMonth: '2026-10',
    income: 2400000,
    savingsGoal: 300000,
    totalExpenses: 1150000,
    availableReal: 950000,
    cmrSpent: 320000,
    cmrPaid: 120000,
    cmrReserveNeeded: 200000,
    wifeTransferred: 250000,
    wifeSpent: 190000,
    wifeBalance: 60000,
    daysRemaining: 10,
    categoriesBreakdown: [
      { id: 'supermercado', name: 'Supermercado y Feria', budget: 420000, spent: 210000 },
      { id: 'hija', name: 'Hija (Pañales, Leche, Ropa)', budget: 140000, spent: 70000 },
      { id: 'delivery_salidas', name: 'Delivery, Salidas y Cafés', budget: 100000, spent: 40000 }
    ],
    pendingLoansSummary: { owedByUs: 0, owedToUs: 0, people: [] },
    unpaidFixedCount: 0
  });

  assert.equal(audit.healthScore >= 85, true);
  assert.equal(audit.statusBadge, 'EXCELENTE');
  assert.equal(audit.dailySafeSpend, 95000);
  assert.match(audit.headline, /Mauricio y Marie/);
  assert.match(audit.cmrShieldDiagnosis, /200\.000/);
  assert.match(audit.wifeAccountDiagnosis, /60\.000/);
  assert.equal(Array.isArray(audit.categoryAlerts), true);
  assert.equal(audit.top3Actions.length, 3);
});

test('getLocalSmartFamilyAudit — Escenario 2: Sobregiro en Supermercado y Delivery + Alerta Escudo CMR sin cubrir + Préstamos', () => {
  const audit = getLocalSmartFamilyAudit({
    activeYearMonth: '2026-10',
    income: 2350000,
    savingsGoal: 250000,
    totalExpenses: 2220000,
    availableReal: -120000,
    cmrSpent: 650000,
    cmrPaid: 100000,
    cmrReserveNeeded: 550000,
    wifeTransferred: 200000,
    wifeSpent: 230000,
    wifeBalance: -30000,
    daysRemaining: 6,
    categoriesBreakdown: [
      { id: 'supermercado', name: 'Supermercado y Feria', budget: 420000, spent: 510000 },
      { id: 'delivery_salidas', name: 'Delivery, Salidas y Cafés', budget: 100000, spent: 165000 },
      { id: 'hija', name: 'Hija (Pañales, Leche, Ropa)', budget: 140000, spent: 120000 }
    ],
    pendingLoansSummary: {
      owedByUs: 80000,
      owedToUs: 45000,
      people: [
        { name: 'Juanito', owedByUs: 80000, owedToUs: 0 },
        { name: 'Pedro Soto', owedByUs: 0, owedToUs: 45000 }
      ]
    },
    unpaidFixedCount: 2
  });

  assert.equal(audit.healthScore < 45, true);
  assert.equal(audit.statusBadge, 'CRITICO');
  assert.equal(audit.dailySafeSpend, 0);
  assert.match(audit.cmrShieldDiagnosis, /ALERTA ESCUDO CMR SIN CUBRIR/);
  assert.equal(
    audit.categoryAlerts.some((a) => a.categoryName.includes('Supermercado') && a.severity === 'CRITICO'),
    true
  );
  assert.equal(
    audit.categoryAlerts.some((a) => a.categoryName.includes('Delivery') && a.severity === 'CRITICO'),
    true
  );
  assert.equal(audit.top3Actions.length, 3);
  assert.equal(audit.top3Actions.some((act) => act.includes('CMR') || act.includes('550.000')), true);
  assert.equal(audit.top3Actions.some((act) => act.includes('Préstamos') || act.includes('Juanito')), true);
});

test('buildExcelWorkbookData y exportStateToExcel generan 4 hojas, descuentan reembolsos y calculan préstamos por persona', () => {
  const sampleState = {
    familyConfig: {
      husbandName: 'Mauricio',
      wifeName: 'Marie',
      monthlyIncomeTarget: 2350000,
      monthlySavingsGoal: 250000
    },
    categories: DEFAULT_CATEGORIES,
    fixedTemplates: DEFAULT_FIXED_TEMPLATE,
    monthlyBudgets: {
      '2026-10': {
        incomeTarget: 2350000,
        savingsGoal: 250000,
        categories: {
          supermercado: 420000,
          salud_farmacia: 80000
        }
      }
    },
    transactions: [
      {
        id: 'tx_inc_1',
        date: '2026-10-01',
        type: 'income',
        amount: 2400000,
        paymentMethod: 'bch_ctacte',
        author: 'el',
        note: 'Sueldo Octubre',
        reconciled: true
      },
      {
        id: 'tx_exp_sup',
        date: '2026-10-05',
        type: 'expense',
        categoryId: 'supermercado',
        amount: 150000,
        paymentMethod: 'cmr_falabella',
        author: 'el',
        note: 'Compra mensual Jumbo',
        reconciled: true
      },
      {
        id: 'tx_exp_salud',
        date: '2026-10-07',
        type: 'expense',
        categoryId: 'salud_farmacia',
        amount: 60000,
        paymentMethod: 'cmr_falabella',
        author: 'ella',
        note: 'Consulta pediátrica y remedios',
        reconciled: true
      },
      {
        id: 'tx_reimb_salud',
        date: '2026-10-08',
        type: 'reimbursement',
        categoryId: 'salud_farmacia',
        amount: 42000,
        paymentMethod: 'bch_ctacte',
        author: 'el',
        note: 'Reembolso Isapre / Seguro complementario',
        reconciled: true
      },
      {
        id: 'tx_wife_trf',
        date: '2026-10-09',
        type: 'transfer_wife',
        amount: 200000,
        paymentMethod: 'bch_ctacte',
        author: 'el',
        note: 'Transferencia mensual a Marie',
        reconciled: true
      },
      {
        id: 'tx_wife_exp',
        date: '2026-10-10',
        type: 'expense',
        categoryId: 'supermercado',
        amount: 45000,
        paymentMethod: 'cuenta_mujer',
        author: 'ella',
        note: 'Verdulería y feria',
        reconciled: false
      },
      {
        id: 'tx_cmr_pay',
        date: '2026-10-12',
        type: 'cmr_payment',
        amount: 80000,
        paymentMethod: 'bch_ctacte',
        author: 'el',
        note: 'Abono parcial CMR',
        reconciled: true
      },
      {
        id: 'tx_loan_rec',
        date: '2026-10-13',
        type: 'loan_received',
        amount: 50000,
        paymentMethod: 'bch_ctacte',
        author: 'el',
        note: 'Juanito — préstamo efectivo',
        reconciled: false
      },
      {
        id: 'tx_loan_rep',
        date: '2026-10-14',
        type: 'loan_repaid',
        amount: 20000,
        paymentMethod: 'bch_ctacte',
        author: 'el',
        note: 'Juanito — abono devolución',
        reconciled: true
      },
      {
        id: 'tx_loan_giv',
        date: '2026-10-15',
        type: 'loan_given',
        amount: 40000,
        paymentMethod: 'cmr_falabella',
        author: 'el',
        note: 'Pedro Soto — asado compartido (Por cobrar)',
        reconciled: true
      },
      {
        id: 'tx_loan_col',
        date: '2026-10-16',
        type: 'loan_collected',
        amount: 15000,
        paymentMethod: 'bch_ctacte',
        author: 'el',
        note: 'Pedro Soto — pago parcial asado',
        reconciled: true
      }
    ]
  };

  // Verificar que los 9 tipos de transacción tengan etiqueta definida
  const nineTypes = [
    'expense',
    'income',
    'reimbursement',
    'transfer_wife',
    'cmr_payment',
    'loan_received',
    'loan_repaid',
    'loan_given',
    'loan_collected'
  ];
  for (const t of nineTypes) {
    assert.equal(typeof TX_TYPE_LABELS[t], 'string');
    assert.equal(TX_TYPE_LABELS[t].length > 0, true);
  }

  const wbData = buildExcelWorkbookData(sampleState, '2026-10');

  // 1. Verificar las 4 hojas requeridas
  assert.deepEqual(wbData.sheetNames, [
    'Resumen_Presupuesto',
    'Movimientos_2026-10',
    'Gastos_Fijos',
    'Escudo_CMR_y_Prestamos'
  ]);

  // 2. Verificar descuento de reembolsos en Salud y Farmacia y en el total neto
  // Gasto bruto: 150.000 (super) + 60.000 (salud) + 45.000 (super Marie) = 255.000
  // Reembolso: 42.000 (salud) -> Gasto neto total = 213.000
  assert.equal(wbData.metrics.totalGrossExpenses, 255000);
  assert.equal(wbData.metrics.totalReimbursements, 42000);
  assert.equal(wbData.metrics.totalNetExpenses, 213000);

  const saludCat = wbData.metrics.categories.find((c) => c.id === 'salud_farmacia');
  assert.equal(saludCat.grossSpent, 60000);
  assert.equal(saludCat.reimbursed, 42000);
  assert.equal(saludCat.netSpent, 18000);
  assert.equal(saludCat.remaining, 62000);

  // Verificar cabeceras en Resumen_Presupuesto
  const resumenHeaderRow = wbData.sheets.Resumen_Presupuesto.rows.find(
    (r) => r[0] === 'PRESUPUESTO POR CATEGORÍA'
  );
  assert.ok(resumenHeaderRow);
  assert.equal(resumenHeaderRow.includes('GASTADO BRUTO'), true);
  assert.equal(resumenHeaderRow.includes('REEMBOLSOS RECIBIDOS'), true);
  assert.equal(resumenHeaderRow.includes('GASTADO NETO REAL'), true);

  // 3. Verificar Escudo CMR y Cuenta Mujer
  // Compras CMR: 150.000 + 60.000 = 210.000; Pagado CMR: 80.000 -> Reserva requerida: 130.000
  assert.equal(wbData.metrics.cmrShield.cmrSpentThisMonth, 210000);
  assert.equal(wbData.metrics.cmrShield.cmrPaidThisMonth, 80000);
  assert.equal(wbData.metrics.cmrShield.cmrReserveRequired, 130000);

  // Cuenta Mujer: transferido 200.000, gastado 45.000 -> disponible 155.000
  assert.equal(wbData.metrics.wifeAccount.transferredToWifeThisMonth, 200000);
  assert.equal(wbData.metrics.wifeAccount.spentByWifeThisMonth, 45000);
  assert.equal(wbData.metrics.wifeAccount.wifeBalanceThisMonth, 155000);

  // 4. Verificar cálculo de préstamos por persona en Escudo_CMR_y_Prestamos
  const juanito = wbData.metrics.loansByPerson.find((p) => p.person === 'Juanito');
  const pedro = wbData.metrics.loansByPerson.find((p) => p.person === 'Pedro Soto');
  assert.ok(juanito);
  assert.equal(juanito.loanReceived, 50000);
  assert.equal(juanito.loanRepaid, 20000);
  assert.equal(juanito.owedByUs, 30000);
  assert.equal(juanito.netBalance, -30000);

  assert.ok(pedro);
  assert.equal(pedro.loanGiven, 40000);
  assert.equal(pedro.loanCollected, 15000);
  assert.equal(pedro.owedToUs, 25000);
  assert.equal(pedro.netBalance, 25000);

  // 5. Probar exportStateToExcel con mock ligero de globalThis.window.XLSX
  const appendedSheets = [];
  let writtenFileName = null;

  const prevWindow = globalThis.window;
  globalThis.window = {
    XLSX: {
      utils: {
        book_new: () => ({ sheets: {} }),
        aoa_to_sheet: (rows) => ({ rows }),
        book_append_sheet: (wb, ws, name) => {
          appendedSheets.push({ name, rowCount: ws.rows.length, cols: ws['!cols'] });
        }
      },
      writeFile: (_wb, fileName) => {
        writtenFileName = fileName;
      }
    }
  };

  try {
    const exported = exportStateToExcel(sampleState, '2026-10');
    assert.ok(exported);
    assert.equal(writtenFileName, 'Finanzas_Familiar_2026-10.xlsx');
    assert.equal(appendedSheets.length, 4);
    assert.deepEqual(
      appendedSheets.map((s) => s.name),
      ['Resumen_Presupuesto', 'Movimientos_2026-10', 'Gastos_Fijos', 'Escudo_CMR_y_Prestamos']
    );
  } finally {
    globalThis.window = prevWindow;
  }

  assert.equal(extractLoanContactName('TRASPASO DE: CARLOS MUÑOZ — Vaca asado'), 'Carlos Muñoz');
});
