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

// Super-Diccionario de +350 glosas y comercios reales de Chile para auto-clasificar cartolas de Banco de Chile, Cuenta FAN y CMR Falabella
export const CHILE_MERCHANT_RULES = [
  {
    categoryId: 'hija',
    keywords: [
      'pampers', 'huggies', 'babysec', 'emubaby', 'waterwipes', 'pañal', 'panales', 'pañales', 'pañalera', 'toallitas humedas',
      'similac', 'enfamil', 'pediasure', 'alula', 'leche nan', 'nestle nan', 'nan optipro', 'nan pro', 'nan confort', 'nan 1', 'nan 2', 'nan 3',
      'leche nido', 'nido 1+', 'nido etapa', 'nutrilon', 'blevit', 'nestum', 'gerber', 'colado', 'formula infantil', 'formula lactea',
      'infanti', 'colloky', 'opaline', 'opalina', 'limonada', 'pillin', 'pillín', 'ficcus', 'carters', "carter's", 'oshkosh',
      'h&m kids', 'zara kids', 'mango kids', 'babytuto', 'maternelle', 'pichintun', 'pichintún', 'mundo bebe', 'mundo bebé',
      'bebesit', 'maxi-cosi', 'chicco', 'philips avent', 'avent', 'medela', 'dr browns', 'fisher price', 'mirax', 'ansaldo', 'jugueteria', 'juguetería',
      'jardin infantil', 'jardín infantil', 'sala cuna', 'vitamina', 'jardin vitamina', 'sala cuna vitamina', 'after school', 'guarderia', 'guardería',
      'kidzania', 'mampato', 'chuck e cheese', 'chuckecheese', 'happyland', 'family park', 'entrekids', 'buin zoo', 'parque safari', 'granja educativa',
      'pediatra', 'pediatria', 'pediatría', 'consulta pediatrica', 'vacunatorio', 'vacunas', 'control niño sano', 'urgencia pediatrica', 'odontopediatria',
      'bebe', 'bebé', 'baby'
    ]
  },
  {
    categoryId: 'salud_farmacia',
    keywords: [
      'cruz verde', 'farmacias cruz verde', 'salcobrand', 'farmacias salcobrand', 'farmacias ahumada', 'ahumada', 'fasa',
      'dr simi', 'dr. simi', 'farmacias del dr', 'farmacia knop', 'knop', 'liga chilena', 'eco farmacias', 'ecofarmacias',
      'farmacia comunal', 'farmacia popular', 'farmacia galenica', 'farmacia belen', 'farmazon', 'pharol', 'farmacia',
      'redsalud', 'clinica redsalud', 'integramedica', 'integramédica', 'uc christus', 'christus', 'san carlos de apoquindo',
      'clinica alemana', 'clínica alemana', 'clinica las condes', 'clínica las condes', 'clinica santa maria', 'clínica santa maría',
      'clinica indisa', 'clínica indisa', 'clinica davila', 'clínica dávila', 'clinica bupa', 'bupa santiago',
      'vidaintegra', 'vida integra', 'megasalud', 'clinica universidad de los andes', 'clinica u andes', 'clinica vespucio',
      'clinica tabancura', 'clinica bicentenario', 'clinica ciudad del mar', 'clinica reñaca', 'clinica bio bio', 'hospital clinico',
      'centro medico', 'centro médico', 'consulta medica', 'consulta médica', 'clinica', 'clínica',
      'bono fonasa', 'fonasa', 'i-med', 'imed', 'bono electronico',
      'isapre colmena', 'colmena', 'cruzblanca', 'cruz blanca', 'consalud', 'banmedica', 'banmédica', 'nueva masvida', 'masvida',
      'vida tres', 'isapre esencial', 'esencial', 'isapre',
      'laboratorio blanco', 'lab blanco', 'bionet', 'laboratorio bionet', 'sonorad', 'examenes medicos', 'radiografia', 'ecografia', 'resonancia',
      'rotter & krauss', 'rotter y krauss', 'rotter krauss', 'optica gmo', 'gmo', 'place vendome', 'optica', 'óptica',
      'uno salud dental', 'uno salud', 'clinica norden', 'norden', 'dentista', 'odontologia', 'dental',
      'kinesiologia', 'psicologo', 'psiquiatra', 'oftalmologia', 'dermatologia'
    ]
  },
  {
    categoryId: 'supermercado',
    keywords: [
      'express de lider', 'hiper lider', 'lider express', 'lider.cl', 'lider', 'walmart',
      'jumbo', 'jumbo.cl', 'cencosud jumbo', 'santa isabel', 'tottus', 'hiper tottus', 'tottus.cl',
      'unimarc', 'supermercado unimarc', 'mayorista 10', 'acuenta', 'bodega acuenta', 'alvi', 'mayorista alvi', 'cugat',
      'spid', 'spid 36', 'spid36', 'erbi', 'minimarket erbi', 'ok market', 'okmarket', 'oxxo', 'big john', 'maxik',
      'castaño', 'castano', 'san camilo', 'panaderia san camilo', 'la fete', 'la fête', 'lafete', 'varsovienne', 'bozzo', 'entrelagos',
      'doña carne', 'dona carne', 'el carnicero', 'corrales del sur', 'carnes ñuble', 'frigorifico',
      'carniceria', 'carnicería', 'pescaderia', 'pescadería', 'marisqueria', 'verduleria', 'verdulería', 'fruteria', 'frutería',
      'feria libre', 'vega central', 'la vega', 'lo valledor', 'feria', 'distribuidora',
      'panaderia', 'panadería', 'pasteleria', 'pastelería', 'amasanderia', 'amasandería', 'rosetta', 'lo saldes',
      'minimarket', 'mini market', 'tienda ruki', 'ruki', 'market', 'supermercado', 'almacen', 'almacén', 'abarrotes', 'tostaduria'
    ]
  },
  {
    categoryId: 'delivery_salidas',
    keywords: [
      'pedidosya', 'pedidos ya', 'uber eats', 'ubereats', 'rappi', 'justo', 'getjusto',
      'starbucks', 'juan valdez', 'cafe martinez', 'café martínez', 'pasteleria tavelli', 'tavelli', 'pasteleria cory', 'cory', 'marley coffee', 'workcafe',
      'coppelia', 'bravissimo', 'emporio la rosa', 'grido', 'heladeria', 'heladería', 'gelateria',
      'mcdonalds', "mcdonald's", 'mc donalds', 'arcos dorados', 'burger king', 'wendys', "wendy's", 'kfc', 'kentucky fried',
      'tarragona', 'doggis', 'juan maestro', 'tommy beans', 'mamut', 'pedro juan y diego', "carl's jr", 'carls jr', 'subway', 'streat burger',
      'papa johns', "papa john's", 'papajohns', 'melt pizzas', 'melt pizza', 'melt', 'dominos pizza', "domino's pizza", 'dominos',
      'little caesars', 'under pizza', 'underpizza', 'telepizza', 'pizza hut', 'sbarro',
      'niu sushi', 'niusushi', 'sushi blues', 'sushiblues', 'kensho', 'sushi house', 'kami sushi', 'sushi', 'nikkei', 'ramen',
      'pf changs', 'p.f. changs', 'chilis', "chili's", 'tgi fridays', 'fridays', 'applebees',
      'bar liguria', 'liguria', 'krossbar', 'kross bar', 'fuente alemana', 'fuente chilena', 'elkika', 'antigua fuente', 'dominó', 'domino',
      'ticketmaster', 'puntoticket', 'punto ticket', 'passline', 'ticketplus', 'cinehoyts', 'cine hoyts', 'cinepolis', 'cinépolis', 'cinemark',
      'restaurante', 'restobar', 'cafeteria', 'cafetería', 'cafe', 'café', 'cerveceria', 'bar'
    ]
  },
  {
    categoryId: 'transporte',
    keywords: [
      'pronto copec', 'copec', 'muevo copec', 'micopec', 'shell', 'upa!', 'shell upa', 'upa', 'petrobras', 'spacio1', 'spacio 1', 'aramco', 'enex',
      'bencinera', 'bencina', 'combustible', 'servicentro',
      'autopista central', 'costanera norte', 'vespucio norte', 'vespucio sur', 'vespucio oriente', 'vespucio', 'autopase',
      'tag total', 'servipag tag', 'pago tag', 'cobro tag', 'telepeaje', 'tag',
      'ruta del maipo', 'rutas del pacifico', 'rutas del pacífico', 'ruta 68', 'ruta 78', 'autopista del sol', 'autopista', 'peaje',
      'metro de santiago', 'metro santiago', 'metro', 'carga bip', 'tarjeta bip', 'bip!', 'bip', 'red movilidad', 'pasaje qr',
      'efe trenes', 'efe central', 'efe valparaiso', 'efe sur', 'biotren', 'merval', 'turbus', 'tur bus', 'pullman bus', 'condor bus', 'eme bus',
      'cabify', 'uber trip', 'ubertrip', 'uber', 'didi', 'indrive', 'in drive', 'whoosh', 'lime',
      'saba estacionamientos', 'estacionamiento saba', 'saba', 'wesmartpark', 'estacionamiento', 'parking', 'parquimetro', 'parquímetro',
      'revision tecnica', 'revisión técnica', 'prt', 'planta revision', 'permiso de circulacion', 'permiso circulacion', 'soap',
      'lavamax', 'autolavado', 'autoplanet', 'zs motor', 'zsmotor', 'leon servicio', 'neumaticos', 'neumáticos', 'lubricentro', 'vulcanizacion'
    ]
  },
  {
    categoryId: 'hogar_varios',
    keywords: [
      'sodimac', 'homecenter', 'constructor', 'easy', 'cencosud easy', 'imperial', 'construmart', 'mk hogar', 'comercial mk', 'mk',
      'casaideas', 'casa ideas', 'ikea', 'homy', 'rosen', 'colchones cic', 'muebles cic', 'cic', 'cannon', 'mashini', 'zara home', 'h&m home',
      'kitchen center', 'el volcan', 'el volcán', 'ursus trotter', 'thomas', 'sindelen', 'karcher',
      'preunic', 'maicao', 'pichara', 'dbs beauty', 'sally beauty', 'the body shop', 'lush', 'daiso', 'miniso', 'mumuso', 'todomoda',
      'lavaseco', 'lavanderia', 'lavandería', 'tintoreria', 'cerrajeria', 'cerrajería', 'gasfiteria', 'gasfitería', 'ferreteria', 'ferretería',
      'superzoo', 'pet happy', 'pethappy', 'braloy', 'laika', 'veterinaria', 'clinica veterinaria', 'mascotas', 'royal canin', 'master dog'
    ]
  },
  {
    categoryId: 'vivienda_fijos',
    keywords: [
      'enel distribucion', 'enel distribución', 'enel', 'cge', 'chilquinta', 'saesa', 'frontel', 'edelaysen', 'edelmag', 'cuenta luz',
      'aguas andinas', 'aguas cordillera', 'esval', 'essbio', 'nuevo sur', 'nuevosur', 'aguas del valle', 'aguas araucania', 'aguas altiplano', 'essal', 'suralis',
      'metrogas', 'lipigas', 'gasco', 'abastible', 'gas sur', 'gas valpo', 'intergas',
      'movistar', 'entel', 'wom', 'vtr', 'claro', 'mundo pacifico', 'mundo pacífico', 'gtd manquehue', 'gtd', 'telsur', 'starlink',
      'comunidadfeliz', 'comunidad feliz', 'edifito', 'kastor', 'gasto comun', 'gasto común', 'gastos comunes', 'condominio',
      'arriendo', 'dividendo', 'credito hipotecario', 'contribuciones', 'tesoreria general', 'tesorería general', 'tgr',
      'sencillito', 'servipag cuentas', 'servipag', 'unired', 'verisure', 'adt', 'prosegur'
    ]
  },
  {
    categoryId: 'gustos_personales',
    keywords: [
      'falabella', 'paris', 'ripley', 'abcdin', 'hites', 'la polar', 'corona', 'tricot', 'fashions park',
      'flores', 'monarch', 'caffarena', 'kayser', 'zapatos', 'bata', 'hush puppies', 'skechers', 'aldo', 'cardinale', 'guante', 'gacel',
      'nike', 'adidas', 'puma', 'under armour', 'reebok', 'new balance', 'asics', 'vans', 'converse', 'merrell',
      'decathlon', 'lippi', 'doite', 'north face', 'the north face', 'columbia', 'patagonia', 'marmot', 'helly hansen', 'kaya unite', 'billabong', 'quiksilver',
      'zara', 'h&m', 'mango', 'forever 21', 'pull & bear', 'bershka', 'stradivarius', 'levis', "levi's", 'lacoste', 'tommy hilfiger', 'calvin klein',
      'shein', 'aliexpress', 'ali express', 'temu', 'amazon', 'mercadolibre', 'mercado libre', 'mercadopago', 'mercado pago', 'merpago',
      'casa royal', 'pc factory', 'pcfactory', 'sp digital', 'spdigital', 'wei.cl', 'wei', 'maconline', 'mac online', 'aufbau', 'microplay', 'zmart', 'weplay',
      'feria chilena del libro', 'feria del libro', 'antartica libros', 'antártica', 'libreria antartica', 'contrapunto', 'buscalibre', 'que leo',
      'botilleria', 'botillería', 'liquidos', 'líquidos', 'el cielo', 'booz', 'booz.cl', 'vinoteca', 'la vinoteca', 'la cav', 'supermercado diez', 'licores',
      'netflix', 'spotify', 'disney+', 'disney plus', 'disney', 'hbo max', 'hbomax', 'max.com', 'max', 'amazon prime', 'prime video',
      'apple.com/bill', 'icloud', 'google one', 'google *', 'youtube premium', 'youtube', 'chatgpt', 'openai', 'claude', 'anthropic',
      'playstation', 'psn', 'xbox', 'steam', 'steampowered', 'nintendo', 'epic games', 'riot games', 'roblox'
    ]
  },
  {
    categoryId: 'imprevistos',
    keywords: [
      'notaria', 'notaría', 'conservador de bienes', 'registro civil', 'multa', 'juzgado policia local', 'parte empadronado',
      'grua', 'grúa', 'sos rescate', 'cerrajero urgencia', 'imprevisto', 'emergencia'
    ]
  }
];

// Palabras clave para detectar traspasos internos o pagos de tarjeta de crédito en la cartola
export const INTERNAL_TRANSFER_KEYWORDS = [
  'traspaso a',
  'traspaso de',
  'traspaso entre',
  'traspaso internet',
  'traspaso app',
  'tef a',
  'tef de',
  'transferencia a',
  'transferencia de',
  'transferencia fondos',
  'pago cmr',
  'pago tarjeta cmr',
  'pago tarjeta de credito',
  'pago estado de cuenta',
  'abono cmr',
  'pago automatico cmr',
  'pac cmr',
  'pago cuenta cmr',
  'cuenta fan',
  'cta fan',
  'mismo titular'
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
