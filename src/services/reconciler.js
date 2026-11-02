import {
  CHILE_MERCHANT_RULES
} from '../data/defaults.js?v=8';

export function cleanChileanAmount(raw) {
  if (typeof raw === 'number') return Math.abs(Math.round(raw));
  if (!raw) return 0;

  let str = String(raw)
    .replace(/\$/g, '')
    .replace(/CLP/gi, '')
    .replace(/\s+/g, '')
    .trim();

  if (!str) return 0;
  if (/[a-zA-Z]/.test(str)) return 0;

  // Caso 1: Formato Excel / US con decimales al final (.00 o ,00), ej: "3,670.00", "895.00", "23,777.00", "48.500,00"
  if (/[.,]\d{1,2}$/.test(str)) {
    const integerPart = str.replace(/[.,]\d{1,2}$/, '');
    const digitsOnly = integerPart.replace(/[.,-]/g, '');
    const num = parseInt(digitsOnly, 10);
    return isNaN(num) ? 0 : Math.abs(num);
  }

  // Caso 2: Formato chileno con puntos o comas de miles sin decimales (ej: "48.500", "1.250.000", "48500")
  const digitsOnly = str.replace(/[.,-]/g, '');
  const num = parseInt(digitsOnly, 10);
  return isNaN(num) ? 0 : Math.abs(num);
}

/**
 * Formatea en vivo un string numérico con puntos de miles chilenos ("150000" -> "150.000")
 * para que Mauricio y Marie nunca confundan $15.000 con $150.000 en el iPhone.
 */
export function formatLiveCLPInput(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  const num = parseInt(digits, 10);
  if (isNaN(num) || num === 0) return digits === '0' ? '0' : '';
  return num.toLocaleString('es-CL');
}

export function isValidStatementDate(rawDate) {
  if (!rawDate) return false;
  const str = String(rawDate).trim();

  const ymd = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymd) {
    const m = parseInt(ymd[2], 10);
    const d = parseInt(ymd[3], 10);
    return m >= 1 && m <= 12 && d >= 1 && d <= 31;
  }

  const dmy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmy) {
    const d = parseInt(dmy[1], 10);
    const m = parseInt(dmy[2], 10);
    return m >= 1 && m <= 12 && d >= 1 && d <= 31;
  }

  const dm = str.match(/^(\d{1,2})[\/\-](\d{1,2})$/);
  if (dm) {
    const d = parseInt(dm[1], 10);
    const m = parseInt(dm[2], 10);
    return m >= 1 && m <= 12 && d >= 1 && d <= 31;
  }

  return false;
}

export function normalizeDateToISO(rawDate, fallbackYearMonth) {
  if (!rawDate) return `${fallbackYearMonth}-01`;
  const str = String(rawDate).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }

  const dmyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    let year = dmyMatch[3];
    if (year.length === 2) year = `20${year}`;
    return `${year}-${month}-${day}`;
  }

  const dmMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})$/);
  if (dmMatch) {
    const [fallbackY] = (fallbackYearMonth || '2026-10').split('-');
    const day = dmMatch[1].padStart(2, '0');
    const month = dmMatch[2].padStart(2, '0');
    return `${fallbackY}-${month}-${day}`;
  }

  return `${fallbackYearMonth}-15`;
}

export function buildBankFingerprint(dateISO, amount, description, flow = 'out') {
  const cleanDesc = String(description || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 28);
  return `fp_${dateISO}_${flow}_${Math.round(Number(amount || 0))}_${cleanDesc}`;
}

export function normalizeContactKey(description) {
  return String(description || '')
    .toLowerCase()
    .replace(/^(pago:|traspaso a:|traspaso de:|tef a:|transferencia a:|transferencia de:)\s*/i, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/[^a-z0-9áéíóúñ\s]/gi, '')
    .trim()
    .slice(0, 32);
}

/**
 * Extrae el nombre limpio de la persona o contacto desde una nota o glosa bancaria
 * (ej: "Juanito — préstamo / encargo" -> "Juanito", "TRASPASO DE: PEDRO SOTO" -> "Pedro Soto").
 */
export function extractContactDisplayName(rawNoteOrDesc) {
  if (!rawNoteOrDesc) return 'General';
  let cleaned = String(rawNoteOrDesc)
    .replace(/^(pago:|traspaso a:|traspaso de:|tef a:|transferencia a:|transferencia de:)\s*/i, '')
    .replace(/\(conciliado.*?\)/gi, '')
    .replace(/\(reembolso.*?\)/gi, '')
    .replace(/\(devolución.*?\)/gi, '')
    .replace(/\(préstamo.*?\)/gi, '')
    .replace(/\(por cobrar.*?\)/gi, '')
    .replace(/\(nuestra parte.*?\)/gi, '')
    .trim();

  // Si tiene guion o dos puntos (ej. "Juanito — préstamo"), tomar la primera parte
  const splitParts = cleaned.split(/\s*[—\-:]\s*/);
  if (splitParts[0] && splitParts[0].trim().length >= 2) {
    cleaned = splitParts[0].trim();
  }
  if (!cleaned) return 'General';
  // Capitalizar palabras
  return cleaned
    .toLowerCase()
    .split(/\s+/)
    .slice(0, 3)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function guessCategoryFromMerchant(description) {
  const lower = String(description || '').toLowerCase();
  for (const rule of CHILE_MERCHANT_RULES) {
    if (rule.keywords.some((kw) => lower.includes(kw))) {
      return rule.categoryId;
    }
  }
  return 'imprevistos';
}

export function guessPaymentMethodFromSource(sourceText, defaultMethod = 'cmr_falabella') {
  const lower = String(sourceText || '').toLowerCase();
  if (lower.includes('cmr') || lower.includes('falabella') || lower.includes('credito')) {
    return 'cmr_falabella';
  }
  if (lower.includes('vista') || lower.includes('fan')) {
    return 'bch_vista';
  }
  if (lower.includes('chile') || lower.includes('corriente') || lower.includes('ctacte')) {
    return 'bch_ctacte';
  }
  if (lower.includes('mujer') || lower.includes('esposa') || lower.includes('marie') || lower.includes('ella')) {
    return 'cuenta_mujer';
  }
  return defaultMethod;
}

export function detectInternalOrCardPayment(
  description,
  wifeName = 'Marie',
  husbandKeywords = ['mauricio', 'santiagos', 'santiago']
) {
  const lower = String(description || '').toLowerCase();

  if (
    lower.includes('pago cmr') ||
    lower.includes('pago tarjeta') ||
    lower.includes('estado de cuenta') ||
    lower.includes('abono cmr')
  ) {
    return 'cmr_payment';
  }

  const cleanWife = String(wifeName || 'marie').toLowerCase().trim();
  if (
    lower.includes('marie') ||
    lower.includes('mi mujer') ||
    (cleanWife.length > 2 && lower.includes(cleanWife))
  ) {
    return 'transfer_wife';
  }

  const isSelfKeyword =
    husbandKeywords.some((kw) => lower.includes(kw)) ||
    lower.includes('cuenta fan') ||
    lower.includes('cta fan') ||
    lower.includes('mismo titular');

  if (isSelfKeyword) {
    return 'transfer_self';
  }

  return null;
}

export function parseBankStatementText(rawText, fallbackYearMonth, defaultPaymentMethod = 'cmr_falabella') {
  if (!rawText || !rawText.trim()) return [];
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const isBancoDeChileFormat = lines.some(
    (l) => /;CENTRAL;|;PAGO:|;TRASPASO|BANCO DE CHILE|CUENTA FAN/i.test(l)
  );
  const effectiveDefaultMethod =
    isBancoDeChileFormat && defaultPaymentMethod === 'cmr_falabella'
      ? 'bch_vista'
      : defaultPaymentMethod;

  const parsedRows = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    let parts = line.includes(';')
      ? line.split(';')
      : line.includes('\t')
        ? line.split('\t')
        : line.split(',');

    parts = parts.map((p) => p.trim());

    let dateColIdx = -1;
    if (isValidStatementDate(parts[0])) {
      dateColIdx = 0;
    } else if (parts.length > 1 && isValidStatementDate(parts[1])) {
      dateColIdx = 1;
    }

    if (dateColIdx === -1) {
      const freeMatch = line.match(/^(\d{1,4}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?)\s+(.+?)\s+\$?([\d\.,]+)$/);
      if (freeMatch && isValidStatementDate(freeMatch[1])) {
        const dateISO = normalizeDateToISO(freeMatch[1], fallbackYearMonth);
        const description = freeMatch[2].trim();
        const amount = cleanChileanAmount(freeMatch[3]);
        const isIncomingDesc = /^(traspaso de|transferencia de|abono|deposito)/i.test(description);
        const flow = isIncomingDesc ? 'in' : 'out';
        if (amount > 0 && description) {
          parsedRows.push({
            rowId: `stmt_${i}_${Date.now()}`,
            date: dateISO,
            description,
            amount,
            flow,
            fingerprint: buildBankFingerprint(dateISO, amount, description, flow),
            paymentMethod: effectiveDefaultMethod,
            sourceLabel: 'Cartola'
          });
        }
      }
      continue;
    }

    const dateISO = normalizeDateToISO(parts[dateColIdx], fallbackYearMonth);
    const description = parts[dateColIdx + 1] || '';
    if (!description) continue;

    const isIncomingByPrefix = /^(traspaso de|transferencia de|abono|deposito)/i.test(description);

    const col2 = parts[dateColIdx + 2] || '';
    const col3 = parts[dateColIdx + 3] || '';
    const col4 = parts[dateColIdx + 4] || '';

    const amtCol2 = cleanChileanAmount(col2);
    const amtCol3 = cleanChileanAmount(col3);
    const amtCol4 = cleanChileanAmount(col4);

    let amount = 0;
    let flow = isIncomingByPrefix ? 'in' : 'out';
    let sourceLabel = '';

    if (amtCol2 > 0) {
      amount = amtCol2;
      sourceLabel = col3 && cleanChileanAmount(col3) === 0 ? col3 : '';
    } else if (amtCol3 > 0) {
      amount = amtCol3;
      flow = isIncomingByPrefix ? 'in' : 'out';
      sourceLabel = isBancoDeChileFormat ? 'Banco de Chile (Fan/Vista)' : col2 || 'Cartola';
    } else if (amtCol3 === 0 && amtCol4 > 0) {
      amount = amtCol4;
      flow = 'in';
      sourceLabel = isBancoDeChileFormat ? 'Banco de Chile (Fan/Vista)' : col2 || 'Cartola';
    }

    if (amount > 0) {
      const cleanDesc = description.replace(/^PAGO:\s*/i, '').trim() || description;
      parsedRows.push({
        rowId: `stmt_${i}_${Date.now()}`,
        date: dateISO,
        description: cleanDesc,
        amount,
        flow,
        fingerprint: buildBankFingerprint(dateISO, amount, cleanDesc, flow),
        paymentMethod: guessPaymentMethodFromSource(sourceLabel || description, effectiveDefaultMethod),
        sourceLabel: sourceLabel || 'Cartola'
      });
    }
  }

  return parsedRows;
}

function daysBetweenISO(d1, d2) {
  const t1 = new Date(`${d1}T12:00:00`).getTime();
  const t2 = new Date(`${d2}T12:00:00`).getTime();
  if (isNaN(t1) || isNaN(t2)) return 999;
  return Math.abs(Math.round((t1 - t2) / (1000 * 60 * 60 * 24)));
}

function inferSmartContextForIncomingAbono(row, allTransactions, learnedContacts = {}) {
  const lower = String(row.description || '').toLowerCase();
  const contactKey = normalizeContactKey(row.description);

  if (contactKey && learnedContacts[contactKey]?.flow === 'in') {
    const saved = learnedContacts[contactKey];
    return {
      abonoAction: saved.abonoAction || 'income',
      reimburseCategoryId: saved.reimburseCategoryId || 'supermercado',
      smartHint: `🧠 Memoria familiar: ya habías clasificado a "${extractContactDisplayName(row.description)}" de esta forma.`
    };
  }

  if (/isapre|colmena|consalud|cruz blanca|banmedica|vida tres|masvida|fonasa|metlife|bice vida|seguro|reembolso|imed/i.test(lower)) {
    return {
      abonoAction: 'reimburse',
      reimburseCategoryId: 'salud_farmacia',
      smartHint: '💡 Reembolso Médico (Isapre/Seguro) detectado → Devuelve cupo a 💊 Salud y Farmacia.'
    };
  }

  if (/devolucion|nota de credito|reversa|anulacion|reembolso compra/i.test(lower)) {
    const cat = guessCategoryFromMerchant(lower);
    return {
      abonoAction: 'reimburse',
      reimburseCategoryId: cat !== 'imprevistos' ? cat : 'gustos_personales',
      smartHint: '💡 Devolución de tienda detectada → Devuelve cupo a la categoría original.'
    };
  }

  if (/rescate|fondo mutuo|ffmm|fintual|racional|deposito a plazo|dap|cuenta ahorro|ahorro/i.test(lower)) {
    return {
      abonoAction: 'savings_withdrawal',
      reimburseCategoryId: 'supermercado',
      smartHint: '⚠️ Retiro desde tus Ahorros / Inversiones → Pre-seleccionado para NO disfrazarlo como ingreso.'
    };
  }

  if (/sueldo|remuneracion|honorarios|aguinaldo|tesoreria|sii /i.test(lower)) {
    return {
      abonoAction: 'income',
      reimburseCategoryId: 'supermercado',
      smartHint: '💰 Sueldo / Remuneración detectada → Suma a tus Ingresos del Mes.'
    };
  }

  const openLoanGiven = allTransactions.find(
    (tx) =>
      tx.type === 'loan_given' &&
      (Math.abs(Number(tx.amount) - row.amount) <= 1000 ||
        (contactKey.length > 3 && String(tx.note || '').toLowerCase().includes(contactKey.split(' ')[0])))
  );
  if (openLoanGiven) {
    return {
      abonoAction: 'loan_collected',
      reimburseCategoryId: 'supermercado',
      smartHint: `💡 Coincide con "${openLoanGiven.note}" ($${Number(openLoanGiven.amount).toLocaleString('es-CL')}) que te debían → Salda esa cuenta por cobrar.`
    };
  }

  const recentBigExpense = allTransactions.find(
    (tx) =>
      tx.type === 'expense' &&
      ['delivery_salidas', 'supermercado', 'gustos_personales'].includes(tx.categoryId) &&
      Number(tx.amount) > row.amount &&
      row.amount >= 4000 &&
      row.amount <= 90000 &&
      daysBetweenISO(tx.date, row.date) <= 4
  );
  if (recentBigExpense && /traspaso de|transferencia de/i.test(lower)) {
    return {
      abonoAction: 'reimburse',
      reimburseCategoryId: recentBigExpense.categoryId,
      smartHint: `💡 ¿Cuenta compartida? Hace poco pagaste $${Number(recentBigExpense.amount).toLocaleString('es-CL')} en "${recentBigExpense.note}". Pre-seleccionado como Reembolso.`
    };
  }

  return {
    abonoAction: 'income',
    reimburseCategoryId: 'supermercado',
    smartHint: '💬 Abono de un tercero: confirma si es Ingreso Extra, Reembolso de cuenta compartida o Préstamo.'
  };
}

function inferSmartContextForOutgoingCargo(row, allTransactions, learnedContacts = {}) {
  const lower = String(row.description || '').toLowerCase();
  const contactKey = normalizeContactKey(row.description);

  if (contactKey && learnedContacts[contactKey]?.flow === 'out') {
    const saved = learnedContacts[contactKey];
    return {
      suggestedCategoryId: saved.suggestedCategoryId,
      smartHint: `🧠 Memoria familiar: recordado de tus cartolas anteriores.`
    };
  }

  const openLoanReceived = allTransactions.find(
    (tx) =>
      tx.type === 'loan_received' &&
      (Math.abs(Number(tx.amount) - row.amount) <= 1000 ||
        (contactKey.length > 3 && String(tx.note || '').toLowerCase().includes(contactKey.split(' ')[0])))
  );
  if (openLoanReceived) {
    return {
      suggestedCategoryId: '__loan_repaid__',
      smartHint: `💡 Coincide con el préstamo de $${Number(openLoanReceived.amount).toLocaleString('es-CL')} ("${openLoanReceived.note}") que debías devolver → No suma gasto.`
    };
  }

  if (/giro cajero|giro en cajero|cajero automatico/i.test(lower)) {
    return {
      suggestedCategoryId: 'supermercado',
      smartHint: '💵 Giro en Cajero: clasificado por defecto en Feria/Supermercado.'
    };
  }

  const cat = guessCategoryFromMerchant(row.description);
  if (cat !== 'imprevistos') {
    return {
      suggestedCategoryId: cat,
      smartHint: '✨ Categoría detectada automáticamente según el comercio.'
    };
  }

  if (/traspaso a|tef a|transferencia a/i.test(lower)) {
    return {
      suggestedCategoryId: 'imprevistos',
      smartHint: '💸 Transferencia a 3º: elige la categoría del gasto o si fue préstamo/devolución.'
    };
  }

  return {
    suggestedCategoryId: 'imprevistos',
    smartHint: 'Elige la categoría una vez y la app recordará a este comercio/contacto.'
  };
}

export function reconcileStatementRows(
  statementRows,
  existingTransactions,
  wifeName = 'Marie',
  allHistoricalTransactions = null,
  learnedContacts = {}
) {
  // Usamos todas las transacciones históricas para permitir calces en bordes de mes (±5 días entre el 30/31 y el 1/2)
  const allTxs = Array.isArray(allHistoricalTransactions) && allHistoricalTransactions.length > 0
    ? allHistoricalTransactions
    : existingTransactions;

  const usedTxIds = new Set();
  const usedGroupIds = new Set();

  const receiptGroups = {};
  allTxs.forEach((tx) => {
    if (tx.receiptGroupId) {
      if (!receiptGroups[tx.receiptGroupId]) {
        receiptGroups[tx.receiptGroupId] = {
          groupId: tx.receiptGroupId,
          date: tx.date,
          totalAmount: 0,
          items: []
        };
      }
      receiptGroups[tx.receiptGroupId].totalAmount += Number(tx.amount || 0);
      receiptGroups[tx.receiptGroupId].items.push(tx);
    }
  });

  return statementRows.map((row) => {
    // 0. BLINDAJE CONTRA DOBLE SUBIDA DE CARTOLA (Huella Digital Exacta)
    const exactFingerprintMatch = allTxs.find(
      (tx) => !usedTxIds.has(tx.id) && tx.bankFingerprint && tx.bankFingerprint === row.fingerprint
    );
    if (exactFingerprintMatch) {
      usedTxIds.add(exactFingerprintMatch.id);
      return {
        ...row,
        status: 'matched_duplicate',
        matchedTx: exactFingerprintMatch,
        matchReason: `Ya importado previamente ("${exactFingerprintMatch.note}") — Bloqueado`,
        suggestedCategoryId: exactFingerprintMatch.categoryId,
        selectedToImport: false
      };
    }

    const internalType = detectInternalOrCardPayment(row.description, wifeName);

    // ========================================================================
    // RAMA A: ENTRADAS DE DINERO / ABONOS (flow === 'in')
    // ========================================================================
    if (row.flow === 'in') {
      if (internalType === 'transfer_self' || internalType === 'transfer_wife') {
        return {
          ...row,
          status: 'internal',
          internalType: 'transfer_self',
          alreadyRecordedInternal: true,
          matchedTx: null,
          suggestedCategoryId: 'traspaso_interno',
          smartHint: '🔄 Plata movida entre tus propias cuentas: se ignora automáticamente.',
          selectedToImport: false
        };
      }

      const matchedIncoming = allTxs.find(
        (tx) =>
          !usedTxIds.has(tx.id) &&
          ['income', 'reimbursement', 'loan_received', 'loan_collected', 'savings_withdrawal'].includes(tx.type) &&
          Math.abs(Number(tx.amount) - row.amount) <= 1000 &&
          daysBetweenISO(tx.date, row.date) <= 5
      );

      if (matchedIncoming) {
        usedTxIds.add(matchedIncoming.id);
        return {
          ...row,
          status: 'matched_duplicate',
          matchedTx: matchedIncoming,
          matchReason: `Abono ya registrado ("${matchedIncoming.note}") el ${matchedIncoming.date}`,
          suggestedCategoryId: matchedIncoming.categoryId,
          selectedToImport: false
        };
      }

      const smartIn = inferSmartContextForIncomingAbono(row, allTxs, learnedContacts);
      return {
        ...row,
        status: 'incoming_abono',
        abonoAction: smartIn.abonoAction,
        reimburseCategoryId: smartIn.reimburseCategoryId,
        smartHint: smartIn.smartHint,
        matchedTx: null,
        selectedToImport: true
      };
    }

    // ========================================================================
    // RAMA B: SALIDAS DE DINERO / CARGOS (flow === 'out')
    // ========================================================================
    if (internalType) {
      const matchedInternal = allTxs.find(
        (tx) =>
          !usedTxIds.has(tx.id) &&
          tx.type === internalType &&
          Math.abs(Number(tx.amount) - row.amount) <= 1000 &&
          daysBetweenISO(tx.date, row.date) <= 5
      );
      if (matchedInternal) {
        usedTxIds.add(matchedInternal.id);
      }
      return {
        ...row,
        status: 'internal',
        internalType,
        alreadyRecordedInternal: Boolean(matchedInternal),
        matchedTx: matchedInternal || null,
        suggestedCategoryId: guessCategoryFromMerchant(row.description),
        selectedToImport: internalType === 'transfer_wife' && !matchedInternal
      };
    }

    // 1. Buscar coincidencia con Cuota CMR generada (ej. "CUOTA 02/03" o "Cuota 2/3")
    const cuotaMatchRegex = row.description.match(/(?:cuota\s*)?0?(\d{1,2})\s*(?:\/|de)\s*0?(\d{1,2})/i);
    if (cuotaMatchRegex) {
      const cuotaNum = parseInt(cuotaMatchRegex[1], 10);
      const cuotaTotal = parseInt(cuotaMatchRegex[2], 10);
      const installmentTx = allTxs.find(
        (tx) =>
          !usedTxIds.has(tx.id) &&
          tx.type === 'expense' &&
          Math.abs(Number(tx.amount) - row.amount) <= 600 &&
          daysBetweenISO(tx.date, row.date) <= 20 &&
          String(tx.note || '').includes(`Cuota ${cuotaNum}/${cuotaTotal}`)
      );
      if (installmentTx) {
        usedTxIds.add(installmentTx.id);
        return {
          ...row,
          status: 'matched_duplicate',
          matchedTx: installmentTx,
          matchReason: `Coincide con ${installmentTx.note} programada por $${Number(installmentTx.amount).toLocaleString('es-CL')}`,
          suggestedCategoryId: installmentTx.categoryId,
          selectedToImport: false
        };
      }
    }

    // 2. Buscar coincidencia directa o monto redondeado en ventana de ±5 días (incluye cruces de fin de mes)
    const directMatch = allTxs.find((tx) => {
      if (usedTxIds.has(tx.id)) return false;
      if (!['expense', 'loan_repaid', 'loan_given'].includes(tx.type)) return false;
      const dayDiff = daysBetweenISO(tx.date, row.date);
      if (dayDiff > 5) return false;
      const amtDiff = Math.abs(Number(tx.amount) - row.amount);
      const tolerance = Math.max(600, Math.round(row.amount * 0.04));
      return amtDiff <= tolerance && (dayDiff <= 2 || amtDiff <= 500);
    });

    if (directMatch) {
      usedTxIds.add(directMatch.id);
      const wasRounded = Number(directMatch.amount) !== row.amount;
      return {
        ...row,
        status: 'matched_duplicate',
        matchedTx: directMatch,
        matchReason: wasRounded
          ? `Coincide con "${directMatch.note}" anotado por $${Number(directMatch.amount).toLocaleString('es-CL')} el ${directMatch.date} (Ajustado al banco: $${row.amount.toLocaleString('es-CL')})`
          : `Coincide con "${directMatch.note || 'Gasto registrado'}" del ${directMatch.date} ($${Number(directMatch.amount).toLocaleString('es-CL')})`,
        suggestedCategoryId: directMatch.categoryId,
        selectedToImport: false
      };
    }

    // 3. Buscar coincidencia con el total de una Boleta Dividida o Cuenta Compartida (±5 días)
    const groupMatch = Object.values(receiptGroups).find(
      (grp) =>
        !usedGroupIds.has(grp.groupId) &&
        Math.abs(grp.totalAmount - row.amount) <= 800 &&
        daysBetweenISO(grp.date, row.date) <= 5
    );

    if (groupMatch) {
      usedGroupIds.add(groupMatch.groupId);
      return {
        ...row,
        status: 'matched_duplicate',
        matchedTx: groupMatch.items[0],
        matchReason: `Coincide con compra dividida en ${groupMatch.items.length} partes del ${groupMatch.date} (Total $${groupMatch.totalAmount.toLocaleString('es-CL')})`,
        suggestedCategoryId: groupMatch.items[0]?.categoryId || 'supermercado',
        selectedToImport: false
      };
    }

    // 4. Movimiento no registrado -> predecir categoría o préstamo con el Motor Contextual
    const smartOut = inferSmartContextForOutgoingCargo(row, allTxs, learnedContacts);
    return {
      ...row,
      status: 'forgotten_new',
      matchedTx: null,
      suggestedCategoryId: smartOut.suggestedCategoryId,
      smartHint: smartOut.smartHint,
      selectedToImport: true
    };
  });
}
