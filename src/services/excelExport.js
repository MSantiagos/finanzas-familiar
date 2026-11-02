import { DEFAULT_CATEGORIES, PAYMENT_METHODS } from '../data/defaults.js';

export const TX_TYPE_LABELS = {
  expense: 'Gasto',
  income: 'Ingreso',
  reimbursement: 'Reembolso / Devolución',
  transfer_wife: 'Traspaso Interno a Mujer',
  cmr_payment: 'Pago Facturación CMR',
  loan_received: 'Préstamo Recibido (Por devolver)',
  loan_repaid: 'Devolución de Préstamo Pagada',
  loan_given: 'Préstamo Otorgado / Por Cobrar',
  loan_collected: 'Préstamo / Cuenta Cobrada',
  savings_withdrawal: 'Rescate desde Ahorros'
};

/**
 * Extrae el nombre limpio de la persona o contacto desde un movimiento de préstamo.
 */
export function extractLoanContactName(txOrNote) {
  if (txOrNote && typeof txOrNote === 'object') {
    const explicit = txOrNote.person || txOrNote.contact || txOrNote.counterparty;
    if (explicit && String(explicit).trim()) {
      return String(explicit).trim();
    }
    txOrNote = txOrNote.note || txOrNote.description || '';
  }

  if (!txOrNote) return 'General';

  let cleaned = String(txOrNote)
    .replace(
      /^(pago:|traspaso a:|traspaso de:|tef a:|transferencia a:|transferencia de:|pr[eé]stamo de:|pr[eé]stamo a:|devoluci[oó]n a:|devoluci[oó]n de:|cobro a:|cobro de:)\s*/i,
      ''
    )
    .replace(/\(conciliado.*?\)/gi, '')
    .replace(/\(reembolso.*?\)/gi, '')
    .replace(/\(devolución.*?\)/gi, '')
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
 * Construye toda la estructura de datos y hojas del Libro Ejecutivo Multi-Hoja Excel (.xlsx)
 * de forma 100% pura (testeable en Node.js sin navegador ni DOM).
 */
export function buildExcelWorkbookData(state = {}, activeYearMonth = '2026-10') {
  const categories =
    Array.isArray(state.categories) && state.categories.length > 0
      ? state.categories
      : DEFAULT_CATEGORIES;

  const categoriesMap = {};
  categories.forEach((c) => {
    categoriesMap[c.id] = c;
  });

  const paymentMap = {};
  PAYMENT_METHODS.forEach((p) => {
    paymentMap[p.id] = p.name;
  });

  const monthConfig = state.monthlyBudgets?.[activeYearMonth] || {
    incomeTarget: state.familyConfig?.monthlyIncomeTarget || 2350000,
    savingsGoal: state.familyConfig?.monthlySavingsGoal || 250000,
    categories: {}
  };

  const allTxs = Array.isArray(state.transactions) ? state.transactions : [];
  const monthTxs = allTxs.filter((t) => String(t?.date || '').startsWith(activeYearMonth));

  // Calcular totales del mes y acumulados para Escudo CMR, Cuenta Mujer y Reembolsos
  let totalRealIncome = 0;
  let totalGrossExpenses = 0;
  let totalReimbursements = 0;
  let cmrSpentThisMonth = 0;
  let cmrPaidThisMonth = 0;
  let transferredToWife = 0;
  let spentByWifeAccount = 0;

  let cmrPrevMonthsSpent = 0;
  let cmrPrevMonthsPaid = 0;
  let wifePrevMonthsTransferred = 0;
  let wifePrevMonthsSpent = 0;

  const grossSpentByCategory = {};
  const reimbursedByCategory = {};
  const netSpentByCategory = {};

  categories.forEach((c) => {
    grossSpentByCategory[c.id] = 0;
    reimbursedByCategory[c.id] = 0;
    netSpentByCategory[c.id] = 0;
  });

  // Libro de Préstamos y Deudas por Persona/Contacto
  const loansPersonMap = {};

  allTxs.forEach((tx) => {
    const amt = Math.max(0, Math.round(Number(tx?.amount || 0)));
    const txYm = String(tx?.date || '').slice(0, 7);
    const isStrictlyBeforeMonth = txYm && txYm < activeYearMonth;

    if (isStrictlyBeforeMonth) {
      if (tx.type === 'expense' && tx.paymentMethod === 'cmr_falabella') {
        cmrPrevMonthsSpent += amt;
      } else if (tx.type === 'cmr_payment') {
        cmrPrevMonthsPaid += amt;
      } else if (tx.type === 'transfer_wife') {
        wifePrevMonthsTransferred += amt;
      } else if (tx.type === 'expense' && tx.paymentMethod === 'cuenta_mujer') {
        wifePrevMonthsSpent += amt;
      }
    }

    if (['loan_received', 'loan_repaid', 'loan_given', 'loan_collected'].includes(tx?.type)) {
      const personName = extractLoanContactName(tx);
      const personKey = personName.toLowerCase();
      if (!loansPersonMap[personKey]) {
        loansPersonMap[personKey] = {
          key: personKey,
          person: personName,
          loanReceived: 0,
          loanRepaid: 0,
          loanGiven: 0,
          loanCollected: 0,
          lastDate: tx.date || ''
        };
      }
      const entry = loansPersonMap[personKey];
      if (String(tx.date || '') >= String(entry.lastDate || '')) {
        entry.lastDate = tx.date || entry.lastDate;
      }
      if (tx.type === 'loan_received') entry.loanReceived += amt;
      if (tx.type === 'loan_repaid') entry.loanRepaid += amt;
      if (tx.type === 'loan_given') entry.loanGiven += amt;
      if (tx.type === 'loan_collected') entry.loanCollected += amt;
    }
  });

  monthTxs.forEach((tx) => {
    const amt = Math.max(0, Math.round(Number(tx?.amount || 0)));
    if (tx.type === 'income') {
      totalRealIncome += amt;
    } else if (tx.type === 'expense') {
      totalGrossExpenses += amt;
      grossSpentByCategory[tx.categoryId] = (grossSpentByCategory[tx.categoryId] || 0) + amt;
      if (tx.paymentMethod === 'cmr_falabella') {
        cmrSpentThisMonth += amt;
      }
      if (tx.paymentMethod === 'cuenta_mujer') {
        spentByWifeAccount += amt;
      }
    } else if (tx.type === 'reimbursement') {
      totalReimbursements += amt;
      if (tx.categoryId) {
        reimbursedByCategory[tx.categoryId] = (reimbursedByCategory[tx.categoryId] || 0) + amt;
      }
    } else if (tx.type === 'transfer_wife') {
      transferredToWife += amt;
    } else if (tx.type === 'cmr_payment') {
      cmrPaidThisMonth += amt;
    }
  });

  let totalNetCategorySum = 0;
  const categoryBreakdown = categories.map((cat) => {
    const budget = Number(monthConfig.categories?.[cat.id] ?? cat.defaultBudget ?? 0);
    const grossSpent = Number(grossSpentByCategory[cat.id] || 0);
    const reimbursed = Number(reimbursedByCategory[cat.id] || 0);
    const netSpent = Math.max(0, grossSpent - reimbursed);
    netSpentByCategory[cat.id] = netSpent;
    totalNetCategorySum += netSpent;

    const remaining = budget - netSpent;
    const pct = budget > 0 ? Math.round((netSpent / budget) * 100) : 0;
    const semaphore =
      pct >= 95 ? 'ROJO (Tope/Excedido)' : pct >= 75 ? 'AMARILLO (Cuidado)' : 'VERDE (Bien)';

    return {
      id: cat.id,
      icon: cat.icon,
      name: cat.name,
      budget,
      grossSpent,
      reimbursed,
      netSpent,
      remaining,
      pct,
      semaphore
    };
  });

  const totalNetExpenses = Math.max(0, totalGrossExpenses - totalReimbursements);
  const effectiveIncome = Number(totalRealIncome || monthConfig.incomeTarget || 2350000);
  const savingsGoal = Number(monthConfig.savingsGoal || 250000);
  const availableReal = effectiveIncome - savingsGoal - totalNetExpenses;

  const cmrCarryoverPrev = Math.max(0, cmrPrevMonthsSpent - cmrPrevMonthsPaid);
  const cmrReserveRequired = Math.max(
    0,
    cmrCarryoverPrev + cmrSpentThisMonth - cmrPaidThisMonth
  );

  const wifeCarryoverPrev = wifePrevMonthsTransferred - wifePrevMonthsSpent;
  const wifeBalanceThisMonth = transferredToWife - spentByWifeAccount;
  const wifeBalanceCumulative = wifeCarryoverPrev + wifeBalanceThisMonth;

  // 1. Hoja Resumen_Presupuesto (incluyendo GASTADO BRUTO, REEMBOLSOS RECIBIDOS y GASTADO NETO REAL)
  const summaryRows = [
    ['FINANZAS FAMILIAR — RESUMEN MENSUAL', activeYearMonth],
    ['Generado el', new Date().toLocaleString('es-CL')],
    [],
    ['INDICADOR CLAVE', 'MONTO (CLP)', 'EXPLICACIÓN'],
    [
      'Ingresos Registrados del Mes',
      effectiveIncome,
      'Sueldos e ingresos reales recibidos en el mes'
    ],
    [
      'Meta de Ahorro Intocable',
      savingsGoal,
      'Monto que se separa al inicio del mes para no gastar'
    ],
    [
      'Gasto Bruto del Mes',
      totalGrossExpenses,
      'Suma total de compras y gastos antes de descontar reembolsos'
    ],
    [
      'Reembolsos Recibidos en el Mes',
      totalReimbursements,
      'Devoluciones, bonos médicos o reembolsos que reducen el gasto real'
    ],
    [
      'Total Gastado Neto en el Mes',
      totalNetExpenses,
      'Suma de todos los gastos reales netos (Gasto Bruto - Reembolsos)'
    ],
    [
      'Disponible Real (Ingresos - Ahorro - Gastos)',
      availableReal,
      'Lo que queda para gastar sin tocar el ahorro'
    ],
    [],
    ['CONTROL DE AGUJEROS NEGROS', 'MONTO (CLP)', 'ACCIÓN RECOMENDADA'],
    [
      'Compras con CMR Falabella este mes',
      cmrSpentThisMonth,
      'Total gastado con tarjeta de crédito en el mes'
    ],
    [
      'Abonos / Pagos a CMR este mes',
      cmrPaidThisMonth,
      'Pagos ya realizados a la tarjeta CMR en el mes'
    ],
    [
      'Reserva Pendiente para Pagar CMR',
      cmrReserveRequired,
      'Dinero que DEBES retener en Banco de Chile para pagar la facturación'
    ],
    [
      'Transferido a Mi Mujer (Traspaso Interno)',
      transferredToWife,
      'Plata pasada a su cuenta (NO se suma como gasto hasta que se compra algo)'
    ],
    [
      'Gastado desde Cuenta Mi Mujer',
      spentByWifeAccount,
      'Compras reales ya registradas con la cuenta de ella'
    ],
    [
      'Saldo Estimado por Rendir/Usar en Cuenta Mujer',
      wifeBalanceThisMonth,
      'Diferencia entre lo transferido a ella y lo ya registrado'
    ],
    [],
    [
      'PRESUPUESTO POR CATEGORÍA',
      'PRESUPUESTO (CLP)',
      'GASTADO BRUTO',
      'REEMBOLSOS RECIBIDOS',
      'GASTADO NETO REAL',
      'DISPONIBLE (CLP)',
      '% USADO',
      'ESTADO SEMÁFORO'
    ]
  ];

  categoryBreakdown.forEach((cat) => {
    summaryRows.push([
      `${cat.icon} ${cat.name}`,
      cat.budget,
      cat.grossSpent,
      cat.reimbursed,
      cat.netSpent,
      cat.remaining,
      `${cat.pct}%`,
      cat.semaphore
    ]);
  });

  // 2. Hoja Movimientos_${activeYearMonth} (Con soporte completo para los 9 tipos de transacción)
  const txRows = [
    [
      'FECHA',
      'TIPO',
      'CATEGORÍA',
      'DETALLE / NOTA',
      'MONTO (CLP)',
      'MEDIO DE PAGO',
      'REGISTRADO POR',
      'CONCILIADO BANCO'
    ]
  ];

  monthTxs
    .slice()
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .forEach((tx) => {
      const tipoLabel = TX_TYPE_LABELS[tx.type] || String(tx.type || 'Movimiento');
      const catObj = categoriesMap[tx.categoryId];
      let catLabel = '🔄 Movimiento Interno';
      if (catObj) {
        catLabel = `${catObj.icon} ${catObj.name}`;
      } else if (tx.type === 'income') {
        catLabel = '💰 Ingreso Familiar';
      } else if (tx.type === 'reimbursement') {
        catLabel = '↩️ Reembolso Familiar';
      } else if (
        ['loan_received', 'loan_repaid', 'loan_given', 'loan_collected'].includes(tx.type)
      ) {
        catLabel = '🤝 Libro de Préstamos';
      }

      const authorLabel =
        tx.author === 'ella'
          ? state.familyConfig?.wifeName || 'Ella'
          : state.familyConfig?.husbandName || 'Él';

      txRows.push([
        tx.date,
        tipoLabel,
        catLabel,
        tx.note || '',
        Number(tx.amount || 0),
        paymentMap[tx.paymentMethod] || tx.paymentMethod || 'Banco / Interno',
        authorLabel,
        tx.reconciled ? 'Sí (Verificado)' : 'Pendiente'
      ]);
    });

  // 3. Hoja Gastos_Fijos
  const fixedRows = [
    [
      'GASTO FIJO MENSUAL',
      'MONTO ESTIMADO (CLP)',
      'DÍA VENCIMIENTO',
      'MEDIO PAGO HABITUAL',
      'ESTADO EN ' + activeYearMonth,
      'MONTO PAGADO REAL'
    ]
  ];

  (state.fixedTemplates || []).forEach((tpl) => {
    const paidTx = monthTxs.find((t) => t.fixedTemplateId === tpl.id);
    fixedRows.push([
      tpl.name,
      Number(tpl.estimatedAmount || 0),
      `Día ${tpl.dayOfMonth || 5}`,
      paymentMap[tpl.defaultPaymentMethod] || tpl.defaultPaymentMethod,
      paidTx ? 'PAGADO' : 'PENDIENTE',
      paidTx ? Number(paidTx.amount) : 0
    ]);
  });

  // 4. Hoja Escudo_CMR_y_Prestamos
  const loansByPerson = Object.values(loansPersonMap).map((p) => {
    const owedByUs = Math.max(0, p.loanReceived - p.loanRepaid);
    const owedToUs = Math.max(0, p.loanGiven - p.loanCollected);
    const netBalance = (p.loanGiven - p.loanCollected) - (p.loanReceived - p.loanRepaid);
    let statusLabel = 'SALDADO ($0)';
    if (netBalance > 0) {
      statusLabel = 'A FAVOR (Nos debe)';
    } else if (netBalance < 0) {
      statusLabel = 'EN CONTRA (Le debemos)';
    }
    return {
      person: p.person,
      loanReceived: p.loanReceived,
      loanRepaid: p.loanRepaid,
      loanGiven: p.loanGiven,
      loanCollected: p.loanCollected,
      owedByUs,
      owedToUs,
      netBalance,
      statusLabel,
      lastDate: p.lastDate
    };
  });

  const loansTotals = loansByPerson.reduce(
    (acc, item) => {
      acc.totalLoanReceived += item.loanReceived;
      acc.totalLoanRepaid += item.loanRepaid;
      acc.totalLoanGiven += item.loanGiven;
      acc.totalLoanCollected += item.loanCollected;
      acc.totalOwedByUs += item.owedByUs;
      acc.totalOwedToUs += item.owedToUs;
      acc.netPosition += item.netBalance;
      return acc;
    },
    {
      totalLoanReceived: 0,
      totalLoanRepaid: 0,
      totalLoanGiven: 0,
      totalLoanCollected: 0,
      totalOwedByUs: 0,
      totalOwedToUs: 0,
      netPosition: 0
    }
  );

  const shieldAndLoansRows = [
    ['REPORTE EJECUTIVO: ESCUDO CMR, CUENTA MUJER Y LIBRO DE PRÉSTAMOS', activeYearMonth],
    [],
    ['SECCIÓN 1: DETALLE DEL ESCUDO CMR FALABELLA', 'MONTO (CLP)', 'DIAGNÓSTICO / ACCIÓN'],
    [
      'Arrastre CMR Pendiente de Meses Anteriores',
      cmrCarryoverPrev,
      'Compras CMR de meses previos que aún no habían sido abonadas'
    ],
    [
      'Compras con CMR Falabella del Mes (' + activeYearMonth + ')',
      cmrSpentThisMonth,
      'Total cargado a la tarjeta de crédito CMR en el mes actual'
    ],
    [
      'Abonos / Pagos a CMR Realizados en el Mes',
      cmrPaidThisMonth,
      'Pagos efectuados desde Banco de Chile hacia CMR Falabella'
    ],
    [
      'Reserva Intocable Requerida en Banco de Chile',
      cmrReserveRequired,
      cmrReserveRequired > 0
        ? 'RETENER EN BANCO DE CHILE para pagar facturación al contado sin intereses'
        : 'Escudo CMR 100% pagado y al día ($0 deuda pendiente)'
    ],
    [],
    ['SECCIÓN 2: CARTOLA INTERNA CUENTA MUJER', 'MONTO (CLP)', 'DETALLE OPERATIVO'],
    [
      'Saldo Acumulado Previo Cuenta Mujer',
      wifeCarryoverPrev,
      'Remanente de meses anteriores en la cuenta de Marie'
    ],
    [
      'Transferencias Enviadas por Mauricio en el Mes',
      transferredToWife,
      'Traspasos internos desde Banco de Chile (no duplican gasto)'
    ],
    [
      'Compras Registradas por Marie en el Mes',
      spentByWifeAccount,
      'Gastos reales pagados con Cuenta Mujer e imputados a categorías'
    ],
    [
      'Saldo Disponible por Rendir en el Mes',
      wifeBalanceThisMonth,
      'Diferencia del mes (Transferencias de Mauricio - Compras de Marie)'
    ],
    [
      'Saldo Disponible Acumulado Total en Cuenta Mujer',
      wifeBalanceCumulative,
      'Fondos totales disponibles en Cuenta Mujer por usar o rendir'
    ],
    [],
    [
      'SECCIÓN 3: ESTADO DE PRÉSTAMOS Y DEUDAS POR PERSONA / CONTACTO',
      'NOS PRESTÓ (RECIBIDO)',
      'LE DEVOLVIMOS (PAGADO)',
      'LE PRESTAMOS (OTORGADO)',
      'NOS PAGÓ (COBRADO)',
      'SALDO NETO (CLP)',
      'ESTADO'
    ]
  ];

  if (loansByPerson.length === 0) {
    shieldAndLoansRows.push([
      'Sin préstamos ni cuentas compartidas registradas',
      0,
      0,
      0,
      0,
      0,
      'SALDADO ($0)'
    ]);
  } else {
    loansByPerson.forEach((p) => {
      shieldAndLoansRows.push([
        p.person,
        p.loanReceived,
        p.loanRepaid,
        p.loanGiven,
        p.loanCollected,
        p.netBalance,
        p.statusLabel
      ]);
    });
  }

  shieldAndLoansRows.push([
    'TOTALES LIBRO DE PRÉSTAMOS',
    loansTotals.totalLoanReceived,
    loansTotals.totalLoanRepaid,
    loansTotals.totalLoanGiven,
    loansTotals.totalLoanCollected,
    loansTotals.netPosition,
    loansTotals.netPosition > 0
      ? 'SALDO NETO A FAVOR'
      : loansTotals.netPosition < 0
        ? 'SALDO NETO POR PAGAR'
        : 'SALDADO ($0)'
  ]);

  const movSheetName = `Movimientos_${activeYearMonth}`;
  const sheetNames = [
    'Resumen_Presupuesto',
    movSheetName,
    'Gastos_Fijos',
    'Escudo_CMR_y_Prestamos'
  ];

  const sheets = {
    Resumen_Presupuesto: {
      name: 'Resumen_Presupuesto',
      rows: summaryRows,
      cols: [
        { wch: 44 },
        { wch: 20 },
        { wch: 20 },
        { wch: 22 },
        { wch: 20 },
        { wch: 20 },
        { wch: 14 },
        { wch: 24 }
      ]
    },
    [movSheetName]: {
      name: movSheetName,
      rows: txRows,
      cols: [
        { wch: 13 },
        { wch: 30 },
        { wch: 30 },
        { wch: 42 },
        { wch: 16 },
        { wch: 28 },
        { wch: 18 },
        { wch: 18 }
      ]
    },
    Gastos_Fijos: {
      name: 'Gastos_Fijos',
      rows: fixedRows,
      cols: [
        { wch: 36 },
        { wch: 22 },
        { wch: 18 },
        { wch: 26 },
        { wch: 18 },
        { wch: 20 }
      ]
    },
    Escudo_CMR_y_Prestamos: {
      name: 'Escudo_CMR_y_Prestamos',
      rows: shieldAndLoansRows,
      cols: [
        { wch: 46 },
        { wch: 22 },
        { wch: 22 },
        { wch: 22 },
        { wch: 22 },
        { wch: 20 },
        { wch: 24 }
      ]
    }
  };

  return {
    fileName: `Finanzas_Familiar_${activeYearMonth}.xlsx`,
    activeYearMonth,
    sheetNames,
    sheets,
    metrics: {
      activeYearMonth,
      totalRealIncome,
      effectiveIncome,
      savingsGoal,
      totalGrossExpenses,
      totalReimbursements,
      totalNetExpenses,
      availableReal,
      cmrShield: {
        cmrCarryoverPrev,
        cmrSpentThisMonth,
        cmrPaidThisMonth,
        cmrReserveRequired
      },
      wifeAccount: {
        wifeCarryoverPrev,
        transferredToWifeThisMonth: transferredToWife,
        spentByWifeThisMonth: spentByWifeAccount,
        wifeBalanceThisMonth,
        wifeBalanceCumulative
      },
      categories: categoryBreakdown,
      loansByPerson,
      loansTotals
    }
  };
}

export function exportStateToExcel(state, activeYearMonth) {
  const xlsxLib =
    (typeof window !== 'undefined' && window.XLSX) ||
    (typeof globalThis !== 'undefined' && globalThis.window?.XLSX) ||
    (typeof globalThis !== 'undefined' && globalThis.XLSX);

  if (!xlsxLib) {
    if (typeof alert === 'function') {
      alert('La librería Excel (SheetJS) aún se está cargando. Intenta de nuevo en 2 segundos.');
    }
    return null;
  }

  const workbookData = buildExcelWorkbookData(state, activeYearMonth);
  const wb = xlsxLib.utils.book_new();

  workbookData.sheetNames.forEach((sheetName) => {
    const sheetDef = workbookData.sheets[sheetName];
    const ws = xlsxLib.utils.aoa_to_sheet(sheetDef.rows);
    ws['!cols'] = sheetDef.cols;
    xlsxLib.utils.book_append_sheet(wb, ws, sheetName);
  });

  xlsxLib.writeFile(wb, workbookData.fileName);
  return workbookData;
}
