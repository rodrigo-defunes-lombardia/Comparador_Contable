import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conciliar, TIPOS, MOTIVOS } from '../js/emparejado.js';
import { parecidoConcepto, normalizarConcepto } from '../js/concepto.js';
import { calcularResumen, calcularPorFecha, filtrarFechas, etiquetaPartida } from '../js/resumen.js';
import { diaDesdeComponentes } from '../js/valores.js';

const marzo = (n) => diaDesdeComponentes(2026, 3, n);

/** Crea movimientos: [dia de marzo, concepto, importe en euros con signo]. */
function movs(origen, lista) {
  return lista.map(([dia, concepto, euros], i) => ({
    id: `${origen[0]}${i}`, origen, indice: i, fila: i + 1, dia: marzo(dia), concepto, importe: Math.round(euros * 100),
  }));
}

// Movimientos de "relleno" al principio y al final del mes para que el periodo sea 1-31 de marzo
// y los casos de prueba no caigan cerca de los bordes.
const BORDES_C = [[1, 'Alquiler local', -800], [31, 'Comisión mantenimiento', -5]];
const BORDES_B = [[1, 'RECIBO ALQUILER LOCAL', -800], [31, 'COMISION MANTENIMIENTO', -5]];

function caso(contab, banco) {
  return conciliar(movs('contabilidad', [...BORDES_C, ...contab]), movs('banco', [...BORDES_B, ...banco]));
}
/** Partidas que no son las de relleno. */
const propias = (r) => r.partidas.filter((p) => ![marzo(1), marzo(31)].includes((p.contabilidad || p.banco).dia));

test('concepto: normalización y parecido', () => {
  assert.deepEqual(normalizarConcepto('Recibo Ibérdrola, nº 12345 de MARZO'), ['recibo', 'iberdrola', 'marzo']);
  assert.ok(parecidoConcepto('Iberdrola luz', 'RECIBO IBERDROLA CLIENTES SAU') >= 0.5);
  assert.ok(parecidoConcepto('Transf. a Juan García', 'TRANSFERENCIA JUAN GARCIA') >= 0.5, 'abreviaturas y tildes');
  assert.ok(parecidoConcepto('Mercadona', 'COMPRA TARJ. CARREFOUR') < 0.5);
  assert.ok(parecidoConcepto('Bizum', 'BIZUM') === 1, 'si solo hay palabras genéricas, se comparan');
  assert.equal(parecidoConcepto('', 'algo'), 0);
});

test('coincidencia exacta: mismo importe, mismo día, concepto parecido', () => {
  const r = caso([[10, 'Iberdrola luz', -62.4]], [[10, 'RECIBO IBERDROLA CLIENTES', -62.4]]);
  const [p] = propias(r);
  assert.equal(propias(r).length, 1);
  assert.equal(p.tipo, TIPOS.COINCIDE);
  assert.equal(p.motivo, MOTIVOS.EXACTA);
  assert.equal(etiquetaPartida(p), 'Coincide');
});

test('coincidencia con desfase de 1 y 2 días', () => {
  const r = caso(
    [[10, 'Gestoría López', -121], [12, 'Cliente Pérez factura', 500]],
    [[11, 'RECIBO GESTORIA LOPEZ', -121], [14, 'TRANSFERENCIA CLIENTE PEREZ', 500]],
  );
  const ps = propias(r);
  assert.equal(ps.length, 2);
  assert.ok(ps.every((p) => p.tipo === TIPOS.COINCIDE && p.motivo === MOTIVOS.DESFASE_FECHA));
  assert.deepEqual(ps.map((p) => p.dias), [1, 2]);
  assert.equal(etiquetaPartida(ps[1]), 'Fecha desfasada 2 días');
  const res = calcularResumen(r);
  assert.equal(res.coincidenConDesfase, 2);
  assert.equal(res.descuadre, 0);
});

test('mismo importe con 3 días de diferencia no es desfase sino "fecha muy distinta"', () => {
  const r = caso([[10, 'Seguro coche Mapfre', -300]], [[20, 'RECIBO MAPFRE SEGUROS', -300]]);
  const [p] = propias(r);
  assert.equal(p.tipo, TIPOS.DUDOSO);
  assert.equal(p.motivo, MOTIVOS.FECHA_MUY_DISTINTA);
  assert.equal(p.dias, 10);
});

test('más allá de VENTANA_MAX_DIAS no se emparejan', () => {
  const r = conciliar(
    movs('contabilidad', [[1, 'Seguro coche Mapfre', -300], [10, 'Otro', -1]]),
    movs('banco', [[1, 'RECIBO MAPFRE SEGUROS', -300], [10, 'Otro', -1]]).map((m, i) => (i === 0 ? { ...m, dia: marzo(1) + 40 } : m)),
  );
  assert.equal(r.partidas.filter((p) => p.motivo === MOTIVOS.FECHA_MUY_DISTINTA).length, 0);
});

test('concepto distinto: mismo importe y fecha cercana, concepto distinto → dudoso', () => {
  const r = caso([[10, 'Mercadona', -45.3]], [[11, 'COMPRA TARJ. CARREFOUR EXPRESS', -45.3]]);
  const [p] = propias(r);
  assert.equal(p.tipo, TIPOS.DUDOSO);
  assert.equal(p.motivo, MOTIVOS.CONCEPTO_DISTINTO);
});

test('importe distinto: mismo signo, fecha cercana, concepto parecido → claro con diferencia', () => {
  const r = caso([[10, 'Vodafone teléfono', -45]], [[10, 'RECIBO VODAFONE ESPANA', -54]]);
  const [p] = propias(r);
  assert.equal(p.tipo, TIPOS.CLARO);
  assert.equal(p.motivo, MOTIVOS.IMPORTE_DISTINTO);
  assert.equal(p.diferencia, 900, 'contabilidad − banco = −45 − (−54) = +9 €');
  assert.match(etiquetaPartida(p), /Importe distinto \(diferencia \+9,00 €\)/);
});

test('importe distinto prefiere el importe más cercano', () => {
  const r = caso([[10, 'Vodafone', -45]], [[10, 'RECIBO VODAFONE', -90], [10, 'RECIBO VODAFONE', -46]]);
  const p = propias(r).find((x) => x.motivo === MOTIVOS.IMPORTE_DISTINTO);
  assert.equal(p.banco.importe, -4600);
});

test('falta en el banco y falta en contabilidad', () => {
  const r = caso([[12, 'Pago proveedor Ruiz', -230]], [[15, 'INGRESO EFECTIVO', 150]]);
  const ps = propias(r);
  assert.equal(ps.length, 2);
  const fb = ps.find((p) => p.motivo === MOTIVOS.FALTA_BANCO);
  const fc = ps.find((p) => p.motivo === MOTIVOS.FALTA_CONTABILIDAD);
  assert.equal(fb.tipo, TIPOS.CLARO);
  assert.equal(fc.tipo, TIPOS.CLARO);
  assert.equal(fb.contabilidad.concepto, 'Pago proveedor Ruiz');
  assert.equal(fc.banco.concepto, 'INGRESO EFECTIVO');
  const res = calcularResumen(r);
  assert.equal(res.faltaBanco, 1);
  assert.equal(res.faltaContabilidad, 1);
  assert.equal(res.descuadre, -23000 - 15000);
  assert.equal(res.primeraFecha, marzo(12));
});

test('bordes del periodo: sobrante cerca del inicio o final del otro archivo → dudoso', () => {
  // Periodo del banco: 1-31 de marzo. MARGEN_DIAS = 2 → dudoso si cae antes del día 3 o después del 29.
  const r = caso(
    [[2, 'Cuota autónomos', -294], [30, 'Cobro cliente Sanz', 1200], [29, 'Algo intermedio', -10]],
    [],
  );
  const porDia = (n) => r.partidas.find((p) => p.contabilidad && p.contabilidad.dia === marzo(n));
  assert.equal(porDia(2).motivo, MOTIVOS.FUERA_PERIODO);
  assert.equal(porDia(2).tipo, TIPOS.DUDOSO);
  assert.equal(porDia(30).motivo, MOTIVOS.FUERA_PERIODO);
  assert.equal(porDia(29).motivo, MOTIVOS.FALTA_BANCO, 'a 2 días del borde ya no es "a menos de" 2 días');
  assert.match(etiquetaPartida(porDia(2)), /puede caer fuera del periodo/);
});

test('fuera del periodo del otro archivo también es dudoso', () => {
  const r = conciliar(
    movs('contabilidad', [[5, 'A', -1], [6, 'B', -2], [20, 'C', -3]]),
    movs('banco', [[5, 'A', -1], [15, 'B', -2]]),
  );
  const c = r.partidas.find((p) => p.contabilidad && p.contabilidad.concepto === 'C');
  assert.equal(c.motivo, MOTIVOS.FUERA_PERIODO);
});

test('una entrada nunca se empareja con una salida del mismo importe', () => {
  const r = caso([[10, 'Devolución Amazon', 100]], [[10, 'COMPRA AMAZON', -100]]);
  const ps = propias(r);
  assert.equal(ps.length, 2);
  assert.ok(ps.every((p) => p.tipo === TIPOS.CLARO));
  assert.ok(ps.every((p) => !(p.contabilidad && p.banco)));
});

test('pista: sobrante con el mismo importe en el otro archivo', () => {
  const r = caso([[5, 'Pago proveedor Ruiz', -230]], [[25, 'TRANSFERENCIA ALFA', -230]]);
  const fb = propias(r).find((p) => p.motivo === MOTIVOS.FALTA_BANCO);
  assert.ok(fb.pista);
  assert.equal(fb.pista.concepto, 'TRANSFERENCIA ALFA');
});

test('emparejado 1 a 1 y desempate por cercanía de fecha y orden original', () => {
  const r = caso(
    [[10, 'Bizum María', -20], [10, 'Bizum María', -20]],
    [[11, 'BIZUM MARIA', -20], [10, 'BIZUM MARIA', -20], [12, 'BIZUM MARIA', -20]],
  );
  const ps = propias(r);
  const pares = ps.filter((p) => p.contabilidad && p.banco);
  assert.equal(pares.length, 2);
  assert.equal(pares[0].motivo, MOTIVOS.EXACTA, 'primero el del mismo día');
  assert.equal(pares[0].contabilidad.indice, 2, 'el primero en el orden original');
  assert.equal(pares[1].dias, 1, 'luego el de 1 día, no el de 2');
  assert.equal(ps.filter((p) => p.motivo === MOTIVOS.FALTA_CONTABILIDAD).length, 1);
  const ids = new Set();
  for (const p of r.partidas) for (const m of [p.contabilidad, p.banco]) if (m) { assert.ok(!ids.has(m.id)); ids.add(m.id); }
  assert.equal(ids.size, r.contabilidad.length + r.banco.length, 'cada movimiento aparece exactamente una vez');
});

test('las pasadas respetan el orden: la coincidencia exacta gana al "concepto distinto"', () => {
  const r = caso([[10, 'Endesa', -70]], [[10, 'RECIBO NATURGY', -70], [10, 'RECIBO ENDESA', -70]]);
  const p = propias(r).find((x) => x.contabilidad);
  assert.equal(p.motivo, MOTIVOS.EXACTA);
  assert.equal(p.banco.concepto, 'RECIBO ENDESA');
});

test('emparejado manual (preparado para el futuro)', () => {
  const c = movs('contabilidad', [[10, 'Algo', -10]]);
  const b = movs('banco', [[20, 'Otra cosa', -99]]);
  const r = conciliar(c, b, { paresManuales: [['c0', 'b0']] });
  assert.equal(r.partidas.length, 1);
  assert.equal(r.partidas[0].motivo, MOTIVOS.MANUAL);
});

test('tabla por fecha: unión de fechas, diferencia y acumulado', () => {
  const r = caso([[10, 'Gestoría López', -121], [12, 'Pago proveedor Ruiz', -230]], [[11, 'RECIBO GESTORIA LOPEZ', -121]]);
  const filas = calcularPorFecha(r);
  assert.deepEqual(filas.map((f) => f.dia), [1, 10, 11, 12, 31].map(marzo));
  const f10 = filas.find((f) => f.dia === marzo(10));
  const f11 = filas.find((f) => f.dia === marzo(11));
  const f12 = filas.find((f) => f.dia === marzo(12));
  assert.equal(f10.diferencia, -12100);
  assert.equal(f11.diferencia, 12100);
  assert.equal(f11.acumulado, 0);
  assert.equal(f12.acumulado, -23000);
  assert.equal(f12.tipo, TIPOS.CLARO);
  assert.deepEqual(filtrarFechas(filas, 'desfases').map((f) => f.dia), [marzo(12)]);
  assert.equal(filtrarFechas(filas, 'todas').length, 5);
  assert.deepEqual(filtrarFechas(filas, 'desfase_fecha').map((f) => f.dia), [marzo(10), marzo(11)]);
});

test('aguanta varios miles de movimientos', () => {
  const n = 5000;
  const c = [], b = [];
  for (let i = 0; i < n; i++) {
    const dia = 1 + (i % 28);
    c.push([dia, `Proveedor ${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + ((i / 26 | 0) % 26))} pago`, -(i % 50 + 1)]);
    b.push([dia + (i % 3 === 0 ? 1 : 0), `RECIBO PROVEEDOR ${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + ((i / 26 | 0) % 26))}`, -(i % 50 + 1)]);
  }
  const t0 = Date.now();
  const r = conciliar(movs('contabilidad', c), movs('banco', b));
  const ms = Date.now() - t0;
  assert.ok(ms < 5000, `tardó ${ms} ms`);
  assert.ok(r.partidas.filter((p) => p.contabilidad && p.banco).length >= n * 0.95);
});
