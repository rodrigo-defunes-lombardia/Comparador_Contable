import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from '../vendor/sheetjs/xlsx.mjs';
import { leerBytes, parsearCSV, ErrorLectura } from '../js/lector.js';
import { filasAMovimientos } from '../js/filas.js';
import { generarHojas } from '../js/ejemplo.js';
import { conciliar, MOTIVOS } from '../js/emparejado.js';
import { formatearFecha, diaDesdeComponentes } from '../js/valores.js';

const xlsxDe = (filas, nombreHoja = 'Hoja1') => {
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(filas), nombreHoja);
  return XLSX.write(libro, { type: 'array', bookType: 'xlsx' });
};

test('ignora filas de cabecera, vacías, saldos y totales; la tabla no empieza en la fila 1', () => {
  const filas = [
    ['Libro de caja'],
    [],
    [null, 'Fecha', 'Concepto', 'Entradas', 'Salidas'],
    [null, 46082, 'Venta', 100, null],
    [null, '02/03/2026', 'Luz', null, '45,30'],
    [null, null, null, null, null],
    [null, 46085, 'Saldo final', 5000, null],
    [null, 'Total', null, 100, 45.3],
  ];
  const r = filasAMovimientos(filas, { origen: 'contabilidad' });
  assert.equal(r.movimientos.length, 2);
  assert.equal(r.columnas.fecha, 1);
  assert.deepEqual(r.movimientos.map((m) => m.importe), [10000, -4530]);
  assert.equal(r.movimientos[1].fila, 5, 'número de fila de la hoja');
  assert.equal(formatearFecha(r.desde), '01/03/2026');
  assert.equal(formatearFecha(r.hasta), '02/03/2026');
});

test('salidas en negativo y columna de fecha valor', () => {
  const filas = [
    ['F. contable', 'F. valor', 'Concepto', 'Entradas', 'Salidas'],
    ['01/03/2026', '03/03/2026', 'Recibo', null, -20],
    ['02/03/2026', '02/03/2026', 'Ingreso', 30, null],
  ];
  const r = filasAMovimientos(filas, { origen: 'banco' });
  assert.equal(r.columnas.concepto, 2);
  assert.deepEqual(r.movimientos.map((m) => [formatearFecha(m.dia), m.importe]), [['01/03/2026', -2000], ['02/03/2026', 3000]]);
});

test('lee un .xlsx con fechas de Excel', () => {
  const bytes = xlsxDe([['Fecha', 'Concepto', 'Entradas', 'Salidas'], [46082, 'Venta', 100.1, null], [46083, 'Compra', null, 0.2]]);
  const r = leerBytes(bytes, 'contabilidad.xlsx', 'contabilidad');
  assert.equal(r.movimientos.length, 2);
  assert.equal(r.movimientos[0].dia, diaDesdeComponentes(2026, 3, 1));
  assert.equal(r.movimientos[1].importe, -20);
});

test('elige la hoja con más movimientos', () => {
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([['Portada']]), 'Portada');
  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([['Fecha', 'C', 'E', 'S'], [46082, 'a', 1, null], [46083, 'b', 2, null]]), 'Datos');
  const r = leerBytes(XLSX.write(libro, { type: 'array', bookType: 'xlsx' }), 'x.xlsx', 'banco');
  assert.equal(r.hoja, 'Datos');
  assert.equal(r.movimientos.length, 2);
});

test('lee un .xls (formato antiguo)', () => {
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([['Fecha', 'C', 'E', 'S'], [46082, 'Café', 1.5, null]]), 'H');
  const r = leerBytes(XLSX.write(libro, { type: 'array', bookType: 'biff8' }), 'banco.xls', 'banco');
  assert.equal(r.movimientos[0].concepto, 'Café');
  assert.equal(r.movimientos[0].importe, 150);
});

test('lee un .csv con punto y coma, formato español y codificación Windows-1252', () => {
  const texto = 'Movimientos\r\nFecha;Concepto;Entradas;Salidas\r\n01/03/2026;"Recibo luz; marzo";;"1.234,56"\r\n02/03/2026;Ingreso cliente Peña;500,00;\r\n;Total;500,00;1.234,56\r\n';
  const bytes = new Uint8Array([...texto].map((ch) => (ch === 'ñ' ? 0xf1 : ch.charCodeAt(0))));
  const r = leerBytes(bytes, 'banco.csv', 'banco');
  assert.equal(r.movimientos.length, 2);
  assert.equal(r.movimientos[0].concepto, 'Recibo luz; marzo');
  assert.equal(r.movimientos[0].importe, -123456);
  assert.equal(r.movimientos[1].concepto, 'Ingreso cliente Peña');
});

test('parsearCSV: comillas dobles escapadas y separador coma', () => {
  assert.deepEqual(parsearCSV('a,"b ""c""",d\n1,2,3'), [['a', 'b "c"', 'd'], ['1', '2', '3']]);
});

test('errores claros en español', () => {
  assert.throws(() => leerBytes(new Uint8Array([1, 2]), 'foto.png', 'banco'), (e) => e instanceof ErrorLectura && /no es un Excel/.test(e.message));
  assert.throws(() => leerBytes(new Uint8Array(0), 'vacio.xlsx', 'banco'), /está vacío/);
  assert.throws(() => leerBytes(new TextEncoder().encode('hola;que;tal'), 'x.csv', 'banco'), /No se ha encontrado ninguna fecha/);
  assert.throws(() => leerBytes(new Uint8Array([0x50, 0x4b, 3, 4, 9, 9, 9]), 'roto.xlsx', 'banco'), ErrorLectura);
});

test('los datos de ejemplo contienen todos los tipos de desfase', () => {
  const hojas = generarHojas();
  const c = filasAMovimientos(hojas.contabilidad, { origen: 'contabilidad' });
  const b = filasAMovimientos(hojas.banco, { origen: 'banco' });
  assert.ok(c.movimientos.length >= 190 && b.movimientos.length >= 190);
  const r = conciliar(c.movimientos, b.movimientos);
  const motivos = new Set(r.partidas.map((p) => p.motivo));
  for (const m of [MOTIVOS.EXACTA, MOTIVOS.DESFASE_FECHA, MOTIVOS.CONCEPTO_DISTINTO, MOTIVOS.IMPORTE_DISTINTO,
    MOTIVOS.FECHA_MUY_DISTINTA, MOTIVOS.FALTA_BANCO, MOTIVOS.FALTA_CONTABILIDAD, MOTIVOS.FUERA_PERIODO]) {
    assert.ok(motivos.has(m), `falta el caso ${m}`);
  }
  assert.ok(r.partidas.some((p) => p.pista), 'hay al menos una pista');
});

test('exportación a Excel: hojas, fechas reales, formato € y cabeceras fijas', async () => {
  const { generarExcel } = await import('../js/exportar.js');
  const hojas = generarHojas();
  const r = conciliar(filasAMovimientos(hojas.contabilidad, { origen: 'contabilidad' }).movimientos,
    filasAMovimientos(hojas.banco, { origen: 'banco' }).movimientos);
  const { bytes, nombre } = generarExcel(r, { archivoContabilidad: 'c.xlsx', archivoBanco: 'b.xlsx' });
  assert.equal(nombre, 'conciliacion_2026-03.xlsx');
  const libro = XLSX.read(bytes, { type: 'array', cellNF: true });
  assert.deepEqual(libro.SheetNames, ['Resumen', 'Desfases claros', 'Desfases dudosos', 'Por fecha', 'Coincidencias']);
  const claros = libro.Sheets['Desfases claros'];
  assert.equal(claros.A1.v, 'Estado');
  assert.equal(claros.A2.v, 'Desfase claro');
  const pf = libro.Sheets['Por fecha'];
  assert.equal(pf.A2.t, 'n');
  assert.equal(pf.A2.z, 'dd/mm/yyyy');
  assert.match(pf.B2.z, /€/);
  const cfb = XLSX.CFB.read(bytes, { type: 'buffer' });
  const xml = new TextDecoder().decode(XLSX.CFB.find(cfb, '/xl/worksheets/sheet4.xml').content);
  assert.match(xml, /<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"\/>/);
});
