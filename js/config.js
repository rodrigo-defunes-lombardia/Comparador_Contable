// Umbrales y parámetros configurables del comparador.
// Cambia aquí los valores; el resto del código los importa desde este archivo.

/** Diferencia máxima de días (en valor absoluto) para considerar dos movimientos "del mismo momento". */
export const MARGEN_DIAS = 2;

/** Ventana máxima de días para la pasada "fecha muy distinta" (mismo importe y concepto, pero lejos). */
export const VENTANA_MAX_DIAS = 31;

/** Parecido mínimo de concepto (0 a 1) para considerarlo "parecido". */
export const UMBRAL_CONCEPTO = 0.5;

/** Longitud mínima de una palabra para que cuente en la comparación de conceptos. */
export const LONGITUD_MIN_PALABRA = 2;

/**
 * Longitud mínima para aceptar que una palabra es abreviatura de otra
 * ("transf" ~ "transferencia"). Pon 0 para desactivarlo.
 */
export const LONGITUD_MIN_PREFIJO = 4;

/** Palabras vacías que nunca cuentan al comparar conceptos. */
export const PALABRAS_VACIAS = [
  'de', 'del', 'la', 'el', 'los', 'las', 'y', 'e', 'o', 'a', 'al', 'en', 'por', 'para', 'con',
  'un', 'una', 'su', 'sus', 'se', 'que', 'n', 'no', 'num', 'nº', 'ref',
];

/**
 * Palabras genéricas de banca que se ignoran al comparar (porque casi todos los conceptos las
 * llevan y harían parecer iguales movimientos distintos). Si tras quitarlas un concepto se queda
 * vacío, se compara con ellas incluidas.
 */
export const PALABRAS_GENERICAS = [
  'recibo', 'recibos', 'transferencia', 'transf', 'trf', 'trans', 'pago', 'pagos', 'cobro', 'cobros',
  'compra', 'compras', 'tarjeta', 'tarj', 'cargo', 'abono', 'adeudo', 'ingreso', 'reintegro',
  'cajero', 'bizum', 'emitida', 'recibida', 'favor', 'sepa', 'domiciliacion', 'domiciliado',
  'factura', 'fra', 'cuota', 'mes', 'sa', 'sl', 'sau', 'slu', 'sociedad', 'limitada', 'anonima',
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre',
  'setiembre', 'octubre', 'noviembre', 'diciembre',
];

/** Años válidos para una fecha. Evita confundir importes con fechas de Excel. */
export const ANIO_MIN = 1990;
export const ANIO_MAX = 2100;

/** Número máximo de filas que se leen de un archivo (protección ante archivos enormes). */
export const MAX_FILAS = 100000;

/** Tamaño máximo de archivo aceptado, en bytes. */
export const MAX_BYTES = 30 * 1024 * 1024;
