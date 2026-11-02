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
 * 7. En "Quién tiene acceso": elige "Cualquier persona" (esto permite que el celular tuyo y el de Marie sincronicen sin bloqueo de sesión).
 * 8. Haz clic en "Implementar", autoriza los permisos y COPIA la "URL de la aplicación web".
 * 9. Pega esa URL en la pestaña "Nube, Excel e IA" de tu App Finanzas Familiar. ¡Listo!
 */

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
    var body = JSON.parse(e.postData.contents);
    var incoming = body.payload;

    if (!incoming) {
      return jsonResponse_({ status: 'error', message: 'Sin payload' });
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var dbSheet = getOrCreateDbSheet_(ss);
    var rawExisting = dbSheet.getRange('A2').getValue();
    var existing = rawExisting ? JSON.parse(rawExisting) : null;

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

function mergeFamilyStates_(existing, incoming) {
  if (!existing) return incoming;
  if (!incoming) return existing;

  var deleted = Object.assign({}, existing.deletedTransactionIds || {}, incoming.deletedTransactionIds || {});
  var demoCleared = Boolean(existing.demoCleared) || Boolean(incoming.demoCleared);

  var txMap = {};
  var allTxs = (existing.transactions || []).concat(incoming.transactions || []);
  for (var i = 0; i < allTxs.length; i++) {
    var tx = allTxs[i];
    if (!tx || !tx.id) continue;
    if (deleted[tx.id]) continue;
    if (demoCleared && tx.isDemo) continue;
    var prev = txMap[tx.id];
    if (!prev) {
      txMap[tx.id] = tx;
    } else {
      var prevStamp = String(prev.updatedAt || prev.createdAt || '');
      var newStamp = String(tx.updatedAt || tx.createdAt || '');
      if (newStamp >= prevStamp || (tx.reconciled && !prev.reconciled)) {
        txMap[tx.id] = tx;
      }
    }
  }

  var mergedTxs = Object.keys(txMap).map(function (k) { return txMap[k]; });
  mergedTxs.sort(function (a, b) {
    return String(b.date || '').localeCompare(String(a.date || ''));
  });

  var merged = Object.assign({}, existing, incoming);
  merged.transactions = mergedTxs;
  merged.deletedTransactionIds = deleted;
  merged.learnedContacts = Object.assign({}, existing.learnedContacts || {}, incoming.learnedContacts || {});
  merged.monthlyBudgets = Object.assign({}, existing.monthlyBudgets || {}, incoming.monthlyBudgets || {});
  merged.demoCleared = demoCleared;
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

function updateReadableSheets_(ss, state) {
  var movSheet = ss.getSheetByName('Movimientos');
  if (!movSheet) {
    movSheet = ss.insertSheet('Movimientos', 0);
  }
  movSheet.clearContents();

  var headers = [['Fecha', 'Tipo', 'Categoría', 'Detalle / Nota', 'Monto (CLP)', 'Medio de Pago', 'Registrado Por', 'Conciliado']];
  movSheet.getRange(1, 1, 1, 8).setValues(headers).setFontWeight('bold').setBackground('#0f172a').setFontColor('#ffffff');

  var catMap = {};
  (state.categories || []).forEach(function (c) {
    catMap[c.id] = c.icon + ' ' + c.name;
  });

  var txs = (state.transactions || []).slice().sort(function (a, b) {
    return String(b.date).localeCompare(String(a.date));
  });

  if (txs.length > 0) {
    var rows = txs.map(function (t) {
      var tipo =
        t.type === 'expense' ? 'Gasto' :
        t.type === 'income' ? 'Ingreso' :
        t.type === 'reimbursement' ? 'Reembolso' :
        t.type === 'transfer_wife' ? 'Traspaso a Marie' :
        t.type === 'cmr_payment' ? 'Pago CMR' :
        t.type === 'loan_received' ? 'Préstamo Recibido' :
        t.type === 'loan_repaid' ? 'Devolución Préstamo' :
        t.type === 'loan_given' ? 'Préstamo por Cobrar' :
        t.type === 'loan_collected' ? 'Préstamo Cobrado' : 'Otro';
      var cat = catMap[t.categoryId] || t.categoryId || '-';
      var autor = t.author === 'ella' ? 'Marie' : 'Mauricio';
      return [
        t.date,
        tipo,
        cat,
        t.note || '',
        Number(t.amount || 0),
        t.paymentMethod || '',
        autor,
        t.reconciled ? 'Verificado' : 'Pendiente'
      ];
    });
    movSheet.getRange(2, 1, rows.length, 8).setValues(rows);
  }
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
