// Exportación del resultado a un libro .xlsx (Resumen, Desfases claros, Desfases dudosos,
// Por fecha y Coincidencias). Fechas como fechas reales, importes como números con formato €,
// cabeceras fijas, filtros automáticos y el estado siempre escrito en texto.

import * as XLSX from '../vendor/sheetjs/xlsx.mjs';
import { TIPOS } from './emparejado.js';
import { calcularResumen, calcularPorFecha, etiquetaPartida, textoPista, NOMBRE_TIPO, estadoFecha } from './resumen.js';
import { serieExcel, formatearFecha, componentesDeDia } from './valores.js';

const FORMATO_EUROS = '#,##0.00 "€";-#,##0.00 "€"';
const FORMATO_FECHA = 'dd/mm/yyyy';

const fecha = (dia) => (dia === null || dia === undefined ? null : { t: 'n', v: serieExcel(dia), z: FORMATO_FECHA });
const euros = (cent) => (cent === null || cent === undefined ? null : { t: 'n', v: cent / 100, z: FORMATO_EUROS });
const texto = (s) => (s === null || s === undefined || s === '' ? null : { t: 's', v: String(s) });
const numero = (n) => ({ t: 'n', v: n });

/** Filas que se dejan fijas (cabecera) en cada hoja. */
const FILAS_FIJAS = new WeakMap();

/** Crea una hoja a partir de filas de celdas, con anchos de columna y filtro automático. */
function hoja(cabeceras, filas, anchos, { filaCabecera = 0, previas = [] } = {}) {
  const todas = [...previas, cabeceras.map(texto), ...filas];
  const ws = XLSX.utils.aoa_to_sheet([[]]);
  todas.forEach((fila, r) => fila.forEach((celda, c) => {
    if (celda) ws[XLSX.utils.encode_cell({ r, c })] = celda;
  }));
  const ultima = { r: Math.max(todas.length - 1, 0), c: cabeceras.length - 1 };
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: ultima });
  ws['!cols'] = anchos.map((wch) => ({ wch }));
  if (filas.length) ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: filaCabecera, c: 0 }, e: ultima }) };
  FILAS_FIJAS.set(ws, filaCabecera + 1);
  return ws;
}

const CABECERAS_PARTIDAS = ['Estado', 'Detalle', 'Fecha contabilidad', 'Concepto contabilidad', 'Importe contabilidad',
  'Fecha banco', 'Concepto banco', 'Importe banco', 'Diferencia (contab. − banco)', 'Días de diferencia', 'Pista'];
const ANCHOS_PARTIDAS = [16, 44, 12, 36, 14, 12, 36, 14, 16, 10, 60];

function filaPartida(p) {
  const c = p.contabilidad, b = p.banco;
  return [
    texto(NOMBRE_TIPO[p.tipo]),
    texto(etiquetaPartida(p)),
    fecha(c && c.dia), texto(c && c.concepto), euros(c && c.importe),
    fecha(b && b.dia), texto(b && b.concepto), euros(b && b.importe),
    euros(p.diferencia),
    p.dias === null || p.dias === undefined ? null : numero(p.dias),
    texto(textoPista(p).replace(/^Pista: /, '')),
  ];
}

/** Fija las primeras filas de cada hoja (SheetJS Community no escribe paneles; se añaden al XML). */
function fijarCabeceras(bytes, libro) {
  const cfb = XLSX.CFB.read(bytes, { type: 'buffer' });
  libro.SheetNames.forEach((nombre, i) => {
    const filas = FILAS_FIJAS.get(libro.Sheets[nombre]);
    const entrada = XLSX.CFB.find(cfb, `/xl/worksheets/sheet${i + 1}.xml`);
    if (!entrada || !filas) return;
    const xml = new TextDecoder().decode(entrada.content);
    const panel = `<pane ySplit="${filas}" topLeftCell="A${filas + 1}" activePane="bottomLeft" state="frozen"/>`
      + `<selection pane="bottomLeft" activeCell="A${filas + 1}" sqref="A${filas + 1}"/>`;
    const nuevo = xml.replace(/<sheetView([^>]*?)\/>/, `<sheetView$1>${panel}</sheetView>`);
    entrada.content = new TextEncoder().encode(nuevo);
    entrada.size = entrada.content.length;
  });
  return XLSX.CFB.write(cfb, { type: 'array', fileType: 'zip', compression: true });
}

/**
 * Genera el libro de Excel. Devuelve {bytes, nombre}.
 * @param {object} resultado  resultado de `conciliar`
 * @param {object} info  {archivoContabilidad, archivoBanco}
 */
export function generarExcel(resultado, info = {}) {
  const resumen = calcularResumen(resultado);
  const porFecha = calcularPorFecha(resultado);
  const libro = XLSX.utils.book_new();
  const pc = resultado.periodoContabilidad, pb = resultado.periodoBanco;

  const filasResumen = [
    [texto('Archivo de contabilidad'), texto(info.archivoContabilidad || '')],
    [texto('Movimientos de contabilidad'), numero(resumen.movimientosContabilidad)],
    [texto('Periodo de contabilidad'), texto(pc ? `del ${formatearFecha(pc.desde)} al ${formatearFecha(pc.hasta)}` : '')],
    [texto('Archivo del banco'), texto(info.archivoBanco || '')],
    [texto('Movimientos del banco'), numero(resumen.movimientosBanco)],
    [texto('Periodo del banco'), texto(pb ? `del ${formatearFecha(pb.desde)} al ${formatearFecha(pb.hasta)}` : '')],
    [],
    [texto('Coinciden'), numero(resumen.coinciden)],
    [texto('   de ellos, con fecha desfasada 1-2 días'), numero(resumen.coincidenConDesfase)],
    [texto('Desfases claros'), numero(resumen.claros)],
    [texto('   Falta en el banco'), numero(resumen.faltaBanco)],
    [texto('   Falta en contabilidad'), numero(resumen.faltaContabilidad)],
    [texto('   Importe distinto'), numero(resumen.importeDistinto)],
    [texto('Desfases dudosos'), numero(resumen.dudosos)],
    [texto('   Concepto distinto'), numero(resumen.conceptoDistinto)],
    [texto('   Fecha muy distinta'), numero(resumen.fechaMuyDistinta)],
    [texto('   Puede caer fuera del periodo'), numero(resumen.fueraPeriodo)],
    [],
    [texto('Neto de contabilidad'), euros(resumen.netoContabilidad)],
    [texto('Neto del banco'), euros(resumen.netoBanco)],
    [texto('Descuadre total (contabilidad − banco)'), euros(resumen.descuadre)],
    [texto('Primera fecha con descuadre'), resumen.primeraFecha === null ? texto('Ninguna') : fecha(resumen.primeraFecha)],
    [],
    [texto('Margen de días'), numero(resultado.parametros.margenDias)],
    [texto('Ventana máxima de días'), numero(resultado.parametros.ventanaMaxDias)],
    [texto('Umbral de parecido de concepto'), numero(resultado.parametros.umbralConcepto)],
  ];
  XLSX.utils.book_append_sheet(libro, hoja(['Concepto', 'Valor'], filasResumen, [42, 40]), 'Resumen');

  const claros = resultado.partidas.filter((p) => p.tipo === TIPOS.CLARO);
  const dudosos = resultado.partidas.filter((p) => p.tipo === TIPOS.DUDOSO);
  const coinciden = resultado.partidas.filter((p) => p.tipo === TIPOS.COINCIDE);
  XLSX.utils.book_append_sheet(libro, hoja(CABECERAS_PARTIDAS, claros.map(filaPartida), ANCHOS_PARTIDAS), 'Desfases claros');
  XLSX.utils.book_append_sheet(libro, hoja(CABECERAS_PARTIDAS, dudosos.map(filaPartida), ANCHOS_PARTIDAS), 'Desfases dudosos');

  const filasFecha = porFecha.map((f) => [
    fecha(f.dia),
    euros(f.contabilidad.entradas), euros(f.contabilidad.salidas), euros(f.contabilidad.neto),
    euros(f.banco.entradas), euros(f.banco.salidas), euros(f.banco.neto),
    euros(f.diferencia), euros(f.acumulado), texto(estadoFecha(f)),
  ]);
  XLSX.utils.book_append_sheet(libro, hoja(
    ['Fecha', 'Entradas contabilidad', 'Salidas contabilidad', 'Neto contabilidad', 'Entradas banco', 'Salidas banco',
      'Neto banco', 'Diferencia del día', 'Descuadre acumulado', 'Estado'],
    filasFecha, [12, 14, 14, 14, 14, 14, 14, 14, 14, 60],
  ), 'Por fecha');
  XLSX.utils.book_append_sheet(libro, hoja(CABECERAS_PARTIDAS, coinciden.map(filaPartida), ANCHOS_PARTIDAS), 'Coincidencias');

  const bytes = XLSX.write(libro, { type: 'array', bookType: 'xlsx', compression: true });
  const final = fijarCabeceras(new Uint8Array(bytes), libro);

  const ref = pb || pc;
  let nombre = 'comparacion.xlsx';
  if (ref) {
    const { anio, mes } = componentesDeDia(ref.desde);
    nombre = `comparacion_${anio}-${String(mes).padStart(2, '0')}.xlsx`;
  }
  return { bytes: final, nombre };
}
