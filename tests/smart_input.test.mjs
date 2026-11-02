import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseQuickNaturalExpense,
  buildInstallmentTransactions,
  getQuickPresetsForAuthor
} from '../src/services/smartInput.js';

const VALID_CATEGORIES = new Set([
  'supermercado',
  'hija',
  'salud_farmacia',
  'transporte',
  'delivery_salidas',
  'hogar_varios',
  'vivienda_fijos',
  'gustos_personales',
  'imprevistos'
]);

test('1. Jerga chilena: "15 lucas feria" parsea 15000, supermercado y nota Feria', () => {
  const res = parseQuickNaturalExpense('15 lucas feria', 'ella');
  assert.equal(res.amount, 15000);
  assert.equal(res.categoryId, 'supermercado');
  assert.equal(res.paymentMethod, 'cuenta_mujer');
  assert.equal(res.installments, 1);
  assert.equal(res.cleanNote, 'Feria');
  assert.equal(res.detectedMerchant, 'Feria');
  assert.equal(res.isTransferWife, false);
  assert.equal(res.confidence, 'high');
});

test('2. Jerga chilena: "1.5 lucas" y "1,5 lucas" parsean 1500 CLP', () => {
  const r1 = parseQuickNaturalExpense('1.5 lucas pan', 'ella');
  const r2 = parseQuickNaturalExpense('1,5 lucas pan', 'ella');
  assert.equal(r1.amount, 1500);
  assert.equal(r2.amount, 1500);
  assert.equal(r1.categoryId, 'supermercado');
  assert.equal(r1.paymentMethod, 'cuenta_mujer');
});

test('3. Jerga chilena: "media luca" parsea exactamente 500 CLP', () => {
  const res = parseQuickNaturalExpense('media luca propina', 'el');
  assert.equal(res.amount, 500);
  assert.equal(res.categoryId, 'delivery_salidas');
  assert.equal(res.cleanNote, 'Propina');
});

test('4. Jerga chilena: "un palo" parsea 1.000.000 CLP y "medio palo" 500.000 CLP', () => {
  const r1 = parseQuickNaturalExpense('un palo arriendo', 'el');
  const r2 = parseQuickNaturalExpense('medio palo arriendo', 'el');
  assert.equal(r1.amount, 1000000);
  assert.equal(r1.categoryId, 'vivienda_fijos');
  assert.equal(r1.paymentMethod, 'bch_ctacte');
  assert.equal(r2.amount, 500000);
});

test('5. Jerga chilena: "25 mil" y "$24.500" parsean montos enteros exactos', () => {
  const r1 = parseQuickNaturalExpense('25 mil supermercado', 'el');
  const r2 = parseQuickNaturalExpense('$24.500 farmacia', 'ella');
  assert.equal(r1.amount, 25000);
  assert.equal(r2.amount, 24500);
  assert.equal(r2.categoryId, 'salud_farmacia');
});

test('6. Frase completa: "24.500 pañales cruz verde cmr" detecta hija, Cruz Verde y CMR', () => {
  const res = parseQuickNaturalExpense('24.500 pañales cruz verde cmr', 'ella');
  assert.equal(res.amount, 24500);
  assert.equal(res.categoryId, 'hija');
  assert.equal(res.paymentMethod, 'cmr_falabella');
  assert.equal(res.installments, 1);
  assert.equal(res.cleanNote, 'Pañales Cruz Verde');
  assert.equal(res.detectedMerchant, 'Cruz Verde');
  assert.equal(res.confidence, 'high');
});

test('7. Frase sin puntos: "24500 pañales cruz verde cmr" funciona idéntico', () => {
  const res = parseQuickNaturalExpense('24500 pañales cruz verde cmr', 'el');
  assert.equal(res.amount, 24500);
  assert.equal(res.categoryId, 'hija');
  assert.equal(res.paymentMethod, 'cmr_falabella');
  assert.equal(res.cleanNote, 'Pañales Cruz Verde');
  assert.equal(res.detectedMerchant, 'Cruz Verde');
});

test('8. Compra en cuotas: "35 mil copec en 3 cuotas" detecta 35000, transporte, 3 cuotas y CMR', () => {
  const res = parseQuickNaturalExpense('35 mil copec en 3 cuotas', 'el');
  assert.equal(res.amount, 35000);
  assert.equal(res.categoryId, 'transporte');
  assert.equal(res.paymentMethod, 'cmr_falabella');
  assert.equal(res.installments, 3);
  assert.equal(res.cleanNote, 'Copec');
  assert.equal(res.detectedMerchant, 'Copec');
  assert.equal(res.confidence, 'high');
});

test('9. Compra en cuotas: "120.000 silla auto infanti en 6 cuotas" detecta 120000, hija, 6 cuotas y CMR', () => {
  const res = parseQuickNaturalExpense('120.000 silla auto infanti en 6 cuotas', 'ella');
  assert.equal(res.amount, 120000);
  assert.equal(res.categoryId, 'hija');
  assert.equal(res.paymentMethod, 'cmr_falabella');
  assert.equal(res.installments, 6);
  assert.equal(res.cleanNote, 'Silla Auto Infanti');
  assert.equal(res.detectedMerchant, 'Infanti');
  assert.equal(res.confidence, 'high');
});

test('10. Abreviaturas de cuotas: "6 cuotas", "3c", "12 cuotas" fuerzan cmr_falabella', () => {
  const r1 = parseQuickNaturalExpense('90000 chaqueta zara 3c', 'ella');
  const r2 = parseQuickNaturalExpense('240.000 neumáticos 12 cuotas', 'el');
  const r3 = parseQuickNaturalExpense('60 mil zapatos 6 cuotas', 'ella');

  assert.equal(r1.installments, 3);
  assert.equal(r1.paymentMethod, 'cmr_falabella');
  assert.equal(r1.amount, 90000);

  assert.equal(r2.installments, 12);
  assert.equal(r2.paymentMethod, 'cmr_falabella');
  assert.equal(r2.amount, 240000);
  assert.equal(r2.categoryId, 'transporte');

  assert.equal(r3.installments, 6);
  assert.equal(r3.paymentMethod, 'cmr_falabella');
  assert.equal(r3.amount, 60000);
});

test('11. Medio de pago explícito: "8500 pan efectivo" detecta efectivo y supermercado', () => {
  const res = parseQuickNaturalExpense('8500 pan efectivo', 'el');
  assert.equal(res.amount, 8500);
  assert.equal(res.categoryId, 'supermercado');
  assert.equal(res.paymentMethod, 'efectivo');
  assert.equal(res.cleanNote, 'Pan');
  assert.equal(res.installments, 1);
});

test('12. Medios de pago explícitos alternativos: cash, billete, monedas -> efectivo', () => {
  assert.equal(parseQuickNaturalExpense('3000 helado cash', 'el').paymentMethod, 'efectivo');
  assert.equal(parseQuickNaturalExpense('5000 feria billete', 'ella').paymentMethod, 'efectivo');
  assert.equal(parseQuickNaturalExpense('1200 parquimetro monedas', 'el').paymentMethod, 'efectivo');
});

test('13. Medios de pago explícitos: cuenta mujer, cuenta marie, billetera marie -> cuenta_mujer', () => {
  assert.equal(
    parseQuickNaturalExpense('12000 verduras cuenta mujer', 'el').paymentMethod,
    'cuenta_mujer'
  );
  assert.equal(
    parseQuickNaturalExpense('6500 pan cuenta marie', 'el').paymentMethod,
    'cuenta_mujer'
  );
  assert.equal(
    parseQuickNaturalExpense('9000 café billetera marie', 'el').paymentMethod,
    'cuenta_mujer'
  );
});

test('14. Medios de pago explícitos: vista y fan -> bch_vista', () => {
  assert.equal(
    parseQuickNaturalExpense('4500 estacionamiento saba vista', 'el').paymentMethod,
    'bch_vista'
  );
  assert.equal(
    parseQuickNaturalExpense('7900 pedidosya fan', 'el').paymentMethod,
    'bch_vista'
  );
});

test('15. Medios de pago explícitos: banco de chile, cta cte, débito, transferencia -> bch_ctacte', () => {
  assert.equal(
    parseQuickNaturalExpense('45000 gas banco de chile', 'el').paymentMethod,
    'bch_ctacte'
  );
  assert.equal(
    parseQuickNaturalExpense('15000 carniceria cta cte', 'el').paymentMethod,
    'bch_ctacte'
  );
  assert.equal(
    parseQuickNaturalExpense('12500 almuerzo débito', 'ella').paymentMethod,
    'bch_ctacte'
  );
  assert.equal(
    parseQuickNaturalExpense('95000 gastos comunes transferencia', 'el').paymentMethod,
    'bch_ctacte'
  );
});

test('16. Inferencia de medio de pago sin mención para Marie (ella): feria/pan/almacén -> cuenta_mujer, super/farmacia -> cmr_falabella', () => {
  const feria = parseQuickNaturalExpense('18 lucas feria', 'ella');
  const pan = parseQuickNaturalExpense('4500 pan', 'ella');
  const almacen = parseQuickNaturalExpense('7000 almacen', 'ella');
  const jumbo = parseQuickNaturalExpense('65 mil jumbo', 'ella');
  const farmacia = parseQuickNaturalExpense('19990 salcobrand', 'ella');

  assert.equal(feria.paymentMethod, 'cuenta_mujer');
  assert.equal(pan.paymentMethod, 'cuenta_mujer');
  assert.equal(almacen.paymentMethod, 'cuenta_mujer');
  assert.equal(jumbo.paymentMethod, 'cmr_falabella');
  assert.equal(farmacia.paymentMethod, 'cmr_falabella');
});

test('17. Inferencia de medio de pago sin mención para Mauricio (el): supermercado/bencina -> cmr_falabella, pan/almacén -> bch_ctacte', () => {
  const lider = parseQuickNaturalExpense('52 mil lider', 'el');
  const copec = parseQuickNaturalExpense('40 lucas copec', 'el');
  const pan = parseQuickNaturalExpense('4500 panaderia', 'el');

  assert.equal(lider.paymentMethod, 'cmr_falabella');
  assert.equal(copec.paymentMethod, 'cmr_falabella');
  assert.equal(pan.paymentMethod, 'bch_ctacte');
});

test('18. Detección de transferencia a Marie: "transferencia a marie", "traspaso marie", "plata a marie"', () => {
  const t1 = parseQuickNaturalExpense('200 mil transferencia a marie', 'el');
  const t2 = parseQuickNaturalExpense('150.000 traspaso marie', 'el');
  const t3 = parseQuickNaturalExpense('100 lucas plata a marie', 'el');

  assert.equal(t1.isTransferWife, true);
  assert.equal(t1.amount, 200000);
  assert.equal(t1.paymentMethod, 'bch_ctacte');
  assert.ok(VALID_CATEGORIES.has(t1.categoryId));

  assert.equal(t2.isTransferWife, true);
  assert.equal(t2.amount, 150000);

  assert.equal(t3.isTransferWife, true);
  assert.equal(t3.amount, 100000);
});

test('19. Clasificación en las 9 categorías chilenas desde comercios reales', () => {
  const cases = [
    ['45000 jumbo', 'supermercado'],
    ['28000 pampers', 'hija'],
    ['15000 cruz verde', 'salud_farmacia'],
    ['32000 shell', 'transporte'],
    ['18900 pedidosya', 'delivery_salidas'],
    ['29990 sodimac', 'hogar_varios'],
    ['42000 enel', 'vivienda_fijos'],
    ['10990 netflix', 'gustos_personales'],
    ['25000 notaria', 'imprevistos']
  ];

  for (const [input, expectedCat] of cases) {
    const res = parseQuickNaturalExpense(input, 'el');
    assert.equal(res.categoryId, expectedCat, `Falló para entrada: ${input}`);
    assert.ok(VALID_CATEGORIES.has(res.categoryId));
  }
});

test('20. buildInstallmentTransactions: si installmentsCount <= 1 devuelve [baseTx] intacto', () => {
  const baseTx = {
    id: 'tx_1',
    date: '2026-11-05',
    amount: 45000,
    categoryId: 'supermercado',
    paymentMethod: 'cmr_falabella',
    author: 'el',
    note: 'Jumbo',
    reconciled: true
  };

  const single = buildInstallmentTransactions(baseTx, 1);
  assert.equal(single.length, 1);
  assert.deepEqual(single[0], baseTx);
});

test('21. buildInstallmentTransactions: exactitud al peso ($100.000 en 3 cuotas -> $33.334 + $33.333 + $33.333 = $100.000)', () => {
  const baseTx = {
    id: 'tx_100k',
    date: '2026-11-10',
    amount: 100000,
    categoryId: 'hogar_varios',
    paymentMethod: 'cmr_falabella',
    author: 'el',
    note: 'Sodimac',
    reconciled: true
  };

  const cuotas = buildInstallmentTransactions(baseTx, 3);
  assert.equal(cuotas.length, 3);
  assert.equal(cuotas[0].amount, 33334);
  assert.equal(cuotas[1].amount, 33333);
  assert.equal(cuotas[2].amount, 33333);

  const sum = cuotas.reduce((acc, c) => acc + c.amount, 0);
  assert.equal(sum, 100000);
});

test('22. buildInstallmentTransactions: resto de $2 en división inexacta ($100.001 en 3 cuotas -> $33.335 + $33.333 + $33.333)', () => {
  const baseTx = {
    id: 'tx_100k1',
    date: '2026-11-10',
    amount: 100001,
    categoryId: 'hija',
    paymentMethod: 'cmr_falabella',
    author: 'ella',
    note: 'Coche bebé'
  };

  const cuotas = buildInstallmentTransactions(baseTx, 3);
  assert.equal(cuotas[0].amount, 33335);
  assert.equal(cuotas[1].amount, 33333);
  assert.equal(cuotas[2].amount, 33333);
  assert.equal(
    cuotas.reduce((acc, c) => acc + c.amount, 0),
    100001
  );
});

test('23. buildInstallmentTransactions: salto de año y fin de mes (2026-11-30 en 6 cuotas pasando por 2027-02-28)', () => {
  const baseTx = {
    id: 'tx_infanti',
    date: '2026-11-30',
    amount: 120000,
    categoryId: 'hija',
    paymentMethod: 'cmr_falabella',
    author: 'ella',
    note: 'Silla Auto Infanti',
    reconciled: true
  };

  const cuotas = buildInstallmentTransactions(baseTx, 6);
  assert.equal(cuotas.length, 6);
  assert.deepEqual(
    cuotas.map((c) => c.date),
    [
      '2026-11-30',
      '2026-12-30',
      '2027-01-30',
      '2027-02-28',
      '2027-03-30',
      '2027-04-30'
    ]
  );
});

test('24. buildInstallmentTransactions: respeta año bisiesto (2028-01-31 en 4 cuotas pasa por 2028-02-29 y 2028-04-30)', () => {
  const baseTx = {
    id: 'tx_leap',
    date: '2028-01-31',
    amount: 80000,
    categoryId: 'gustos_personales',
    paymentMethod: 'cmr_falabella',
    author: 'el',
    note: 'Falabella'
  };

  const cuotas = buildInstallmentTransactions(baseTx, 4);
  assert.deepEqual(
    cuotas.map((c) => c.date),
    ['2028-01-31', '2028-02-29', '2028-03-31', '2028-04-30']
  );
});

test('25. buildInstallmentTransactions: metadatos de cuotas, IDs únicos, installmentGroupId compartido y reconciled solo en cuota 1', () => {
  const baseTx = {
    id: 'tx_meta',
    date: '2026-10-15',
    amount: 60000,
    categoryId: 'salud_farmacia',
    paymentMethod: 'cmr_falabella',
    author: 'ella',
    note: 'Exámenes médicos',
    reconciled: true
  };

  const cuotas = buildInstallmentTransactions(baseTx, 3);
  const ids = new Set(cuotas.map((c) => c.id));
  assert.equal(ids.size, 3);

  const groupId = cuotas[0].installmentGroupId;
  assert.ok(groupId);

  cuotas.forEach((c, idx) => {
    const k = idx + 1;
    assert.equal(c.installmentNumber, k);
    assert.equal(c.installmentsTotal, 3);
    assert.equal(c.installmentGroupId, groupId);
    assert.equal(c.parentTotalAmount, 60000);
    assert.equal(c.note, `Exámenes médicos (Cuota ${k}/3)`);
    assert.equal(c.reconciled, k === 1);
  });
});

test('26. getQuickPresetsForAuthor: devuelve los 6 atajos exactos para Marie (ella) y Mauricio (el)', () => {
  const presetsElla = getQuickPresetsForAuthor('ella');
  const presetsEl = getQuickPresetsForAuthor('el');

  assert.equal(presetsElla.length, 6);
  assert.equal(presetsEl.length, 6);

  assert.deepEqual(
    presetsElla.map((p) => p.id),
    [
      'preset_feria',
      'preset_hija',
      'preset_pan',
      'preset_super',
      'preset_farmacia',
      'preset_cafe'
    ]
  );

  assert.deepEqual(
    presetsEl.map((p) => p.id),
    [
      'preset_super_m',
      'preset_bencina',
      'preset_hija_m',
      'preset_delivery',
      'preset_farmacia_m',
      'preset_feria_m'
    ]
  );

  assert.equal(presetsElla[0].paymentMethod, 'cuenta_mujer');
  assert.equal(presetsElla[1].paymentMethod, 'cmr_falabella');
  assert.equal(presetsEl[1].categoryId, 'transporte');
  assert.equal(presetsEl[5].paymentMethod, 'bch_ctacte');
});

test('27. Resiliencia con entrada vacía o sin monto: devuelve estructura válida y confidence low', () => {
  const empty = parseQuickNaturalExpense('', 'ella');
  assert.equal(empty.amount, 0);
  assert.equal(empty.installments, 1);
  assert.equal(empty.paymentMethod, 'cuenta_mujer');
  assert.equal(empty.confidence, 'low');
  assert.ok(VALID_CATEGORIES.has(empty.categoryId));
});
