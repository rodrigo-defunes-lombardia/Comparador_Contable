// Conversión de valores de celda (fechas e importes) y formato para mostrar.
// Las fechas se representan como "día plano": número entero de días desde el 01/01/1970,
// sin hora ni zona horaria. Así no hay desfases de un día por el huso horario.
// Los importes se representan en céntimos enteros con signo.

import { ANIO_MIN, ANIO_MAX } from './config.js';

const MS_DIA = 86400000;
/** Días entre el 30/12/1899 (día 0 de Excel) y el 01/01/1970. */
const EPOCA_EXCEL = 25569;
/** Diferencia entre el sistema de fechas 1904 de Excel (Mac antiguo) y el de 1900. */
const DESFASE_1904 = 1462;

const DIA_MIN = diaDesdeComponentes(ANIO_MIN, 1, 1);
const DIA_MAX = diaDesdeComponentes(ANIO_MAX, 12, 31);

/** Devuelve el día plano para año/mes/día, o null si la fecha no existe (p. ej. 31/02). */
export function diaDesdeComponentes(anio, mes, dia) {
  if (!Number.isInteger(anio) || !Number.isInteger(mes) || !Number.isInteger(dia)) return null;
  const ms = Date.UTC(anio, mes - 1, dia);
  const f = new Date(ms);
  if (f.getUTCFullYear() !== anio || f.getUTCMonth() !== mes - 1 || f.getUTCDate() !== dia) return null;
  return Math.round(ms / MS_DIA);
}

/** Componentes {anio, mes, dia} de un día plano. */
export function componentesDeDia(diaPlano) {
  const f = new Date(diaPlano * MS_DIA);
  return { anio: f.getUTCFullYear(), mes: f.getUTCMonth() + 1, dia: f.getUTCDate() };
}

function enRango(d) {
  return d !== null && d >= DIA_MIN && d <= DIA_MAX ? d : null;
}

/**
 * Convierte una celda en día plano, o null si no es una fecha válida.
 * Acepta: número de serie de Excel, objeto Date y texto dd/mm/aaaa (también con - o .,
 * año de 2 dígitos, y aaaa-mm-dd). La hora, si la hay, se descarta.
 */
export function aDia(valor, { fecha1904 = false } = {}) {
  if (valor === null || valor === undefined || valor === '') return null;

  if (typeof valor === 'number') {
    if (!Number.isFinite(valor) || valor < 1) return null;
    const serie = Math.floor(valor) + (fecha1904 ? DESFASE_1904 : 0);
    return enRango(serie - EPOCA_EXCEL);
  }

  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) return null;
    // Si la fecha es medianoche UTC exacta, se usan sus componentes UTC; si no, se redondea al
    // día local más cercano (las librerías crean fechas a medianoche local o UTC según el caso).
    if (valor.getTime() % MS_DIA === 0) return enRango(Math.round(valor.getTime() / MS_DIA));
    const m = new Date(valor.getTime() + 12 * 3600000);
    return enRango(diaDesdeComponentes(m.getFullYear(), m.getMonth() + 1, m.getDate()));
  }

  if (typeof valor !== 'string') return null;
  const t = valor.trim();
  let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?:[ T].*)?$/.exec(t);
  if (m) {
    let anio = Number(m[3]);
    if (m[3].length === 2) anio += 2000;
    return enRango(diaDesdeComponentes(anio, Number(m[2]), Number(m[1])));
  }
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T].*)?$/.exec(t);
  if (m) return enRango(diaDesdeComponentes(Number(m[1]), Number(m[2]), Number(m[3])));
  return null;
}

/** Número de serie de Excel (sistema 1900) para un día plano. */
export function serieExcel(diaPlano) {
  return diaPlano + EPOCA_EXCEL;
}

/**
 * Convierte una celda en céntimos enteros.
 * Devuelve null si la celda está vacía y NaN si tiene algo que no es un importe.
 * Acepta números y texto en formato español ("1.234,56", "-12,30 €", "(45,00)").
 * Si el texto solo tiene un punto seguido de 3 cifras ("1.234") se toma como separador de miles.
 */
export function aCentimos(valor) {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === 'number') {
    if (!Number.isFinite(valor)) return NaN;
    return Math.round(Number((valor * 100).toFixed(6)));
  }
  if (typeof valor !== 'string') return NaN;

  let t = valor.replace(/[\s  ]/g, '').replace(/€|eur(os?)?/gi, '');
  if (t === '' || t === '-') return null;

  let negativo = false;
  if (/^\(.*\)$/.test(t)) { negativo = true; t = t.slice(1, -1); }
  if (/^[-−]/.test(t)) { negativo = !negativo; t = t.slice(1); }
  else if (/^\+/.test(t)) t = t.slice(1);
  if (/[-−]$/.test(t)) { negativo = !negativo; t = t.slice(0, -1); }
  if (!/^[\d.,]+$/.test(t) || !/\d/.test(t)) return NaN;

  const ultimaComa = t.lastIndexOf(',');
  const ultimoPunto = t.lastIndexOf('.');
  let entero, decimales = '';
  if (ultimaComa >= 0 && ultimoPunto >= 0) {
    const sep = ultimaComa > ultimoPunto ? ',' : '.';
    const i = t.lastIndexOf(sep);
    entero = t.slice(0, i).replace(/[.,]/g, '');
    decimales = t.slice(i + 1);
  } else if (ultimaComa >= 0) {
    const partes = t.split(',');
    if (partes.length > 2) entero = partes.join('');
    else [entero, decimales] = partes;
  } else if (ultimoPunto >= 0) {
    const partes = t.split('.');
    if (partes.length > 2 || /^\d{1,3}\.\d{3}$/.test(t)) entero = partes.join('');
    else [entero, decimales] = partes;
  } else {
    entero = t;
  }
  if (!/^\d*$/.test(entero) || !/^\d*$/.test(decimales)) return NaN;

  let cent = Number(entero || '0') * 100 + Number((decimales + '00').slice(0, 2));
  if (decimales.length > 2 && Number(decimales[2]) >= 5) cent += 1;
  return negativo ? -cent : cent;
}

// ---------- Formato para mostrar ----------

/** "dd/mm/aaaa" */
export function formatearFecha(diaPlano) {
  if (diaPlano === null || diaPlano === undefined) return '';
  const { anio, mes, dia } = componentesDeDia(diaPlano);
  return `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}/${anio}`;
}

const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** "lunes, 3 de marzo de 2026" (para lectores de pantalla y títulos). */
export function formatearFechaLarga(diaPlano) {
  const { anio, mes, dia } = componentesDeDia(diaPlano);
  const semana = DIAS_SEMANA[new Date(diaPlano * MS_DIA).getUTCDay()];
  return `${semana}, ${dia} de ${MESES[mes - 1]} de ${anio}`;
}

/** "1.234,56 €" con signo menos tipográfico para negativos. */
export function formatearEuros(cent, { signo = false } = {}) {
  if (cent === null || cent === undefined) return '';
  const abs = Math.abs(cent);
  const entero = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const dec = String(abs % 100).padStart(2, '0');
  const pre = cent < 0 ? '−' : (signo && cent > 0 ? '+' : '');
  return `${pre}${entero},${dec} €`;
}

/** "1 día" / "3 días" */
export function textoDias(n) {
  return `${n} ${n === 1 ? 'día' : 'días'}`;
}
