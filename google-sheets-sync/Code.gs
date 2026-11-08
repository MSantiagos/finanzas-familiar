/**
 * FINANZAS FAMILIAR — MOTOR DE SINCRONIZACIÓN EN GOOGLE SHEETS (CON FUSIÓN CRDT-LITE)
 *
 * INSTRUCCIONES (90 segundos):
 * 1. Abre https://sheets.new en tu cuenta de Google y ponle de nombre "Finanzas Familiar".
 * 2. En el menú superior, haz clic en "Extensiones" -> "Apps Script".
 * 3. Borra el código que aparece por defecto y pega TODO este archivo.
 * 4. Haz clic en el botón azul "Implementar" (arriba a la derecha) -> "Nueva implementación".
 * 5. En "Selecciona el tipo" (ícono de engranaje), elige "Aplicación web".
 * 6. En "Ejecutar como": elige "Yo".
 * 7. En "Quién tiene acceso": elige "Cualquier persona" (esto permite que el iPhone tuyo en Santiago y el de Marie en Algarrobo sincronicen sin bloqueo de sesión).
 * 8. Haz clic en "Implementar", autoriza los permisos y COPIA la "URL de la aplicación web".
 * 9. Pega esa URL en la pestaña "☁️ iPhone & IA" de tu App Finanzas Familiar y envíale el Link Mágico por WhatsApp a Marie. ¡Listo!
 */

var DEFAULT_FIXED_ORDER_ = [
  'fix_arriendo',
  'fix_gGCC',
  'fix_luz',
  'fix_agua',
  'fix_gas',
  'fix_internet',
  'fix_suscripciones'
];

var PAYMENT_LABELS_ = {
  bch_ctacte: 'Banco de Chile (Cta. Corriente)',
  bch_vista: 'Banco de Chile (Cta. Vista)',
  cmr_falabella: 'CMR Falabella (Crédito)',
  cuenta_mujer: 'Cuenta Mi Mujer (Fondos transferidos)',
  efectivo: 'Efectivo'
};

function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var dbSheet = getOrCreateDbSheet_(ss);
    var rawJson = dbSheet.getRange('A2').getValue();

    if (!rawJson) {
      return jsonResponse_({
        status: 'empty',
        message: 'Aún no hay datos guardados en la nube.'
      });
    }

    return jsonResponse_({
      status: 'ok',
      payload: JSON.parse(rawJson),
      updatedAt: dbSheet.getRange('B2').getValue()
    });
  } catch (err) {
    return jsonResponse_({
      status: 'error',
      message: String(err)
    });
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    var rawContents = (e && e.postData && e.postData.contents) ? e.postData.contents : '{}';
    var body = JSON.parse(rawContents);
    var incoming = body && body.payload ? body.payload : body;

    if (!incoming || typeof incoming !== 'object') {
      return jsonResponse_({ status: 'error', message: 'Sin payload' });
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var dbSheet = getOrCreateDbSheet_(ss);
    var rawExisting = dbSheet.getRange('A2').getValue();
    var existing = null;
    if (rawExisting) {
      try {
        existing = JSON.parse(rawExisting);
      } catch (parseErr) {
        existing = null;
      }
    }

    var merged = mergeFamilyStates_(existing, incoming);
    var nowStr = new Date().toISOString();
    merged.lastUpdated = nowStr;

    dbSheet.getRange('A1:B1').setValues([['JSON_STATE', 'LAST_UPDATED']]);
    dbSheet.getRange('A2:B2').setValues([[JSON.stringify(merged), nowStr]]);

    updateReadableSheets_(ss, merged);

    return jsonResponse_({
      status: 'ok',
      syncedAt: nowStr,
      payload: merged
    });
  } catch (err) {
    return jsonResponse_({
      status: 'error',
      message: String(err)
    });
  } finally {
    try {
      lock.releaseLock();
    } catch (ignore) {}
  }
}

function mergeTwoTransactions_(prev, cand) {
  var prevStamp = String(prev.updatedAt || prev.createdAt || '');
  var candStamp = String(cand.updatedAt || cand.createdAt || '');
  var prevRec = Boolean(prev.reconciled);
  var candRec = Boolean(cand.reconciled);

  var winner;
  var loser;
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

  var mergedTx = Object.assign({}, loser, winner);
  if (prevRec || candRec) {
    mergedTx.reconciled = true;
    var fp = winner.bankFingerprint || loser.bankFingerprint;
    if (fp) {
      mergedTx.bankFingerprint = fp;
    }
  }
  return mergedTx;
}

/**
 * Fusión CRDT-Lite determinista, idempotente y conmutativa alineada 100% con server.py y storage.js.
 */
function mergeFamilyStates_(existing, incoming) {
  if (!existing || typeof existing !== 'object') return incoming;
  if (!incoming || typeof incoming !== 'object') return existing;

  // 1. Comparar timestamps de deletedTransactionIds conservando el más reciente
  var deleted = {};
  var existingDel = existing.deletedTransactionIds || {};
  var incomingDel = incoming.deletedTransactionIds || {};
  Object.keys(existingDel).forEach(function (txId) {
    deleted[txId] = existingDel[txId];
  });
  Object.keys(incomingDel).forEach(function (txId) {
    var prevTs = String(deleted[txId] || '');
    var nextTs = String(incomingDel[txId] || '');
    if (!prevTs || nextTs >= prevTs) {
      deleted[txId] = incomingDel[txId];
    }
  });

  // 2. Propagar demoCleared incluso si uno de los estados ya limpió las transacciones isDemo
  var existingTxs = Array.isArray(existing.transactions) ? existing.transactions : [];
  var incomingTxs = Array.isArray(incoming.transactions) ? incoming.transactions : [];
  var hasDemoExisting = existingTxs.some(function (t) { return Boolean(t && t.isDemo); });
  var hasDemoIncoming = incomingTxs.some(function (t) { return Boolean(t && t.isDemo); });

  var demoCleared =
    Boolean(existing.demoCleared) ||
    Boolean(incoming.demoCleared) ||
    (hasDemoExisting && Array.isArray(incoming.transactions) && !hasDemoIncoming) ||
    (hasDemoIncoming && Array.isArray(existing.transactions) && !hasDemoExisting);

  // 3. Fusionar transactions por ID desempatando por updatedAt || createdAt y priorizando reconciled === true
  var txMap = {};
  var allTxs = existingTxs.concat(incomingTxs);
  for (var i = 0; i < allTxs.length; i++) {
    var tx = allTxs[i];
    if (!tx || !tx.id) continue;
    if (deleted[tx.id]) continue;
    if (demoCleared && tx.isDemo) continue;

    var prev = txMap[tx.id];
    if (!prev) {
      txMap[tx.id] = Object.assign({}, tx);
    } else {
      txMap[tx.id] = mergeTwoTransactions_(prev, tx);
    }
  }

  var mergedTxs = Object.keys(txMap).map(function (k) { return txMap[k]; });
  mergedTxs.sort(function (a, b) {
    var byDate = String(b.date || '').localeCompare(String(a.date || ''));
    if (byDate !== 0) return byDate;
    var byCreated = String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    if (byCreated !== 0) return byCreated;
    return String(b.id || '').localeCompare(String(a.id || ''));
  });

  // 4. Fusionar learnedContacts
  var learnedContacts = Object.assign({}, existing.learnedContacts || {});
  var incomingContacts = incoming.learnedContacts || {};
  Object.keys(incomingContacts).forEach(function (ck) {
    var prevC = learnedContacts[ck];
    var nextC = incomingContacts[ck];
    if (!prevC || typeof prevC !== 'object' || typeof nextC !== 'object') {
      learnedContacts[ck] = nextC;
    } else {
      var prevU = String(prevC.updatedAt || '');
      var nextU = String(nextC.updatedAt || '');
      if (nextU >= prevU) {
        learnedContacts[ck] = nextC;
      }
    }
  });

  // 5. Fusionar monthlyBudgets comparando updatedAt de cada mes (YYYY-MM)
  var monthlyBudgets = Object.assign({}, existing.monthlyBudgets || {});
  var incomingBudgets = incoming.monthlyBudgets || {};
  Object.keys(incomingBudgets).forEach(function (ym) {
    var cfgB = incomingBudgets[ym];
    var cfgA = monthlyBudgets[ym];
    if (!cfgA) {
      monthlyBudgets[ym] = cfgB;
    } else {
      var uA = String(cfgA.updatedAt || '');
      var uB = String(cfgB.updatedAt || '');
      if (uB >= uA) {
        monthlyBudgets[ym] = cfgB;
      }
    }
  });

  // 6. Fusionar fixedTemplates por id (mapa por id)
  var tplMap = {};
  var allTpls = (existing.fixedTemplates || []).concat(incoming.fixedTemplates || []);
  for (var j = 0; j < allTpls.length; j++) {
    var tpl = allTpls[j];
    if (!tpl || !tpl.id) continue;
    var prevTpl = tplMap[tpl.id];
    if (!prevTpl) {
      tplMap[tpl.id] = tpl;
    } else {
      var tplUA = String(prevTpl.updatedAt || '');
      var tplUB = String(tpl.updatedAt || '');
      if (tplUB >= tplUA) {
        tplMap[tpl.id] = tpl;
      }
    }
  }
  var mergedTemplates = Object.keys(tplMap).map(function (id) { return tplMap[id]; });
  mergedTemplates.sort(function (a, b) {
    var idxA = DEFAULT_FIXED_ORDER_.indexOf(a.id);
    var idxB = DEFAULT_FIXED_ORDER_.indexOf(b.id);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return String(a.id || '').localeCompare(String(b.id || ''));
  });

  // 6b. Fusionar Bóveda de Patrimonio Intocable (patrimonyItems + deletedPatrimonyIds)
  var deletedPatrimony = {};
  var existingDelPat = existing.deletedPatrimonyIds || {};
  var incomingDelPat = incoming.deletedPatrimonyIds || {};
  Object.keys(existingDelPat).forEach(function (pId) {
    deletedPatrimony[pId] = existingDelPat[pId];
  });
  Object.keys(incomingDelPat).forEach(function (pId) {
    var prevTs = String(deletedPatrimony[pId] || '');
    var nextTs = String(incomingDelPat[pId] || '');
    if (!prevTs || nextTs >= prevTs) {
      deletedPatrimony[pId] = incomingDelPat[pId];
    }
  });

  var patMap = {};
  var allPat = (existing.patrimonyItems || []).concat(incoming.patrimonyItems || []);
  for (var pIdx = 0; pIdx < allPat.length; pIdx++) {
    var pat = allPat[pIdx];
    if (!pat || !pat.id) continue;
    if (deletedPatrimony[pat.id]) continue;
    var prevPat = patMap[pat.id];
    if (!prevPat) {
      patMap[pat.id] = Object.assign({}, pat);
    } else {
      var patUA = String(prevPat.updatedAt || prevPat.createdAt || '');
      var patUB = String(pat.updatedAt || pat.createdAt || '');
      if (patUB >= patUA) {
        patMap[pat.id] = Object.assign({}, prevPat, pat);
      }
    }
  }
  var mergedPatrimony = Object.keys(patMap).map(function (id) { return patMap[id]; });
  mergedPatrimony.sort(function (a, b) {
    var diffAmt = Number(b.amount || 0) - Number(a.amount || 0);
    if (diffAmt !== 0) return diffAmt;
    return String(a.id || '').localeCompare(String(b.id || ''));
  });

  // 6c. Fusionar familyConfig por updatedAt
  var mergedFamilyConfig = incoming.familyConfig || existing.familyConfig;
  if (existing.familyConfig && incoming.familyConfig) {
    var fcUA = String(existing.familyConfig.updatedAt || '');
    var fcUB = String(incoming.familyConfig.updatedAt || '');
    if (fcUA && fcUB) {
      mergedFamilyConfig = fcUB >= fcUA ? incoming.familyConfig : existing.familyConfig;
    } else if (fcUA && !fcUB) {
      mergedFamilyConfig = existing.familyConfig;
    } else {
      mergedFamilyConfig = incoming.familyConfig;
    }
  }

  // 6d. Fusionar Suscripciones Anuales Dinámicas (annualSubscriptions + deletedAnnualSubscriptionIds)
  var deletedAnnual = {};
  var existingDelAnn = existing.deletedAnnualSubscriptionIds || {};
  var incomingDelAnn = incoming.deletedAnnualSubscriptionIds || {};
  Object.keys(existingDelAnn).forEach(function (sId) {
    deletedAnnual[sId] = existingDelAnn[sId];
  });
  Object.keys(incomingDelAnn).forEach(function (sId) {
    var prevTs = String(deletedAnnual[sId] || '');
    var nextTs = String(incomingDelAnn[sId] || '');
    if (!prevTs || nextTs >= prevTs) {
      deletedAnnual[sId] = incomingDelAnn[sId];
    }
  });

  var annMap = {};
  var allAnn = (existing.annualSubscriptions || []).concat(incoming.annualSubscriptions || []);
  for (var aIdx = 0; aIdx < allAnn.length; aIdx++) {
    var ann = allAnn[aIdx];
    if (!ann || !ann.id) continue;
    if (deletedAnnual[ann.id]) continue;
    var prevAnn = annMap[ann.id];
    if (!prevAnn) {
      annMap[ann.id] = Object.assign({}, ann);
    } else {
      var annUA = String(prevAnn.updatedAt || prevAnn.createdAt || '');
      var annUB = String(ann.updatedAt || ann.createdAt || '');
      if (annUB >= annUA) {
        annMap[ann.id] = Object.assign({}, prevAnn, ann);
      }
    }
  }
  var mergedAnnualSubscriptions = Object.keys(annMap).map(function (id) { return annMap[id]; });
  mergedAnnualSubscriptions.sort(function (a, b) {
    var diffM = Number(a.billingMonth || 1) - Number(b.billingMonth || 1);
    if (diffM !== 0) return diffM;
    return String(a.id || '').localeCompare(String(b.id || ''));
  });

  // 7. Fusionar sharedIntegrations conservando claves no vacías (googleSheetsWebhookUrl, googleSheetsUrl, geminiApiKey)
  var sharedIntegrations = {
    googleSheetsWebhookUrl: '',
    geminiApiKey: ''
  };
  var existingShared = existing.sharedIntegrations || {};
  var incomingShared = incoming.sharedIntegrations || {};
  Object.keys(existingShared).forEach(function (k) {
    if (existingShared[k] !== undefined && existingShared[k] !== null && String(existingShared[k]).trim() !== '') {
      sharedIntegrations[k] = existingShared[k];
    }
  });
  Object.keys(incomingShared).forEach(function (k) {
    if (incomingShared[k] !== undefined && incomingShared[k] !== null && String(incomingShared[k]).trim() !== '') {
      sharedIntegrations[k] = incomingShared[k];
    }
  });
  if (sharedIntegrations.googleSheetsUrl && !sharedIntegrations.googleSheetsWebhookUrl) {
    sharedIntegrations.googleSheetsWebhookUrl = sharedIntegrations.googleSheetsUrl;
  }
  if (sharedIntegrations.googleSheetsWebhookUrl && !sharedIntegrations.googleSheetsUrl) {
    sharedIntegrations.googleSheetsUrl = sharedIntegrations.googleSheetsWebhookUrl;
  }

  var existingLast = String(existing.lastUpdated || '');
  var incomingLast = String(incoming.lastUpdated || '');
  var latestStamp = incomingLast >= existingLast ? (incoming.lastUpdated || existing.lastUpdated) : existing.lastUpdated;

  var merged = Object.assign({}, existing, incoming);
  merged.version = 3;
  merged.familyConfig = mergedFamilyConfig;
  merged.categories = incoming.categories || existing.categories;
  merged.monthlyBudgets = monthlyBudgets;
  merged.fixedTemplates = mergedTemplates;
  merged.annualSubscriptions = mergedAnnualSubscriptions;
  merged.deletedAnnualSubscriptionIds = deletedAnnual;
  merged.transactions = mergedTxs;
  merged.deletedTransactionIds = deleted;
  merged.patrimonyItems = mergedPatrimony;
  merged.deletedPatrimonyIds = deletedPatrimony;
  merged.learnedContacts = learnedContacts;
  merged.sharedIntegrations = sharedIntegrations;
  merged.demoCleared = demoCleared;
  merged.lastUpdated = latestStamp || new Date().toISOString();
  return merged;
}

function getOrCreateDbSheet_(ss) {
  var sheet = ss.getSheetByName('_DB_Sync');
  if (!sheet) {
    sheet = ss.insertSheet('_DB_Sync');
    sheet.getRange('A1:B1').setValues([['JSON_STATE', 'LAST_UPDATED']]);
  }
  return sheet;
}

function getOrCreateSheet_(ss, name, index) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    if (typeof index === 'number') {
      sheet = ss.insertSheet(name, index);
    } else {
      sheet = ss.insertSheet(name);
    }
  }
  sheet.clearContents();
  return sheet;
}

function detectActiveYearMonth_(state) {
  var candidates = [];
  var txs = (state && state.transactions) || [];
  for (var i = 0; i < txs.length; i++) {
    var d = String((txs[i] && txs[i].date) || '');
    if (/^\d{4}-\d{2}/.test(d)) {
      candidates.push(d.slice(0, 7));
    }
  }
  var budgets = (state && state.monthlyBudgets) || {};
  Object.keys(budgets).forEach(function (ym) {
    if (/^\d{4}-\d{2}$/.test(ym)) {
      candidates.push(ym);
    }
  });
  if (candidates.length === 0) {
    return new Date().toISOString().slice(0, 7);
  }
  candidates.sort();
  return candidates[candidates.length - 1];
}

function extractContactName_(rawNote) {
  if (!rawNote) return 'General';
  var cleaned = String(rawNote)
    .replace(/^(pago:|traspaso a:|traspaso de:|tef a:|transferencia a:|transferencia de:)\s*/i, '')
    .replace(/\(conciliado.*?\)/gi, '')
    .replace(/\(reembolso.*?\)/gi, '')
    .replace(/\(devolución.*?\)/gi, '')
    .replace(/\(préstamo.*?\)/gi, '')
    .replace(/\(por cobrar.*?\)/gi, '')
    .replace(/\(nuestra parte.*?\)/gi, '')
    .trim();

  var parts = cleaned.split(/\s*[—\-:]\s*/);
  if (parts[0] && parts[0].trim().length >= 2) {
    cleaned = parts[0].trim();
  }
  if (!cleaned) return 'General';
  return cleaned
    .toLowerCase()
    .split(/\s+/)
    .slice(0, 3)
    .map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); })
    .join(' ');
}

function formatInstallmentBadge_(tx) {
  var total = Math.round(Number((tx && (tx.installmentsTotal || tx.installments)) || 1));
  if (!(total > 1)) return '';
  var current = Math.max(
    1,
    Math.min(total, Math.round(Number((tx && (tx.installmentNumber || tx.installmentCurrent)) || 1)))
  );
  return 'Cuota ' + current + '/' + total;
}

function updateReadableSheets_(ss, state) {
  var activeYm = detectActiveYearMonth_(state);
  var categories = (state && state.categories) || [];
  var allTxs = ((state && state.transactions) || []).slice().sort(function (a, b) {
    var byDate = String(b.date || '').localeCompare(String(a.date || ''));
    if (byDate !== 0) return byDate;
    return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
  });
  var monthTxs = allTxs.filter(function (t) {
    return String(t.date || '').indexOf(activeYm) === 0;
  });

  var husbandName = (state.familyConfig && state.familyConfig.husbandName) || 'Mauricio';
  var wifeName = (state.familyConfig && state.familyConfig.wifeName) || 'Marie';

  var catMap = {};
  categories.forEach(function (c) {
    catMap[c.id] = (c.icon ? c.icon + ' ' : '') + c.name;
  });

  // =========================================================================
  // 1. Hoja Movimientos
  // =========================================================================
  var movSheet = getOrCreateSheet_(ss, 'Movimientos', 0);
  var movHeaders = [['Fecha', 'Tipo', 'Categoría', 'Detalle / Nota', 'Monto (CLP)', 'Medio de Pago', 'Registrado Por', 'Conciliado']];
  movSheet.getRange(1, 1, 1, 8).setValues(movHeaders).setFontWeight('bold').setBackground('#0f172a').setFontColor('#ffffff');

  if (allTxs.length > 0) {
    var movRows = allTxs.map(function (t) {
      var baseTipo =
        t.type === 'expense' ? 'Gasto' :
        t.type === 'income' ? 'Ingreso' :
        t.type === 'reimbursement' ? 'Reembolso' :
        t.type === 'transfer_wife' ? 'Aporte a Fondo Familiar de ' + wifeName :
        t.type === 'cmr_payment' ? 'Pago CMR' :
        t.type === 'loan_received' ? 'Préstamo Recibido' :
        t.type === 'loan_repaid' ? 'Devolución Préstamo' :
        t.type === 'loan_given' ? 'Préstamo por Cobrar' :
        t.type === 'loan_collected' ? 'Préstamo Cobrado' :
        t.type === 'savings_withdrawal' ? 'Retiro de Ahorro' : 'Otro';
      var instBadge = formatInstallmentBadge_(t);
      var tipo = instBadge ? (baseTipo + ' (' + instBadge + ')') : baseTipo;
      var rawNote = String(t.note || '');
      var noteText = (instBadge && rawNote.toLowerCase().indexOf(instBadge.toLowerCase()) === -1)
        ? (rawNote ? (rawNote + ' (' + instBadge + ')') : instBadge)
        : rawNote;
      var cat = catMap[t.categoryId] || t.categoryId || '-';
      var autor = t.author === 'ella' ? wifeName : husbandName;
      var pmLabel = PAYMENT_LABELS_[t.paymentMethod] || t.paymentMethod || '';
      return [
        t.date || '',
        tipo,
        cat,
        noteText,
        Number(t.amount || 0),
        pmLabel,
        autor,
        t.reconciled ? 'Verificado' : 'Pendiente'
      ];
    });
    movSheet.getRange(2, 1, movRows.length, 8).setValues(movRows);
  }

  // =========================================================================
  // Cálculos ejecutivos para Resumen_Mensual, Escudo_CMR_y_Mujer y Prestamos_y_Fijos
  // =========================================================================
  var monthCfg = (state.monthlyBudgets && state.monthlyBudgets[activeYm]) || {};
  var incomeTarget = Number(monthCfg.incomeTarget || (state.familyConfig && state.familyConfig.monthlyIncomeTarget) || 2350000);
  var savingsGoal = Number(monthCfg.savingsGoal || (state.familyConfig && state.familyConfig.monthlySavingsGoal) || 250000);

  var realIncome = 0;
  var totalExpense = 0;
  var cmrSpentMonth = 0;
  var cmrPaidMonth = 0;
  var wifeTransferredMonth = 0;
  var wifeSpentMonth = 0;

  var spentByCat = {};
  categories.forEach(function (c) {
    spentByCat[c.id] = 0;
  });

  monthTxs.forEach(function (tx) {
    var amt = Number(tx.amount || 0);
    if (tx.type === 'income') {
      realIncome += amt;
    } else if (tx.type === 'expense') {
      totalExpense += amt;
      spentByCat[tx.categoryId] = (spentByCat[tx.categoryId] || 0) + amt;
      if (tx.paymentMethod === 'cmr_falabella') {
        cmrSpentMonth += amt;
      }
      if (tx.paymentMethod === 'cuenta_mujer') {
        wifeSpentMonth += amt;
      }
    } else if (tx.type === 'reimbursement') {
      totalExpense = Math.max(0, totalExpense - amt);
      spentByCat[tx.categoryId] = Math.max(0, (spentByCat[tx.categoryId] || 0) - amt);
    } else if (tx.type === 'transfer_wife') {
      wifeTransferredMonth += amt;
    } else if (tx.type === 'cmr_payment') {
      cmrPaidMonth += amt;
    }
  });

  var cmrCumulativeSpent = 0;
  var cmrCumulativePaid = 0;
  var wifeCumulativeTransferred = 0;
  var wifeCumulativeSpent = 0;
  var loanLedger = {};

  allTxs.forEach(function (tx) {
    var amt = Number(tx.amount || 0);
    var txYm = String(tx.date || '').slice(0, 7);
    if (txYm <= activeYm) {
      if (tx.type === 'expense' && tx.paymentMethod === 'cmr_falabella') {
        cmrCumulativeSpent += amt;
      } else if (tx.type === 'cmr_payment') {
        cmrCumulativePaid += amt;
      } else if (tx.type === 'transfer_wife') {
        wifeCumulativeTransferred += amt;
      } else if (tx.type === 'expense' && tx.paymentMethod === 'cuenta_mujer') {
        wifeCumulativeSpent += amt;
      }
    }

    if (
      tx.type === 'loan_received' ||
      tx.type === 'loan_repaid' ||
      tx.type === 'loan_given' ||
      tx.type === 'loan_collected'
    ) {
      var contactName = extractContactName_(tx.note);
      var key = contactName.toLowerCase();
      if (!loanLedger[key]) {
        loanLedger[key] = {
          name: contactName,
          loan_received: 0,
          loan_repaid: 0,
          loan_given: 0,
          loan_collected: 0,
          lastDate: tx.date || ''
        };
      }
      var entry = loanLedger[key];
      if (String(tx.date || '') >= String(entry.lastDate || '')) {
        entry.lastDate = tx.date || '';
      }
      entry[tx.type] = (entry[tx.type] || 0) + amt;
    }
  });

  var effectiveIncome = realIncome > 0 ? realIncome : incomeTarget;
  var availableReal = effectiveIncome - savingsGoal - totalExpense;

  // =========================================================================
  // 2. Hoja Resumen_Mensual
  // =========================================================================
  var resSheet = getOrCreateSheet_(ss, 'Resumen_Mensual');
  var resRows = [
    ['RESUMEN EJECUTIVO MENSUAL — FINANZAS FAMILIAR', activeYm, '', '', '', ''],
    ['Indicador Clave', 'Monto (CLP)', 'Meta / Referencia (CLP)', 'Diferencia / Estado', 'Detalle Ejecutivo', ''],
    ['Ingresos Reales vs Meta', realIncome, incomeTarget, effectiveIncome, realIncome > 0 ? 'Ingreso real registrado en el mes' : 'Usando meta mensual configurada', ''],
    ['Meta de Ahorro Intocable', savingsGoal, savingsGoal, 'PROTEGIDO', 'Se separa al inicio del mes antes de gastar', ''],
    ['Total Gastado en el Mes', totalExpense, effectiveIncome - savingsGoal, (effectiveIncome - savingsGoal) - totalExpense, 'Suma neta de gastos reales del mes', ''],
    ['Disponible Real del Mes', availableReal, effectiveIncome - savingsGoal, availableReal >= 0 ? 'SALUDABLE' : 'SOBREGIRO', 'Ingresos efectivos - Meta de ahorro - Total gastado', ''],
    ['', '', '', '', '', ''],
    ['Categoría', 'Presupuesto (CLP)', 'Gastado (CLP)', 'Disponible (CLP)', '% Usado', 'Estado']
  ];

  categories.forEach(function (cat) {
    var catBudgets = monthCfg.categories || {};
    var budget = Number(catBudgets[cat.id] !== undefined ? catBudgets[cat.id] : (cat.defaultBudget || 0));
    var spent = Number(spentByCat[cat.id] || 0);
    var avail = budget - spent;
    var pct = budget > 0 ? Math.round((spent / budget) * 100) : 0;
    var status = pct >= 95 ? 'ROJO' : (pct >= 75 ? 'AMARILLO' : 'VERDE');
    resRows.push([
      (cat.icon ? cat.icon + ' ' : '') + cat.name,
      budget,
      spent,
      avail,
      pct + '%',
      status
    ]);
  });

  resSheet.getRange(1, 1, resRows.length, 6).setValues(resRows);
  resSheet.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#0f172a').setFontColor('#ffffff');
  resSheet.getRange(2, 1, 1, 6).setFontWeight('bold').setBackground('#1e293b').setFontColor('#ffffff');
  resSheet.getRange(8, 1, 1, 6).setFontWeight('bold').setBackground('#0f172a').setFontColor('#ffffff');

  // =========================================================================
  // 3. Hoja Escudo_CMR_y_Mujer
  // =========================================================================
  var escudoSheet = getOrCreateSheet_(ss, 'Escudo_CMR_y_Mujer');
  var cmrPendingReserve = Math.max(0, cmrCumulativeSpent - cmrCumulativePaid);
  var wifePendingBalance = wifeCumulativeTransferred - wifeCumulativeSpent;

  var cmrInstNotes = [];
  var cmrInstallmentRows = [];
  monthTxs.forEach(function (tx) {
    if (tx.type === 'expense' && tx.paymentMethod === 'cmr_falabella') {
      var badge = formatInstallmentBadge_(tx);
      if (badge) {
        var noteClean = String(tx.note || 'Compra CMR').trim();
        cmrInstNotes.push(noteClean + ' (' + badge + ')');
        cmrInstallmentRows.push([
          '↳ Compra CMR en cuotas (' + (tx.date || activeYm) + '): ' + noteClean + ' — ' + badge,
          Number(tx.amount || 0),
          Number(tx.amount || 0),
          badge + ' activa en el mes e incluida en el Escudo CMR'
        ]);
      }
    }
  });

  var escudoRows = [
    ['PANEL EJECUTIVO — ESCUDO CMR FALABELLA Y FONDO FAMILIAR DE ' + wifeName.toUpperCase(), activeYm, '', ''],
    ['Sección / Indicador', 'Monto Mes Activo (CLP)', 'Acumulado con Arrastre (CLP)', 'Explicación Operativa'],
    ['ESCUDO CMR FALABELLA', '', '', 'Protección contra pago de tarjeta con ahorros'],
    [
      'Compras con CMR del mes',
      cmrSpentMonth,
      cmrCumulativeSpent,
      cmrInstNotes.length > 0
        ? 'Gastos pagados con tarjeta CMR Falabella — Incluye cuotas: ' + cmrInstNotes.join(', ')
        : 'Gastos pagados con tarjeta CMR Falabella'
    ],
    ['Pagos de facturación CMR registrados', cmrPaidMonth, cmrCumulativePaid, 'Abonos/pagos hechos desde Banco de Chile a CMR'],
    ['Reserva Intocable pendiente en Banco de Chile', Math.max(0, cmrSpentMonth - cmrPaidMonth), cmrPendingReserve, 'Dinero que DEBES mantener intacto en Banco de Chile para pagar CMR'],
    ['', '', '', ''],
    ['FONDO FAMILIAR EN CUENTA DE ' + wifeName.toUpperCase(), '', '', 'Gestión colaborativa en equipo sin duplicar gastos al transferir a ' + wifeName],
    ['Aportes transferidos al Fondo Familiar de ' + wifeName, wifeTransferredMonth, wifeCumulativeTransferred, 'Traspasos internos desde Banco de Chile al fondo familiar (no cuentan como gasto aún)'],
    ['Compras Familiares Registradas por ' + wifeName, wifeSpentMonth, wifeCumulativeSpent, 'Compras familiares reales pagadas desde la cuenta de ' + wifeName],
    ['Fondo Familiar Disponible en Cuenta de ' + wifeName, wifeTransferredMonth - wifeSpentMonth, wifePendingBalance, 'Fondo familiar disponible en la cuenta de ' + wifeName + ' para próximas compras del hogar']
  ];

  for (var ci = 0; ci < cmrInstallmentRows.length; ci++) {
    escudoRows.push(cmrInstallmentRows[ci]);
  }

  escudoSheet.getRange(1, 1, escudoRows.length, 4).setValues(escudoRows);
  escudoSheet.getRange(1, 1, 1, 4).setFontWeight('bold').setBackground('#0f172a').setFontColor('#ffffff');
  escudoSheet.getRange(2, 1, 1, 4).setFontWeight('bold').setBackground('#1e293b').setFontColor('#ffffff');
  escudoSheet.getRange(3, 1, 1, 4).setFontWeight('bold').setBackground('#dcfce7').setFontColor('#14532d');
  escudoSheet.getRange(8, 1, 1, 4).setFontWeight('bold').setBackground('#fce7f3').setFontColor('#831843');

  // =========================================================================
  // 4. Hoja Prestamos_y_Fijos
  // =========================================================================
  var pfSheet = getOrCreateSheet_(ss, 'Prestamos_y_Fijos');
  var pfRows = [
    ['LIBRO DE PRÉSTAMOS POR CONTACTO Y PLANTILLA DE GASTOS FIJOS', activeYm, '', '', '', '', '', ''],
    ['Persona / Contacto', 'Préstamo Recibido (loan_received)', 'Devolución Pagada (loan_repaid)', 'Préstamo Otorgado (loan_given)', 'Préstamo Cobrado (loan_collected)', 'Debemos (CLP)', 'Nos Deben (CLP)', 'Estado / Última Fecha']
  ];

  var loanKeys = Object.keys(loanLedger).sort();
  if (loanKeys.length === 0) {
    pfRows.push(['Sin préstamos registrados', 0, 0, 0, 0, 0, 0, 'AL DÍA']);
  } else {
    loanKeys.forEach(function (k) {
      var item = loanLedger[k];
      var owedByUs = Math.max(0, Number(item.loan_received || 0) - Number(item.loan_repaid || 0));
      var owedToUs = Math.max(0, Number(item.loan_given || 0) - Number(item.loan_collected || 0));
      var estado = (owedByUs === 0 && owedToUs === 0) ? 'SALDADO (' + item.lastDate + ')' : 'PENDIENTE (' + item.lastDate + ')';
      pfRows.push([
        item.name,
        Number(item.loan_received || 0),
        Number(item.loan_repaid || 0),
        Number(item.loan_given || 0),
        Number(item.loan_collected || 0),
        owedByUs,
        owedToUs,
        estado
      ]);
    });
  }

  pfRows.push(['', '', '', '', '', '', '', '']);
  pfRows.push(['ID Plantilla', 'Gasto Fijo Mensual', 'Categoría', 'Monto Estimado (CLP)', 'Día Vencimiento', 'Medio Pago Habitual', 'Estado en ' + activeYm, 'Monto Pagado Real (CLP)']);

  var fixedHeaderRowIdx = pfRows.length;
  var templates = (state && state.fixedTemplates) || [];
  templates.forEach(function (tpl) {
    var paidTx = null;
    for (var m = 0; m < monthTxs.length; m++) {
      if (monthTxs[m].fixedTemplateId === tpl.id) {
        paidTx = monthTxs[m];
        break;
      }
    }
    pfRows.push([
      tpl.id || '',
      tpl.name || '',
      catMap[tpl.categoryId] || tpl.categoryId || '🏠 Vivienda y Cuentas Fijas',
      Number(tpl.estimatedAmount || 0),
      'Día ' + (tpl.dayOfMonth || 5),
      PAYMENT_LABELS_[tpl.defaultPaymentMethod] || tpl.defaultPaymentMethod || '',
      paidTx ? 'PAGADO' : 'PENDIENTE',
      paidTx ? Number(paidTx.amount || 0) : 0
    ]);
  });

  pfSheet.getRange(1, 1, pfRows.length, 8).setValues(pfRows);
  pfSheet.getRange(1, 1, 1, 8).setFontWeight('bold').setBackground('#0f172a').setFontColor('#ffffff');
  pfSheet.getRange(2, 1, 1, 8).setFontWeight('bold').setBackground('#1e293b').setFontColor('#ffffff');
  pfSheet.getRange(fixedHeaderRowIdx, 1, 1, 8).setFontWeight('bold').setBackground('#0f172a').setFontColor('#ffffff');
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
