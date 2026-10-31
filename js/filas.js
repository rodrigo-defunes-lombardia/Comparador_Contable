// Convierte las filas de una hoja (matriz de celdas) en movimientos.
// No depende de ninguna librería: lo usan tanto el lector de archivos como los tests.

import { aDia, aCentimos } from './valores.js';
import { MAX_FILAS } from './config.js';

export class ErrorLectura extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = 'ErrorLectura';
  }
}

/** Filas de saldos o totales que llevan fecha pero no son movimientos. */
const FILA_RESUMEN = /^\s*(saldo(s)?(\s+(inicial|final|anterior|actual|al\s.*))?|total(es)?(\s+(general|movimientos|periodo|mes))?|suma(s)?)\s*:?\s*$/i;

/**
 * Busca la columna de fecha: la primera columna (por la izquierda) en la que al menos la mitad
 * de las filas con fecha la tienen. Si la columna siguiente también es de fechas (fecha valor),
 * se salta. Detrás vienen concepto, entradas y salidas.
 */
function detectarColumnas(filas, opciones) {
  const cuenta = [];
  for (const fila of filas) {
    if (!Array.isArray(fila)) continue;
    for (let c = 0; c < fila.length; c++) {
      if (aDia(fila[c], opciones) !== null) cuenta[c] = (cuenta[c] || 0) + 1;
    }
  }
  const conteo = Array.from(cuenta, (n) => n || 0);
  const maximo = Math.max(0, ...conteo);
  if (maximo === 0) return null;
  const fecha = conteo.findIndex((n) => n >= maximo / 2);
  let concepto = fecha + 1;
  if ((cuenta[concepto] || 0) >= (cuenta[fecha] || 0) / 2) concepto += 1; // columna de fecha valor
  return { fecha, concepto, entradas: concepto + 1, salidas: concepto + 2 };
}

/**
 * @param {Array<Array<any>>} filas  celdas de la hoja (fila 0 = primera fila de la hoja)
 * @param {object} opciones
 * @param {'contabilidad'|'banco'} opciones.origen
 * @param {boolean} [opciones.fecha1904]  libro con sistema de fechas 1904
 * @returns {{movimientos: object[], ignoradas: number, columnas: object, desde: number, hasta: number}}
 */
export function filasAMovimientos(filas, { origen, fecha1904 = false } = {}) {
  if (!Array.isArray(filas)) throw new ErrorLectura('El archivo no contiene ninguna tabla.');
  if (filas.length > MAX_FILAS) {
    throw new ErrorLectura(`El archivo tiene más de ${MAX_FILAS.toLocaleString('es-ES')} filas. Comprueba que es el archivo correcto o divídelo por meses.`);
  }
  const opcionesFecha = { fecha1904 };
  const columnas = detectarColumnas(filas, opcionesFecha);
  if (!columnas) {
    throw new ErrorLectura('No se ha encontrado ninguna fecha en el archivo. Comprueba que la primera columna de la tabla es la fecha (dd/mm/aaaa) y que es el archivo correcto.');
  }

  const movimientos = [];
  let ignoradas = 0;
  let importesNoValidos = 0;
  filas.forEach((fila, i) => {
    if (!Array.isArray(fila)) return;
    const dia = aDia(fila[columnas.fecha], opcionesFecha);
    if (dia === null) {
      if (fila.some((c) => c !== null && c !== undefined && String(c).trim() !== '')) ignoradas++;
      return;
    }
    const concepto = fila[columnas.concepto] == null ? '' : String(fila[columnas.concepto]).replace(/\s+/g, ' ').trim();
    const entrada = aCentimos(fila[columnas.entradas]);
    const salida = aCentimos(fila[columnas.salidas]);
    if (Number.isNaN(entrada) || Number.isNaN(salida)) { ignoradas++; importesNoValidos++; return; }
    // Las salidas deberían venir en positivo; si vienen en negativo se toman igual como salida.
    // Una entrada negativa se respeta (archivos con una sola columna de importe con signo).
    const importe = (entrada ?? 0) - Math.abs(salida ?? 0);
    if (importe === 0 || FILA_RESUMEN.test(concepto)) { ignoradas++; return; }
    movimientos.push({
      id: `${origen === 'banco' ? 'b' : 'c'}${movimientos.length}`,
      origen,
      indice: movimientos.length,
      fila: i + 1,
      dia,
      concepto,
      importe,
    });
  });

  if (movimientos.length === 0) {
    const extra = importesNoValidos > 0 ? ' Hay filas con fecha pero los importes no se entienden.' : '';
    throw new ErrorLectura(`No se ha encontrado ningún movimiento con fecha e importe.${extra} La tabla debe tener 4 columnas en este orden: fecha, concepto, entradas y salidas.`);
  }

  let desde = Infinity, hasta = -Infinity;
  for (const m of movimientos) { desde = Math.min(desde, m.dia); hasta = Math.max(hasta, m.dia); }
  return { movimientos, ignoradas, columnas, desde, hasta };
}
