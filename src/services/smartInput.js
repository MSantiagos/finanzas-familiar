import { CHILE_MERCHANT_RULES } from '../data/defaults.js';

export const INSTALLMENT_OPTIONS = [1, 3, 6, 12];

const WORD_NUMBERS = {
  un: 1,
  uno: 1,
  una: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
  quince: 15,
  dieciocho: 18,
  veinte: 20,
  veinticuatro: 24,
  veinticinco: 25,
  treinta: 30,
  cuarenta: 40,
  cincuenta: 50,
  sesenta: 60,
  setenta: 70,
  ochenta: 80,
  noventa: 90,
  cien: 100
};

// Palabras coloquiales chilenas adicionales por categoría para complementar CHILE_MERCHANT_RULES
const EXTRA_CATEGORY_KEYWORDS = [
  {
    categoryId: 'hija',
    keywords: [
      'silla auto',
      'silla de auto',
      'coche',
      'mamadera',
      'mamaderas',
      'chupete',
      'babero',
      'toallitas',
      'crema coceduras',
      'hipoglos',
      'colados',
      'ropa hija',
      'zapatos hija',
      'articulos hija',
      'compras hija',
      'niña',
      'nina',
      'guagua',
      'hija'
    ]
  },
  {
    categoryId: 'salud_farmacia',
    keywords: [
      'remedios',
      'remedio',
      'medicamentos',
      'medicamento',
      'jarabe',
      'paracetamol',
      'ibuprofeno',
      'vitaminas',
      'antibiotico',
      'doctor',
      'medico',
      'hora medica',
      'receta medica',
      'lentes',
      'kine',
      'examenes',
      'examen'
    ]
  },
  {
    categoryId: 'supermercado',
    keywords: [
      'feria y verduras',
      'verduras',
      'verdura',
      'frutas',
      'fruta',
      'marraqueta',
      'hallulla',
      'pan',
      'leche',
      'huevos',
      'queso',
      'jamon',
      'palta',
      'paltas',
      'tomates',
      'tomate',
      'papas',
      'carne',
      'pollo',
      'pescado',
      'mercaderia',
      'abarrotes',
      'almacen',
      'super'
    ]
  },
  {
    categoryId: 'transporte',
    keywords: [
      'estacionamiento',
      'parquimetro',
      'bencina',
      'combustible',
      'peaje',
      'tag',
      'taxi',
      'colectivo',
      'micro',
      'pasaje',
      'pasajes',
      'mecanico',
      'taller',
      'auto'
    ]
  },
  {
    categoryId: 'delivery_salidas',
    keywords: [
      'almuerzo',
      'cena',
      'desayuno',
      'once',
      'salida',
      'paseo',
      'helado',
      'helados',
      'pizza',
      'hamburguesa',
      'completo',
      'completos',
      'empanadas',
      'empanada',
      'delivery',
      'propina',
      'tragos',
      'postre',
      'torta'
    ]
  },
  {
    categoryId: 'hogar_varios',
    keywords: [
      'detergente',
      'cloro',
      'lavalozas',
      'confort',
      'papel higienico',
      'aseo',
      'ampolleta',
      'pilas',
      'arreglo',
      'reparacion',
      'maestro',
      'jardinero',
      'plantas',
      'planta',
      'regalo',
      'mueble',
      'sabanas',
      'toallas',
      'hogar',
      'casa'
    ]
  },
  {
    categoryId: 'vivienda_fijos',
    keywords: [
      'gastos comunes',
      'gasto comun',
      'ggcc',
      'arriendo',
      'dividendo',
      'cuenta luz',
      'cuenta agua',
      'cuenta gas',
      'balon de gas',
      'internet',
      'wifi',
      'plan celular',
      'celular',
      'calefaccion',
      'leña',
      'parafina',
      'luz',
      'agua',
      'gas'
    ]
  },
  {
    categoryId: 'gustos_personales',
    keywords: [
      'polera',
      'pantalon',
      'chaqueta',
      'vestido',
      'zapatillas',
      'ropa',
      'peluqueria',
      'barberia',
      'corte de pelo',
      'manicure',
      'uñas',
      'gimnasio',
      'gym',
      'padel',
      'futbol',
      'suscripcion',
      'libro'
    ]
  },
  {
    categoryId: 'imprevistos',
    keywords: ['urgencia', 'multa', 'parte', 'imprevisto', 'emergencia']
  }
];

// Palabras genéricas de productos (no comercios) para que detectedMerchant priorice comercios reales
const GENERIC_ITEM_KEYWORDS = new Set([
  'panal',
  'panales',
  'pañal',
  'pañales',
  'pañalera',
  'toallitas humedas',
  'toallitas',
  'formula infantil',
  'formula lactea',
  'colado',
  'jugueteria',
  'juguetería',
  'jardin infantil',
  'jardín infantil',
  'sala cuna',
  'guarderia',
  'guardería',
  'pediatra',
  'pediatria',
  'pediatría',
  'consulta pediatrica',
  'vacunatorio',
  'vacunas',
  'control niño sano',
  'urgencia pediatrica',
  'odontopediatria',
  'bebe',
  'bebé',
  'baby',
  'silla auto',
  'silla de auto',
  'coche',
  'mamadera',
  'chupete',
  'hija',
  'niña',
  'nina',
  'guagua',
  'pan',
  'verduras',
  'verdura',
  'fruta',
  'frutas',
  'carne',
  'pollo',
  'pescado',
  'huevos',
  'queso',
  'jamon',
  'palta',
  'paltas',
  'leche',
  'bencina',
  'combustible',
  'peaje',
  'estacionamiento',
  'parking',
  'parquimetro',
  'parquímetro',
  'remedios',
  'remedio',
  'medicamentos',
  'medicamento',
  'jarabe',
  'arriendo',
  'dividendo',
  'gasto comun',
  'gasto común',
  'gastos comunes',
  'luz',
  'agua',
  'gas',
  'internet',
  'ropa',
  'zapatos',
  'imprevisto',
  'emergencia',
  'multa'
]);

const SMALL_NEIGHBORHOOD_KEYWORDS = [
  'feria',
  'vega',
  'lo valledor',
  'verduleria',
  'verdulería',
  'fruteria',
  'frutería',
  'verduras',
  'verdura',
  'frutas',
  'fruta',
  'pan',
  'panaderia',
  'panadería',
  'amasanderia',
  'amasandería',
  'pasteleria',
  'pastelería',
  'marraqueta',
  'hallulla',
  'almacen',
  'almacén',
  'abarrotes',
  'minimarket',
  'mini market',
  'carniceria',
  'carnicería',
  'pescaderia',
  'pescadería',
  'tostaduria',
  'huevos',
  'queso',
  'palta',
  'paltas'
];

const BIG_SUPERMARKET_KEYWORDS = [
  'lider',
  'walmart',
  'jumbo',
  'santa isabel',
  'tottus',
  'unimarc',
  'mayorista 10',
  'acuenta',
  'alvi',
  'cugat',
  'spid',
  'erbi',
  'ok market',
  'okmarket',
  'oxxo',
  'supermercado',
  'super',
  'súper'
];

function stripAccents(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsKeyword(normalizedText, rawKeyword) {
  const normKw = stripAccents(rawKeyword).toLowerCase().trim();
  if (!normKw) return false;
  const escaped = escapeRegex(normKw);
  const startsWord = /^[a-z0-9]/i.test(normKw);
  const endsWord = /[a-z0-9]$/i.test(normKw);
  const prefix = startsWord ? '(?:^|[^a-z0-9])' : '';
  const suffix = endsWord ? '(?=$|[^a-z0-9])' : '';
  const rx = new RegExp(`${prefix}${escaped}${suffix}`, 'i');
  return rx.test(normalizedText);
}

function toTitleCase(str) {
  const LOWER_CONNECTORS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'en', 'a', 'con', 'por', 'para']);
  return String(str || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (index > 0 && LOWER_CONNECTORS.has(lower)) {
        return lower;
      }
      if (lower === 'cmr' || lower === 'tag' || lower === 'ggcc' || lower === 'bch') {
        return lower.toUpperCase();
      }
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

/**
 * Extrae el número de cuotas (ej. "en 3 cuotas", "6 cuotas", "3c", "12 cuotas sin interés")
 * y devuelve el texto sin el fragmento de cuotas para no interferir con el monto ni la nota.
 */
function extractInstallments(text) {
  let working = String(text || '');
  let installments = 1;

  // 1. "en 3 cuotas (sin interés)", "6 cuotas", "12 cuota"
  const numCuotasRx = /\b(?:en\s+)?(\d{1,2})\s*cuotas?(?:\s+sin\s+inter[eé]s)?\b/i;
  const numMatch = numCuotasRx.exec(working);
  if (numMatch) {
    const parsed = parseInt(numMatch[1], 10);
    if (parsed >= 1 && parsed <= 48) {
      installments = parsed;
      working = working.replace(numCuotasRx, ' ');
      return { installments, remainingText: working };
    }
  }

  // 2. "en tres cuotas", "seis cuotas", "doce cuotas"
  const wordKeys = Object.keys(WORD_NUMBERS).join('|');
  const wordCuotasRx = new RegExp(
    `\\b(?:en\\s+)?(${wordKeys})\\s+cuotas?(?:\\s+sin\\s+inter[eé]s)?\\b`,
    'i'
  );
  const wordMatch = wordCuotasRx.exec(stripAccents(working));
  if (wordMatch) {
    const val = WORD_NUMBERS[wordMatch[1].toLowerCase()];
    if (val >= 1 && val <= 48) {
      installments = val;
      working = working.replace(
        new RegExp(`\\b(?:en\\s+)?${wordMatch[1]}\\s+cuotas?(?:\\s+sin\\s+inter[eé]s)?\\b`, 'i'),
        ' '
      );
      return { installments, remainingText: working };
    }
  }

  // 3. Abreviatura "3c", "6c", "12c"
  const shortCuotasRx = /\b(?:en\s+)?(\d{1,2})c\b/i;
  const shortMatch = shortCuotasRx.exec(working);
  if (shortMatch) {
    const parsed = parseInt(shortMatch[1], 10);
    if (parsed >= 1 && parsed <= 48) {
      installments = parsed;
      working = working.replace(shortCuotasRx, ' ');
      return { installments, remainingText: working };
    }
  }

  return { installments: 1, remainingText: working };
}

/**
 * Extrae el monto en CLP soportando jerga chilena ("15 lucas", "1.5 lucas", "media luca",
 * "un palo", "25 mil", "$24.500", "24500") y devuelve el texto restante sin el monto.
 */
function extractAmount(text) {
  const working = String(text || '');

  // 1. "media luca" / "1/2 luca"
  const mediaLucaRx = /\b(?:media|1\/2)\s*(?:luca|lks?|lk)\b/i;
  if (mediaLucaRx.test(working)) {
    return {
      amount: 500,
      remainingText: working.replace(mediaLucaRx, ' ')
    };
  }

  // 2. "medio palo" / "1/2 palo"
  const medioPaloRx = /\b(?:medio|1\/2)\s*palos?\b/i;
  if (medioPaloRx.test(working)) {
    return {
      amount: 500000,
      remainingText: working.replace(medioPaloRx, ' ')
    };
  }

  // 3. "un palo", "1 palo", "1.5 palos", "2,5 palos", "dos palos"
  const numPaloRx = /\$?\s*(\d+(?:[.,]\d{1,3})?)\s*palos?\b/i;
  const numPaloMatch = numPaloRx.exec(working);
  if (numPaloMatch) {
    const rawNum = numPaloMatch[1].replace(',', '.');
    const val = Math.round(parseFloat(rawNum) * 1000000);
    return {
      amount: val,
      remainingText: working.replace(numPaloRx, ' ')
    };
  }

  const wordKeys = Object.keys(WORD_NUMBERS).join('|');
  const wordPaloRx = new RegExp(`\\b(${wordKeys})\\s+palos?(?:\\s+y\\s+medio)?\\b`, 'i');
  const wordPaloMatch = wordPaloRx.exec(stripAccents(working));
  if (wordPaloMatch) {
    const base = WORD_NUMBERS[wordPaloMatch[1].toLowerCase()] || 1;
    const hasHalf = /y\s+medio/i.test(wordPaloMatch[0]);
    return {
      amount: Math.round((base + (hasHalf ? 0.5 : 0)) * 1000000),
      remainingText: working.replace(wordPaloRx, ' ')
    };
  }

  // 4. "15 lucas y media", "una luca y media", "1.5 lucas", "15 lucas", "20 lks"
  const numLucasRx = /\$?\s*(\d+(?:[.,]\d{1,2})?)\s*(?:lucas?|lks?|lk)(?:\s+y\s+media)?\b/i;
  const numLucasMatch = numLucasRx.exec(working);
  if (numLucasMatch) {
    const rawNum = numLucasMatch[1].replace(',', '.');
    const hasHalf = /y\s+media/i.test(numLucasMatch[0]);
    const val = Math.round((parseFloat(rawNum) + (hasHalf ? 0.5 : 0)) * 1000);
    return {
      amount: val,
      remainingText: working.replace(numLucasRx, ' ')
    };
  }

  const wordLucasRx = new RegExp(
    `\\b(${wordKeys})\\s+(?:lucas?|lks?|lk)(?:\\s+y\\s+media)?\\b`,
    'i'
  );
  const wordLucasMatch = wordLucasRx.exec(stripAccents(working));
  if (wordLucasMatch) {
    const base = WORD_NUMBERS[wordLucasMatch[1].toLowerCase()] || 1;
    const hasHalf = /y\s+media/i.test(wordLucasMatch[0]);
    return {
      amount: Math.round((base + (hasHalf ? 0.5 : 0)) * 1000),
      remainingText: working.replace(wordLucasRx, ' ')
    };
  }

  // 5. Compuesto "24 mil 500" / "15 mil quinientos"
  const compoundMilRx = /\$?\s*(\d{1,4})\s*mil\s*(\d{3}|quinientos)\b/i;
  const compoundMilMatch = compoundMilRx.exec(working);
  if (compoundMilMatch) {
    const thousands = parseInt(compoundMilMatch[1], 10) * 1000;
    const extra = /quinientos/i.test(compoundMilMatch[2])
      ? 500
      : parseInt(compoundMilMatch[2], 10);
    return {
      amount: thousands + extra,
      remainingText: working.replace(compoundMilRx, ' ')
    };
  }

  // 6. "25 mil", "35 mil", "1.5 mil", "25k"
  const numMilRx = /\$?\s*(\d+(?:[.,]\d{1,2})?)\s*(?:mil|k)\b/i;
  const numMilMatch = numMilRx.exec(working);
  if (numMilMatch) {
    const rawNum = numMilMatch[1].replace(',', '.');
    const val = Math.round(parseFloat(rawNum) * 1000);
    return {
      amount: val,
      remainingText: working.replace(numMilRx, ' ')
    };
  }

  const wordMilRx = new RegExp(`\\b(${wordKeys})\\s+mil\\b`, 'i');
  const wordMilMatch = wordMilRx.exec(stripAccents(working));
  if (wordMilMatch) {
    const base = WORD_NUMBERS[wordMilMatch[1].toLowerCase()] || 1;
    return {
      amount: base * 1000,
      remainingText: working.replace(wordMilRx, ' ')
    };
  }

  // 7. Monto formateado con separador de miles chileno ("$24.500", "120.000", "$1.250.000")
  const formattedClpRx = /(?:^|\s)\$?\s*(\d{1,3}(?:\.\d{3})+)(?=$|\s|[^\d.])/i;
  const formattedMatch = formattedClpRx.exec(working);
  if (formattedMatch) {
    const digitsOnly = formattedMatch[1].replace(/\./g, '');
    const val = parseInt(digitsOnly, 10);
    if (val > 0) {
      return {
        amount: val,
        remainingText: working.replace(formattedMatch[0], ' ')
      };
    }
  }

  // 8. Monto entero directo de 3 o más dígitos ("$24500", "24500", "8500", "500")
  const plainClpRx = /(?:^|\s)\$?\s*(\d{3,8})(?=$|\s|[^\d])/i;
  const plainMatch = plainClpRx.exec(working);
  if (plainMatch) {
    const val = parseInt(plainMatch[1], 10);
    if (val > 0) {
      return {
        amount: val,
        remainingText: working.replace(plainMatch[0], ' ')
      };
    }
  }

  // 9. Fallback para cualquier número restante si alguien escribe un monto pequeño
  const anyNumRx = /(?:^|\s)\$?\s*(\d{1,2})(?=$|\s|[^\d])/i;
  const anyNumMatch = anyNumRx.exec(working);
  if (anyNumMatch) {
    const val = parseInt(anyNumMatch[1], 10);
    return {
      amount: val,
      remainingText: working.replace(anyNumMatch[0], ' ')
    };
  }

  return { amount: 0, remainingText: working };
}

/**
 * Detecta si el texto corresponde a una transferencia interna a Marie.
 */
function detectTransferWife(normalizedText) {
  const patterns = [
    /\btransferencia\s+(?:a\s+|para\s+)?(?:marie|mi\s+mujer|mi\s+señora|mi\s+senora|esposa)\b/i,
    /\btransferir\s+(?:a\s+|para\s+)?(?:marie|mi\s+mujer)\b/i,
    /\btraspaso\s+(?:a\s+|para\s+)?(?:marie|mi\s+mujer|mi\s+señora|mi\s+senora|esposa)\b/i,
    /\bplata\s+(?:a\s+|para\s+)?(?:marie|mi\s+mujer|mi\s+señora|mi\s+senora|esposa)\b/i,
    /\btef\s+(?:a\s+|para\s+)?(?:marie|mi\s+mujer)\b/i,
    /\bmesada\s+(?:a\s+|para\s+)?(?:marie|mi\s+mujer)\b/i
  ];
  return patterns.some((rx) => rx.test(normalizedText));
}

/**
 * Detecta categoría y comercio usando CHILE_MERCHANT_RULES + palabras coloquiales chilenas.
 */
function detectCategoryAndMerchant(rawText) {
  const normalized = stripAccents(rawText).toLowerCase();

  let matchedCategoryId = null;
  let matchedMerchant = null;
  let fallbackKeywordMerchant = null;

  // 1. Buscar en CHILE_MERCHANT_RULES respetando prioridad de categorías
  for (const rule of CHILE_MERCHANT_RULES) {
    for (const kw of rule.keywords) {
      if (containsKeyword(normalized, kw)) {
        if (!matchedCategoryId) {
          matchedCategoryId = rule.categoryId;
        }
        const normKw = stripAccents(kw).toLowerCase().trim();
        if (!GENERIC_ITEM_KEYWORDS.has(normKw)) {
          if (!matchedMerchant || kw.length > matchedMerchant.length) {
            matchedMerchant = kw;
          }
        } else if (!fallbackKeywordMerchant) {
          fallbackKeywordMerchant = kw;
        }
      }
    }
  }

  // 2. Si no hubo match de categoría en CHILE_MERCHANT_RULES, buscar en palabras coloquiales
  if (!matchedCategoryId) {
    for (const rule of EXTRA_CATEGORY_KEYWORDS) {
      for (const kw of rule.keywords) {
        if (containsKeyword(normalized, kw)) {
          matchedCategoryId = rule.categoryId;
          break;
        }
      }
      if (matchedCategoryId) break;
    }
  }

  return {
    categoryId: matchedCategoryId || 'supermercado',
    hasCategoryMatch: Boolean(matchedCategoryId),
    detectedMerchant: matchedMerchant ? toTitleCase(matchedMerchant) : null
  };
}

/**
 * Determina el medio de pago según menciones explícitas o reglas por autor y tipo de gasto.
 */
function resolvePaymentMethod({
  normalizedText,
  installments,
  defaultAuthor,
  categoryId,
  isTransferWife
}) {
  // Si tiene cuotas (> 1), siempre es CMR Falabella
  if (installments > 1) {
    return 'cmr_falabella';
  }

  // Menciones explícitas en el texto
  if (/\b(?:cuenta\s+mujer|cuenta\s+marie|billetera\s+marie)\b/i.test(normalizedText)) {
    return 'cuenta_mujer';
  }
  if (/\b(?:efectivo|cash|billetes?|monedas?)\b/i.test(normalizedText)) {
    return 'efectivo';
  }
  if (/\b(?:cmr|falabella|creditos?|tarjeta\s+de\s+credito|tc)\b/i.test(normalizedText)) {
    return 'cmr_falabella';
  }
  if (/\b(?:cuenta\s+vista|cta\s+vista|vista|cuenta\s+fan|cta\s+fan|fan)\b/i.test(normalizedText)) {
    return 'bch_vista';
  }
  if (
    /\b(?:banco\s+de\s+chile|banco\s+chile|cta\s*cte|cuenta\s+corriente|debito|transferencia)\b/i.test(
      normalizedText
    )
  ) {
    return 'bch_ctacte';
  }

  if (isTransferWife) {
    return 'bch_ctacte';
  }

  const isSmallNeighborhoodPurchase = SMALL_NEIGHBORHOOD_KEYWORDS.some((kw) =>
    containsKeyword(normalizedText, kw)
  );
  const isBigSupermarketPurchase = BIG_SUPERMARKET_KEYWORDS.some((kw) =>
    containsKeyword(normalizedText, kw)
  );

  // Inferencia inteligente por autor cuando no se menciona medio de pago
  if (defaultAuthor === 'ella') {
    if (isSmallNeighborhoodPurchase) {
      return 'cuenta_mujer';
    }
    if (
      isBigSupermarketPurchase ||
      categoryId === 'salud_farmacia' ||
      categoryId === 'hija' ||
      categoryId === 'transporte' ||
      categoryId === 'hogar_varios' ||
      categoryId === 'gustos_personales' ||
      categoryId === 'vivienda_fijos'
    ) {
      return 'cmr_falabella';
    }
    // Feria/pan/almacén/café o gasto rápido diario de Marie
    return 'cuenta_mujer';
  }

  // defaultAuthor === 'el' (Mauricio)
  if (isSmallNeighborhoodPurchase || categoryId === 'vivienda_fijos') {
    return 'bch_ctacte';
  }
  return 'cmr_falabella';
}

/**
 * Limpia el texto restante quitando tokens de medios de pago y conectores sueltos
 * para producir una nota legible como "Feria", "Pañales Cruz Verde", "Copec".
 */
function buildCleanNote(remainingText, { detectedMerchant, isTransferWife }) {
  let text = String(remainingText || '').trim();

  if (isTransferWife) {
    const cleanedTransfer = text
      .replace(
        /\b(?:con\s+|en\s+|por\s+|via\s+|vía\s+)?(?:banco\s+de\s+chile|banco\s+chile|cta\s*cte|cuenta\s+corriente|debito|débito)\b/gi,
        ' '
      )
      .replace(/\s+/g, ' ')
      .trim();
    return cleanedTransfer ? toTitleCase(cleanedTransfer) : 'Transferencia a Marie';
  }

  const paymentTokensRx =
    /\b(?:pagado\s+con\s+|pago\s+con\s+|con\s+|en\s+|por\s+|via\s+|vía\s+)?(?:cmr\s+falabella|tarjeta\s+cmr|cmr|cuenta\s+mujer|cuenta\s+marie|billetera\s+marie|banco\s+de\s+chile|banco\s+chile|cuenta\s+corriente|cta\.?\s*cte\.?|cuenta\s+vista|cta\.?\s*vista|cuenta\s+fan|cta\.?\s*fan|fan|vista|efectivo|cash|billetes?|monedas?|debito|débito|credito|crédito|transferencia)\b/gi;

  text = text.replace(paymentTokensRx, ' ');

  // Si menciona "falabella" junto a otro comercio/producto (ej. "pañales cmr falabella"), limpiar;
  // si solo dice "falabella" como tienda, conservarlo.
  const withoutFalabella = text.replace(/\b(?:con\s+|en\s+)?falabella\b/gi, ' ').trim();
  if (withoutFalabella.length > 0 && /\bcmr\b/i.test(remainingText)) {
    text = withoutFalabella;
  }

  // Limpiar símbolos sueltos y preposiciones al inicio o al final
  text = text
    .replace(/^[\s$,.;:\-+/*]+|[\s$,.;:\-+/*]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const edgeStopwordsRx =
    /^(?:en\s+la|en\s+el|de\s+la|del|de|en|por|para|con|la|el|los|las|un|una)\s+|\s+(?:en\s+la|en\s+el|de\s+la|del|de|en|por|para|con|la|el)$/gi;
  while (edgeStopwordsRx.test(text)) {
    text = text.replace(edgeStopwordsRx, '').trim();
  }

  if (!text) {
    if (detectedMerchant) return detectedMerchant;
    return 'Gasto rápido';
  }

  return toTitleCase(text);
}

/**
 * Parsea en 0 ms una frase corta o dictado de voz en español chileno.
 *
 * @param {string} rawText - Frase como "15 lucas feria", "24500 pañales cruz verde cmr", "35 mil copec en 3 cuotas"
 * @param {'el' | 'ella'} defaultAuthor - Autor activo ('el' = Mauricio, 'ella' = Marie)
 */
export function parseQuickNaturalExpense(rawText, defaultAuthor = 'el') {
  const input = String(rawText || '').trim();
  const author = defaultAuthor === 'ella' ? 'ella' : 'el';

  if (!input) {
    return {
      amount: 0,
      categoryId: 'supermercado',
      paymentMethod: author === 'ella' ? 'cuenta_mujer' : 'cmr_falabella',
      installments: 1,
      cleanNote: '',
      detectedMerchant: null,
      isTransferWife: false,
      confidence: 'low'
    };
  }

  // 1. Extraer cuotas primero para que "en 3 cuotas" o "6c" no se confunda con el monto
  const { installments, remainingText: textWithoutInstallments } = extractInstallments(input);

  // 2. Extraer monto en CLP
  const { amount, remainingText: textWithoutAmount } = extractAmount(textWithoutInstallments);

  // 3. Normalizar texto para clasificar comercio, categoría, transferencia a Marie y medio de pago
  const normalizedFull = stripAccents(input).toLowerCase();
  const normalizedDesc = stripAccents(textWithoutAmount).toLowerCase();

  const isTransferWife = detectTransferWife(normalizedFull);

  const { categoryId, hasCategoryMatch, detectedMerchant } = detectCategoryAndMerchant(
    textWithoutAmount
  );

  const paymentMethod = resolvePaymentMethod({
    normalizedText: normalizedFull,
    installments,
    defaultAuthor: author,
    categoryId,
    isTransferWife
  });

  const cleanNote = buildCleanNote(textWithoutAmount, {
    detectedMerchant,
    isTransferWife
  });

  let confidence = 'low';
  if (amount > 0 && (hasCategoryMatch || isTransferWife)) {
    confidence = 'high';
  } else if (amount > 0 || hasCategoryMatch || isTransferWife) {
    confidence = 'medium';
  }

  // Asegurar que categoryId siempre sea una de las 9 categorías válidas
  const finalCategoryId = isTransferWife && !hasCategoryMatch ? 'hogar_varios' : categoryId;
  const normalizedNoteForCheck = stripAccents(normalizedDesc);

  return {
    amount,
    categoryId: finalCategoryId,
    paymentMethod,
    installments,
    cleanNote,
    detectedMerchant:
      detectedMerchant ||
      (containsKeyword(normalizedNoteForCheck, 'feria') ? 'Feria' : null),
    isTransferWife,
    confidence
  };
}

/**
 * Avanza meses calendario respetando fines de mes (ej. 30 o 31 -> 28/29 en febrero).
 */
function addCalendarMonthsClamped(isoDateStr, monthsToAdd) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDateStr || '').trim());
  let year;
  let monthIndex;
  let anchorDay;

  if (match) {
    year = parseInt(match[1], 10);
    monthIndex = parseInt(match[2], 10) - 1;
    anchorDay = parseInt(match[3], 10);
  } else {
    const now = new Date();
    year = now.getFullYear();
    monthIndex = now.getMonth();
    anchorDay = now.getDate();
  }

  const totalMonths = year * 12 + monthIndex + monthsToAdd;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonthIndex = ((totalMonths % 12) + 12) % 12;
  const maxDayInTargetMonth = new Date(
    Date.UTC(targetYear, targetMonthIndex + 1, 0)
  ).getUTCDate();
  const clampedDay = Math.min(anchorDay, maxDayInTargetMonth);

  const yStr = String(targetYear).padStart(4, '0');
  const mStr = String(targetMonthIndex + 1).padStart(2, '0');
  const dStr = String(clampedDay).padStart(2, '0');
  return `${yStr}-${mStr}-${dStr}`;
}

/**
 * Distribuye una compra en N cuotas mensuales enteras en CLP tales que la suma de las N cuotas
 * sea exactamente igual al total de la compra (el resto de $1 o $2 se asigna a la cuota 1).
 *
 * @param {object} baseTx - Transacción base con { date, amount, categoryId, paymentMethod, author, note, ... }
 * @param {number} installmentsCount - Número de cuotas (1 a 24)
 */
export function buildInstallmentTransactions(baseTx, installmentsCount = 1) {
  if (!baseTx || typeof baseTx !== 'object') {
    return [];
  }

  const N = Math.min(24, Math.max(1, Math.round(Number(installmentsCount) || 1)));
  if (N <= 1) {
    return [baseTx];
  }

  const totalAmount = Math.round(Number(baseTx.amount) || 0);
  const baseQuota = Math.floor(totalAmount / N);
  const remainder = totalAmount - baseQuota * N;

  const baseId =
    baseTx.id || `tx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const groupId = baseTx.installmentGroupId || `grp_${baseId}`;
  const cleanBaseNote = String(baseTx.note || '').trim() || 'Compra CMR';

  const result = [];
  for (let k = 1; k <= N; k += 1) {
    const quotaAmount = k === 1 ? baseQuota + remainder : baseQuota;
    const quotaDate = addCalendarMonthsClamped(baseTx.date, k - 1);

    result.push({
      ...baseTx,
      id: `${baseId}_c${k}`,
      date: quotaDate,
      amount: quotaAmount,
      note: `${cleanBaseNote} (Cuota ${k}/${N})`,
      installmentNumber: k,
      installmentsTotal: N,
      installmentGroupId: groupId,
      parentTotalAmount: totalAmount,
      reconciled: k === 1 ? Boolean(baseTx.reconciled) : false
    });
  }

  return result;
}

/**
 * Devuelve los 6 atajos frecuentes de 1 toque personalizados para Marie ('ella') o Mauricio ('el').
 *
 * @param {'el' | 'ella'} author
 */
export function getQuickPresetsForAuthor(author = 'el') {
  if (author === 'ella') {
    return [
      {
        id: 'preset_feria',
        icon: '🥬',
        label: 'Feria / Verduras',
        categoryId: 'supermercado',
        paymentMethod: 'cuenta_mujer',
        defaultNote: 'Feria y verduras'
      },
      {
        id: 'preset_hija',
        icon: '👶',
        label: 'Pañales / Hija',
        categoryId: 'hija',
        paymentMethod: 'cmr_falabella',
        defaultNote: 'Artículos hija'
      },
      {
        id: 'preset_pan',
        icon: '🥖',
        label: 'Pan / Almacén',
        categoryId: 'supermercado',
        paymentMethod: 'cuenta_mujer',
        defaultNote: 'Panadería / Almacén'
      },
      {
        id: 'preset_super',
        icon: '🛒',
        label: 'Supermercado',
        categoryId: 'supermercado',
        paymentMethod: 'cmr_falabella',
        defaultNote: 'Supermercado'
      },
      {
        id: 'preset_farmacia',
        icon: '💊',
        label: 'Farmacia',
        categoryId: 'salud_farmacia',
        paymentMethod: 'cmr_falabella',
        defaultNote: 'Farmacia'
      },
      {
        id: 'preset_cafe',
        icon: '☕',
        label: 'Café / Salida',
        categoryId: 'delivery_salidas',
        paymentMethod: 'cuenta_mujer',
        defaultNote: 'Café / paseo'
      }
    ];
  }

  return [
    {
      id: 'preset_super_m',
      icon: '🛒',
      label: 'Supermercado',
      categoryId: 'supermercado',
      paymentMethod: 'cmr_falabella',
      defaultNote: 'Supermercado'
    },
    {
      id: 'preset_bencina',
      icon: '⛽',
      label: 'Bencina / TAG',
      categoryId: 'transporte',
      paymentMethod: 'cmr_falabella',
      defaultNote: 'Copec / Bencina'
    },
    {
      id: 'preset_hija_m',
      icon: '👶',
      label: 'Pañales / Hija',
      categoryId: 'hija',
      paymentMethod: 'cmr_falabella',
      defaultNote: 'Compras hija'
    },
    {
      id: 'preset_delivery',
      icon: '🍔',
      label: 'Delivery / Salida',
      categoryId: 'delivery_salidas',
      paymentMethod: 'cmr_falabella',
      defaultNote: 'Delivery / Restaurante'
    },
    {
      id: 'preset_farmacia_m',
      icon: '💊',
      label: 'Farmacia / Salud',
      categoryId: 'salud_farmacia',
      paymentMethod: 'cmr_falabella',
      defaultNote: 'Farmacia'
    },
    {
      id: 'preset_feria_m',
      icon: '🥖',
      label: 'Pan / Almacén',
      categoryId: 'supermercado',
      paymentMethod: 'bch_ctacte',
      defaultNote: 'Panadería / Almacén'
    }
  ];
}
