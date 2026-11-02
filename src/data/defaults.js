// Categorías diseñadas para una familia en Chile con una hija pequeña (20 meses)
export const DEFAULT_CATEGORIES = [
  {
    id: 'supermercado',
    name: 'Supermercado y Feria',
    icon: '🛒',
    color: '#10b981',
    group: 'esencial',
    defaultBudget: 420000,
    description: 'Lider, Jumbo, feria, verdulería, carnicería, panadería'
  },
  {
    id: 'hija',
    name: 'Hija (Pañales, Leche, Ropa)',
    icon: '👶',
    color: '#ec4899',
    group: 'esencial',
    defaultBudget: 140000,
    description: 'Pañales, toallitas, leche/alimentación, ropa, juguetes, pediatra'
  },
  {
    id: 'vivienda_fijos',
    name: 'Vivienda y Cuentas Fijas',
    icon: '🏠',
    color: '#3b82f6',
    group: 'fijo',
    defaultBudget: 850000,
    description: 'Arriendo, gastos comunes, luz, agua, gas, internet, celulares'
  },
  {
    id: 'salud_farmacia',
    name: 'Salud y Farmacia',
    icon: '💊',
    color: '#06b6d4',
    group: 'esencial',
    defaultBudget: 80000,
    description: 'Cruz Verde, Salcobrand, Ahumada, consultas médicas, exámenes'
  },
  {
    id: 'transporte',
    name: 'Transporte, Auto y Bencina',
    icon: '🚗',
    color: '#f59e0b',
    group: 'esencial',
    defaultBudget: 130000,
    description: 'Copec, Shell, TAG, estacionamientos, Bip!, Uber, mantención'
  },
  {
    id: 'delivery_salidas',
    name: 'Delivery, Salidas y Cafés',
    icon: '🍔',
    color: '#ef4444',
    group: 'estilo_vida',
    defaultBudget: 100000,
    description: 'PedidosYa, Uber Eats, restaurantes, helados, cafés, paseos'
  },
  {
    id: 'hogar_varios',
    name: 'Hogar, Aseo y Varios',
    icon: '🧹',
    color: '#8b5cf6',
    group: 'esencial',
    defaultBudget: 60000,
    description: 'Sodimac, Casaideas, artículos de aseo, reparaciones, regalos'
  },
  {
    id: 'gustos_personales',
    name: 'Gustos y Compras Personales',
    icon: '🎁',
    color: '#f97316',
    group: 'estilo_vida',
    defaultBudget: 80000,
    description: 'Ropa adultos, Falabella, MercadoLibre, hobbies, antojos'
  },
  {
    id: 'imprevistos',
    name: 'Imprevistos y Otros',
    icon: '🚨',
    color: '#64748b',
    group: 'esencial',
    defaultBudget: 50000,
    description: 'Gastos no planificados o emergencias menores del mes'
  }
];

// Medios de pago reales de la familia
export const PAYMENT_METHODS = [
  {
    id: 'bch_ctacte',
    name: 'Banco de Chile (Cta. Corriente)',
    shortName: 'B. Chile Cta. Cte.',
    icon: '🏦',
    type: 'debit',
    owner: 'el',
    badgeColor: '#1e3a8a'
  },
  {
    id: 'bch_vista',
    name: 'Banco de Chile (Cta. Vista)',
    shortName: 'B. Chile Vista',
    icon: '💳',
    type: 'debit',
    owner: 'el',
    badgeColor: '#2563eb'
  },
  {
    id: 'cmr_falabella',
    name: 'CMR Falabella (Crédito)',
    shortName: 'CMR Falabella',
    icon: '🟢',
    type: 'credit',
    owner: 'ambos',
    badgeColor: '#15803d'
  },
  {
    id: 'cuenta_mujer',
    name: 'Cuenta Mi Mujer (Fondos transferidos)',
    shortName: 'Cuenta Mujer',
    icon: '👩',
    type: 'wife_wallet',
    owner: 'ella',
    badgeColor: '#db2777'
  },
  {
    id: 'efectivo',
    name: 'Efectivo',
    shortName: 'Efectivo',
    icon: '💵',
    type: 'cash',
    owner: 'ambos',
    badgeColor: '#475569'
  }
];

// Plantilla base de gastos fijos mensuales que suelen llegar al correo
export const DEFAULT_FIXED_TEMPLATE = [
  {
    id: 'fix_arriendo',
    name: 'Arriendo Departamento/Casa',
    categoryId: 'vivienda_fijos',
    estimatedAmount: 580000,
    defaultPaymentMethod: 'bch_ctacte',
    dayOfMonth: 5
  },
  {
    id: 'fix_gGCC',
    name: 'Gastos Comunes',
    categoryId: 'vivienda_fijos',
    estimatedAmount: 95000,
    defaultPaymentMethod: 'bch_ctacte',
    dayOfMonth: 10
  },
  {
    id: 'fix_luz',
    name: 'Luz (Enel / CGE)',
    categoryId: 'vivienda_fijos',
    estimatedAmount: 42000,
    defaultPaymentMethod: 'cmr_falabella',
    dayOfMonth: 15
  },
  {
    id: 'fix_agua',
    name: 'Agua (Aguas Andinas / Esval)',
    categoryId: 'vivienda_fijos',
    estimatedAmount: 24000,
    defaultPaymentMethod: 'cmr_falabella',
    dayOfMonth: 18
  },
  {
    id: 'fix_gas',
    name: 'Gas / Agua Caliente (Metrogas / Lipigas)',
    categoryId: 'vivienda_fijos',
    estimatedAmount: 35000,
    defaultPaymentMethod: 'cmr_falabella',
    dayOfMonth: 20
  },
  {
    id: 'fix_internet',
    name: 'Internet Hogar + Planes Celulares',
    categoryId: 'vivienda_fijos',
    estimatedAmount: 48000,
    defaultPaymentMethod: 'cmr_falabella',
    dayOfMonth: 12
  },
  {
    id: 'fix_suscripciones',
    name: 'Suscripciones (Streaming / Nube / Spotify)',
    categoryId: 'gustos_personales',
    estimatedAmount: 18000,
    defaultPaymentMethod: 'cmr_falabella',
    dayOfMonth: 25
  }
];

// Diccionario de comercios chilenos para auto-clasificar cartolas de Banco de Chile y CMR
export const CHILE_MERCHANT_RULES = [
  { keywords: ['lider', 'express de lider', 'jumbo', 'santa isabel', 'tottus', 'unimarc', 'mayorista 10', 'acuenta', 'alvi', 'spid', 'carniceria', 'panaderia', 'pasteleria', 'rosetta', 'amasanderia', 'verduleria', 'feria', 'minimarket', 'tienda ruki', 'ruki', 'market', 'abastible'], categoryId: 'supermercado' },
  { keywords: ['pampers', 'huggies', 'baby', 'infanti', 'colloky', 'opalina', 'limonada', 'bebe', 'pañal', 'jardin infantil', 'sala cuna', 'pediatra'], categoryId: 'hija' },
  { keywords: ['cruz verde', 'salcobrand', 'ahumada', 'dr simi', 'dr. simi', 'farmacia', 'redsalud', 'integramedica', 'uc christus', 'clinica', 'bono fonasa', 'isapre', 'imed'], categoryId: 'salud_farmacia' },
  { keywords: ['copec', 'shell', 'petrobras', 'aramco', 'autopista', 'costanera norte', 'vespucio', 'tag', 'servipag tag', 'metro', 'bip', 'red movilidad', 'uber trip', 'cabify', 'didi', 'saba', 'estacionamiento'], categoryId: 'transporte' },
  { keywords: ['pedidosya', 'pedidos ya', 'uber eats', 'ubereats', 'rappi', 'starbucks', 'mcdonalds', 'burger king', 'kfc', 'papa johns', 'melt', 'dominos', 'sushi', 'restaurante', 'cafe', 'heladeria', 'bar '], categoryId: 'delivery_salidas' },
  { keywords: ['sodimac', 'homecenter', 'easy', 'casaideas', 'casa ideas', 'imperial', 'ikea', 'ferreteria'], categoryId: 'hogar_varios' },
  { keywords: ['enel', 'cge', 'aguas andinas', 'esval', 'essbio', 'metrogas', 'lipigas', 'gasco', 'movistar', 'entel', 'wom', 'vtr', 'mundo pacifico', 'gtd', 'comunidad feliz', 'edifito', 'gasto comun', 'arriendo'], categoryId: 'vivienda_fijos' },
  { keywords: ['falabella', 'paris', 'ripley', 'mercadolibre', 'mercado libre', 'merpago', 'licores', 'botilleria', 'shein', 'aliexpress', 'zara', 'h&m', 'decathlon', 'netflix', 'spotify', 'disney', 'youtube', 'apple.com/bill', 'google *'], categoryId: 'gustos_personales' }
];

// Palabras clave para detectar traspasos internos o pagos de tarjeta de crédito en la cartola
export const INTERNAL_TRANSFER_KEYWORDS = [
  'traspaso a',
  'tef a',
  'transferencia a',
  'pago cmr',
  'pago tarjeta cmr',
  'pago estado de cuenta',
  'abono cmr',
  'pago automatico cmr'
];

// Cartola de ejemplo realista (Banco de Chile + CMR Falabella) para probar el Conciliador Antiduplicados
export const SAMPLE_BANK_STATEMENT_TEXT = `FECHA;DESCRIPCION;MONTO;ORIGEN
2026-10-24;COMPRA HIPER LIDER;48500;CMR Falabella
2026-10-25;TEF A MI MUJER;150000;Banco de Chile Cta. Cte.
2026-10-25;FARMACIAS CRUZ VERDE;22990;CMR Falabella
2026-10-26;PEDIDOSYA RESTAURANTE;18400;CMR Falabella
2026-10-26;ESTACIONAMIENTO SABA;3200;Banco de Chile Vista
2026-10-27;COPEC ESTACION SERVICIO;35000;CMR Falabella
2026-10-27;NETFLIX.COM;10990;CMR Falabella`;
