// Escáner de Boletas y Clasificador de Cartolas con IA usando @google/genai (>= 2.29.1) y gemini-3.8-flash
// Sigue la especificación de Interactions API con salida estructurada JSON

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

const RECEIPT_JSON_SCHEMA = {
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
- "salud_farmacia": medicamentos, vitaminas, termómetros, farmacia.
- "hogar_varios": detergente, artículos de limpieza/aseo hogar, ampolletas, menaje.
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

  return JSON.parse(outputText);
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
- "gustos_personales": suscripciones digitales (Apple, Netflix, Spotify), licores/botillerías, tiendas de ropa/retail, compras personales.
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
  return {
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
  };
}
