// Comparación de conceptos: normalización y parecido por solapamiento de palabras.

import { PALABRAS_VACIAS, PALABRAS_GENERICAS, LONGITUD_MIN_PALABRA, LONGITUD_MIN_PREFIJO } from './config.js';

const VACIAS = new Set(PALABRAS_VACIAS);
const GENERICAS = new Set(PALABRAS_GENERICAS);

/** Minúsculas, sin tildes, sin números ni signos de puntuación. Devuelve la lista de palabras. */
export function normalizarConcepto(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zñç]+/g, ' ')
    .split(' ')
    .filter((p) => p.length >= LONGITUD_MIN_PALABRA && !VACIAS.has(p));
}

/** Prepara un concepto para compararlo muchas veces: {todas, distintivas}. */
export function prepararConcepto(texto) {
  const todas = new Set(normalizarConcepto(texto));
  const distintivas = new Set([...todas].filter((p) => !GENERICAS.has(p)));
  return { todas, distintivas };
}

function coinciden(a, b) {
  if (a === b) return true;
  if (LONGITUD_MIN_PREFIJO <= 0) return false;
  const [corta, larga] = a.length <= b.length ? [a, b] : [b, a];
  return corta.length >= LONGITUD_MIN_PREFIJO && larga.startsWith(corta);
}

/**
 * Parecido entre dos conceptos, de 0 a 1: proporción de palabras del concepto más corto que
 * aparecen en el otro (coeficiente de solapamiento). Se ignoran las palabras genéricas
 * ("recibo", "transferencia"...) salvo que uno de los dos se quede sin palabras.
 * Acepta textos o conceptos ya preparados con `prepararConcepto`.
 */
export function parecidoConcepto(a, b) {
  const pa = typeof a === 'string' ? prepararConcepto(a) : a;
  const pb = typeof b === 'string' ? prepararConcepto(b) : b;
  let sa = pa.distintivas, sb = pb.distintivas;
  if (sa.size === 0 || sb.size === 0) { sa = pa.todas; sb = pb.todas; }
  if (sa.size === 0 || sb.size === 0) return 0;
  const [menor, mayor] = sa.size <= sb.size ? [sa, sb] : [sb, sa];
  const lista = [...mayor];
  let comunes = 0;
  for (const p of menor) if (mayor.has(p) || lista.some((q) => coinciden(p, q))) comunes++;
  return comunes / menor.size;
}
