// Escáner de Boletas, Clasificador de Cartolas y Asesor Financiero Familiar con IA
// Usando @google/genai (>= 2.29.1) y gemini-3.8-flash con Interactions API y salida estructurada JSON

export async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve({
        base64,
        mimeType: file.type || 'image/jpeg'
      });
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

export const RECEIPT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    merchant: {
      type: 'string',
      description: 'Nombre del comercio en la boleta (ej. Lider, Jumbo, Cruz Verde)'
    },
    date: {
      type: 'string',
      description: 'Fecha de la boleta en formato YYYY-MM-DD'
    },
    totalAmount: {
      type: 'integer',
      description: 'Monto total de la boleta en pesos chilenos (entero sin decimales)'
    },
    splits: {
      type: 'array',
      description: 'Desglose del total agrupado por las categorías familiares',
      items: {
        type: 'object',
        properties: {
          categoryId: {
            type: 'string',
            enum: [
              'supermercado',
              'hija',
              'gatos_mascotas',
              'suscripciones',
              'salud_farmacia',
              'transporte',
              'delivery_salidas',
              'hogar_varios',
              'gustos_personales',
              'vivienda_fijos',
              'imprevistos'
            ]
          },
          amount: {
            type: 'integer',
            description: 'Suma en CLP correspondiente a esta categoría'
          },
          summary: {
            type: 'string',
            description: 'Resumen breve de los productos agrupados en esta categoría (ej. Pañales Pampers y colados)'
          }
        },
        required: ['categoryId', 'amount', 'summary']
      }
    }
  },
  required: ['merchant', 'totalAmount', 'splits']
};

/**
 * Normaliza y cuadra al peso exacto los splits de una boleta escaneada respecto de totalAmount.
 * Si la suma de splits devuelta por el modelo difiere por unos pesos de totalAmount,
 * ajusta automáticamente la diferencia en el split principal y registra `splitDifferenceAdjusted`
 * para que nunca descuadre la contabilidad ni la conciliación bancaria.
 */
export function reconcileReceiptSplits(rawReceipt) {
  const receipt = rawReceipt && typeof rawReceipt === 'object' ? { ...rawReceipt } : {};
  const rawSplits = Array.isArray(receipt.splits)
    ? receipt.splits.map((s) => ({
        categoryId: s?.categoryId || 'supermercado',
        amount: Math.max(0, Math.round(Number(s?.amount || 0))),
        summary: String(s?.summary || 'Productos de boleta')
      }))
    : [];

  const initialSplitSum = rawSplits.reduce((acc, s) => acc + s.amount, 0);
  const totalAmount =
    receipt.totalAmount !== undefined && receipt.totalAmount !== null && Number(receipt.totalAmount) > 0
      ? Math.max(0, Math.round(Number(receipt.totalAmount)))
      : initialSplitSum;

  if (rawSplits.length === 0) {
    return {
      merchant: String(receipt.merchant || 'Comercio'),
      date: receipt.date || new Date().toISOString().slice(0, 10),
      totalAmount,
      splits:
        totalAmount > 0
          ? [
              {
                categoryId: 'supermercado',
                amount: totalAmount,
                summary: String(receipt.merchant || 'Compra general')
              }
            ]
          : [],
      splitDifferenceAdjusted: totalAmount
    };
  }

  const diff = totalAmount - initialSplitSum;

  if (diff !== 0) {
    // Buscar el split de mayor monto que pueda absorber la diferencia sin quedar negativo
    let bestIdx = 0;
    for (let i = 1; i < rawSplits.length; i++) {
      if (rawSplits[i].amount > rawSplits[bestIdx].amount) {
        bestIdx = i;
      }
    }

    if (rawSplits[bestIdx].amount + diff >= 0) {
      rawSplits[bestIdx].amount += diff;
    } else if (totalAmount > 0 && initialSplitSum > 0) {
      // Si diff es negativo y mayor que un único split, reescalar proporcionalmente y cuadrar el residuo
      let runningSum = 0;
      for (let i = 0; i < rawSplits.length; i++) {
        const scaled = Math.floor((rawSplits[i].amount * totalAmount) / initialSplitSum);
        rawSplits[i].amount = scaled;
        runningSum += scaled;
      }
      rawSplits[0].amount += totalAmount - runningSum;
    }
  }

  return {
    ...receipt,
    merchant: String(receipt.merchant || 'Comercio'),
    totalAmount,
    splits: rawSplits,
    splitDifferenceAdjusted: diff
  };
}

export async function scanReceiptWithGemini(imageFile, apiKey) {
  if (!apiKey || !apiKey.trim()) {
    throw new Error('Ingresa tu clave gratuita de Gemini API en la pestaña "Nube, Excel e IA" para escanear fotos reales.');
  }

  const { base64, mimeType } = await fileToBase64(imageFile);

  const prompt = `Analiza esta foto de una boleta de compra en Chile (en pesos chilenos CLP, donde el punto suele separar miles).
Extrae el nombre del comercio, la fecha (YYYY-MM-DD) y el monto total pagado.
Además, agrupa los productos comprados según estas categorías familiares para que podamos dividir el gasto:
- "supermercado": alimentos generales, abarrotes, verduras, carnes, lácteos familiares.
- "hija": pañales, toallitas húmedas, leche de fórmula/nan/nido infantil, colados, ropa o artículos de bebé/niña.
- "gatos_mascotas": comida/alimento para gatos o mascotas, arena sanitaria, Churu, snacks o artículos veterinarios.
- "salud_farmacia": medicamentos, vitaminas, termómetros, farmacia.
- "hogar_varios": detergente, artículos de limpieza/aseo hogar, ampolletas, menaje.
- "suscripciones": membresías o suscripciones digitales.
- "gustos_personales": alcohol, vinos, cervezas, snacks/antojos caros, cosmética, juguetes o compras no esenciales.
- "delivery_salidas": comida preparada de restaurante o cafetería.
Asegúrate de que la suma de "splits" cuadre exactamente con "totalAmount".`;

  const { GoogleGenAI } = await import('https://esm.sh/@google/genai@2.29.1');
  const client = new GoogleGenAI({ apiKey: apiKey.trim() });

  const interaction = await client.interactions.create({
    model: 'gemini-3.8-flash',
    input: [
      {
        type: 'image',
        data: base64,
        mime_type: mimeType
      },
      {
        type: 'text',
        text: prompt
      }
    ],
    response_format: {
      type: 'text',
      mime_type: 'application/json',
      schema: RECEIPT_JSON_SCHEMA
    }
  });

  const outputText = interaction.output_text;
  if (!outputText) {
    throw new Error('El modelo no devolvió texto estructurado.');
  }

  const parsed = JSON.parse(outputText);
  return reconcileReceiptSplits(parsed);
}

const STATEMENT_CLASSIFY_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          index: { type: 'integer' },
          categoryId: {
            type: 'string',
            enum: [
              'supermercado',
              'hija',
              'gatos_mascotas',
              'suscripciones',
              'salud_farmacia',
              'transporte',
              'delivery_salidas',
              'hogar_varios',
              'gustos_personales',
              'vivienda_fijos',
              'imprevistos'
            ]
          }
        },
        required: ['index', 'categoryId']
      }
    }
  },
  required: ['items']
};

/**
 * Usa Gemini 3.8 Flash para clasificar glosas de cartolas bancarias chilenas que no estén en el diccionario local
 */
export async function classifyStatementRowsWithGemini(analyzedRows, apiKey) {
  if (!apiKey || !apiKey.trim()) {
    throw new Error('Primero guarda tu Gemini API Key en la pestaña "Nube, Excel e IA".');
  }

  const targetList = analyzedRows
    .map((r, index) => ({ index, description: r.description, amount: r.amount, status: r.status }))
    .filter((r) => r.status === 'forgotten_new');

  if (targetList.length === 0) return analyzedRows;

  const prompt = `Eres un experto en finanzas personales en Chile. Clasifica cada uno de estos comercios/glosas de una cartola bancaria chilena en la categoría familiar más adecuada:
Categorías permitidas:
- "supermercado": supermercados, minimarkets, panaderías, pastelerías, almacenes de barrio, verdulerías, carnicerías.
- "hija": artículos de bebé/niña, pañales, ropa infantil, jardín infantil, pediatría.
- "salud_farmacia": farmacias, médicos, clínicas, bonos, laboratorios.
- "transporte": transporte público (Red Movilidad, Metro, Bip), bencineras, autopistas, estacionamientos, Uber/Cabify.
- "delivery_salidas": restaurantes, cafeterías, bares, heladerías, apps de delivery.
- "hogar_varios": ferreterías, artículos de casa, aseo, lavandería.
- "gatos_mascotas": tiendas de mascotas (SuperZoo, Pet Happy, Braloy, Laika), alimento o arena para gatos, clínicas veterinarias.
- "suscripciones": suscripciones digitales y apps (Apple, iCloud, Netflix, Spotify, YouTube, Disney+, ChatGPT, almacenamiento nube).
- "gustos_personales": licores/botillerías, tiendas de ropa/retail, compras personales.
- "vivienda_fijos": cuentas básicas (luz, agua, gas, internet, telecomunicaciones, gastos comunes, arriendo).
- "imprevistos": otros no identificables.

Movimientos a clasificar:
${JSON.stringify(targetList)}`;

  const { GoogleGenAI } = await import('https://esm.sh/@google/genai@2.29.1');
  const client = new GoogleGenAI({ apiKey: apiKey.trim() });

  const interaction = await client.interactions.create({
    model: 'gemini-3.8-flash',
    input: prompt,
    response_format: {
      type: 'text',
      mime_type: 'application/json',
      schema: STATEMENT_CLASSIFY_SCHEMA
    }
  });

  const parsed = JSON.parse(interaction.output_text || '{"items":[]}');
  (parsed.items || []).forEach((item) => {
    if (analyzedRows[item.index] && item.categoryId) {
      analyzedRows[item.index].suggestedCategoryId = item.categoryId;
    }
  });

  return analyzedRows;
}

// Simulación instantánea de boleta mixta (Jumbo: Comida + Pañales Hija + Vino/Gustos)
export function getDemoScannedReceipt(todayISO) {
  return reconcileReceiptSplits({
    merchant: 'Supermercado Jumbo',
    date: todayISO,
    totalAmount: 89400,
    splits: [
      {
        categoryId: 'supermercado',
        amount: 51900,
        summary: 'Pollo, verduras, arroz, huevos, leche, pan y frutas'
      },
      {
        categoryId: 'hija',
        amount: 24500,
        summary: 'Pañales Pampers XXG + Pack Toallitas Húmedas Bebé'
      },
      {
        categoryId: 'gustos_personales',
        amount: 13000,
        summary: 'Pack cervezas + helado familiar y chocolates'
      }
    ]
  });
}

// ============================================================================
// MOTOR DE ASESOR FINANCIERO FAMILIAR CON IA (GEMINI 3.8 FLASH + LOCAL 0ms)
// ============================================================================

export const FAMILY_AUDIT_SCHEMA = {
  type: 'object',
  properties: {
    healthScore: {
      type: 'integer',
      description: 'Puntaje de salud financiera familiar del mes entre 0 y 100'
    },
    statusBadge: {
      type: 'string',
      enum: ['EXCELENTE', 'SALUDABLE', 'ATENCION', 'CRITICO'],
      description: 'Estado ejecutivo del presupuesto familiar del mes'
    },
    headline: {
      type: 'string',
      description: 'Titular ejecutivo empático y directo para Mauricio y Marie'
    },
    dailySafeSpend: {
      type: 'integer',
      description: 'Monto sugerido máximo por día para el resto del mes en CLP'
    },
    cmrShieldDiagnosis: {
      type: 'string',
      description: 'Diagnóstico claro del Escudo CMR Falabella y su reserva en Banco de Chile'
    },
    wifeAccountDiagnosis: {
      type: 'string',
      description: 'Diagnóstico claro de los fondos transferidos y gastados en Cuenta Mujer'
    },
    categoryAlerts: {
      type: 'array',
      description: 'Alertas detalladas por categoría con severidad y consejo accionable',
      items: {
        type: 'object',
        properties: {
          categoryName: { type: 'string' },
          severity: {
            type: 'string',
            enum: ['CRITICO', 'ATENCION', 'OK']
          },
          message: { type: 'string' },
          actionableTip: { type: 'string' }
        },
        required: ['categoryName', 'severity', 'message', 'actionableTip']
      }
    },
    top3Actions: {
      type: 'array',
      description: 'Las 3 acciones concretas más importantes para esta semana',
      items: { type: 'string' }
    }
  },
  required: [
    'healthScore',
    'statusBadge',
    'headline',
    'dailySafeSpend',
    'cmrShieldDiagnosis',
    'wifeAccountDiagnosis',
    'categoryAlerts',
    'top3Actions'
  ]
};

function fmtCLP(amount) {
  const num = Math.round(Number(amount || 0));
  const sign = num < 0 ? '-' : '';
  return `${sign}$${Math.abs(num).toLocaleString('es-CL')}`;
}

function normalizeCategoriesBreakdown(rawCategories) {
  if (!rawCategories) return [];
  if (Array.isArray(rawCategories)) {
    return rawCategories.map((c) => {
      const budget = Math.max(0, Math.round(Number(c?.budget ?? c?.defaultBudget ?? 0)));
      const spent = Math.max(0, Math.round(Number(c?.spent ?? c?.netSpent ?? 0)));
      const remaining = Math.round(Number(c?.remaining ?? budget - spent));
      const pct =
        c?.pct !== undefined
          ? Math.round(Number(c.pct))
          : budget > 0
            ? Math.round((spent / budget) * 100)
            : spent > 0
              ? 100
              : 0;
      return {
        id: String(c?.id || c?.categoryId || c?.name || 'general'),
        name: String(c?.name || c?.categoryName || c?.id || 'Categoría'),
        budget,
        spent,
        remaining,
        pct
      };
    });
  }
  if (typeof rawCategories === 'object') {
    return Object.entries(rawCategories).map(([key, val]) => {
      const budget = Math.max(0, Math.round(Number(val?.budget ?? 0)));
      const spent = Math.max(0, Math.round(Number(val?.spent ?? 0)));
      const remaining = budget - spent;
      const pct = budget > 0 ? Math.round((spent / budget) * 100) : spent > 0 ? 100 : 0;
      return {
        id: key,
        name: String(val?.name || val?.categoryName || key),
        budget,
        spent,
        remaining,
        pct
      };
    });
  }
  return [];
}

function normalizeLoansSummary(rawLoans) {
  if (!rawLoans) {
    return { owedByUs: 0, owedToUs: 0, people: [] };
  }
  if (Array.isArray(rawLoans)) {
    let owedByUs = 0;
    let owedToUs = 0;
    const people = rawLoans.map((p) => {
      const byUs = Math.max(0, Math.round(Number(p?.owedByUs ?? 0)));
      const toUs = Math.max(0, Math.round(Number(p?.owedToUs ?? 0)));
      owedByUs += byUs;
      owedToUs += toUs;
      return {
        name: String(p?.name || p?.person || 'Contacto'),
        owedByUs: byUs,
        owedToUs: toUs
      };
    });
    return { owedByUs, owedToUs, people };
  }
  if (typeof rawLoans === 'object') {
    const peopleList = Array.isArray(rawLoans.people || rawLoans.loansByPerson)
      ? (rawLoans.people || rawLoans.loansByPerson).map((p) => ({
          name: String(p?.name || p?.person || 'Contacto'),
          owedByUs: Math.max(0, Math.round(Number(p?.owedByUs ?? 0))),
          owedToUs: Math.max(0, Math.round(Number(p?.owedToUs ?? 0)))
        }))
      : [];
    const sumByUsFromPeople = peopleList.reduce((acc, p) => acc + p.owedByUs, 0);
    const sumToUsFromPeople = peopleList.reduce((acc, p) => acc + p.owedToUs, 0);
    const owedByUs = Math.max(
      0,
      Math.round(Number(rawLoans.owedByUs ?? rawLoans.totalLoansOwedToOthers ?? sumByUsFromPeople))
    );
    const owedToUs = Math.max(
      0,
      Math.round(Number(rawLoans.owedToUs ?? rawLoans.totalLoansReceivable ?? sumToUsFromPeople))
    );
    return { owedByUs, owedToUs, people: peopleList };
  }
  return { owedByUs: 0, owedToUs: 0, people: [] };
}

function estimateDaysRemaining(activeYearMonth, explicitDaysRemaining) {
  if (explicitDaysRemaining !== undefined && Number(explicitDaysRemaining) > 0) {
    return Math.max(1, Math.round(Number(explicitDaysRemaining)));
  }
  const ym = String(activeYearMonth || '').slice(0, 7);
  const match = ym.match(/^(\d{4})-(\d{2})$/);
  if (!match) return 10;

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const daysInMonth = new Date(year, month, 0).getDate();
  const now = new Date();
  const currentYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  if (ym === currentYm) {
    return Math.max(1, daysInMonth - now.getDate() + 1);
  }
  return 10;
}

/**
 * Genera instantáneamente en 0 ms (sin requerir API key ni internet, o como fallback automático)
 * un diagnóstico inteligente, hiper-personalizado y calculado matemáticamente a partir de `auditInput`.
 */
export function getLocalSmartFamilyAudit(auditInput = {}) {
  const activeYearMonth = String(auditInput.activeYearMonth || new Date().toISOString().slice(0, 7));
  const income = Math.max(0, Math.round(Number(auditInput.income ?? 2350000)));
  const savingsGoal = Math.max(0, Math.round(Number(auditInput.savingsGoal ?? 250000)));
  const totalExpenses = Math.max(0, Math.round(Number(auditInput.totalExpenses ?? 0)));
  const spendableAfterSavings = Math.max(0, income - savingsGoal);
  const availableReal = Math.round(
    Number(auditInput.availableReal !== undefined ? auditInput.availableReal : spendableAfterSavings - totalExpenses)
  );

  const cmrSpent = Math.max(0, Math.round(Number(auditInput.cmrSpent ?? 0)));
  const cmrPaid = Math.max(0, Math.round(Number(auditInput.cmrPaid ?? 0)));
  const cmrReserveNeeded = Math.max(
    0,
    Math.round(
      Number(auditInput.cmrReserveNeeded !== undefined ? auditInput.cmrReserveNeeded : Math.max(0, cmrSpent - cmrPaid))
    )
  );

  const wifeTransferred = Math.max(0, Math.round(Number(auditInput.wifeTransferred ?? 0)));
  const wifeSpent = Math.max(0, Math.round(Number(auditInput.wifeSpent ?? 0)));
  const wifeBalance = Math.round(
    Number(auditInput.wifeBalance !== undefined ? auditInput.wifeBalance : wifeTransferred - wifeSpent)
  );

  const categories = normalizeCategoriesBreakdown(auditInput.categoriesBreakdown);
  const loans = normalizeLoansSummary(auditInput.pendingLoansSummary);
  const unpaidFixedCount = Math.max(
    0,
    Math.round(
      Number(
        Array.isArray(auditInput.unpaidFixedCount)
          ? auditInput.unpaidFixedCount.length
          : (auditInput.unpaidFixedCount ?? 0)
      )
    )
  );

  const daysRemaining = estimateDaysRemaining(activeYearMonth, auditInput.daysRemaining);
  const dailySafeSpend = availableReal > 0 ? Math.max(0, Math.round(availableReal / daysRemaining)) : 0;

  // Cálculo matemático del puntaje de salud (0 - 100)
  let score = 100;
  const spendRatio = spendableAfterSavings > 0 ? totalExpenses / spendableAfterSavings : totalExpenses > 0 ? 1.25 : 0;

  if (availableReal < 0) {
    const deficitRatio = spendableAfterSavings > 0 ? Math.abs(availableReal) / spendableAfterSavings : 0.5;
    score -= 35 + Math.min(25, Math.round(deficitRatio * 60));
  } else if (spendRatio >= 0.92) {
    score -= 18;
  } else if (spendRatio >= 0.78) {
    score -= 8;
  }

  const exceededCategories = categories.filter((c) => c.budget > 0 && c.pct >= 100);
  const warningCategories = categories.filter((c) => c.budget > 0 && c.pct >= 80 && c.pct < 100);

  score -= Math.min(30, exceededCategories.length * 11);
  score -= Math.min(15, warningCategories.length * 5);

  // Riesgo en Escudo CMR Falabella
  const cmrUncoveredRisk = cmrReserveNeeded > 0 && (availableReal < 0 || cmrReserveNeeded > Math.max(0, availableReal));
  if (cmrUncoveredRisk) {
    score -= 18;
  } else if (cmrReserveNeeded > 500000) {
    score -= 6;
  }

  // Sobregiro en Cuenta Mujer
  if (wifeBalance < 0) {
    score -= 6;
  }

  // Préstamos pendientes que debemos devolver
  if (loans.owedByUs > 0) {
    score -= Math.min(14, Math.max(5, Math.round((loans.owedByUs / Math.max(1, income)) * 100)));
  }
  if (loans.owedToUs > 0) {
    score -= 3;
  }

  // Cuentas fijas aún no pagadas
  if (unpaidFixedCount > 0) {
    score -= Math.min(10, unpaidFixedCount * 2);
  }

  const healthScore = Math.max(0, Math.min(100, Math.round(score)));

  let statusBadge = 'EXCELENTE';
  if (healthScore < 45) {
    statusBadge = 'CRITICO';
  } else if (healthScore < 70) {
    statusBadge = 'ATENCION';
  } else if (healthScore < 85) {
    statusBadge = 'SALUDABLE';
  }

  // Diagnóstico Escudo CMR Falabella
  let cmrShieldDiagnosis = '';
  if (cmrSpent === 0 && cmrReserveNeeded === 0) {
    cmrShieldDiagnosis =
      'Escudo CMR Falabella impecable: no hay compras pendientes de cubrir con tarjeta de crédito este mes.';
  } else if (cmrReserveNeeded === 0) {
    cmrShieldDiagnosis = `Escudo CMR 100% blindado: usaron ${fmtCLP(cmrSpent)} en CMR y ya abonaron ${fmtCLP(cmrPaid)}, dejando $0 de deuda pendiente.`;
  } else if (cmrUncoveredRisk) {
    const gap = cmrReserveNeeded - Math.max(0, availableReal);
    cmrShieldDiagnosis = `⚠️ ALERTA ESCUDO CMR SIN CUBRIR: deben retener ${fmtCLP(cmrReserveNeeded)} en Banco de Chile para pagar CMR (compras ${fmtCLP(cmrSpent)} menos abonos ${fmtCLP(cmrPaid)}), pero el disponible libre es de ${fmtCLP(availableReal)} (faltan ${fmtCLP(gap)}). No usen esa liquidez del banco.`;
  } else {
    cmrShieldDiagnosis = `Escudo CMR activo: han comprado ${fmtCLP(cmrSpent)} con CMR (abonos: ${fmtCLP(cmrPaid)}). Mantengan intocables ${fmtCLP(cmrReserveNeeded)} en Banco de Chile para pagar la facturación al contado sin intereses.`;
  }

  // Diagnóstico Cuenta Mujer (Marie)
  let wifeAccountDiagnosis = '';
  if (wifeTransferred === 0 && wifeSpent === 0) {
    wifeAccountDiagnosis =
      'Cuenta Mujer sin movimientos este mes ($0 transferidos por Mauricio y $0 registrados como gasto por Marie).';
  } else if (wifeBalance > 0) {
    wifeAccountDiagnosis = `Cuenta Mujer al día: Mauricio transfirió ${fmtCLP(wifeTransferred)} y Marie ha registrado compras por ${fmtCLP(wifeSpent)}, quedando ${fmtCLP(wifeBalance)} disponibles por usar o rendir sin duplicar gastos.`;
  } else if (wifeBalance === 0) {
    wifeAccountDiagnosis = `Cuenta Mujer 100% cuadrada: los ${fmtCLP(wifeTransferred)} transferidos a Marie ya fueron íntegramente respaldados en compras familiares ($0 pendientes).`;
  } else {
    wifeAccountDiagnosis = `Atención en Cuenta Mujer: Marie registró compras por ${fmtCLP(wifeSpent)} frente a ${fmtCLP(wifeTransferred)} transferidos (diferencia de ${fmtCLP(Math.abs(wifeBalance))} pagada con saldo propio o pendiente de reembolso interno).`;
  }

  // Alertas por categoría
  const categoryAlerts = [];
  const sortedCategories = categories.slice().sort((a, b) => b.pct - a.pct);

  sortedCategories.forEach((cat) => {
    if (cat.budget <= 0 && cat.spent <= 0) return;
    if (cat.pct >= 100) {
      const excess = Math.max(0, cat.spent - cat.budget);
      categoryAlerts.push({
        categoryName: cat.name,
        severity: 'CRITICO',
        message: `${cat.name} alcanzó el ${cat.pct}% de su presupuesto (${fmtCLP(cat.spent)} de ${fmtCLP(cat.budget)}, excedido en ${fmtCLP(excess)}).`,
        actionableTip: `Congelar compras no urgentes en ${cat.name} por los próximos días y reasignar holgura desde categorías en verde.`
      });
    } else if (cat.pct >= 80) {
      categoryAlerts.push({
        categoryName: cat.name,
        severity: 'ATENCION',
        message: `${cat.name} va en ${cat.pct}% del tope mensual (quedan ${fmtCLP(Math.max(0, cat.remaining))} disponibles de ${fmtCLP(cat.budget)}).`,
        actionableTip: `Limitar ${cat.name} a un máximo de ${fmtCLP(Math.round(Math.max(0, cat.remaining) / Math.max(1, Math.ceil(daysRemaining / 7))))} por semana hasta fin de mes.`
      });
    } else if (categoryAlerts.length < 3 && cat.budget > 0) {
      categoryAlerts.push({
        categoryName: cat.name,
        severity: 'OK',
        message: `${cat.name} bajo control en ${cat.pct}% (${fmtCLP(cat.spent)} gastados, disponible ${fmtCLP(cat.remaining)}).`,
        actionableTip: `Mantener el ritmo actual en ${cat.name} para proteger la meta de ahorro de ${fmtCLP(savingsGoal)}.`
      });
    }
  });

  if (categoryAlerts.length === 0) {
    categoryAlerts.push({
      categoryName: 'Presupuesto General',
      severity: availableReal >= 0 ? 'OK' : 'CRITICO',
      message:
        availableReal >= 0
          ? `Gasto total controlado en ${fmtCLP(totalExpenses)} con ${fmtCLP(availableReal)} disponibles.`
          : `Presupuesto mensual sobregirado por ${fmtCLP(Math.abs(availableReal))}.`,
      actionableTip:
        availableReal >= 0
          ? `Mantener un tope diario de ${fmtCLP(dailySafeSpend)} durante el resto de ${activeYearMonth}.`
          : 'Pausar gastos discrecionales (delivery y gustos) esta semana para recuperar liquidez.'
    });
  }

  // Titular ejecutivo empático para Mauricio y Marie
  let headline = '';
  if (statusBadge === 'EXCELENTE') {
    headline = `¡Felicitaciones Mauricio y Marie! Su mes ${activeYearMonth} está blindado: ahorro de ${fmtCLP(savingsGoal)} protegido y ${fmtCLP(availableReal)} disponibles (${fmtCLP(dailySafeSpend)}/día).`;
  } else if (statusBadge === 'SALUDABLE') {
    headline = `Mauricio y Marie, llevan un buen pulso en ${activeYearMonth}: cuentan con ${fmtCLP(availableReal)} disponibles (${fmtCLP(dailySafeSpend)}/día) manteniendo su ahorro de ${fmtCLP(savingsGoal)}.`;
  } else if (statusBadge === 'ATENCION') {
    const mainAlertCat = exceededCategories[0]?.name || warningCategories[0]?.name || 'gastos variables';
    headline = `Mauricio y Marie, atención preventiva en ${activeYearMonth}: vigilen ${mainAlertCat} y ajusten el ritmo a ${fmtCLP(dailySafeSpend)}/día para cuidar la reserva CMR y el ahorro.`;
  } else {
    headline = `⚠️ Alerta prioritaria para Mauricio y Marie en ${activeYearMonth}: presupuesto presionado (${fmtCLP(availableReal)} libres) — toca frenar gastos variables y blindar ${fmtCLP(cmrReserveNeeded)} del Escudo CMR.`;
  }

  // Top 3 acciones concretas para esta semana
  const actions = [];

  if (cmrUncoveredRisk) {
    actions.push(
      `Bloquear inmediatamente ${fmtCLP(cmrReserveNeeded)} en Banco de Chile para cubrir el Escudo CMR Falabella y evitar intereses rotativos.`
    );
  } else if (cmrReserveNeeded > 0) {
    actions.push(
      `Separar o abonar ${fmtCLP(cmrReserveNeeded)} desde Banco de Chile a CMR Falabella para dejar la deuda de tarjeta en $0.`
    );
  }

  if (exceededCategories.length > 0) {
    const names = exceededCategories.slice(0, 2).map((c) => c.name).join(' y ');
    actions.push(
      `Pausar gastos adicionales en ${names} esta semana y cubrir solo compras indispensables con tope diario de ${fmtCLP(dailySafeSpend)}.`
    );
  } else if (warningCategories.length > 0) {
    const topWarn = warningCategories[0];
    actions.push(
      `Cuidar el saldo restante de ${fmtCLP(Math.max(0, topWarn.remaining))} en ${topWarn.name} (${topWarn.pct}% usado) antes de que pase a semáforo rojo.`
    );
  }

  if (loans.owedByUs > 0 || loans.owedToUs > 0) {
    const peopleText =
      loans.people.length > 0
        ? ` (${loans.people.map((p) => p.name).slice(0, 2).join(', ')})`
        : '';
    if (loans.owedByUs > 0 && loans.owedToUs > 0) {
      actions.push(
        `Regularizar el Libro de Préstamos${peopleText}: cobrar ${fmtCLP(loans.owedToUs)} pendientes a favor y programar devolución de ${fmtCLP(loans.owedByUs)}.`
      );
    } else if (loans.owedByUs > 0) {
      actions.push(
        `Programar la devolución de ${fmtCLP(loans.owedByUs)} de préstamos recibidos${peopleText} para limpiar pasivos informales.`
      );
    } else {
      actions.push(
        `Gestionar el cobro de ${fmtCLP(loans.owedToUs)} en cuentas compartidas/préstamos por cobrar${peopleText} para recuperar liquidez familiar.`
      );
    }
  }

  if (unpaidFixedCount > 0 && actions.length < 3) {
    actions.push(
      `Marcar y pagar las ${unpaidFixedCount} cuenta(s) fija(s) pendiente(s) del mes para despejar compromisos obligatorios.`
    );
  }

  if (wifeBalance > 0 && actions.length < 3) {
    actions.push(
      `Registrar las boletas pendientes de Marie contra los ${fmtCLP(wifeBalance)} disponibles en Cuenta Mujer para mantener el presupuesto al día.`
    );
  }

  while (actions.length < 3) {
    if (actions.length === 0) {
      actions.push(
        `Mantener el gasto diario familiar bajo ${fmtCLP(dailySafeSpend)} para cerrar ${activeYearMonth} con holgura.`
      );
    } else if (actions.length === 1) {
      actions.push(
        `Asegurar la transferencia del ahorro intocable de ${fmtCLP(savingsGoal)} y verificar la conciliación bancaria de la semana.`
      );
    } else {
      actions.push(
        'Revisar juntos 2 minutos el semáforo de categorías el domingo en ambos iPhones antes de planificar la compra semanal.'
      );
    }
  }

  return {
    healthScore,
    statusBadge,
    headline,
    dailySafeSpend,
    cmrShieldDiagnosis,
    wifeAccountDiagnosis,
    categoryAlerts,
    top3Actions: actions.slice(0, 3)
  };
}

/**
 * Genera una auditoría mensual ejecutiva con Gemini 3.8 Flash (`@google/genai` >= 2.29.1)
 * usando `client.interactions.create` y salida estructurada JSON (`FAMILY_AUDIT_SCHEMA`).
 */
export async function generateMonthlyFamilyAuditWithGemini(auditInput, apiKey) {
  if (!apiKey || !apiKey.trim()) {
    throw new Error('Ingresa tu clave gratuita de Gemini API en la pestaña "Nube, Excel e IA" para consultar al Asesor IA.');
  }

  const fallbackAudit = getLocalSmartFamilyAudit(auditInput);

  const prompt = `Eres el Asesor Financiero Familiar de Mauricio y Marie en Chile (con una hija pequeña de 20 meses).
Analiza con empatía, rigor contable y foco práctico el siguiente resumen financiero del mes (${auditInput?.activeYearMonth || 'actual'}) en pesos chilenos (CLP):

${JSON.stringify(auditInput, null, 2)}

Reglas de negocio clave:
1. "Escudo CMR Falabella": cada compra con tarjeta de crédito CMR exige mantener intocable esa misma plata en Banco de Chile (cmrReserveNeeded) para pagar el total facturado sin intereses. Si availableReal es menor que cmrReserveNeeded, adviértelo con prioridad.
2. "Cuenta Mujer": las transferencias de Mauricio a Marie (wifeTransferred) son traspasos internos; el gasto real ocurre cuando Marie compra (wifeSpent). El saldo por rendir es wifeBalance.
3. "Ahorro Intocable": la meta de ahorro (${fmtCLP(auditInput?.savingsGoal || 250000)}) se separa al inicio del mes.
4. Entrega un healthScore (0-100), statusBadge ('EXCELENTE' | 'SALUDABLE' | 'ATENCION' | 'CRITICO'), headline directo para Mauricio y Marie, dailySafeSpend en CLP enteros, cmrShieldDiagnosis, wifeAccountDiagnosis, categoryAlerts y exactamente 3 acciones concretas en top3Actions para esta semana.`;

  const { GoogleGenAI } = await import('https://esm.sh/@google/genai@2.29.1');
  const client = new GoogleGenAI({ apiKey: apiKey.trim() });

  const interaction = await client.interactions.create({
    model: 'gemini-3.8-flash',
    input: prompt,
    response_format: {
      type: 'text',
      mime_type: 'application/json',
      schema: FAMILY_AUDIT_SCHEMA
    }
  });

  const outputText = interaction.output_text;
  if (!outputText) {
    throw new Error('El modelo no devolvió el diagnóstico estructurado.');
  }

  const parsed = JSON.parse(outputText);
  return {
    healthScore: Math.max(0, Math.min(100, Math.round(Number(parsed.healthScore ?? fallbackAudit.healthScore)))),
    statusBadge: ['EXCELENTE', 'SALUDABLE', 'ATENCION', 'CRITICO'].includes(parsed.statusBadge)
      ? parsed.statusBadge
      : fallbackAudit.statusBadge,
    headline: String(parsed.headline || fallbackAudit.headline),
    dailySafeSpend: Math.max(0, Math.round(Number(parsed.dailySafeSpend ?? fallbackAudit.dailySafeSpend))),
    cmrShieldDiagnosis: String(parsed.cmrShieldDiagnosis || fallbackAudit.cmrShieldDiagnosis),
    wifeAccountDiagnosis: String(parsed.wifeAccountDiagnosis || fallbackAudit.wifeAccountDiagnosis),
    categoryAlerts:
      Array.isArray(parsed.categoryAlerts) && parsed.categoryAlerts.length > 0
        ? parsed.categoryAlerts
        : fallbackAudit.categoryAlerts,
    top3Actions:
      Array.isArray(parsed.top3Actions) && parsed.top3Actions.length === 3
        ? parsed.top3Actions.map(String)
        : fallbackAudit.top3Actions
  };
}
