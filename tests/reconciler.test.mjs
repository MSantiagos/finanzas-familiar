import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_CATEGORIES,
  PAYMENT_METHODS,
  DEFAULT_FIXED_TEMPLATE,
  CHILE_MERCHANT_RULES,
  INTERNAL_TRANSFER_KEYWORDS,
  SAMPLE_BANK_STATEMENT_TEXT
} from '../src/data/defaults.js';

import {
  cleanChileanAmount,
  formatLiveCLPInput,
  isValidStatementDate,
  normalizeDateToISO,
  normalizeBankDescription,
  buildBankFingerprint,
  normalizeContactKey,
  extractContactDisplayName,
  guessCategoryFromDescription,
  guessCategoryFromMerchant,
  guessPaymentMethodFromSource,
  detectInternalOrCardPayment,
  parseBankStatementText,
  parseBankStatementRows,
  reconcileStatementRows,
  applyReconciliationToTransactions
} from '../src/services/reconciler.js';

describe('1. Super-Diccionario Chileno & Exportaciones Base (defaults.js)', () => {
  test('1.1 Mantiene intactas todas las exportaciones requeridas en defaults.js', () => {
    assert.ok(Array.isArray(DEFAULT_CATEGORIES));
    assert.equal(DEFAULT_CATEGORIES.length, 9);
    assert.ok(Array.isArray(PAYMENT_METHODS));
    assert.ok(Array.isArray(DEFAULT_FIXED_TEMPLATE));
    assert.ok(Array.isArray(CHILE_MERCHANT_RULES));
    assert.ok(Array.isArray(INTERNAL_TRANSFER_KEYWORDS));
    assert.equal(typeof SAMPLE_BANK_STATEMENT_TEXT, 'string');
  });

  test('1.2 CHILE_MERCHANT_RULES contiene más de 300 glosas y comercios reales de Chile distribuidos en las 9 categorías', () => {
    const allKeywords = CHILE_MERCHANT_RULES.flatMap((r) => r.keywords);
    assert.ok(
      allKeywords.length >= 300,
      `Se esperaban +300 comercios y se encontraron ${allKeywords.length}`
    );

    const categoryIdsInRules = new Set(CHILE_MERCHANT_RULES.map((r) => r.categoryId));
    for (const cat of DEFAULT_CATEGORIES) {
      assert.ok(
        categoryIdsInRules.has(cat.id),
        `La categoría ${cat.id} debe estar presente en CHILE_MERCHANT_RULES`
      );
    }
  });

  test('1.3 INTERNAL_TRANSFER_KEYWORDS incluye palabras clave de transferencias y pagos CMR', () => {
    assert.ok(INTERNAL_TRANSFER_KEYWORDS.includes('traspaso a'));
    assert.ok(INTERNAL_TRANSFER_KEYWORDS.includes('tef a'));
    assert.ok(INTERNAL_TRANSFER_KEYWORDS.includes('pago cmr'));
    assert.ok(INTERNAL_TRANSFER_KEYWORDS.includes('abono cmr'));
  });
});

describe('2. Limpieza y Formateo de Montos Chilenos (cleanChileanAmount & formatLiveCLPInput)', () => {
  test('2.1 cleanChileanAmount: convierte formato chileno clásico "$1.250.000" y "48.500"', () => {
    assert.equal(cleanChileanAmount('$1.250.000'), 1250000);
    assert.equal(cleanChileanAmount('48.500'), 48500);
    assert.equal(cleanChileanAmount('CLP 150.000'), 150000);
  });

  test('2.2 cleanChileanAmount: convierte montos negativos "-48.500", "-$15.990" y "($48.500)" a entero positivo', () => {
    assert.equal(cleanChileanAmount('-48.500'), 48500);
    assert.equal(cleanChileanAmount('-$15.990'), 15990);
    assert.equal(cleanChileanAmount('($48.500)'), 48500);
  });

  test('2.3 cleanChileanAmount: convierte formatos Excel US con decimales "3,670.00" y "23,777.00"', () => {
    assert.equal(cleanChileanAmount('3,670.00'), 3670);
    assert.equal(cleanChileanAmount('23,777.00'), 23777);
    assert.equal(cleanChileanAmount('895.00'), 895);
    assert.equal(cleanChileanAmount('1,450,000.00'), 1450000);
  });

  test('2.4 cleanChileanAmount: convierte formato con coma decimal "48.500,00"', () => {
    assert.equal(cleanChileanAmount('48.500,00'), 48500);
    assert.equal(cleanChileanAmount('$1.250.000,00'), 1250000);
  });

  test('2.5 cleanChileanAmount: maneja números nativos y redondea decimales', () => {
    assert.equal(cleanChileanAmount(89400), 89400);
    assert.equal(cleanChileanAmount(-42500.4), 42500);
    assert.equal(cleanChileanAmount(NaN), 0);
    assert.equal(cleanChileanAmount(Infinity), 0);
  });

  test('2.6 cleanChileanAmount: retorna 0 ante textos inválidos, fechas o indicadores de cuotas "01/03"', () => {
    assert.equal(cleanChileanAmount(''), 0);
    assert.equal(cleanChileanAmount(null), 0);
    assert.equal(cleanChileanAmount(undefined), 0);
    assert.equal(cleanChileanAmount('CENTRAL'), 0);
    assert.equal(cleanChileanAmount('SIN MONTO'), 0);
    assert.equal(cleanChileanAmount('01/03'), 0);
    assert.equal(cleanChileanAmount('24/10/2026'), 0);
  });

  test('2.7 formatLiveCLPInput: formatea dígitos en vivo con puntos de miles chilenos', () => {
    assert.equal(formatLiveCLPInput('150000'), '150.000');
    assert.equal(formatLiveCLPInput('1250000'), '1.250.000');
    assert.equal(formatLiveCLPInput('$48.500'), '48.500');
    assert.equal(formatLiveCLPInput('0'), '0');
    assert.equal(formatLiveCLPInput(0), '0');
    assert.equal(formatLiveCLPInput(''), '');
    assert.equal(formatLiveCLPInput('abc'), '');
  });
});

describe('3. Validación y Normalización de Fechas de Cartola (isValidStatementDate & normalizeDateToISO)', () => {
  test('3.1 isValidStatementDate: acepta formato DD/MM/YYYY y D/M/YYYY', () => {
    assert.equal(isValidStatementDate('24/10/2026'), true);
    assert.equal(isValidStatementDate('5/8/2026'), true);
  });

  test('3.2 isValidStatementDate: acepta formato DD-MM-YY y DD/MM/YY', () => {
    assert.equal(isValidStatementDate('05-11-26'), true);
    assert.equal(isValidStatementDate('24/10/26'), true);
  });

  test('3.3 isValidStatementDate: acepta formato YYYY-MM-DD y DD/MM corto', () => {
    assert.equal(isValidStatementDate('2026-10-24'), true);
    assert.equal(isValidStatementDate('24/10'), true);
    assert.equal(isValidStatementDate('5-8'), true);
  });

  test('3.4 isValidStatementDate: rechaza fechas fuera de rango y textos de cabecera', () => {
    assert.equal(isValidStatementDate(''), false);
    assert.equal(isValidStatementDate(null), false);
    assert.equal(isValidStatementDate('FECHA'), false);
    assert.equal(isValidStatementDate('2026-13-10'), false);
    assert.equal(isValidStatementDate('32/10/2026'), false);
    assert.equal(isValidStatementDate('15/15/2026'), false);
    assert.equal(isValidStatementDate('Total'), false);
  });

  test('3.5 normalizeDateToISO: convierte DD/MM/YYYY y D/M/YYYY a YYYY-MM-DD', () => {
    assert.equal(normalizeDateToISO('24/10/2026'), '2026-10-24');
    assert.equal(normalizeDateToISO('5/8/2026'), '2026-08-05');
  });

  test('3.6 normalizeDateToISO: convierte DD-MM-YY y DD/MM/YY a YYYY-MM-DD', () => {
    assert.equal(normalizeDateToISO('24-10-26'), '2026-10-24');
    assert.equal(normalizeDateToISO('03/11/26'), '2026-11-03');
  });

  test('3.7 normalizeDateToISO: mantiene YYYY-MM-DD y completa DD/MM usando fallbackYearMonth', () => {
    assert.equal(normalizeDateToISO('2026-10-24'), '2026-10-24');
    assert.equal(normalizeDateToISO('24/10', '2026-10'), '2026-10-24');
    assert.equal(normalizeDateToISO('7-11', '2026-11'), '2026-11-07');
  });
});

describe('4. Normalización de Glosas Bancarias y Procesadores (normalizeBankDescription)', () => {
  test('4.1 Limpia COMPRA TARJETA DEBITO y prefijo TBK*', () => {
    assert.equal(
      normalizeBankDescription('COMPRA TARJETA DEBITO TBK*FARMACIA CRUZ VERDE SANTIAGO CL'),
      'FARMACIA CRUZ VERDE'
    );
  });

  test('4.2 Limpia COMPRA NACIONAL y prefijo MERPAGO*', () => {
    assert.equal(
      normalizeBankDescription('COMPRA NACIONAL MERPAGO*PEDIDOSYA LAS CONDES CL'),
      'PEDIDOSYA'
    );
  });

  test('4.3 Limpia CARGO POR COMPRA y prefijo SUMUP *', () => {
    assert.equal(
      normalizeBankDescription('CARGO POR COMPRA SUMUP *PANADERIA SAN CAMILO PROVIDENCIA'),
      'PANADERIA SAN CAMILO'
    );
  });

  test('4.4 Limpia PAGO:, GETNET*, KUSHKI*, FLOW*, WEBPAY*, DL * y DLOCAL*', () => {
    assert.equal(normalizeBankDescription('PAGO: GETNET*DOÑA CARNE ÑUÑOA CL'), 'DOÑA CARNE');
    assert.equal(normalizeBankDescription('COMPRA REDCOMPRA KUSHKI*WOM SANTIAGO'), 'WOM');
    assert.equal(normalizeBankDescription('FLOW*COMUNIDAD FELIZ LAS CONDES'), 'COMUNIDAD FELIZ');
    assert.equal(normalizeBankDescription('WEBPAY*SODIMAC HOMECENTER SANTIAGO CL'), 'SODIMAC HOMECENTER');
    assert.equal(normalizeBankDescription('DL *UBER TRIP SANTIAGO CL'), 'UBER TRIP');
    assert.equal(normalizeBankDescription('DLOCAL*NETFLIX.COM SANTIAGO CL'), 'NETFLIX.COM');
  });

  test('4.5 Limpia indicadores de cuotas ("01/03", "CUOTA 01 DE 06") y ciudades finales', () => {
    assert.equal(
      normalizeBankDescription('COMPRA FALABELLA CUOTA 01 DE 06 LAS CONDES CL'),
      'FALABELLA'
    );
    assert.equal(
      normalizeBankDescription('TBK*JUMBO BILBAO 01/03 PROVIDENCIA'),
      'JUMBO BILBAO'
    );
  });
});

describe('5. Clasificación Inteligente con el Super-Diccionario Chileno (guessCategoryFromDescription)', () => {
  test('5.1 Supermercados grandes: Lider, Express de Lider, Hiper Lider, Jumbo, Santa Isabel, Tottus, Unimarc, Mayorista 10, Acuenta, Alvi', () => {
    assert.equal(guessCategoryFromDescription('COMPRA HIPER LIDER SANTIAGO CL'), 'supermercado');
    assert.equal(guessCategoryFromDescription('TBK*EXPRESS DE LIDER PROVIDENCIA'), 'supermercado');
    assert.equal(guessCategoryFromDescription('CENCOSUD JUMBO BILBAO LAS CONDES'), 'supermercado');
    assert.equal(guessCategoryFromDescription('SUPERMERCADO SANTA ISABEL'), 'supermercado');
    assert.equal(guessCategoryFromDescription('HIPER TOTTUS KENNEDY'), 'supermercado');
    assert.equal(guessCategoryFromDescription('UNIMARC LOS MILITARES'), 'supermercado');
    assert.equal(guessCategoryFromDescription('MAYORISTA 10 MAIPU'), 'supermercado');
    assert.equal(guessCategoryFromDescription('SUPER BODEGA ACUENTA'), 'supermercado');
    assert.equal(guessCategoryFromDescription('MAYORISTA ALVI'), 'supermercado');
  });

  test('5.2 Minimarkets, panaderías, chocolaterías y carnicerías: Spid, Erbi, Ok Market, Oxxo, Big John, Castaño, San Camilo, La Fête, Varsovienne, Doña Carne, El Carnicero, Corrales del Sur', () => {
    assert.equal(guessCategoryFromDescription('MERPAGO*SPID 36'), 'supermercado');
    assert.equal(guessCategoryFromDescription('MINIMARKET ERBI'), 'supermercado');
    assert.equal(guessCategoryFromDescription('OK MARKET PROVIDENCIA'), 'supermercado');
    assert.equal(guessCategoryFromDescription('TIENDA OXXO BIG JOHN VITACURA'), 'supermercado');
    assert.equal(guessCategoryFromDescription('SUMUP *PANADERIA SAN CAMILO'), 'supermercado');
    assert.equal(guessCategoryFromDescription('PANADERIA CASTAÑO LAS CONDES'), 'supermercado');
    assert.equal(guessCategoryFromDescription('CHOCOLATERIA LA FETE'), 'supermercado');
    assert.equal(guessCategoryFromDescription('VARSOVIENNE PROVIDENCIA'), 'supermercado');
    assert.equal(guessCategoryFromDescription('GETNET*DOÑA CARNE'), 'supermercado');
    assert.equal(guessCategoryFromDescription('CARNICERIA EL CARNICERO'), 'supermercado');
    assert.equal(guessCategoryFromDescription('CORRALES DEL SUR'), 'supermercado');
    assert.equal(guessCategoryFromDescription('VERDULERIA Y FRUTERIA FERIA LIBRE'), 'supermercado');
  });

  test('5.3 Hija (pañales, leche fórmula, ropa infantil): Pampers, Huggies, Babysec, Similac, Nan, Nido, Enfamil, Pediasure, Alula, Infanti, Colloky, Opaline, Limonada, Pillín, Ficcus, Carter\'s, H&M Kids, Zara Kids', () => {
    assert.equal(guessCategoryFromDescription('COMPRA PAMPERS HUGGIES BABYSEC'), 'hija');
    assert.equal(guessCategoryFromDescription('SIMILAC ENFAMIL PEDIASURE ALULA LECHE NAN LECHE NIDO'), 'hija');
    assert.equal(guessCategoryFromDescription('TIENDA INFANTI COSTANERA'), 'hija');
    assert.equal(guessCategoryFromDescription('TBK*COLLOKY PARQUE ARAUCO'), 'hija');
    assert.equal(guessCategoryFromDescription('OPALINE OPALINA ROPA BEBE'), 'hija');
    assert.equal(guessCategoryFromDescription('LIMONADA INFANTIL PILLIN FICCUS'), 'hija');
    assert.equal(guessCategoryFromDescription("CARTER'S KIDS"), 'hija');
    assert.equal(guessCategoryFromDescription('H&M KIDS SANTIAGO CL'), 'hija');
    assert.equal(guessCategoryFromDescription('ZARA KIDS LAS CONDES'), 'hija');
  });

  test('5.4 Hija (jardín, paseos y pediatría): Babytuto, Maternelle, Pichintun, Mundo Bebé, Sala Cuna, Vitamina, KidZania, Mampato, Chuck E Cheese, Pediatría, Vacunas', () => {
    assert.equal(guessCategoryFromDescription('BABYTUTO.COM MATERNELLE PICHINTUN MUNDO BEBE'), 'hija');
    assert.equal(guessCategoryFromDescription('SALA CUNA Y JARDIN INFANTIL VITAMINA'), 'hija');
    assert.equal(guessCategoryFromDescription('KIDZANIA SANTIAGO'), 'hija');
    assert.equal(guessCategoryFromDescription('PARQUE MAMPATO LO BARNECHEA'), 'hija');
    assert.equal(guessCategoryFromDescription('CHUCK E CHEESE LA DEHESA'), 'hija');
    assert.equal(guessCategoryFromDescription('CONSULTA PEDIATRIA Y VACUNAS'), 'hija');
  });

  test('5.5 Salud y Farmacias: Cruz Verde, Salcobrand, Ahumada, Dr. Simi, Knop, Liga Chilena, Eco Farmacias', () => {
    assert.equal(guessCategoryFromDescription('TBK*FARMACIA CRUZ VERDE SANTIAGO CL'), 'salud_farmacia');
    assert.equal(guessCategoryFromDescription('FARMACIAS SALCOBRAND PROVIDENCIA'), 'salud_farmacia');
    assert.equal(guessCategoryFromDescription('FARMACIAS AHUMADA'), 'salud_farmacia');
    assert.equal(guessCategoryFromDescription('FARMACIAS DEL DR. SIMI'), 'salud_farmacia');
    assert.equal(guessCategoryFromDescription('FARMACIA KNOP'), 'salud_farmacia');
    assert.equal(guessCategoryFromDescription('ECO FARMACIAS LIGA CHILENA'), 'salud_farmacia');
  });

  test('5.6 Clínicas, Isapres, Laboratorios, Ópticas y Dental: RedSalud, IntegraMédica, UC Christus, Alemana, Las Condes, Santa María, Indisa, Dávila, Bupa, Fonasa, I-Med, Colmena, CruzBlanca, Consalud, Banmédica, Bionet, Rotter & Krauss, GMO, Uno Salud Dental', () => {
    assert.equal(guessCategoryFromDescription('CENTRO MEDICO REDSALUD INTEGRAMEDICA'), 'salud_farmacia');
    assert.equal(guessCategoryFromDescription('CLINICA UC CHRISTUS CLINICA ALEMANA'), 'salud_farmacia');
    assert.equal(guessCategoryFromDescription('CLINICA LAS CONDES CLINICA SANTA MARIA'), 'salud_farmacia');
    assert.equal(guessCategoryFromDescription('CLINICA INDISA CLINICA DAVILA CLINICA BUPA'), 'salud_farmacia');
    assert.equal(guessCategoryFromDescription('VIDAINTEGRA MEGASALUD BONO FONASA I-MED'), 'salud_farmacia');
    assert.equal(guessCategoryFromDescription('ISAPRE COLMENA CRUZBLANCA CONSALUD BANMEDICA'), 'salud_farmacia');
    assert.equal(guessCategoryFromDescription('NUEVA MASVIDA VIDA TRES ESENCIAL'), 'salud_farmacia');
    assert.equal(guessCategoryFromDescription('LABORATORIO BLANCO BIONET SONORAD'), 'salud_farmacia');
    assert.equal(guessCategoryFromDescription('OPTICA ROTTER & KRAUSS GMO PLACE VENDOME'), 'salud_farmacia');
    assert.equal(guessCategoryFromDescription('UNO SALUD DENTAL CLINICA NORDEN'), 'salud_farmacia');
  });

  test('5.7 Transporte (bencineras y autopistas): Copec, Pronto Copec, Shell, Upa, Petrobras, Spacio1, Aramco, Enex, Autopista Central, Costanera Norte, Vespucio, Autopase, Tag Total, Servipag Tag, Rutas', () => {
    assert.equal(guessCategoryFromDescription('PRONTO COPEC ESTACION SERVICIO'), 'transporte');
    assert.equal(guessCategoryFromDescription('SHELL UPA! LAS CONDES'), 'transporte');
    assert.equal(guessCategoryFromDescription('PETROBRAS SPACIO1 ARAMCO ENEX'), 'transporte');
    assert.equal(guessCategoryFromDescription('AUTOPASE COSTANERA NORTE'), 'transporte');
    assert.equal(guessCategoryFromDescription('AUTOPISTA CENTRAL VESPUCIO NORTE VESPUCIO SUR'), 'transporte');
    assert.equal(guessCategoryFromDescription('SERVIPAG TAG TOTAL'), 'transporte');
    assert.equal(guessCategoryFromDescription('RUTA DEL MAIPO RUTAS DEL PACIFICO RUTA 68 RUTA 78'), 'transporte');
  });

  test('5.8 Transporte (público, apps, parking y taller): Metro, Carga Bip, Red Movilidad, EFE Trenes, Turbus, Pullman Bus, Cabify, Uber Trip, Didi, InDrive, Saba, WesmartPark, PRT, SOAP, Lavamax, Autoplanet, ZS Motor', () => {
    assert.equal(guessCategoryFromDescription('METRO DE SANTIAGO CARGA BIP RED MOVILIDAD'), 'transporte');
    assert.equal(guessCategoryFromDescription('EFE TRENES TURBUS PULLMAN BUS'), 'transporte');
    assert.equal(guessCategoryFromDescription('DL *UBER TRIP SANTIAGO CL'), 'transporte');
    assert.equal(guessCategoryFromDescription('CABIFY DIDI INDRIVE'), 'transporte');
    assert.equal(guessCategoryFromDescription('SABA ESTACIONAMIENTOS WESMARTPARK PARQUIMETRO'), 'transporte');
    assert.equal(guessCategoryFromDescription('REVISION TECNICA PRT PERMISO DE CIRCULACION SOAP'), 'transporte');
    assert.equal(guessCategoryFromDescription('LAVAMAX AUTOPLANET ZS MOTOR LEON SERVICIO'), 'transporte');
  });

  test('5.9 Delivery, Cafés y Heladerías: PedidosYa, Uber Eats, Rappi, Justo, Starbucks, Juan Valdez, Café Martínez, Tavelli, Cory, Coppelia, Bravissimo, Emporio La Rosa, Grido', () => {
    assert.equal(guessCategoryFromDescription('MERPAGO*PEDIDOSYA SANTIAGO CL'), 'delivery_salidas');
    assert.equal(guessCategoryFromDescription('DL *UBER EATS LAS CONDES'), 'delivery_salidas');
    assert.equal(guessCategoryFromDescription('RAPPI CHILE JUSTO'), 'delivery_salidas');
    assert.equal(guessCategoryFromDescription('STARBUCKS COFFEE JUAN VALDEZ CAFE MARTINEZ'), 'delivery_salidas');
    assert.equal(guessCategoryFromDescription('PASTELERIA TAVELLI CORY'), 'delivery_salidas');
    assert.equal(guessCategoryFromDescription('HELADERIA COPPELIA BRAVISSIMO EMPORIO LA ROSA GRIDO'), 'delivery_salidas');
  });

  test('5.10 Restaurantes, Fast Food, Pizzas, Sushi y Cines: McDonald\'s, Burger King, Wendy\'s, KFC, Tarragona, Doggis, Juan Maestro, Papa John\'s, Melt, Domino\'s, Niu Sushi, Sushi Blues, Kensho, PF Changs, Liguria, Krossbar, Fuente Alemana, Ticketmaster, Puntoticket, Cinehoyts, Cinépolis, Cinemark', () => {
    assert.equal(guessCategoryFromDescription("MCDONALD'S BURGER KING WENDY'S KFC"), 'delivery_salidas');
    assert.equal(guessCategoryFromDescription('TARRAGONA DOGGIS JUAN MAESTRO TOMMY BEANS'), 'delivery_salidas');
    assert.equal(guessCategoryFromDescription('RESTAURANTE MAMUT PEDRO JUAN Y DIEGO'), 'delivery_salidas');
    assert.equal(guessCategoryFromDescription("PAPA JOHN'S MELT PIZZAS DOMINO'S PIZZA"), 'delivery_salidas');
    assert.equal(guessCategoryFromDescription('LITTLE CAESARS UNDER PIZZA TELEPIZZA'), 'delivery_salidas');
    assert.equal(guessCategoryFromDescription('NIU SUSHI SUSHI BLUES KENSHO'), 'delivery_salidas');
    assert.equal(guessCategoryFromDescription("PF CHANGS CHILI'S TGI FRIDAYS"), 'delivery_salidas');
    assert.equal(guessCategoryFromDescription('BAR LIGURIA KROSSBAR FUENTE ALEMANA DOMINO'), 'delivery_salidas');
    assert.equal(guessCategoryFromDescription('TICKETMASTER PUNTOTICKET CINEHOYTS CINEPOLIS CINEMARK'), 'delivery_salidas');
  });

  test('5.11 Hogar, Aseo, Cuidado Personal y Mascotas: Sodimac, Homecenter, Easy, Imperial, Construmart, MK, Casaideas, Ikea, Homy, Rosen, CIC, Cannon, Mashini, Kitchen Center, El Volcán, Preunic, Maicao, Pichara, Daiso, Miniso, Superzoo, Pet Happy, Braloy', () => {
    assert.equal(guessCategoryFromDescription('SODIMAC HOMECENTER CONSTRUCTOR'), 'hogar_varios');
    assert.equal(guessCategoryFromDescription('CENCOSUD EASY IMPERIAL CONSTRUMART'), 'hogar_varios');
    assert.equal(guessCategoryFromDescription('TIENDA MK HOGAR'), 'hogar_varios');
    assert.equal(guessCategoryFromDescription('CASAIDEAS IKEA HOMY'), 'hogar_varios');
    assert.equal(guessCategoryFromDescription('COLCHONES ROSEN MUEBLES CIC CANNON MASHINI'), 'hogar_varios');
    assert.equal(guessCategoryFromDescription('KITCHEN CENTER EL VOLCAN'), 'hogar_varios');
    assert.equal(guessCategoryFromDescription('PREUNIC MAICAO PICHARA DAISO MINISO'), 'hogar_varios');
    assert.equal(guessCategoryFromDescription('LAVASECO CERRAJERIA GASFITERIA FERRETERIA'), 'hogar_varios');
    assert.equal(guessCategoryFromDescription('SUPERZOO PET HAPPY BRALOY VETERINARIA'), 'hogar_varios');
  });

  test('5.12 Vivienda y Cuentas Fijas: Enel, CGE, Chilquinta, Saesa, Frontel, Aguas Andinas, Esval, Essbio, Metrogas, Lipigas, Gasco, Abastible, Movistar, Entel, WOM, VTR, Claro, Mundo Pacífico, GTD, Telsur, Starlink, ComunidadFeliz, Edifito, Kastor, TGR, Sencillito, Servipag, Unired', () => {
    assert.equal(guessCategoryFromDescription('PAC ENEL DISTRIBUCION SANTIAGO'), 'vivienda_fijos');
    assert.equal(guessCategoryFromDescription('CGE CHILQUINTA SAESA FRONTEL'), 'vivienda_fijos');
    assert.equal(guessCategoryFromDescription('AGUAS ANDINAS AGUAS CORDILLERA ESVAL ESSBIO NUEVO SUR AGUAS DEL VALLE'), 'vivienda_fijos');
    assert.equal(guessCategoryFromDescription('METROGAS LIPIGAS GASCO ABASTIBLE'), 'vivienda_fijos');
    assert.equal(guessCategoryFromDescription('KUSHKI*WOM MOVISTAR ENTEL VTR CLARO'), 'vivienda_fijos');
    assert.equal(guessCategoryFromDescription('MUNDO PACIFICO GTD MANQUEHUE TELSUR STARLINK'), 'vivienda_fijos');
    assert.equal(guessCategoryFromDescription('FLOW*COMUNIDADFELIZ EDIFITO KASTOR GASTO COMUN'), 'vivienda_fijos');
    assert.equal(guessCategoryFromDescription('ARRIENDO CONTRIBUCIONES TESORERIA GENERAL TGR'), 'vivienda_fijos');
    assert.equal(guessCategoryFromDescription('SENCILLITO SERVIPAG CUENTAS UNIRED'), 'vivienda_fijos');
  });

  test('5.13 Gustos Personales (Tiendas, Deporte, Outdoor y E-commerce): Falabella, Paris, Ripley, Abcdin, Hites, La Polar, Corona, Tricot, Flores, Monarch, Bata, Hush Puppies, Nike, Adidas, Puma, Decathlon, Lippi, Doite, North Face, Columbia, Patagonia, Zara, H&M, Shein, AliExpress, Temu, Amazon, MercadoLibre', () => {
    assert.equal(guessCategoryFromDescription('COMPRA TIENDAS FALABELLA PARIS RIPLEY'), 'gustos_personales');
    assert.equal(guessCategoryFromDescription('ABCDIN HITES LA POLAR CORONA TRICOT'), 'gustos_personales');
    assert.equal(guessCategoryFromDescription('FLORES MONARCH BATA HUSH PUPPIES ZAPATOS'), 'gustos_personales');
    assert.equal(guessCategoryFromDescription('NIKE ADIDAS PUMA UNDER ARMOUR DECATHLON'), 'gustos_personales');
    assert.equal(guessCategoryFromDescription('LIPPI DOITE THE NORTH FACE COLUMBIA PATAGONIA'), 'gustos_personales');
    assert.equal(guessCategoryFromDescription('ZARA H&M MANGO FOREVER 21'), 'gustos_personales');
    assert.equal(guessCategoryFromDescription('DLOCAL*SHEIN ALIEXPRESS TEMU AMAZON'), 'gustos_personales');
    assert.equal(guessCategoryFromDescription('MERPAGO*MERCADOLIBRE MERCADOPAGO'), 'gustos_personales');
  });

  test('5.14 Gustos Personales (Tecnología, Libros, Botillerías, Streaming, IA y Gaming): Casa Royal, PC Factory, SP Digital, Wei, Microplay, Zmart, Feria Chilena del Libro, Antártica, Contrapunto, Líquidos, El Cielo, Booz, Vinoteca, Netflix, Spotify, Disney+, Max, Apple, Google One, YouTube, ChatGPT, Claude, PlayStation, Xbox, Steam, Nintendo', () => {
    assert.equal(guessCategoryFromDescription('CASA ROYAL PC FACTORY SP DIGITAL WEI.CL'), 'gustos_personales');
    assert.equal(guessCategoryFromDescription('MICROPLAY ZMART'), 'gustos_personales');
    assert.equal(guessCategoryFromDescription('FERIA CHILENA DEL LIBRO ANTARTICA LIBROS CONTRAPUNTO'), 'gustos_personales');
    assert.equal(guessCategoryFromDescription('BOTILLERIA LIQUIDOS EL CIELO BOOZ VINOTECA'), 'gustos_personales');
    assert.equal(guessCategoryFromDescription('NETFLIX SPOTIFY DISNEY+ HBO MAX AMAZON PRIME'), 'gustos_personales');
    assert.equal(guessCategoryFromDescription('APPLE.COM/BILL GOOGLE ONE YOUTUBE PREMIUM'), 'gustos_personales');
    assert.equal(guessCategoryFromDescription('CHATGPT OPENAI CLAUDE'), 'gustos_personales');
    assert.equal(guessCategoryFromDescription('PLAYSTATION XBOX STEAM NINTENDO'), 'gustos_personales');
  });

  test('5.15 Desambiguación de colisiones: Patagonia no se confunde con TAG, Temuco no se confunde con Temu, Feria Chilena del Libro no se confunde con Feria Libre', () => {
    assert.equal(guessCategoryFromDescription('COMPRA TIENDA PATAGONIA SANTIAGO CL'), 'gustos_personales');
    assert.equal(guessCategoryFromDescription('FERIA CHILENA DEL LIBRO PROVIDENCIA'), 'gustos_personales');
    assert.equal(guessCategoryFromDescription('FARMACIA CRUZ VERDE TEMUCO'), 'salud_farmacia');
    assert.equal(guessCategoryFromMerchant('COMERCIO DESCONOCIDO XYZ 999'), 'imprevistos');
  });
});

describe('6. Parseo de Cartolas Bancarias Chilenas (parseBankStatementText & parseBankStatementRows)', () => {
  test('6.1 Parsea cartola de Banco de Chile Cuenta FAN / Vista (6 columnas con Canal, Cargos, Abonos y Saldo ignorado)', () => {
    const bchFanStatement = `
      CARTOLA HISTORICA CUENTA FAN BANCO DE CHILE
      Fecha;Descripción;Canal o Lugar;Cargos;Abonos;Saldo
      01/10/2026;SALDO INICIAL;CENTRAL;0;0;1.500.000
      24/10/2026;PAGO: TBK*FARMACIA CRUZ VERDE SANTIAGO CL;INTERNET;22.990;0;1.477.010
      25/10/2026;TRASPASO A: MARIE ESPOSA;INTERNET;150.000;0;1.327.010
      26/10/2026;TRASPASO DE: JUANITO PEREZ;INTERNET;0;35.000;1.362.010
      31/10/2026;TOTAL MOVIMIENTOS;CENTRAL;172.990;35.000;1.362.010
      31/10/2026;SALDO FINAL;CENTRAL;0;0;1.362.010
    `;

    const rows = parseBankStatementText(bchFanStatement, '2026-10', 'cmr_falabella');
    assert.equal(rows.length, 3, 'Debe filtrar cabeceras, Saldo Inicial, Total y Saldo Final');

    assert.equal(rows[0].date, '2026-10-24');
    assert.equal(rows[0].amount, 22990);
    assert.equal(rows[0].flow, 'out');
    assert.equal(rows[0].paymentMethod, 'bch_vista');

    assert.equal(rows[1].date, '2026-10-25');
    assert.equal(rows[1].amount, 150000);
    assert.equal(rows[1].flow, 'out');

    assert.equal(rows[2].date, '2026-10-26');
    assert.equal(rows[2].amount, 35000);
    assert.equal(rows[2].flow, 'in');
  });

  test('6.2 Parsea cartola de Banco de Chile Cuenta Corriente (5 columnas sin Canal: Fecha;Movimiento;Cargo;Abono;Saldo)', () => {
    const bchCtaCteStatement = `
      BANCO DE CHILE - CARTOLA CUENTA CORRIENTE
      Fecha;Movimiento;Cargos;Abonos;Saldo
      01/10/2026;SALDO ANTERIOR;0;0;2.100.000
      05/10/2026;PAC ENEL DISTRIBUCION;42.300;0;2.057.700
      10/10/2026;REEMBOLSO ISAPRE COLMENA;0;28.500;2.086.200
      28/10/2026;ABONO SUELDO EMPRESA SPA;;2.350.000;4.436.200
      31/10/2026;TOTAL CARGOS Y ABONOS;42.300;2.378.500;4.436.200
    `;

    const rows = parseBankStatementText(bchCtaCteStatement, '2026-10', 'bch_ctacte');
    assert.equal(rows.length, 3);
    assert.equal(rows[0].amount, 42300);
    assert.equal(rows[0].flow, 'out');
    assert.equal(rows[0].paymentMethod, 'bch_ctacte');

    assert.equal(rows[1].amount, 28500);
    assert.equal(rows[1].flow, 'in');

    assert.equal(rows[2].amount, 2350000);
    assert.equal(rows[2].flow, 'in');
  });

  test('6.3 Parsea cartola de CMR Falabella con columna de Cuotas (01/03) sin confundir la cuota con el monto', () => {
    const cmrStatement = `
      ESTADO DE CUENTA CMR FALABELLA
      Fecha;Descripción;Cuotas;Monto
      24/10/2026;COMPRA JUMBO BILBAO LAS CONDES;01/01;$89.400
      25/10/2026;TIENDAS FALABELLA PARQUE ARAUCO;02/03;$33.333
      26/10/2026;PAGO TARJETA CMR;00/00;$120.000
      30/10/2026;TOTAL FACTURADO;;$242.733
    `;

    const rows = parseBankStatementText(cmrStatement, '2026-10', 'cmr_falabella');
    assert.equal(rows.length, 3);
    assert.equal(rows[0].amount, 89400);
    assert.equal(rows[0].paymentMethod, 'cmr_falabella');
    assert.equal(rows[1].amount, 33333);
    assert.match(rows[1].rawDescription, /02\/03/);
  });

  test('6.4 parseBankStatementRows: soporta matriz de celdas Excel (SheetJS)', () => {
    const excelMatrix = [
      ['Fecha', 'Descripción', 'Cargos', 'Abonos', 'Saldo'],
      ['01/10/2026', 'Saldo Inicial', '0', '0', '900.000'],
      ['15/10/2026', 'MERPAGO*PEDIDOSYA', '18.400', '0', '881.600'],
      ['16/10/2026', 'BONO FONASA REEMBOLSO', '0', '15.000', '896.600'],
      ['31/10/2026', 'Total', '18.400', '15.000', '896.600']
    ];

    const parsedFromMatrix = parseBankStatementRows(excelMatrix, '2026-10', 'bch_vista');
    assert.equal(parsedFromMatrix.length, 2);
    assert.equal(parsedFromMatrix[0].amount, 18400);
    assert.equal(parsedFromMatrix[0].flow, 'out');
    assert.equal(parsedFromMatrix[1].amount, 15000);
    assert.equal(parsedFromMatrix[1].flow, 'in');
  });

  test('6.5 parseBankStatementRows: soporta arreglo de objetos estructurados', () => {
    const objectRows = [
      { fecha: '2026-10-20', descripcion: 'COPEC ESTACION', monto: '$35.000', origen: 'CMR Falabella' },
      { fecha: '2026-10-21', descripcion: 'SALDO FINAL', monto: '$500.000', origen: 'CMR Falabella' }
    ];
    const parsedFromObjects = parseBankStatementRows(objectRows, '2026-10');
    assert.equal(parsedFromObjects.length, 1);
    assert.equal(parsedFromObjects[0].amount, 35000);
  });

  test('6.6 parseBankStatementText: soporta líneas en texto libre separadas por espacios', () => {
    const freeText = `
      24/10/2026 COMPRA SUPERMERCADO LIDER $48.500
      25/10/2026 ABONO REEMBOLSO ISAPRE $22.000
    `;
    const rows = parseBankStatementText(freeText, '2026-10', 'cmr_falabella');
    assert.equal(rows.length, 2);
    assert.equal(rows[0].amount, 48500);
    assert.equal(rows[0].flow, 'out');
    assert.equal(rows[1].amount, 22000);
    assert.equal(rows[1].flow, 'in');
  });
});

describe('7. Motor de Conciliación de 7 Capas (reconcileStatementRows)', () => {
  test('7.1 Capa 0: Detecta huella digital (bankFingerprint) y bloquea duplicados si se sube dos veces la misma cartola', () => {
    const csv = '2026-10-24;COMPRA HIPER LIDER;48500;CMR Falabella';
    const parsed = parseBankStatementText(csv, '2026-10', 'cmr_falabella');

    const existingTxs = [
      {
        id: 'tx_100',
        date: '2026-10-10',
        type: 'expense',
        amount: 48500,
        categoryId: 'supermercado',
        bankFingerprint: parsed[0].fingerprint,
        note: 'Lider importado antes'
      }
    ];

    const reconciled = reconcileStatementRows(parsed, existingTxs, 'Marie');
    assert.equal(reconciled.length, 1);
    assert.equal(reconciled[0].status, 'matched_duplicate');
    assert.equal(reconciled[0].reconciliationStatus, 'already_registered');
    assert.equal(reconciled[0].isDuplicateFingerprint, true);
    assert.equal(reconciled[0].selectedToImport, false);
    assert.equal(reconciled[0].matchedTx.id, 'tx_100');
  });

  test('7.2 Capa 1: Coincidencia exacta en ventana de ±4 días (already_registered / matched_duplicate)', () => {
    const existingTxs = [
      {
        id: 'tx_exp_1',
        date: '2026-10-20',
        type: 'expense',
        amount: 48500,
        categoryId: 'supermercado',
        paymentMethod: 'cmr_falabella',
        note: 'Supermercado Lider'
      }
    ];

    const statementRows = parseBankStatementText(
      '2026-10-24;COMPRA HIPER LIDER SANTIAGO CL;48500;CMR Falabella',
      '2026-10'
    );

    const result = reconcileStatementRows(statementRows, existingTxs, 'Marie');
    assert.equal(result[0].status, 'matched_duplicate');
    assert.equal(result[0].reconciliationStatus, 'already_registered');
    assert.equal(result[0].matchedTx.id, 'tx_exp_1');
    assert.equal(result[0].selectedToImport, false);
  });

  test('7.3 Capa 1B: Coincidencia con monto ligeramente redondeado (±$400) dentro de la ventana de conciliación', () => {
    const existingTxs = [
      {
        id: 'tx_exp_round',
        date: '2026-10-24',
        type: 'expense',
        amount: 23000, // Usuario anotó $23.000 cerrados
        categoryId: 'salud_farmacia',
        paymentMethod: 'cmr_falabella',
        note: 'Farmacia Cruz Verde'
      }
    ];

    const statementRows = parseBankStatementText(
      '2026-10-25;FARMACIAS CRUZ VERDE;22990;CMR Falabella',
      '2026-10'
    );

    const result = reconcileStatementRows(statementRows, existingTxs, 'Marie');
    assert.equal(result[0].status, 'matched_duplicate');
    assert.equal(result[0].reconciliationStatus, 'already_registered');
    assert.equal(result[0].matchedTx.id, 'tx_exp_round');
  });

  test('7.4 Capa 2A: Coincidencia de Boleta Mixta dividida con splitGroupId / receiptGroupId ($89.400 = $51.900 + $24.500 + $13.000) y marca todas las partes como conciliadas', () => {
    const splitTxs = [
      {
        id: 'tx_split_1',
        splitGroupId: 'grp_jumbo_1',
        date: '2026-10-22',
        type: 'expense',
        amount: 51900,
        categoryId: 'supermercado',
        paymentMethod: 'cmr_falabella',
        note: 'Jumbo: Mercadería general',
        reconciled: false
      },
      {
        id: 'tx_split_2',
        splitGroupId: 'grp_jumbo_1',
        date: '2026-10-22',
        type: 'expense',
        amount: 24500,
        categoryId: 'hija',
        paymentMethod: 'cmr_falabella',
        note: 'Jumbo: Pañales Pampers y colados',
        reconciled: false
      },
      {
        id: 'tx_split_3',
        splitGroupId: 'grp_jumbo_1',
        date: '2026-10-22',
        type: 'expense',
        amount: 13000,
        categoryId: 'gustos_personales',
        paymentMethod: 'cmr_falabella',
        note: 'Jumbo: Vino y chocolates',
        reconciled: false
      }
    ];

    const statementRows = parseBankStatementText(
      '2026-10-25;CENCOSUD JUMBO BILBAO LAS CONDES CL;89400;CMR Falabella',
      '2026-10'
    );

    const result = reconcileStatementRows(statementRows, splitTxs, 'Marie');
    assert.equal(result[0].status, 'matched_duplicate');
    assert.equal(result[0].reconciliationStatus, 'already_registered');
    assert.equal(result[0].isSplitMatch, true);
    assert.equal(result[0].matchedTransactions.length, 3);
    assert.deepEqual(result[0].matchedSplitIds, ['tx_split_1', 'tx_split_2', 'tx_split_3']);
    assert.equal(result[0].selectedToImport, false);

    // Simular confirmación de conciliación como lo hace app.js (marcando matchedTx.reconciled = true)
    result[0].matchedTx.reconciled = true;
    assert.equal(splitTxs[0].reconciled, true, 'Parte 1 del split debe quedar conciliada');
    assert.equal(splitTxs[1].reconciled, true, 'Parte 2 del split debe quedar conciliada');
    assert.equal(splitTxs[2].reconciled, true, 'Parte 3 del split debe quedar conciliada');
  });

  test('7.5 Capa 2B: Coincidencia de Boleta Mixta implícita (misma fecha + medio de pago sin splitGroupId previo)', () => {
    const implicitSplits = [
      {
        id: 'tx_imp_1',
        date: '2026-10-18',
        type: 'expense',
        amount: 51900,
        categoryId: 'supermercado',
        paymentMethod: 'cmr_falabella',
        note: 'Jumbo mercadería',
        reconciled: false
      },
      {
        id: 'tx_imp_2',
        date: '2026-10-18',
        type: 'expense',
        amount: 24500,
        categoryId: 'hija',
        paymentMethod: 'cmr_falabella',
        note: 'Jumbo pañales',
        reconciled: false
      },
      {
        id: 'tx_imp_3',
        date: '2026-10-18',
        type: 'expense',
        amount: 13000,
        categoryId: 'gustos_personales',
        paymentMethod: 'cmr_falabella',
        note: 'Jumbo antojos',
        reconciled: false
      }
    ];

    const statementRows = parseBankStatementText(
      '2026-10-20;COMPRA JUMBO SANTIAGO CL;89400;CMR Falabella',
      '2026-10'
    );

    const result = reconcileStatementRows(statementRows, implicitSplits, 'Marie');
    assert.equal(result[0].status, 'matched_duplicate');
    assert.equal(result[0].reconciliationStatus, 'already_registered');
    assert.equal(result[0].isSplitMatch, true);
    assert.equal(result[0].matchedTransactions.length, 3);

    applyReconciliationToTransactions(result, implicitSplits);
    assert.ok(implicitSplits.every((t) => t.reconciled === true));
  });

  test('7.6 Capa 3A: Detecta Transferencias a Marie (internal_transfer / transfer_wife)', () => {
    const rows = parseBankStatementText(
      '2026-10-25;TEF A MARIE GASTOS MES;200000;Banco de Chile Cta. Cte.',
      '2026-10'
    );
    const result = reconcileStatementRows(rows, [], 'Marie');
    assert.equal(result[0].status, 'internal');
    assert.equal(result[0].internalType, 'transfer_wife');
    assert.equal(result[0].reconciliationCategory, 'internal_transfer');
    assert.equal(result[0].selectedToImport, true);
  });

  test('7.7 Capa 3B: Detecta Pagos de CMR (cmr_payment)', () => {
    const rows = parseBankStatementText(
      '2026-10-26;PAGO TARJETA CMR FALABELLA;340000;Banco de Chile Cta. Cte.',
      '2026-10'
    );
    const result = reconcileStatementRows(rows, [], 'Marie');
    assert.equal(result[0].status, 'internal');
    assert.equal(result[0].internalType, 'cmr_payment');
    assert.equal(result[0].reconciliationCategory, 'cmr_payment');
  });

  test('7.8 Capa 3C: Detecta traspasos entre cuentas propias (transfer_self) sin confundir la ciudad "SANTIAGO CL"', () => {
    const rows = parseBankStatementText(
      `2026-10-27;TRASPASO A CUENTA FAN MAURICIO;50000;Banco de Chile Cta. Cte.
       2026-10-27;COMPRA LIDER SANTIAGO CL;32000;Banco de Chile Cta. Cte.`,
      '2026-10'
    );
    const result = reconcileStatementRows(rows, [], 'Marie');
    assert.equal(result[0].status, 'internal');
    assert.equal(result[0].internalType, 'transfer_self');
    assert.equal(result[0].selectedToImport, false);

    // La compra en Santiago CL NO debe clasificarse como traspaso propio
    assert.equal(result[1].status, 'forgotten_new');
    assert.equal(result[1].suggestedCategoryId, 'supermercado');
  });

  test('7.9 Capa 4A: Detecta Abono por Reembolso Médico Isapre/Fonasa (reimbursement -> salud_farmacia)', () => {
    const rows = parseBankStatementText(
      '20/10/2026;REEMBOLSO ISAPRE COLMENA BONO;INTERNET;0;32.000;1.500.000',
      '2026-10',
      'bch_ctacte'
    );
    const reconciled = reconcileStatementRows(rows, [], 'Marie');
    assert.equal(reconciled[0].status, 'incoming_abono');
    assert.equal(reconciled[0].abonoAction, 'reimburse');
    assert.equal(reconciled[0].abonoCategory, 'reimbursement');
    assert.equal(reconciled[0].reimburseCategoryId, 'salud_farmacia');
  });

  test('7.10 Capa 4B: Detecta Abono por Reembolso de Colegio / Jardín Infantil (reimbursement -> hija)', () => {
    const rows = parseBankStatementText(
      '21/10/2026;DEVOLUCION CUOTA COLEGIO JARDIN INFANTIL;INTERNET;0;15.000;1.515.000',
      '2026-10',
      'bch_ctacte'
    );
    const reconciled = reconcileStatementRows(rows, [], 'Marie');
    assert.equal(reconciled[0].status, 'incoming_abono');
    assert.equal(reconciled[0].abonoAction, 'reimburse');
    assert.equal(reconciled[0].abonoCategory, 'reimbursement');
    assert.equal(reconciled[0].reimburseCategoryId, 'hija');
  });

  test('7.11 Capa 4C: Detecta Abono por Devolución de Préstamo (loan_collection / loan_collected)', () => {
    const existingTxs = [
      {
        id: 'tx_loan_juanito',
        date: '2026-10-10',
        type: 'loan_given',
        amount: 45000,
        categoryId: 'prestamo_encargo',
        note: 'Juanito Soto — entrada concierto'
      }
    ];
    const rows = parseBankStatementText(
      '22/10/2026;TRASPASO DE: JUANITO SOTO;INTERNET;0;45.000;1.560.000',
      '2026-10',
      'bch_ctacte'
    );
    const reconciled = reconcileStatementRows(rows, existingTxs, 'Marie');
    assert.equal(reconciled[0].status, 'incoming_abono');
    assert.equal(reconciled[0].abonoAction, 'loan_collected');
    assert.equal(reconciled[0].abonoCategory, 'loan_collection');
  });

  test('7.12 Capa 4D: Detecta Abono por Préstamo Recibido (loan_received)', () => {
    const rows = parseBankStatementText(
      '23/10/2026;ABONO PRESTAMO RECIBIDO MAMA;INTERNET;0;100.000;1.660.000',
      '2026-10',
      'bch_ctacte'
    );
    const reconciled = reconcileStatementRows(rows, [], 'Marie');
    assert.equal(reconciled[0].status, 'incoming_abono');
    assert.equal(reconciled[0].abonoAction, 'loan_received');
    assert.equal(reconciled[0].abonoCategory, 'loan_received');
  });

  test('7.13 Capa 4E: Detecta Abono por Sueldo / Remuneración (income)', () => {
    const rows = parseBankStatementText(
      '28/10/2026;ABONO SUELDO REMUNERACION OCTUBRE;CENTRAL;0;2.350.000;4.010.000',
      '2026-10',
      'bch_ctacte'
    );
    const reconciled = reconcileStatementRows(rows, [], 'Marie');
    assert.equal(reconciled[0].status, 'incoming_abono');
    assert.equal(reconciled[0].abonoAction, 'income');
    assert.equal(reconciled[0].abonoCategory, 'income');
  });

  test('7.14 Capa 5: Utiliza learnedContacts (Memoria Familiar) tanto para cargos como para abonos', () => {
    const learnedContacts = {
      'pedro jardinero': {
        flow: 'out',
        suggestedCategoryId: 'hogar_varios'
      },
      'claudia hermana': {
        flow: 'in',
        abonoAction: 'reimburse',
        reimburseCategoryId: 'delivery_salidas'
      }
    };

    const rows = parseBankStatementText(
      `Fecha;Descripción;Canal;Cargos;Abonos;Saldo
       25/10/2026;TRASPASO A: PEDRO JARDINERO;INTERNET;25.000;0;900.000
       26/10/2026;TRASPASO DE: CLAUDIA HERMANA;INTERNET;0;18.500;918.500`,
      '2026-10'
    );

    const reconciled = reconcileStatementRows(rows, [], 'Marie', null, learnedContacts);

    assert.equal(reconciled[0].status, 'forgotten_new');
    assert.equal(reconciled[0].suggestedCategoryId, 'hogar_varios');
    assert.match(reconciled[0].smartHint, /Memoria familiar/);

    assert.equal(reconciled[1].status, 'incoming_abono');
    assert.equal(reconciled[1].abonoAction, 'reimburse');
    assert.equal(reconciled[1].reimburseCategoryId, 'delivery_salidas');
    assert.match(reconciled[1].smartHint, /Memoria familiar/);
  });

  test('7.15 Capa 6: Coincidencia de cuotas de tarjeta de crédito CMR y auxiliares de contacto', () => {
    const existingTxs = [
      {
        id: 'tx_cuota_2',
        date: '2026-10-15',
        type: 'expense',
        amount: 33333,
        categoryId: 'hogar_varios',
        note: 'Aspiradora Robot (Cuota 2/3)'
      }
    ];

    const rows = parseBankStatementText(
      '2026-10-22;FALABELLA ELECTRODOMESTICOS CUOTA 02/03;33333;CMR Falabella',
      '2026-10'
    );

    const reconciled = reconcileStatementRows(rows, existingTxs, 'Marie');
    assert.equal(reconciled[0].status, 'matched_duplicate');
    assert.equal(reconciled[0].matchedTx.id, 'tx_cuota_2');

    assert.equal(extractContactDisplayName('TRASPASO DE: PEDRO SOTO (Reembolso)'), 'Pedro Soto');
    assert.equal(normalizeContactKey('TEF A: Juanito Pérez (Préstamo)'), 'juanito pérez');
    assert.equal(guessPaymentMethodFromSource('Banco de Chile Cta. Cte.'), 'bch_ctacte');
    assert.equal(guessPaymentMethodFromSource('Cuenta FAN Vista'), 'bch_vista');
    assert.equal(guessPaymentMethodFromSource('Cuenta Marie'), 'cuenta_mujer');
  });

  test('7.16 Capa 7: Detecta devolución de préstamo que debíamos (loan_repaid) y rescate de ahorros (savings_withdrawal)', () => {
    const existingTxs = [
      {
        id: 'tx_loan_rec_1',
        date: '2026-10-05',
        type: 'loan_received',
        amount: 60000,
        categoryId: 'prestamo_encargo',
        note: 'Andrés Primo — préstamo emergencia'
      }
    ];

    const rows = parseBankStatementText(
      `Fecha;Descripción;Canal;Cargos;Abonos;Saldo
       25/10/2026;TRASPASO A: ANDRES PRIMO;INTERNET;60.000;0;800.000
       26/10/2026;RESCATE FONDO MUTUO FINTUAL;INTERNET;0;200.000;1.000.000`,
      '2026-10'
    );

    const reconciled = reconcileStatementRows(rows, existingTxs, 'Marie');
    assert.equal(reconciled[0].status, 'forgotten_new');
    assert.equal(reconciled[0].suggestedCategoryId, '__loan_repaid__');

    assert.equal(reconciled[1].status, 'incoming_abono');
    assert.equal(reconciled[1].abonoAction, 'savings_withdrawal');
  });
});
