import { PAYMENT_METHODS } from '../data/defaults.js';

export function exportStateToExcel(state, activeYearMonth) {
  if (!window.XLSX) {
    alert('La librería Excel (SheetJS) aún se está cargando. Intenta de nuevo en 2 segundos.');
    return;
  }

  const XLSX = window.XLSX;
  const wb = XLSX.utils.book_new();

  const categoriesMap = {};
  (state.categories || []).forEach((c) => {
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

  const monthTxs = (state.transactions || []).filter((t) =>
    String(t.date || '').startsWith(activeYearMonth)
  );

  // Calcular totales del mes
  let totalRealIncome = 0;
  let totalExpenses = 0;
  let cmrSpentThisMonth = 0;
  let cmrPaidThisMonth = 0;
  let transferredToWife = 0;
  let spentByWifeAccount = 0;

  const spentByCategory = {};
  (state.categories || []).forEach((c) => {
    spentByCategory[c.id] = 0;
  });

  monthTxs.forEach((tx) => {
    const amt = Number(tx.amount || 0);
    if (tx.type === 'income') {
      totalRealIncome += amt;
    } else if (tx.type === 'expense') {
      totalExpenses += amt;
      spentByCategory[tx.categoryId] = (spentByCategory[tx.categoryId] || 0) + amt;
      if (tx.paymentMethod === 'cmr_falabella') {
        cmrSpentThisMonth += amt;
      }
      if (tx.paymentMethod === 'cuenta_mujer') {
        spentByWifeAccount += amt;
      }
    } else if (tx.type === 'transfer_wife') {
      transferredToWife += amt;
    } else if (tx.type === 'cmr_payment') {
      cmrPaidThisMonth += amt;
    }
  });

  // 1. Hoja Resumen_Presupuesto
  const summaryRows = [
    ['FINANZAS FAMILIAR — RESUMEN MENSUAL', activeYearMonth],
    ['Generado el', new Date().toLocaleString('es-CL')],
    [],
    ['INDICADOR CLAVE', 'MONTO (CLP)', 'EXPLICACIÓN'],
    ['Ingresos Registrados del Mes', totalRealIncome || monthConfig.incomeTarget, 'Sueldos e ingresos reales recibidos en el mes'],
    ['Meta de Ahorro Intocable', monthConfig.savingsGoal, 'Monto que se separa al inicio del mes para no gastar'],
    ['Total Gastado en el Mes', totalExpenses, 'Suma de todos los gastos reales (fijos + variables)'],
    ['Disponible Real (Ingresos - Ahorro - Gastos)', (totalRealIncome || monthConfig.incomeTarget) - monthConfig.savingsGoal - totalExpenses, 'Lo que queda para gastar sin tocar el ahorro'],
    [],
    ['CONTROL DE AGUJEROS NEGROS', 'MONTO (CLP)', 'ACCIÓN RECOMENDADA'],
    ['Compras con CMR Falabella este mes', cmrSpentThisMonth, 'Total gastado con tarjeta de crédito en el mes'],
    ['Reserva Pendiente para Pagar CMR', Math.max(0, cmrSpentThisMonth - cmrPaidThisMonth), 'Dinero que DEBES retener en Banco de Chile para pagar la facturación'],
    ['Transferido a Mi Mujer (Traspaso Interno)', transferredToWife, 'Plata pasada a su cuenta (NO se suma como gasto hasta que se compra algo)'],
    ['Gastado desde Cuenta Mi Mujer', spentByWifeAccount, 'Compras reales ya registradas con la cuenta de ella'],
    ['Saldo Estimado por Rendir/Usar en Cuenta Mujer', transferredToWife - spentByWifeAccount, 'Diferencia entre lo transferido a ella y lo ya registrado'],
    [],
    ['PRESUPUESTO POR CATEGORÍA', 'PRESUPUESTO (CLP)', 'GASTADO (CLP)', 'DISPONIBLE (CLP)', '% USADO', 'ESTADO SEMÁFORO']
  ];

  (state.categories || []).forEach((cat) => {
    const budget = Number(monthConfig.categories?.[cat.id] ?? cat.defaultBudget ?? 0);
    const spent = Number(spentByCategory[cat.id] || 0);
    const remaining = budget - spent;
    const pct = budget > 0 ? Math.round((spent / budget) * 100) : 0;
    const semaphore = pct >= 95 ? 'ROJO (Tope/Excedido)' : pct >= 75 ? 'AMARILLO (Cuidado)' : 'VERDE (Bien)';
    summaryRows.push([
      `${cat.icon} ${cat.name}`,
      budget,
      spent,
      remaining,
      `${pct}%`,
      semaphore
    ]);
  });

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  wsSummary['!cols'] = [{ wch: 42 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 14 }, { wch: 24 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumen_Presupuesto');

  // 2. Hoja Movimientos_Mes
  const txRows = [
    ['FECHA', 'TIPO', 'CATEGORÍA', 'DETALLE / NOTA', 'MONTO (CLP)', 'MEDIO DE PAGO', 'REGISTRADO POR', 'CONCILIADO BANCO']
  ];

  monthTxs
    .slice()
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .forEach((tx) => {
      const tipoLabel =
        tx.type === 'expense'
          ? 'Gasto'
          : tx.type === 'income'
            ? 'Ingreso'
            : tx.type === 'transfer_wife'
              ? 'Traspaso Interno a Mujer'
              : 'Pago Facturación CMR';
      const catObj = categoriesMap[tx.categoryId];
      const catLabel = catObj
        ? `${catObj.icon} ${catObj.name}`
        : tx.type === 'income'
          ? '💰 Ingreso Familiar'
          : '🔄 Movimiento Interno';
      const authorLabel = tx.author === 'ella' ? state.familyConfig?.wifeName || 'Ella' : state.familyConfig?.husbandName || 'Él';
      txRows.push([
        tx.date,
        tipoLabel,
        catLabel,
        tx.note || '',
        Number(tx.amount || 0),
        paymentMap[tx.paymentMethod] || tx.paymentMethod,
        authorLabel,
        tx.reconciled ? 'Sí (Verificado)' : 'Pendiente'
      ]);
    });

  const wsTx = XLSX.utils.aoa_to_sheet(txRows);
  wsTx['!cols'] = [
    { wch: 13 },
    { wch: 24 },
    { wch: 30 },
    { wch: 42 },
    { wch: 16 },
    { wch: 28 },
    { wch: 18 },
    { wch: 18 }
  ];
  XLSX.utils.book_append_sheet(wb, wsTx, `Movimientos_${activeYearMonth}`);

  // 3. Hoja Gastos_Fijos
  const fixedRows = [
    ['GASTO FIJO MENSUAL', 'MONTO ESTIMADO (CLP)', 'DÍA VENCIMIENTO', 'MEDIO PAGO HABITUAL', 'ESTADO EN ' + activeYearMonth, 'MONTO PAGADO REAL']
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

  const wsFixed = XLSX.utils.aoa_to_sheet(fixedRows);
  wsFixed['!cols'] = [{ wch: 36 }, { wch: 22 }, { wch: 18 }, { wch: 26 }, { wch: 18 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, wsFixed, 'Gastos_Fijos');

  XLSX.writeFile(wb, `Finanzas_Familiar_${activeYearMonth}.xlsx`);
}
