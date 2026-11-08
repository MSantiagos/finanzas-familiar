import {
  CHILE_MERCHANT_RULES
} from '../data/defaults.js';

function stripAccents(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function cleanChileanAmount(raw) {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? Math.abs(Math.round(raw)) : 0;
  }
  if (!raw) return 0;

  let str = String(raw)
    .replace(/\$/g, '')
    .replace(/CLP/gi, '')
    .replace(/[()+]/g, '')
    .replace(/\s+/g, '')
    .trim();

  if (!str) return 0;
  // Rechazar textos con letras, barras de fechas/cuotas (ej. 01/03 o 24/10) o dos puntos de hora
  if (/[a-zA-Z\/:]/.test(str)) return 0;

  // Caso 1: Formato Excel / US / Europeo con decimales al final (.00 o ,00), ej: "3,670.00", "895.00", "23,777.00", "48.500,00"
  if (/[.,]\d{1,2}$/.test(str)) {
    const integerPart = str.replace(/[.,]\d{1,2}$/, '');
    const digitsOnly = integerPart.replace(/[.,-]/g, '');
    if (!digitsOnly || !/^\d+$/.test(digitsOnly)) return 0;
    const num = parseInt(digitsOnly, 10);
    return isNaN(num) ? 0 : Math.abs(num);
  }

  // Caso 2: Formato chileno con puntos o comas de miles sin decimales (ej: "48.500", "1.250.000", "-48.500", "48500")
  const digitsOnly = str.replace(/[.,-]/g, '');
  if (!digitsOnly || !/^\d+$/.test(digitsOnly)) return 0;
  const num = parseInt(digitsOnly, 10);
  return isNaN(num) ? 0 : Math.abs(num);
}

/**
 * Formatea en vivo un string numérico con puntos de miles chilenos ("150000" -> "150.000")
 * para que Mauricio y Marie nunca confundan $15.000 con $150.000 en el iPhone.
 */
export function formatLiveCLPInput(raw) {
  if (raw === null || raw === undefined || raw === '') return '';
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return '';
  const num = parseInt(digits, 10);
  if (isNaN(num) || num === 0) return digits === '0' ? '0' : '';
  return String(num).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function isValidStatementDate(rawDate) {
  if (!rawDate) return false;
  const str = String(rawDate).trim();

  // Soporte para número serial de fecha Excel (ej. 46333 -> 2026-11-07)
  if (/^\d{5}$/.test(str)) {
    const serial = parseInt(str, 10);
    return serial >= 36526 && serial <= 65000;
  }

  const ymd = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (ymd) {
    const y = parseInt(ymd[1], 10);
    const m = parseInt(ymd[2], 10);
    const d = parseInt(ymd[3], 10);
    return y >= 1990 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31;
  }

  const dmy = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (dmy) {
    const d = parseInt(dmy[1], 10);
    const m = parseInt(dmy[2], 10);
    const y = parseInt(dmy[3], 10);
    if (dmy[3].length === 3) return false;
    const fullY = y < 100 ? 2000 + y : y;
    return fullY >= 1990 && fullY <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31;
  }

  const dm = str.match(/^(\d{1,2})[\/\-](\d{1,2})$/);
  if (dm) {
    const d = parseInt(dm[1], 10);
    const m = parseInt(dm[2], 10);
    return m >= 1 && m <= 12 && d >= 1 && d <= 31;
  }

  return false;
}

export function normalizeDateToISO(rawDate, fallbackYearMonth = '2026-10') {
  const safeFallbackYM =
    fallbackYearMonth && /^\d{4}-\d{2}$/.test(String(fallbackYearMonth))
      ? String(fallbackYearMonth)
      : new Date().toISOString().slice(0, 7);

  if (!rawDate) return `${safeFallbackYM}-01`;
  const str = String(rawDate).trim();

  // Convertir número serial de fecha Excel (base 1899-12-30) a YYYY-MM-DD
  if (/^\d{5}$/.test(str)) {
    const serial = parseInt(str, 10);
    if (serial >= 36526 && serial <= 65000) {
      const utcMs = Date.UTC(1899, 11, 30) + serial * 86400000;
      return new Date(utcMs).toISOString().slice(0, 10);
    }
  }

  const ymdMatch = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (ymdMatch) {
    const year = ymdMatch[1];
    const month = ymdMatch[2].padStart(2, '0');
    const day = ymdMatch[3].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  const dmyMatch = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    let year = dmyMatch[3];
    if (year.length === 2) year = `20${year}`;
    return `${year}-${month}-${day}`;
  }

  const dmMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})$/);
  if (dmMatch) {
    const [fallbackY] = safeFallbackYM.split('-');
    const day = dmMatch[1].padStart(2, '0');
    const month = dmMatch[2].padStart(2, '0');
    return `${fallbackY}-${month}-${day}`;
  }

  return `${safeFallbackYM}-15`;
}

/**
 * Limpia prefijos bancarios y de procesadores de pago chilenos (Transbank, MercadoPago, SumUp, Getnet, Kushki, Flow, DLocal),
 * indicadores de cuotas ("01/03", "CUOTA 01 DE 06") y ciudades finales ("SANTIAGO CL", "LAS CONDES CL", "PROVIDENCIA").
 */
export function normalizeBankDescription(rawDescription, options = {}) {
  if (!rawDescription) return '';
  let text = String(rawDescription).trim();

  // 1. Limpiar prefijos repetidos de operación bancaria y pasarelas de pago
  const prefixPattern =
    /^(?:pago\s*:|cargo\s+por\s+compra|compra\s+con\s+tarjeta(?:\s+de\s+(?:debito|débito|credito|crédito))?|compra\s+tarjeta(?:\s+(?:debito|débito|credito|crédito))?|compra\s+nacional|compra\s+internacional|compra\s+redcompra|compra\s+normal|compra\s+en\s+l[ií]nea|compra\s+(?=[a-z0-9])|pac\s+(?=[a-z0-9])|pat\s+(?=[a-z0-9]))\s*/i;
  const processorPattern =
    /^(?:tbk|merpago|mercadopago|mp|sumup|getnet|kushki|flow|webpay|dl|dlocal|khipu|payu|etpay)\s*[\*\-]\s*(?=.+)/i;

  let changed = true;
  let guard = 0;
  while (changed && guard < 6) {
    changed = false;
    guard++;
    const next1 = text.replace(prefixPattern, '').trim();
    if (next1 !== text && next1.length > 0) {
      text = next1;
      changed = true;
    }
    const next2 = text.replace(processorPattern, '').trim();
    if (next2 !== text && next2.length > 0) {
      text = next2;
      changed = true;
    }
  }

  // 2. Limpiar sufijos o insertos de cuotas (ej. "CUOTA 01 DE 06", "CUOTA 01/03", "01/03")
  if (!options.keepInstallments) {
    text = text
      .replace(/\bcuota\s*0?\d{1,2}\s*(?:\/|de)\s*0?\d{1,2}\b/gi, ' ')
      .replace(/(?:^|\s)0?\d{1,2}\s*\/\s*0?\d{1,2}(?=\s|$)/g, ' ');
  }

  // 3. Limpiar ciudades / comunas chilenas y código de país al final de la glosa
  const trailingCityPattern =
    /\s+(?:santiago(?:\s+centro)?|las\s+condes|providencia|vitacura|nunoa|ñuñoa|la\s+reina|lo\s+barnechea|macul|peñalolen|penalolen|la\s+florida|maipu|maipú|puente\s+alto|san\s+bernardo|estaci[oó]n\s+central|recoleta|independencia|san\s+miguel|la\s+cisterna|quilicura|huechuraba|conchal[ií]|cerrillos|viña\s+del\s+mar|vina\s+del\s+mar|valpara[ií]so|concepci[oó]n|antofagasta|la\s+serena|temuco|rancagua|talca|puerto\s+montt|osorno|valdivia|chill[aá]n|iquique|arica|copiap[oó]|curic[oó])(?:\s+(?:chile|cl))?$/i;

  text = text.replace(trailingCityPattern, '').trim();
  text = text.replace(/\s+(?:chile|cl)$/i, '').trim();
  text = text.replace(/\s{2,}/g, ' ').trim();

  return text || String(rawDescription).trim();
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
    .replace(/^(pago:|traspaso a:|traspaso de:|tef a:|tef de:|transferencia a:|transferencia de:)\s*/i, '')
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
    .replace(/^(pago:|traspaso a:|traspaso de:|tef a:|tef de:|transferencia a:|transferencia de:)\s*/i, '')
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

function matchKeywordInText(normalizedText, rawKeyword) {
  const cleanKw = stripAccents(String(rawKeyword || '').toLowerCase()).trim();
  if (!cleanKw) return false;

  // Para palabras clave cortas (<= 4 caracteres, ej: "tag", "bip", "wom", "cge", "kfc", "mk", "cic", "prt", "upa", "max", "wei", "bar", "temu"),
  // exigir límite de palabra para no coincidir dentro de "patagonia", "temuco", "espumante", "lavamax", etc.
  if (cleanKw.length <= 4) {
    const regex = new RegExp(`(?:^|[^a-z0-9])${escapeRegex(cleanKw)}(?:$|[^a-z0-9])`, 'i');
    return regex.test(normalizedText);
  }

  return normalizedText.includes(cleanKw);
}

function findBestCategoryMatch(candidateText) {
  const normText = stripAccents(String(candidateText || '').toLowerCase());
  if (!normText) return null;

  const matches = [];
  for (let ruleIdx = 0; ruleIdx < CHILE_MERCHANT_RULES.length; ruleIdx++) {
    const rule = CHILE_MERCHANT_RULES[ruleIdx];
    for (const kw of rule.keywords) {
      if (matchKeywordInText(normText, kw)) {
        const cleanKw = stripAccents(kw.toLowerCase()).trim();
        matches.push({
          categoryId: rule.categoryId,
          kw: cleanKw,
          ruleIdx
        });
      }
    }
  }

  if (matches.length === 0) return null;

  // Si una palabra clave coincidente es supercadena específica de otra más corta
  // (ej. "feria chilena del libro" contiene "feria", "uber eats" contiene "uber", "servipag tag" contiene "servipag", "h&m kids" contiene "h&m"),
  // descartar la subcadena genérica y priorizar la frase específica.
  const filtered = matches.filter(
    (m1) => !matches.some((m2) => m2.kw.length > m1.kw.length && m2.kw.includes(m1.kw))
  );

  const bestList = filtered.length > 0 ? filtered : matches;
  return bestList[0].categoryId;
}

export function guessCategoryFromDescription(description) {
  if (!description || !String(description).trim()) return 'imprevistos';

  // Paso 1: Evaluar sobre la glosa limpia (sin prefijos MERPAGO*, TBK*, SUMUP*, ciudades ni cuotas)
  const cleaned = normalizeBankDescription(description);
  const matchFromCleaned = findBestCategoryMatch(cleaned);
  if (matchFromCleaned) return matchFromCleaned;

  // Paso 2: Evaluar sobre la glosa original completa (por si era un cargo genérico "MERPAGO" o "GOOGLE *")
  const matchFromRaw = findBestCategoryMatch(description);
  if (matchFromRaw) return matchFromRaw;

  return 'imprevistos';
}

export function guessCategoryFromMerchant(description) {
  return guessCategoryFromDescription(description);
}

export function guessPaymentMethodFromSource(sourceText, defaultMethod = 'cmr_falabella') {
  const lower = String(sourceText || '').toLowerCase();
  if (lower.includes('cmr') || lower.includes('falabella') || lower.includes('credito') || lower.includes('crédito')) {
    return 'cmr_falabella';
  }
  if (lower.includes('vista') || lower.includes('fan')) {
    return 'bch_vista';
  }
  if (lower.includes('chile') || lower.includes('corriente') || lower.includes('ctacte') || lower.includes('cta cte') || lower.includes('cta. cte')) {
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
  husbandKeywords = ['mauricio', 'mauricio santiago', 'santiagos']
) {
  const lower = stripAccents(String(description || '').toLowerCase());

  if (
    lower.includes('pago cmr') ||
    lower.includes('pago tarjeta') ||
    lower.includes('tarjeta cmr') ||
    lower.includes('estado de cuenta') ||
    lower.includes('abono cmr') ||
    lower.includes('pago automatico cmr') ||
    lower.includes('pac cmr') ||
    lower.includes('pago cuenta cmr')
  ) {
    return 'cmr_payment';
  }

  const cleanWife = stripAccents(String(wifeName || 'marie').toLowerCase().trim());
  const hasWifeMatch =
    /\bmarie\b/i.test(lower) ||
    lower.includes('mi mujer') ||
    lower.includes('cuenta mujer') ||
    lower.includes('esposa') ||
    (cleanWife.length > 2 && new RegExp(`(?:^|[^a-z0-9])${escapeRegex(cleanWife)}(?:$|[^a-z0-9])`, 'i').test(lower));

  if (hasWifeMatch) {
    return 'transfer_wife';
  }

  const isTransferContext = /(?:traspaso|transferencia|tef|abono|deposito)\b/i.test(lower);
  const matchesHusband = husbandKeywords.some((kw) => {
    const cleanKw = stripAccents(String(kw || '').toLowerCase().trim());
    if (!cleanKw) return false;
    // Evitar confundir el apellido "Santiago" con la ciudad "Santiago CL" o "Metro de Santiago"
    if (cleanKw === 'santiago') {
      return isTransferContext && !/metro\s+de\s+santiago|santiago\s+cl$/i.test(lower) && /\bsantiago\b/i.test(lower);
    }
    return lower.includes(cleanKw);
  });

  // En Banco de Chile, los traspasos propios entre cuentas del mismo titular vienen como "Traspaso A Cuenta:000004422049" o "Traspaso De Cuenta:001380682400"
  const isOwnAccountNumberOrPrefix =
    /traspaso\s+(?:a|de)\s+cuenta\s*:/i.test(lower) ||
    lower.includes('001380682400') ||
    lower.includes('000004422049') ||
    lower.includes('00-138-06824-00') ||
    lower.includes('00-000-44220-49');

  const isSelfKeyword =
    matchesHusband ||
    isOwnAccountNumberOrPrefix ||
    lower.includes('cuenta fan') ||
    lower.includes('cta fan') ||
    lower.includes('mismo titular') ||
    lower.includes('entre mis cuentas') ||
    lower.includes('traspaso propio');

  if (isSelfKeyword) {
    return 'transfer_self';
  }

  return null;
}

function isSummaryOrNoiseStatementLine(description) {
  const clean = stripAccents(String(description || '').toLowerCase().trim());
  if (!clean) return true;
  if (
    /^(?:fecha|descripcion|movimiento|detalle|glosa|cartola|resumen|totales|total\b|subtotal\b|saldo\s+inicial|saldo\s+final|saldo\s+anterior|saldo\s+disponible|saldo\s+contable|saldo\s+al\s+dia|monto\s+total|pago\s+minimo|sr\(a\)|rut:|cuenta:|moneda:|movimientos\s+al|saldos\s+al|informate\s+sobre)/i.test(
      clean
    )
  ) {
    return true;
  }
  return false;
}

function isIncomingStatementDescription(description) {
  const clean = stripAccents(String(description || '').toLowerCase().trim());
  // Excluir pagos de tarjeta CMR ("ABONO CMR") para que se procesen como pago de tarjeta
  if (/abono\s+cmr|pago\s+cmr|pago\s+tarjeta|tarjeta\s+cmr/i.test(clean)) return false;

  return (
    /^(?:traspaso\s+de|transferencia\s+de|tef\s+de|abono|deposito|reembolso|devolucion|reversa|nota\s+de\s+credito|sueldo|remuneracion|honorarios|aguinaldo|rescate\b|ajuste\s+compra)/i.test(
      clean
    ) ||
    /\b(?:reembolso\s+(?:isapre|medico|seguro|colegio|fonasa|gasto)|pago\s+de\s+sueldo|abono\s+en\s+cuenta|abono\s+remuneracion|devolucion\s+de\s+prestamo|prestamo\s+recibido)/i.test(
      clean
    )
  );
}

function isInstallmentSpec(str) {
  return /^(?:cuota\s*)?0?\d{1,2}\s*(?:\/|de)\s*0?\d{1,2}$/i.test(String(str || '').trim());
}

/**
 * Traduce glosas bancarias crípticas o abreviadas de Banco de Chile y CMR Falabella
 * a una explicación clara en español para el usuario.
 */
export function explainBankGlosa(rawDesc, amount = 0, channel = '', accountNumber = '') {
  const lower = stripAccents(String(rawDesc || '').toLowerCase().trim());
  if (!lower) return '';

  if (/cargo\s+segun\s+instruc/i.test(lower)) {
    return amount <= 2500
      ? 'Cobro automático o ajuste instruido al Banco de Chile (por el monto de $' +
          Number(amount).toLocaleString('es-CL') +
          ', suele corresponder a regularización de pasaje Red Movilidad / Bip! QR o comisión menor).'
      : 'Cargo automático por instrucción permanente o mandato PAC registrado en Banco de Chile.';
  }
  if (/abono\s+segun\s+instruc/i.test(lower)) {
    return 'Abono o reversa automática instruida al Banco de Chile (devolución de cobro, ajuste comercial o liquidación).';
  }
  if (/medio\s+de\s+pago\s+fintoc|fintoc/i.test(lower)) {
    return 'Pago por transferencia electrónica instantánea vía Fintoc (usado por comercios online, apps de inversión como Fintual/Racional, pago de cuentas o recargas).';
  }
  if (/khipu\s+clbs|khipu/i.test(lower)) {
    return 'Pago por transferencia vía pasarela Khipu (común en pago de gastos comunes, servicios básicos, seguros o comercios online).';
  }
  if (/recaudacion\s+y\s+pagos\s+de\s+servicios/i.test(lower)) {
    return 'Pago de cuentas o servicios contratados a través del portal de pagos del Banco de Chile (ej. Arriendo, dividendo, luz, agua, gas o gastos comunes).';
  }
  if (/pago\s+en\s+sii\.cl/i.test(lower)) {
    return 'Pago de impuestos en el Servicio de Impuestos Internos (SII.cl, ej. F29 IVA mensual, F50 o contribuciones).';
  }
  if (/tienda\s+ruki|ruki/i.test(lower)) {
    return 'Compra presencial con tarjeta en comercio "Tienda Ruki" (minimarket / tienda de conveniencia o barrio).';
  }
  if (/rosetta\s+spa|rosetta/i.test(lower)) {
    return 'Compra presencial con tarjeta en razón social "Rosetta SpA" (cafetería / panadería / local gastronómico).';
  }
  if (/^compra\s+algarrobo$|^algarrobo$/i.test(lower)) {
    return 'Compra presencial en comercio local de Algarrobo (registrado el mismo día que Lider Express Algarrobo y Under Matta).';
  }
  if (/fudo\s*\*/i.test(lower)) {
    return 'Restaurante o cafetería que utiliza el sistema de punto de venta gastronómico "Fudo".';
  }
  if (/merpago\*|mercadopago/i.test(lower)) {
    return 'Comercio cobrado a través de maquinita o pasarela MercadoPago ("Merpago*").';
  }
  if (/payu\s*\*uber\s+trip|uber\s+rides/i.test(lower)) {
    return 'Viaje en auto por aplicación Uber (cobrado vía PayU / Uber Rides).';
  }
  if (/traspaso\s+a:|transferencia\s+a:/i.test(lower)) {
    return 'Transferencia electrónica enviada por internet. Nota: el archivo Excel del Banco de Chile solo incluye el nombre del destinatario, no el mensaje escrito en el correo.';
  }
  if (/traspaso\s+de:|transferencia\s+de:/i.test(lower)) {
    return 'Transferencia electrónica recibida. Nota: el archivo Excel del Banco de Chile solo incluye el nombre de quien transfiere, no el comentario del correo.';
  }
  return 'Glosa comercial informada directamente por Transbank / Redcompra o el banco emisor.';
}

export function parseBankStatementText(rawText, fallbackYearMonth = '2026-10', defaultPaymentMethod = 'cmr_falabella') {
  if (!rawText || !String(rawText).trim()) return [];
  const lines = String(rawText)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const isBancoDeChileFormat = lines.some(
    (l) => /;CENTRAL;|;PAGO:|;TRASPASO|BANCO DE CHILE|CUENTA FAN|CTA\.?\s*CORRIENTE|CARGOS?\s*(?:\(CLP\))?[;,]|ABONOS?\s*(?:\(CLP\))?[;,]/i.test(l)
  );
  const isCtaCteHeader = lines.some((l) => /CTA\.?\s*CORRIENTE|CUENTA\s+CORRIENTE|00-138-06824-00|001380682400/i.test(l));
  let currentBlockMethod =
    isBancoDeChileFormat && defaultPaymentMethod === 'cmr_falabella'
      ? isCtaCteHeader
        ? 'bch_ctacte'
        : 'bch_vista'
      : defaultPaymentMethod;
  let currentAccountNumber =
    currentBlockMethod === 'bch_ctacte'
      ? '00-138-06824-00'
      : currentBlockMethod === 'bch_vista'
        ? '00-000-44220-49'
        : 'CMR Falabella';

  const parsedRows = [];
  let headerMap = null;
  const intraStatementFpCounts = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detectar cambio de cuenta si el usuario pegó o subió múltiples cartolas juntas
    if (/00-138-06824-00|001380682400/i.test(line) && /cuenta/i.test(line)) {
      currentBlockMethod = 'bch_ctacte';
      currentAccountNumber = '00-138-06824-00';
    } else if (/00-000-44220-49|000004422049/i.test(line) && /cuenta/i.test(line)) {
      currentBlockMethod = 'bch_vista';
      currentAccountNumber = '00-000-44220-49';
    } else if (/titular\/adicional|valor\s+cuota/i.test(line)) {
      currentBlockMethod = 'cmr_falabella';
      currentAccountNumber = 'CMR Falabella';
    }

    let parts = line.includes(';')
      ? line.split(';')
      : line.includes('\t')
        ? line.split('\t')
        : line.split(',');

    parts = parts.map((p) => p.trim());

    // Detectar fila de cabecera para mapear columnas de Cargo, Abono, Monto, Cuotas Pendientes, Valor Cuota y Saldo con precisión
    const lowerParts = parts.map((p) => stripAccents(p.toLowerCase()));
    if (
      lowerParts.some((p) => p === 'fecha' || p.startsWith('fecha ')) &&
      lowerParts.some((p) => /descripcion|movimiento|detalle|glosa/.test(p))
    ) {
      headerMap = {
        dateIdx: lowerParts.findIndex((p) => p === 'fecha' || p.startsWith('fecha ')),
        descIdx: lowerParts.findIndex((p) => /descripcion|movimiento|detalle|glosa/.test(p)),
        cargoIdx: lowerParts.findIndex((p) => /^(?:cargos?|debito|giros?)(?:\s|\(|$)/.test(p)),
        abonoIdx: lowerParts.findIndex((p) => /^(?:abonos?|credito|depositos?)(?:\s|\(|$)/.test(p)),
        montoIdx: lowerParts.findIndex((p) => /^(?:monto|importe|total)(?:\s|\(|$)|^valor(?!\s*cuota)/.test(p)),
        valorCuotaIdx: lowerParts.findIndex((p) => /^valor\s*cuota/.test(p)),
        cuotasPendientesIdx: lowerParts.findIndex((p) => /cuotas?\s*pendientes?/.test(p)),
        saldoIdx: lowerParts.findIndex((p) => /^saldo/.test(p)),
        origenIdx: lowerParts.findIndex((p) => /origen|cuenta|medio|tarjeta|canal|sucursal|titular/.test(p)),
        cuotaIdx: lowerParts.findIndex((p) => /cuota/.test(p) && !/valor\s*cuota|cuotas?\s*pendientes?/.test(p))
      };
      if (headerMap.valorCuotaIdx >= 0) {
        currentBlockMethod = 'cmr_falabella';
        currentAccountNumber = 'CMR Falabella';
      }
      continue;
    }

    let dateColIdx = -1;
    if (headerMap && headerMap.dateIdx >= 0 && isValidStatementDate(parts[headerMap.dateIdx])) {
      dateColIdx = headerMap.dateIdx;
    } else if (isValidStatementDate(parts[0])) {
      dateColIdx = 0;
    } else if (parts.length > 1 && isValidStatementDate(parts[1])) {
      dateColIdx = 1;
    }

    if (dateColIdx === -1) {
      const freeMatch = line.match(/^(\d{1,4}[\/\-\.]\d{1,2}(?:[\/\-\.]\d{2,4})?)\s+(.+?)\s+(-?\$?[\d\.,]+)$/);
      if (freeMatch && isValidStatementDate(freeMatch[1])) {
        const rawDesc = freeMatch[2].trim();
        if (isSummaryOrNoiseStatementLine(rawDesc)) continue;
        const dateISO = normalizeDateToISO(freeMatch[1], fallbackYearMonth);
        const amount = cleanChileanAmount(freeMatch[3]);
        const isIncomingDesc = isIncomingStatementDescription(rawDesc);
        const flow = isIncomingDesc ? 'in' : 'out';
        const cleanDesc = rawDesc.replace(/^PAGO:\s*/i, '').trim() || rawDesc;
        if (amount > 0 && cleanDesc) {
          const baseFp = buildBankFingerprint(dateISO, amount, cleanDesc, flow);
          intraStatementFpCounts[baseFp] = (intraStatementFpCounts[baseFp] || 0) + 1;
          const occurrenceIndex = intraStatementFpCounts[baseFp];
          const fingerprint = occurrenceIndex > 1 ? `${baseFp}_occ${occurrenceIndex}` : baseFp;
          parsedRows.push({
            rowId: `stmt_${i}_${Date.now()}`,
            date: dateISO,
            description: cleanDesc,
            rawDescription: rawDesc,
            normalizedMerchant: normalizeBankDescription(cleanDesc),
            amount,
            flow,
            fingerprint,
            occurrenceIndex,
            paymentMethod: currentBlockMethod,
            accountNumber: currentAccountNumber,
            channelOrBranch: 'Cartola',
            balanceAfter: null,
            originalTotalAmount: amount,
            rawLineText: line,
            glosaExplanation: explainBankGlosa(rawDesc, amount, '', currentAccountNumber),
            sourceLabel: 'Cartola'
          });
        }
      }
      continue;
    }

    const dateISO = normalizeDateToISO(parts[dateColIdx], fallbackYearMonth);
    const descIdx = headerMap && headerMap.descIdx >= 0 ? headerMap.descIdx : dateColIdx + 1;
    let rawDescription = parts[descIdx] || '';
    if (!rawDescription || isSummaryOrNoiseStatementLine(rawDescription)) continue;

    const isIncomingByPrefix = isIncomingStatementDescription(rawDescription);

    let amount = 0;
    let flow = isIncomingByPrefix ? 'in' : 'out';
    let sourceLabel = '';
    let pendingInstallmentsCount = 0;
    let balanceAfter = null;
    let originalTotalAmount = 0;

    // Si existe mapa de cabeceras con columnas explícitas Cargo / Abono
    if (headerMap && (headerMap.cargoIdx >= 0 || headerMap.abonoIdx >= 0)) {
      const cargoAmt = headerMap.cargoIdx >= 0 ? cleanChileanAmount(parts[headerMap.cargoIdx]) : 0;
      const abonoAmt = headerMap.abonoIdx >= 0 ? cleanChileanAmount(parts[headerMap.abonoIdx]) : 0;
      if (cargoAmt > 0) {
        amount = cargoAmt;
        flow = 'out';
      } else if (abonoAmt > 0) {
        amount = abonoAmt;
        flow = 'in';
      }
      if (headerMap.saldoIdx >= 0 && parts[headerMap.saldoIdx] !== '') {
        balanceAfter = cleanChileanAmount(parts[headerMap.saldoIdx]);
      }
      if (headerMap.cuotaIdx >= 0 && isInstallmentSpec(parts[headerMap.cuotaIdx])) {
        rawDescription = `${rawDescription} CUOTA ${parts[headerMap.cuotaIdx]}`;
      }
      if (headerMap.origenIdx >= 0 && parts[headerMap.origenIdx]) {
        sourceLabel = parts[headerMap.origenIdx];
      }
    } else if (headerMap && (headerMap.montoIdx >= 0 || headerMap.valorCuotaIdx >= 0)) {
      const rawMontoCell = headerMap.montoIdx >= 0 ? String(parts[headerMap.montoIdx] || '').trim() : '';
      const rawValorCuotaCell = headerMap.valorCuotaIdx >= 0 ? String(parts[headerMap.valorCuotaIdx] || '').trim() : '';
      const rawCuotasPend = headerMap.cuotasPendientesIdx >= 0 ? parseInt(String(parts[headerMap.cuotasPendientesIdx] || '0').trim(), 10) : 0;
      pendingInstallmentsCount = Number.isFinite(rawCuotasPend) && rawCuotasPend > 0 ? rawCuotasPend : 0;

      const montoAmt = cleanChileanAmount(rawMontoCell);
      const valorCuotaAmt = cleanChileanAmount(rawValorCuotaCell);
      originalTotalAmount = montoAmt > 0 ? montoAmt : valorCuotaAmt;

      // En CMR Falabella: si hay VALOR CUOTA (> 0) y CUOTAS PENDIENTES > 0, el cobro del mes es VALOR CUOTA (no el monto histórico total)
      if (valorCuotaAmt > 0 && (pendingInstallmentsCount > 0 || montoAmt === 0)) {
        amount = valorCuotaAmt;
      } else {
        amount = montoAmt > 0 ? montoAmt : valorCuotaAmt;
      }

      if (pendingInstallmentsCount > 0 && !/cuota/i.test(rawDescription)) {
        rawDescription = `${rawDescription} (${pendingInstallmentsCount} cuota${pendingInstallmentsCount === 1 ? '' : 's'} pend.)`;
      } else if (headerMap.cuotaIdx >= 0 && isInstallmentSpec(parts[headerMap.cuotaIdx])) {
        rawDescription = `${rawDescription} CUOTA ${parts[headerMap.cuotaIdx]}`;
      }
      if (headerMap.origenIdx >= 0 && parts[headerMap.origenIdx]) {
        sourceLabel = parts[headerMap.origenIdx];
      }
      flow = isIncomingByPrefix ? 'in' : 'out';
    } else {
      // Detección heurística sin cabecera
      const col2 = parts[dateColIdx + 2] || '';
      const col3 = parts[dateColIdx + 3] || '';
      const col4 = parts[dateColIdx + 4] || '';

      // Si col2 es un indicador de cuotas CMR (ej. "01/03" o "Cuota 01/03")
      if (isInstallmentSpec(col2)) {
        rawDescription = `${rawDescription} CUOTA ${col2}`;
        amount = cleanChileanAmount(col3);
        sourceLabel = col4 && cleanChileanAmount(col4) === 0 ? col4 : 'CMR Falabella';
        flow = isIncomingByPrefix ? 'in' : 'out';
      } else {
        const amtCol2 = cleanChileanAmount(col2);
        const amtCol3 = cleanChileanAmount(col3);
        const amtCol4 = cleanChileanAmount(col4);
        const col2IsTextChannel = Boolean(col2 && /[a-zA-Z]/.test(col2.replace(/CLP/gi, '')) && amtCol2 === 0);

        if (col2IsTextChannel) {
          // Formato 6 columnas Banco de Chile: Fecha;Descripción;Canal;Cargos;Abonos;Saldo
          if (amtCol3 > 0) {
            amount = amtCol3;
            flow = isIncomingByPrefix ? 'in' : 'out';
          } else if (amtCol4 > 0) {
            amount = amtCol4;
            flow = 'in';
          }
          if (parts[dateColIdx + 5]) {
            balanceAfter = cleanChileanAmount(parts[dateColIdx + 5]);
          }
          sourceLabel = col2 || (isBancoDeChileFormat ? 'Banco de Chile (Fan/Vista)' : 'Cartola');
        } else if (parts.length >= dateColIdx + 5) {
          // Formato 5 columnas: Fecha;Descripción;Cargos;Abonos;Saldo (ignorar col4 que es Saldo)
          if (amtCol2 > 0) {
            amount = amtCol2;
            flow = isIncomingByPrefix ? 'in' : 'out';
          } else if (amtCol3 > 0) {
            amount = amtCol3;
            flow = 'in';
          }
          if (amtCol4 > 0) {
            balanceAfter = amtCol4;
          }
          sourceLabel = isBancoDeChileFormat ? 'Banco de Chile' : 'Cartola';
        } else {
          // Formato 3 o 4 columnas: Fecha;Descripción;Monto;Origen (o Fecha;Descripción;Cargo;Abono)
          if (amtCol2 > 0) {
            amount = amtCol2;
            sourceLabel = col3 && amtCol3 === 0 ? col3 : '';
            if (/^abono$/i.test(sourceLabel)) {
              flow = 'in';
              sourceLabel = '';
            }
          } else if (amtCol3 > 0) {
            amount = amtCol3;
            flow = 'in';
            sourceLabel = isBancoDeChileFormat ? 'Banco de Chile' : 'Cartola';
          }
        }
      }
    }

    if (amount > 0) {
      const cleanDesc = rawDescription.replace(/^PAGO:\s*/i, '').trim() || rawDescription;
      const baseFp = buildBankFingerprint(dateISO, amount, cleanDesc, flow);
      intraStatementFpCounts[baseFp] = (intraStatementFpCounts[baseFp] || 0) + 1;
      const occurrenceIndex = intraStatementFpCounts[baseFp];
      const fingerprint = occurrenceIndex > 1 ? `${baseFp}_occ${occurrenceIndex}` : baseFp;
      const resolvedPm = sourceLabel
        ? guessPaymentMethodFromSource(sourceLabel, currentBlockMethod)
        : currentBlockMethod;
      const nonEmptyCells = parts.filter(Boolean).join(' | ');
      parsedRows.push({
        rowId: `stmt_${i}_${Date.now()}`,
        date: dateISO,
        description: cleanDesc,
        rawDescription,
        normalizedMerchant: normalizeBankDescription(cleanDesc),
        amount,
        originalTotalAmount: originalTotalAmount || amount,
        balanceAfter,
        channelOrBranch: sourceLabel || (currentBlockMethod === 'cmr_falabella' ? 'Titular CMR' : 'Banco de Chile'),
        accountNumber: currentAccountNumber,
        rawLineText: nonEmptyCells,
        glosaExplanation: explainBankGlosa(rawDescription, amount, sourceLabel, currentAccountNumber),
        flow,
        fingerprint,
        occurrenceIndex,
        pendingInstallmentsCount,
        paymentMethod: resolvedPm,
        sourceLabel: sourceLabel || 'Cartola'
      });
    }
  }

  // Vincular contexto cronológico (movimiento inmediatamente anterior y posterior en la misma cuenta)
  for (let idx = 0; idx < parsedRows.length; idx++) {
    const curr = parsedRows[idx];
    const prevSameAcc = parsedRows[idx - 1] && parsedRows[idx - 1].accountNumber === curr.accountNumber
      ? `${parsedRows[idx - 1].date}: ${parsedRows[idx - 1].description} ($${Number(parsedRows[idx - 1].amount).toLocaleString('es-CL')})`
      : null;
    const nextSameAcc = parsedRows[idx + 1] && parsedRows[idx + 1].accountNumber === curr.accountNumber
      ? `${parsedRows[idx + 1].date}: ${parsedRows[idx + 1].description} ($${Number(parsedRows[idx + 1].amount).toLocaleString('es-CL')})`
      : null;
    curr.neighborBefore = prevSameAcc;
    curr.neighborAfter = nextSameAcc;
  }

  return parsedRows;
}

/**
 * Permite parsear tanto texto crudo CSV/TSV como arreglos de filas (arrays de celdas u objetos provenientes de SheetJS / Excel).
 */
export function parseBankStatementRows(rowsOrText, fallbackYearMonth = '2026-10', defaultPaymentMethod = 'cmr_falabella') {
  if (!rowsOrText) return [];
  if (typeof rowsOrText === 'string') {
    return parseBankStatementText(rowsOrText, fallbackYearMonth, defaultPaymentMethod);
  }
  if (!Array.isArray(rowsOrText) || rowsOrText.length === 0) return [];

  // Si es un arreglo de objetos ya estructurados o provenientes de JSON
  if (typeof rowsOrText[0] === 'object' && !Array.isArray(rowsOrText[0]) && rowsOrText[0] !== null) {
    const lines = [];
    rowsOrText.forEach((obj) => {
      const rawDate = obj.date ?? obj.fecha ?? obj.FECHA ?? obj.Fecha ?? '';
      const rawDesc = obj.description ?? obj.descripcion ?? obj.DESCRIPCION ?? obj.Descripcion ?? obj.glosa ?? obj.movimiento ?? '';
      if (isSummaryOrNoiseStatementLine(rawDesc)) return;

      const hasCargoAbono =
        obj.cargo !== undefined || obj.cargos !== undefined || obj.abono !== undefined || obj.abonos !== undefined ||
        obj.CARGO !== undefined || obj.CARGOS !== undefined || obj.ABONO !== undefined || obj.ABONOS !== undefined;

      if (hasCargoAbono) {
        const cargo = obj.cargo ?? obj.cargos ?? obj.CARGO ?? obj.CARGOS ?? 0;
        const abono = obj.abono ?? obj.abonos ?? obj.ABONO ?? obj.ABONOS ?? 0;
        const saldo = obj.saldo ?? obj.SALDO ?? 0;
        lines.push(`${rawDate};${rawDesc};${cargo};${abono};${saldo}`);
      } else {
        const monto = obj.amount ?? obj.monto ?? obj.MONTO ?? obj.Monto ?? obj.valor ?? 0;
        const origen = obj.paymentMethod ?? obj.sourceLabel ?? obj.origen ?? obj.ORIGEN ?? '';
        const flowPrefix = obj.flow === 'in' && !isIncomingStatementDescription(rawDesc) ? `ABONO ${rawDesc}` : rawDesc;
        lines.push(`${rawDate};${flowPrefix};${monto};${origen}`);
      }
    });
    return parseBankStatementText(lines.join('\n'), fallbackYearMonth, defaultPaymentMethod);
  }

  // Si es un arreglo de arreglos de celdas (ej. XLSX.utils.sheet_to_json(sheet, { header: 1 })) or strings
  const serialized = rowsOrText
    .map((row) => (Array.isArray(row) ? row.map((cell) => String(cell ?? '').trim()).join(';') : String(row ?? '').trim()))
    .filter(Boolean)
    .join('\n');

  return parseBankStatementText(serialized, fallbackYearMonth, defaultPaymentMethod);
}

function daysBetweenISO(d1, d2) {
  const t1 = new Date(`${d1}T12:00:00`).getTime();
  const t2 = new Date(`${d2}T12:00:00`).getTime();
  if (isNaN(t1) || isNaN(t2)) return 999;
  return Math.abs(Math.round((t1 - t2) / (1000 * 60 * 60 * 24)));
}

function lookupLearnedContact(description, learnedContacts = {}, expectedFlow = null) {
  if (!learnedContacts || typeof learnedContacts !== 'object') return null;
  const contactKey = normalizeContactKey(description);
  const cleanedKey = normalizeContactKey(normalizeBankDescription(description));
  const rawLower = String(description || '').toLowerCase().trim();

  const candidates = [contactKey, cleanedKey, rawLower].filter(Boolean);
  for (const key of candidates) {
    if (learnedContacts[key]) {
      const entry = learnedContacts[key];
      if (typeof entry === 'string') {
        return { categoryId: entry };
      }
      if (!expectedFlow || !entry.flow || entry.flow === expectedFlow) {
        return entry;
      }
    }
  }

  // Búsqueda parcial por nombre de contacto si la clave guardada está contenida en la glosa
  for (const [savedKey, entry] of Object.entries(learnedContacts)) {
    const cleanSaved = String(savedKey || '').toLowerCase().trim();
    if (cleanSaved.length >= 4 && (contactKey.includes(cleanSaved) || rawLower.includes(cleanSaved))) {
      if (typeof entry === 'string') {
        return { categoryId: entry };
      }
      if (!expectedFlow || !entry.flow || entry.flow === expectedFlow) {
        return entry;
      }
    }
  }

  return null;
}

function inferSmartContextForIncomingAbono(row, allTransactions, learnedContacts = {}) {
  const lower = stripAccents(String(row.description || '').toLowerCase());
  const contactKey = normalizeContactKey(row.description);

  const saved = lookupLearnedContact(row.description, learnedContacts, 'in');
  if (saved) {
    const action =
      saved.abonoAction === 'reimbursement'
        ? 'reimburse'
        : saved.abonoAction === 'loan_collection'
          ? 'loan_collected'
          : saved.abonoAction || saved.type || 'income';
    const normalizedAction =
      action === 'reimbursement' ? 'reimburse' : action === 'loan_collection' ? 'loan_collected' : action;
    return {
      abonoAction: normalizedAction,
      abonoCategory:
        normalizedAction === 'reimburse'
          ? 'reimbursement'
          : normalizedAction === 'loan_collected'
            ? 'loan_collection'
            : normalizedAction,
      reimburseCategoryId: saved.reimburseCategoryId || saved.categoryId || 'supermercado',
      smartHint: `🧠 Memoria familiar: ya habías clasificado a "${extractContactDisplayName(row.description)}" de esta forma.`
    };
  }

  // 1. Reembolsos médicos (Isapre / Fonasa / Seguros complementarios)
  if (/isapre|colmena|consalud|cruz\s*blanca|banmedica|vida\s*tres|masvida|esencial|fonasa|metlife|bice\s*vida|sura|chubb|bupa|seguro|reembolso\s*med|imed|i-med|\bbono\b/i.test(lower)) {
    return {
      abonoAction: 'reimburse',
      abonoCategory: 'reimbursement',
      reimburseCategoryId: 'salud_farmacia',
      smartHint: '💡 Reembolso Médico (Isapre/Seguro) detectado → Devuelve cupo a 💊 Salud y Farmacia.'
    };
  }

  // 2. Reembolsos de colegio / jardín infantil / sala cuna
  if (/colegio|jardin|sala\s+cuna|apoderado|cuota\s+curso|centro\s+de\s+padres|escolar|matricula/i.test(lower)) {
    return {
      abonoAction: 'reimburse',
      abonoCategory: 'reimbursement',
      reimburseCategoryId: 'hija',
      smartHint: '💡 Reembolso de Colegio / Jardín detectado → Devuelve cupo a 👶 Hija.'
    };
  }

  // 3. Devolución o cobro de préstamo que nos debían (por glosa explícita o cruce con loan_given)
  const openLoanGiven = allTransactions.find(
    (tx) =>
      tx.type === 'loan_given' &&
      (Math.abs(Number(tx.amount) - row.amount) <= 1000 ||
        (contactKey.length > 3 && String(tx.note || '').toLowerCase().includes(contactKey.split(' ')[0])))
  );
  if (
    openLoanGiven ||
    /devolucion.*prestamo|pago\s+(?:de\s+)?prestamo|cobro\s+prestamo|devuelve\s+prestamo|me\s+devuelve|pago\s+deuda/i.test(lower)
  ) {
    return {
      abonoAction: 'loan_collected',
      abonoCategory: 'loan_collection',
      reimburseCategoryId: 'supermercado',
      smartHint: openLoanGiven
        ? `💡 Coincide con "${openLoanGiven.note}" ($${Number(openLoanGiven.amount).toLocaleString('es-CL')}) que te debían → Salda esa cuenta por cobrar.`
        : '💡 Devolución de préstamo detectada → Salda cuenta por cobrar.'
    };
  }

  // 4. Préstamo recibido (nos prestaron plata)
  if (/prestamo\s+recibido|prestamo\s+de\b|me\s+presta|credito\s+consumo|avance\s+en\s+cuotas|(?:^|\s)prestamo(?:\s|$)/i.test(lower)) {
    return {
      abonoAction: 'loan_received',
      abonoCategory: 'loan_received',
      reimburseCategoryId: 'supermercado',
      smartHint: '📥 Préstamo recibido detectado → Se registra como deuda por devolver (no infla tus ingresos).'
    };
  }

  // 5. Devolución de compra en comercio / nota de crédito / reembolso general
  if (/devolucion|nota\s+de\s+credito|reversa|anulacion|reembolso/i.test(lower)) {
    const cat = guessCategoryFromDescription(lower);
    return {
      abonoAction: 'reimburse',
      abonoCategory: 'reimbursement',
      reimburseCategoryId: cat !== 'imprevistos' ? cat : 'gustos_personales',
      smartHint: '💡 Devolución o reembolso detectado → Devuelve cupo a la categoría original.'
    };
  }

  // 6. Rescate desde ahorros / inversiones
  if (/rescate|fondo\s+mutuo|ffmm|fintual|racional|deposito\s+a\s+plazo|dap|cuenta\s+ahorro|ahorro/i.test(lower)) {
    return {
      abonoAction: 'savings_withdrawal',
      abonoCategory: 'savings_withdrawal',
      reimburseCategoryId: 'supermercado',
      smartHint: '⚠️ Retiro desde tus Ahorros / Inversiones → Pre-seleccionado para NO disfrazarlo como ingreso.'
    };
  }

  // 6.5. Sueldo pagado en los últimos días del mes anterior (ej. 29/10 para financiar Noviembre)
  if (row.isLatePrevMonthSalary) {
    return {
      abonoAction: 'base_income',
      abonoCategory: 'base_income',
      reimburseCategoryId: 'supermercado',
      extraBudgetPct: 0,
      extraTarget: 'proportional_unlocked',
      smartHint: `💼 Sueldo de fin de mes anterior (${row.date}) detectado automáticamente → Se imputa como tu Ingreso Base de ${row.targetBudgetMonth || 'este mes'} (parte de tus $2.800.000).`
    };
  }

  // 6.6. Retiro mensual habitual de Vías SpA (forma parte del Ingreso Base de $2.800.000)
  if (/vias\s+spa/i.test(lower)) {
    return {
      abonoAction: 'base_income',
      abonoCategory: 'base_income',
      reimburseCategoryId: 'supermercado',
      extraBudgetPct: 20,
      extraTarget: 'proportional_unlocked',
      smartHint: '🏢 Retiro de Utilidades Vías SpA → Se registra dentro de tu Ingreso Base ($2.800.000) sin alterar tu presupuesto. Cámbialo a "💰 Ingreso Extra Adicional" si es un retiro extra.'
    };
  }

  // 7. Sueldo / Remuneración del mes en curso
  if (
    /sueldo|remuneracion|haberes|nomina/i.test(lower) ||
    (row.amount >= 900000 && /abono\s+por\s+traspaso\s+internet/i.test(lower))
  ) {
    return {
      abonoAction: 'base_income',
      abonoCategory: 'base_income',
      reimburseCategoryId: 'supermercado',
      extraBudgetPct: 0,
      extraTarget: 'proportional_unlocked',
      smartHint: '💼 Sueldo / Remuneración detectada → Se registra dentro de tu Ingreso Base del mes ($2.800.000).'
    };
  }

  // 7.5. Honorarios / Aguinaldo / Bono / Devolución SII → Ingreso Extra Adicional (diversificable)
  if (/honorarios|aguinaldo|gratificacion|tesoreria|sii\b|bono/i.test(lower)) {
    return {
      abonoAction: 'income',
      abonoCategory: 'income',
      reimburseCategoryId: 'supermercado',
      extraBudgetPct: 20,
      extraTarget: 'proportional_unlocked',
      smartHint: '💰 Ingreso Extra Adicional detectado → Puedes elegir qué % va a Presupuestos No Fijos (🔓) y qué % a Ahorro Blindado (🛡️).'
    };
  }

  // 8. Heurística de cuenta compartida reciente (±4 días)
  const recentBigExpense = allTransactions.find(
    (tx) =>
      tx.type === 'expense' &&
      ['delivery_salidas', 'supermercado', 'gustos_personales'].includes(tx.categoryId) &&
      Number(tx.amount) > row.amount &&
      row.amount >= 4000 &&
      row.amount <= 90000 &&
      daysBetweenISO(tx.date, row.date) <= 4
  );
  if (recentBigExpense && /traspaso\s+de|transferencia\s+de|tef\s+de/i.test(lower)) {
    return {
      abonoAction: 'reimburse',
      abonoCategory: 'reimbursement',
      reimburseCategoryId: recentBigExpense.categoryId,
      extraBudgetPct: 20,
      extraTarget: 'proportional_unlocked',
      smartHint: `💡 ¿Cuenta compartida? Hace poco pagaste $${Number(recentBigExpense.amount).toLocaleString('es-CL')} en "${recentBigExpense.note}". Pre-seleccionado como Reembolso.`
    };
  }

  return {
    abonoAction: 'income',
    abonoCategory: 'income',
    reimburseCategoryId: 'supermercado',
    extraBudgetPct: 20,
    extraTarget: 'proportional_unlocked',
    smartHint: '💬 Abono recibido: confirma si es Ingreso Extra (con % a presupuesto/ahorro), Reembolso o Préstamo.'
  };
}

function inferSmartContextForOutgoingCargo(row, allTransactions, learnedContacts = {}) {
  const lower = stripAccents(String(row.description || '').toLowerCase());
  const contactKey = normalizeContactKey(row.description);

  const saved = lookupLearnedContact(row.description, learnedContacts, 'out');
  if (saved && (saved.suggestedCategoryId || saved.categoryId)) {
    return {
      suggestedCategoryId: saved.suggestedCategoryId || saved.categoryId,
      smartHint: '🧠 Memoria familiar: recordado de tus cartolas anteriores.'
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

  if (/giro\s+cajero|giro\s+en\s+cajero|cajero\s+automatico/i.test(lower)) {
    return {
      suggestedCategoryId: 'supermercado',
      smartHint: '💵 Giro en Cajero: clasificado por defecto en Feria/Supermercado.'
    };
  }

  const cat = guessCategoryFromDescription(row.description);
  if (cat !== 'imprevistos') {
    return {
      suggestedCategoryId: cat,
      smartHint: '✨ Categoría detectada automáticamente según el comercio.'
    };
  }

  if (/traspaso\s+a|tef\s+a|transferencia\s+a/i.test(lower)) {
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

/**
 * Busca si un conjunto de transacciones del mismo día (±4/5 días respecto al cargo bancario)
 * corresponde a una Boleta Mixta / Compra Dividida aunque no tengan `receiptGroupId` explícito,
 * o cuando tienen `splitGroupId` / `receiptGroupId`.
 */
function findImplicitSplitGroup(row, allTxs, usedTxIds, tolerance = 800) {
  const candidates = allTxs.filter(
    (tx) =>
      !usedTxIds.has(tx.id) &&
      ['expense', 'loan_given'].includes(tx.type) &&
      daysBetweenISO(tx.date, row.date) <= 5 &&
      Number(tx.amount) > 0 &&
      Number(tx.amount) < row.amount
  );

  if (candidates.length < 2) return null;

  // Agrupar candidatos por fecha exacta de la compra
  const byDate = {};
  candidates.forEach((tx) => {
    const key = tx.date;
    if (!byDate[key]) byDate[key] = [];
    byDate[key].push(tx);
  });

  // Ordenar fechas priorizando cercanía a la fecha de la cartola
  const sortedDates = Object.keys(byDate).sort(
    (d1, d2) => daysBetweenISO(d1, row.date) - daysBetweenISO(d2, row.date)
  );

  for (const dateKey of sortedDates) {
    const dayItems = byDate[dateKey];
    if (dayItems.length < 2) continue;

    // 1. Probar suma total del día filtrando por el mismo medio de pago (si aplica)
    if (row.paymentMethod) {
      const samePmItems = dayItems.filter(
        (t) => !t.paymentMethod || t.paymentMethod === row.paymentMethod
      );
      if (samePmItems.length >= 2) {
        const sumPm = samePmItems.reduce((acc, t) => acc + Number(t.amount || 0), 0);
        if (Math.abs(sumPm - row.amount) <= tolerance) {
          return {
            groupId: `implicit_split_${dateKey}_${row.amount}`,
            date: dateKey,
            totalAmount: sumPm,
            items: samePmItems
          };
        }
      }
    }

    // 2. Probar suma total de todos los candidatos del día
    const sumAllDay = dayItems.reduce((acc, t) => acc + Number(t.amount || 0), 0);
    if (Math.abs(sumAllDay - row.amount) <= tolerance) {
      return {
        groupId: `implicit_split_${dateKey}_${row.amount}`,
        date: dateKey,
        totalAmount: sumAllDay,
        items: dayItems
      };
    }

    // 3. Buscar subconjunto de 2 a 5 transacciones del mismo día que sumen exactamente row.amount (±tolerance)
    const n = Math.min(dayItems.length, 10);
    let bestSubset = null;
    let bestDiff = Infinity;

    const searchSubset = (startIdx, currentItems, currentSum) => {
      if (currentItems.length >= 2) {
        const diff = Math.abs(currentSum - row.amount);
        if (diff <= tolerance && diff < bestDiff) {
          bestDiff = diff;
          bestSubset = [...currentItems];
          if (diff === 0) return true;
        }
      }
      if (currentItems.length >= 5 || currentSum > row.amount + tolerance) return false;

      for (let i = startIdx; i < n; i++) {
        currentItems.push(dayItems[i]);
        if (searchSubset(i + 1, currentItems, currentSum + Number(dayItems[i].amount || 0))) {
          return true;
        }
        currentItems.pop();
      }
      return false;
    };

    searchSubset(0, [], 0);
    if (bestSubset) {
      const total = bestSubset.reduce((acc, t) => acc + Number(t.amount || 0), 0);
      return {
        groupId: `implicit_split_${dateKey}_${row.amount}`,
        date: dateKey,
        totalAmount: total,
        items: bestSubset
      };
    }
  }

  return null;
}

/**
 * Vincula las partes de una compra dividida para que cuando `app.js` (o el llamador)
 * marque `matchedTx.reconciled = true`, todas las partes del split queden conciliadas
 * y con su `receiptGroupId` / `bankFingerprint` sincronizado.
 */
function linkSplitItemsForReconciliation(items, fingerprint, groupId) {
  if (!Array.isArray(items) || items.length === 0) return;

  items.forEach((item) => {
    if (!item.receiptGroupId) {
      item.receiptGroupId = item.splitGroupId || groupId;
    }
    if (!item.splitGroupId) {
      item.splitGroupId = item.receiptGroupId;
    }
  });

  if (items.length < 2) return;

  const primary = items[0];
  let currentReconciled = Boolean(primary.reconciled);

  Object.defineProperty(primary, 'reconciled', {
    configurable: true,
    enumerable: true,
    get() {
      return currentReconciled;
    },
    set(val) {
      currentReconciled = Boolean(val);
      Object.defineProperty(primary, 'reconciled', {
        value: currentReconciled,
        writable: true,
        enumerable: true,
        configurable: true
      });
      if (currentReconciled) {
        const nowISO = new Date().toISOString();
        items.forEach((peer) => {
          if (peer !== primary) {
            peer.reconciled = true;
            if (fingerprint && !peer.bankFingerprint) {
              peer.bankFingerprint = fingerprint;
            }
            peer.updatedAt = nowISO;
          }
        });
      }
    }
  });
}

/**
 * Aplica la conciliación sobre el arreglo de transacciones marcando como `reconciled = true`
 * tanto las coincidencias individuales como todas las partes de una Boleta Mixta dividida.
 */
export function applyReconciliationToTransactions(analyzedRows, transactions = []) {
  if (!Array.isArray(analyzedRows) || !Array.isArray(transactions)) return transactions;
  const nowISO = new Date().toISOString();

  analyzedRows.forEach((row) => {
    if (row.status === 'matched_duplicate') {
      const targets =
        Array.isArray(row.matchedTransactions) && row.matchedTransactions.length > 0
          ? row.matchedTransactions
          : row.matchedTx
            ? [row.matchedTx]
            : [];

      targets.forEach((matched) => {
        const tx = transactions.find((t) => t.id === matched.id) || matched;
        if (tx) {
          tx.reconciled = true;
          if (row.fingerprint) tx.bankFingerprint = row.fingerprint;
          tx.updatedAt = nowISO;
        }
      });
    }
  });

  return transactions;
}

/**
 * Detecta si una glosa de cartola corresponde a una plantilla de Cuenta Fija mensual
 * (Arriendo, Gastos Comunes, Luz, Agua, Gas, Internet o plantillas personalizadas).
 */
export function matchFixedTemplateFromStatementRow(row, fixedTemplates = []) {
  if (!row || row.flow !== 'out' || !Array.isArray(fixedTemplates) || fixedTemplates.length === 0) {
    return null;
  }
  const lower = stripAccents(String(`${row.rawDescription || ''} ${row.description || ''}`).toLowerCase());

  const templateRuleKeywords = {
    fix_arriendo: ['arriendo', 'dividendo', 'hipotecario', 'inmobiliaria', 'corredora'],
    fix_gGCC: ['gasto comun', 'gastos comunes', 'ggcc', 'comunidad feliz', 'comunidadfeliz', 'edifito', 'kastor', 'condominio', 'administracion edificio'],
    fix_luz: ['enel', 'cge', 'chilquinta', 'saesa', 'frontel', 'codiner', 'cuenta luz', 'electricidad'],
    fix_agua: ['aguas andinas', 'aguas cordillera', 'aguas manantiales', 'esval', 'essbio', 'essal', 'nuevosur', 'aguas del valle', 'sacyr agua', 'cuenta agua'],
    fix_gas: ['metrogas', 'lipigas', 'abastible', 'gasco', 'gas sur', 'intergas', 'cuenta gas'],
    fix_internet: ['movistar', 'entel', 'wom', 'vtr', 'claro', 'gtd', 'telsur', 'mundo pacifico', 'mundo telecom', 'starlink', 'internet hogar', 'fibra optica']
  };

  for (const tpl of fixedTemplates) {
    if (!tpl || !tpl.id) continue;
    const ruleKws = templateRuleKeywords[tpl.id] || [];
    if (ruleKws.some((kw) => matchKeywordInText(lower, kw))) {
      return tpl;
    }
    const cleanTplName = stripAccents(String(tpl.name || '').toLowerCase())
      .replace(/\([^)]*\)/g, '')
      .trim();
    if (cleanTplName.length >= 5 && lower.includes(cleanTplName)) {
      return tpl;
    }
  }

  return null;
}

export function reconcileStatementRows(
  statementRows,
  existingTransactions = [],
  wifeName = 'Marie',
  allHistoricalTransactions = null,
  learnedContacts = {},
  fixedTemplates = [],
  options = {}
) {
  if (!Array.isArray(statementRows)) return [];

  const filterActiveYm = options?.activeYearMonth ? String(options.activeYearMonth).slice(0, 7) : null;
  const onlyActiveMonth = Boolean(options?.onlyActiveMonth && filterActiveYm);

  let prevYearMonth = '';
  if (filterActiveYm && /^\d{4}-\d{2}$/.test(filterActiveYm)) {
    const [yNum, mNum] = filterActiveYm.split('-').map(Number);
    prevYearMonth = mNum === 1 ? `${yNum - 1}-12` : `${yNum}-${String(mNum - 1).padStart(2, '0')}`;
  }

  const allTxs =
    Array.isArray(allHistoricalTransactions) && allHistoricalTransactions.length > 0
      ? allHistoricalTransactions
      : Array.isArray(existingTransactions)
        ? existingTransactions
        : [];

  const usedTxIds = new Set();
  const usedGroupIds = new Set();
  const claimedFixedTemplateMonthKeys = new Set();
  const claimedCmrPayments = [];
  const intraBatchBaseFpCounts = {};

  // Agrupar compras divididas explícitas (soportando tanto `receiptGroupId` como `splitGroupId`)
  const receiptGroups = {};
  allTxs.forEach((tx) => {
    const grpId = tx.receiptGroupId || tx.splitGroupId || tx.groupId;
    if (grpId) {
      if (!receiptGroups[grpId]) {
        receiptGroups[grpId] = {
          groupId: grpId,
          date: tx.date,
          totalAmount: 0,
          items: []
        };
      }
      receiptGroups[grpId].totalAmount += Number(tx.amount || 0);
      receiptGroups[grpId].items.push(tx);
    }
  });

  return statementRows.map((rawRow) => {
    const flow = rawRow.flow || (isIncomingStatementDescription(rawRow.description) ? 'in' : 'out');
    const amount = cleanChileanAmount(rawRow.amount);
    const date = isValidStatementDate(rawRow.date) ? normalizeDateToISO(rawRow.date) : rawRow.date;
    const rowYearMonth = String(date || '').slice(0, 7);
    const dayOfMonth = Number(String(date || '').slice(8, 10) || 0);
    const internalType = detectInternalOrCardPayment(rawRow.description, wifeName);

    // Detectar sueldo pagado en los últimos días del mes anterior (días 24 al 31 de M-1)
    // para que financie el mes activo (ej. Sueldo del 29/10 -> imputado a Noviembre 2026)
    const lowerDesc = stripAccents(String(rawRow.description || '').toLowerCase());
    const isLatePrevMonthSalary = Boolean(
      filterActiveYm &&
        prevYearMonth &&
        rowYearMonth === prevYearMonth &&
        dayOfMonth >= 24 &&
        flow === 'in' &&
        !internalType &&
        (amount >= 500000 || /sueldo|remuneracion|haberes|nomina|anticipo|vias\s+spa/i.test(lowerDesc))
    );

    const targetBudgetMonth = isLatePrevMonthSalary ? filterActiveYm : rowYearMonth;
    const isPreviousMonth = Boolean(
      filterActiveYm && rowYearMonth && rowYearMonth < filterActiveYm && !isLatePrevMonthSalary
    );
    const baseFp = buildBankFingerprint(date, amount, rawRow.description, flow);
    intraBatchBaseFpCounts[baseFp] = (intraBatchBaseFpCounts[baseFp] || 0) + 1;
    const occurrenceIndex = Number(rawRow.occurrenceIndex || intraBatchBaseFpCounts[baseFp] || 1);

    let fingerprint =
      rawRow.fingerprint ||
      rawRow.bankFingerprint ||
      (occurrenceIndex > 1 ? `${baseFp}_occ${occurrenceIndex}` : baseFp);
    if (occurrenceIndex > 1 && !/_occ\d+$/.test(fingerprint)) {
      fingerprint = `${fingerprint}_occ${occurrenceIndex}`;
    }

    const baseAltFp = buildBankFingerprint(
      date,
      amount,
      normalizeBankDescription(rawRow.description),
      flow
    );
    const altFingerprint = occurrenceIndex > 1 ? `${baseAltFp}_occ${occurrenceIndex}` : baseAltFp;

    const row = {
      ...rawRow,
      date,
      rowYearMonth,
      targetBudgetMonth,
      isLatePrevMonthSalary,
      isPreviousMonth,
      amount,
      flow,
      fingerprint,
      occurrenceIndex
    };

    // 0. BLINDAJE CONTRA DOBLE SUBIDA DE CARTOLA (Huella Digital Exacta)
    const exactFingerprintMatch = allTxs.find(
      (tx) =>
        !usedTxIds.has(tx.id) &&
        tx.bankFingerprint &&
        (tx.bankFingerprint === fingerprint || tx.bankFingerprint === altFingerprint)
    );
    if (exactFingerprintMatch) {
      usedTxIds.add(exactFingerprintMatch.id);
      return {
        ...row,
        status: 'matched_duplicate',
        reconciliationStatus: 'already_registered',
        isDuplicateFingerprint: true,
        matchedTx: exactFingerprintMatch,
        matchedTransactions: [exactFingerprintMatch],
        matchReason: `Ya importado previamente ("${exactFingerprintMatch.note}") — Bloqueado`,
        suggestedCategoryId: exactFingerprintMatch.categoryId,
        selectedToImport: false
      };
    }

    // ========================================================================
    // RAMA A: ENTRADAS DE DINERO / ABONOS (flow === 'in')
    // ========================================================================
    if (row.flow === 'in') {
      if (internalType === 'transfer_self' || internalType === 'transfer_wife') {
        return {
          ...row,
          status: 'internal',
          internalType: 'transfer_self',
          reconciliationCategory: 'internal_transfer',
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
          ['income', 'reimbursement', 'loan_received', 'loan_collected', 'loan_collection', 'savings_withdrawal'].includes(tx.type) &&
          Math.abs(Number(tx.amount) - row.amount) <= 1000 &&
          daysBetweenISO(tx.date, row.date) <= 5
      );

      if (matchedIncoming) {
        usedTxIds.add(matchedIncoming.id);
        return {
          ...row,
          status: 'matched_duplicate',
          reconciliationStatus: 'already_registered',
          matchedTx: matchedIncoming,
          matchedTransactions: [matchedIncoming],
          matchReason: `Abono ya registrado ("${matchedIncoming.note}") el ${matchedIncoming.date}`,
          suggestedCategoryId: matchedIncoming.categoryId,
          selectedToImport: false
        };
      }

      const smartIn = inferSmartContextForIncomingAbono(row, allTxs, learnedContacts);
      const shouldSelectIn = smartIn.abonoAction !== 'ignore' && !(onlyActiveMonth && isPreviousMonth);
      return {
        ...row,
        status: 'incoming_abono',
        abonoAction: smartIn.abonoAction,
        abonoCategory: smartIn.abonoCategory,
        inferredType: smartIn.abonoCategory,
        reimburseCategoryId: smartIn.reimburseCategoryId,
        suggestedCategoryId: smartIn.reimburseCategoryId,
        extraBudgetPct: typeof smartIn.extraBudgetPct === 'number' ? smartIn.extraBudgetPct : 20,
        extraTarget: smartIn.extraTarget || 'proportional_unlocked',
        smartHint: smartIn.smartHint,
        matchedTx: null,
        selectedToImport: shouldSelectIn
      };
    }

    // ========================================================================
    // RAMA B: SALIDAS DE DINERO / CARGOS (flow === 'out')
    // ========================================================================
    if (internalType) {
      if (internalType === 'cmr_payment') {
        const duplicateInBatch = claimedCmrPayments.find(
          (p) => Math.abs(p.amount - row.amount) <= 1000 && daysBetweenISO(p.date, row.date) <= 5
        );
        if (duplicateInBatch) {
          return {
            ...row,
            status: 'matched_duplicate',
            reconciliationStatus: 'already_registered',
            matchedTx: null,
            matchedTransactions: [],
            matchReason: `Pago CMR ya incluido en la otra cartola (${duplicateInBatch.date}) — Evita duplicar entre Banco de Chile y CMR`,
            suggestedCategoryId: 'pago_tarjeta',
            selectedToImport: false
          };
        }
        claimedCmrPayments.push({ date: row.date, amount: row.amount });
      }

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
        reconciliationCategory: internalType === 'cmr_payment' ? 'cmr_payment' : 'internal_transfer',
        alreadyRecordedInternal: Boolean(matchedInternal),
        matchedTx: matchedInternal || null,
        suggestedCategoryId: guessCategoryFromDescription(row.description),
        selectedToImport: internalType === 'transfer_wife' && !matchedInternal && !(onlyActiveMonth && isPreviousMonth)
      };
    }

    // 1. Buscar coincidencia con Cuota CMR generada (ej. "CUOTA 02/03" o "Cuota 2/3")
    const rawForCuota = `${row.rawDescription || ''} ${row.description || ''}`;
    const cuotaMatchRegex = rawForCuota.match(/(?:cuota\s*)?0?(\d{1,2})\s*(?:\/|de)\s*0?(\d{1,2})/i);
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
          reconciliationStatus: 'already_registered',
          matchedTx: installmentTx,
          matchedTransactions: [installmentTx],
          matchReason: `Coincide con ${installmentTx.note} programada por $${Number(installmentTx.amount).toLocaleString('es-CL')}`,
          suggestedCategoryId: installmentTx.categoryId,
          selectedToImport: false
        };
      }
    }

    // 2. Buscar coincidencia directa o monto redondeado en ventana de ±5 días (cubre ±4 días y cruces de fin de mes)
    const directMatch = allTxs.find((tx) => {
      if (usedTxIds.has(tx.id)) return false;
      if (!['expense', 'loan_repaid', 'loan_given'].includes(tx.type)) return false;
      const dayDiff = daysBetweenISO(tx.date, row.date);
      if (dayDiff > 5) return false;
      const amtDiff = Math.abs(Number(tx.amount) - row.amount);
      const tolerance = Math.max(600, Math.round(row.amount * 0.04));
      return amtDiff <= tolerance && (dayDiff <= 4 || amtDiff <= 600);
    });

    if (directMatch) {
      usedTxIds.add(directMatch.id);
      const wasRounded = Number(directMatch.amount) !== row.amount;
      return {
        ...row,
        status: 'matched_duplicate',
        reconciliationStatus: 'already_registered',
        matchedTx: directMatch,
        matchedTransactions: [directMatch],
        matchReason: wasRounded
          ? `Coincide con "${directMatch.note}" anotado por $${Number(directMatch.amount).toLocaleString('es-CL')} el ${directMatch.date} (Ajustado al banco: $${row.amount.toLocaleString('es-CL')})`
          : `Coincide con "${directMatch.note || 'Gasto registrado'}" del ${directMatch.date} ($${Number(directMatch.amount).toLocaleString('es-CL')})`,
        suggestedCategoryId: directMatch.categoryId,
        selectedToImport: false
      };
    }

    // 3. Buscar coincidencia con el total de una Boleta Dividida (Splits explícitos o implícitos en ±5 días)
    let groupMatch = Object.values(receiptGroups).find(
      (grp) =>
        !usedGroupIds.has(grp.groupId) &&
        grp.items.length >= 2 &&
        grp.items.every((item) => !usedTxIds.has(item.id)) &&
        Math.abs(grp.totalAmount - row.amount) <= 800 &&
        daysBetweenISO(grp.date, row.date) <= 5
    );

    if (!groupMatch) {
      groupMatch = findImplicitSplitGroup(row, allTxs, usedTxIds, 800);
    }

    if (groupMatch) {
      usedGroupIds.add(groupMatch.groupId);
      groupMatch.items.forEach((item) => usedTxIds.add(item.id));
      linkSplitItemsForReconciliation(groupMatch.items, fingerprint, groupMatch.groupId);

      return {
        ...row,
        status: 'matched_duplicate',
        reconciliationStatus: 'already_registered',
        isSplitMatch: true,
        splitGroupId: groupMatch.groupId,
        receiptGroupId: groupMatch.groupId,
        matchedTx: groupMatch.items[0],
        matchedTransactions: groupMatch.items,
        matchedSplitIds: groupMatch.items.map((item) => item.id),
        matchReason: `Coincide con compra dividida en ${groupMatch.items.length} partes del ${groupMatch.date} (Total $${groupMatch.totalAmount.toLocaleString('es-CL')})`,
        suggestedCategoryId: groupMatch.items[0]?.categoryId || 'supermercado',
        selectedToImport: false
      };
    }

    // 3.5. Buscar coincidencia o vinculación automática con Cuenta Fija mensual (Arriendo, GGCC, Luz, Agua, Gas, Internet)
    const matchedFixedTemplate = matchFixedTemplateFromStatementRow(row, fixedTemplates);
    if (matchedFixedTemplate && rowYearMonth) {
      const existingFixedTx = allTxs.find(
        (tx) =>
          !usedTxIds.has(tx.id) &&
          tx.type === 'expense' &&
          tx.fixedTemplateId === matchedFixedTemplate.id &&
          String(tx.date || '').slice(0, 7) === rowYearMonth &&
          Math.abs(Number(tx.amount) - row.amount) <= Math.max(15000, Math.round(row.amount * 0.25))
      );

      if (existingFixedTx) {
        usedTxIds.add(existingFixedTx.id);
        return {
          ...row,
          status: 'matched_duplicate',
          reconciliationStatus: 'already_registered',
          matchedTx: existingFixedTx,
          matchedTransactions: [existingFixedTx],
          matchReason: `Coincide con cuenta fija "${matchedFixedTemplate.name}" ya confirmada este mes ($${Number(existingFixedTx.amount).toLocaleString('es-CL')})`,
          suggestedCategoryId: existingFixedTx.categoryId || matchedFixedTemplate.categoryId,
          suggestedFixedTemplateId: matchedFixedTemplate.id,
          suggestedFixedTemplateName: matchedFixedTemplate.name,
          selectedToImport: false
        };
      }
    }

    // 4. Movimiento no registrado -> predecir categoría o préstamo con el Motor Contextual
    const smartOut = inferSmartContextForOutgoingCargo(row, allTxs, learnedContacts);
    let suggestedFixedTemplateId = null;
    let suggestedFixedTemplateName = null;
    let suggestedCategoryId = smartOut.suggestedCategoryId;
    let smartHint = smartOut.smartHint;

    if (matchedFixedTemplate && rowYearMonth) {
      const fixedMonthKey = `${matchedFixedTemplate.id}_${rowYearMonth}`;
      const alreadyPaidInMonth = allTxs.some(
        (tx) =>
          tx.type === 'expense' &&
          tx.fixedTemplateId === matchedFixedTemplate.id &&
          String(tx.date || '').slice(0, 7) === rowYearMonth
      );
      if (!alreadyPaidInMonth && !claimedFixedTemplateMonthKeys.has(fixedMonthKey)) {
        claimedFixedTemplateMonthKeys.add(fixedMonthKey);
        suggestedFixedTemplateId = matchedFixedTemplate.id;
        suggestedFixedTemplateName = matchedFixedTemplate.name;
        suggestedCategoryId = matchedFixedTemplate.categoryId || suggestedCategoryId;
        smartHint = `📌 Se vinculará automáticamente a tu cuenta fija "${matchedFixedTemplate.name}" en 🏠 Fijos.`;
      }
    }

    if (occurrenceIndex > 1) {
      smartHint = `🔁 Compra repetida #${occurrenceIndex} en el mismo día · ${smartHint}`;
    }

    return {
      ...row,
      status: 'forgotten_new',
      reconciliationStatus: 'new_unregistered',
      matchedTx: null,
      matchedTransactions: [],
      suggestedCategoryId,
      suggestedFixedTemplateId,
      suggestedFixedTemplateName,
      smartHint,
      selectedToImport: !(onlyActiveMonth && isPreviousMonth)
    };
  });
}
