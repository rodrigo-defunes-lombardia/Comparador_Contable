// Emparejado 1 a 1 de movimientos de contabilidad y banco.
//
// Cada movimiento se empareja como máximo con uno del otro archivo. Se aplican pasadas en orden;
// dentro de cada pasada se eligen primero los pares con menor diferencia de días, luego mayor
// parecido de concepto, luego (solo en "importe distinto") menor diferencia de importe, y por
// último el orden original de los archivos.

import { MARGEN_DIAS, VENTANA_MAX_DIAS, UMBRAL_CONCEPTO } from './config.js';
import { prepararConcepto, parecidoConcepto } from './concepto.js';

export const TIPOS = { COINCIDE: 'coincide', DUDOSO: 'dudoso', CLARO: 'claro' };

export const MOTIVOS = {
  MANUAL: 'manual',
  EXACTA: 'exacta',
  DESFASE_FECHA: 'desfase_fecha',
  CONCEPTO_DISTINTO: 'concepto_distinto',
  IMPORTE_DISTINTO: 'importe_distinto',
  FECHA_MUY_DISTINTA: 'fecha_muy_distinta',
  FALTA_BANCO: 'falta_banco',
  FALTA_CONTABILIDAD: 'falta_contabilidad',
  FUERA_PERIODO: 'fuera_periodo',
};

/** Gravedad para decidir el "peor" estado de una fecha. */
export function gravedad(partida) {
  if (partida.tipo === TIPOS.CLARO) return 3;
  if (partida.tipo === TIPOS.DUDOSO) return 2;
  return partida.motivo === MOTIVOS.DESFASE_FECHA ? 1 : 0;
}

function periodo(movs) {
  let desde = Infinity, hasta = -Infinity;
  for (const m of movs) { desde = Math.min(desde, m.dia); hasta = Math.max(hasta, m.dia); }
  return movs.length ? { desde, hasta } : null;
}

function agrupar(movs, clave) {
  const mapa = new Map();
  for (const m of movs) {
    const k = clave(m);
    if (!mapa.has(k)) mapa.set(k, []);
    mapa.get(k).push(m);
  }
  return mapa;
}

/**
 * @param {object[]} contabilidad  movimientos {id, indice, dia, concepto, importe}
 * @param {object[]} banco
 * @param {object} [opciones]
 * @param {Array<[string,string]>} [opciones.paresManuales]  pares [idContabilidad, idBanco] fijados
 *        por el usuario (preparado para el emparejado manual; hoy la interfaz no lo usa).
 * @param {object} [opciones.parametros]  permite sobrescribir MARGEN_DIAS, VENTANA_MAX_DIAS y UMBRAL_CONCEPTO.
 */
export function conciliar(contabilidad, banco, opciones = {}) {
  const p = {
    margenDias: MARGEN_DIAS,
    ventanaMaxDias: VENTANA_MAX_DIAS,
    umbralConcepto: UMBRAL_CONCEPTO,
    ...(opciones.parametros || {}),
  };

  const conceptos = new Map();
  for (const m of [...contabilidad, ...banco]) conceptos.set(m, prepararConcepto(m.concepto));
  const cacheParecido = new Map();
  const parecido = (c, b) => {
    const k = `${c.id}|${b.id}`;
    if (!cacheParecido.has(k)) cacheParecido.set(k, parecidoConcepto(conceptos.get(c), conceptos.get(b)));
    return cacheParecido.get(k);
  };

  const usados = new Set();
  const partidas = [];
  const crear = (datos) => {
    const partida = { id: `p${partidas.length}`, pista: null, ...datos };
    partidas.push(partida);
    return partida;
  };
  const emparejar = (c, b, tipo, motivo) => {
    usados.add(c.id); usados.add(b.id);
    crear({
      tipo, motivo, contabilidad: c, banco: b,
      dias: Math.abs(c.dia - b.dia),
      diferencia: c.importe - b.importe,
      parecido: parecido(c, b),
    });
  };

  // Pares fijados a mano (futuro emparejado manual).
  const porId = new Map([...contabilidad, ...banco].map((m) => [m.id, m]));
  for (const [idC, idB] of opciones.paresManuales || []) {
    const c = porId.get(idC), b = porId.get(idB);
    if (c && b && !usados.has(c.id) && !usados.has(b.id)) emparejar(c, b, TIPOS.COINCIDE, MOTIVOS.MANUAL);
  }

  const mismoImporte = (c) => porImporte.get(c.importe) || [];
  const cercanos = (c) => {
    const lista = [];
    for (let d = c.dia - p.margenDias; d <= c.dia + p.margenDias; d++) lista.push(...(porDia.get(d) || []));
    return lista;
  };
  const porImporte = agrupar(banco, (m) => m.importe);
  const porDia = agrupar(banco, (m) => m.dia);
  const parecidos = (sim) => sim >= p.umbralConcepto;

  const pasadas = [
    { tipo: TIPOS.COINCIDE, motivo: MOTIVOS.EXACTA, candidatos: mismoImporte,
      vale: (dd, sim) => dd === 0 && parecidos(sim) },
    { tipo: TIPOS.COINCIDE, motivo: MOTIVOS.DESFASE_FECHA, candidatos: mismoImporte,
      vale: (dd, sim) => dd >= 1 && dd <= p.margenDias && parecidos(sim) },
    { tipo: TIPOS.DUDOSO, motivo: MOTIVOS.CONCEPTO_DISTINTO, candidatos: mismoImporte,
      vale: (dd, sim) => dd <= p.margenDias && !parecidos(sim) },
    { tipo: TIPOS.CLARO, motivo: MOTIVOS.IMPORTE_DISTINTO, candidatos: cercanos, porDiferencia: true,
      vale: (dd, sim, c, b) => c.importe !== b.importe && Math.sign(c.importe) === Math.sign(b.importe) && parecidos(sim) },
    { tipo: TIPOS.DUDOSO, motivo: MOTIVOS.FECHA_MUY_DISTINTA, candidatos: mismoImporte,
      vale: (dd, sim) => dd > p.margenDias && dd <= p.ventanaMaxDias && parecidos(sim) },
  ];

  for (const pasada of pasadas) {
    const pares = [];
    for (const c of contabilidad) {
      if (usados.has(c.id)) continue;
      for (const b of pasada.candidatos(c)) {
        if (usados.has(b.id)) continue;
        const dd = Math.abs(c.dia - b.dia);
        const sim = parecido(c, b);
        if (pasada.vale(dd, sim, c, b)) pares.push({ c, b, dd, sim, dif: Math.abs(c.importe - b.importe) });
      }
    }
    pares.sort((x, y) => x.dd - y.dd
      || y.sim - x.sim
      || (pasada.porDiferencia ? x.dif - y.dif : 0)
      || x.c.indice - y.c.indice
      || x.b.indice - y.b.indice);
    for (const { c, b } of pares) {
      if (!usados.has(c.id) && !usados.has(b.id)) emparejar(c, b, pasada.tipo, pasada.motivo);
    }
  }

  // Lo que sobra en cada lado.
  const periodoC = periodo(contabilidad);
  const periodoB = periodo(banco);
  const restoC = contabilidad.filter((m) => !usados.has(m.id));
  const restoB = banco.filter((m) => !usados.has(m.id));
  const cercaDelBorde = (dia, per) => per && (dia < per.desde + p.margenDias || dia > per.hasta - p.margenDias);
  const pista = (m, otros) => {
    let mejor = null;
    for (const o of otros) {
      if (o.importe === m.importe && (!mejor || Math.abs(o.dia - m.dia) < Math.abs(mejor.dia - m.dia))) mejor = o;
    }
    return mejor;
  };
  for (const c of restoC) {
    const borde = cercaDelBorde(c.dia, periodoB);
    crear({
      tipo: borde ? TIPOS.DUDOSO : TIPOS.CLARO,
      motivo: borde ? MOTIVOS.FUERA_PERIODO : MOTIVOS.FALTA_BANCO,
      contabilidad: c, banco: null, dias: null, diferencia: c.importe, parecido: null,
      pista: pista(c, restoB),
    });
  }
  for (const b of restoB) {
    const borde = cercaDelBorde(b.dia, periodoC);
    crear({
      tipo: borde ? TIPOS.DUDOSO : TIPOS.CLARO,
      motivo: borde ? MOTIVOS.FUERA_PERIODO : MOTIVOS.FALTA_CONTABILIDAD,
      contabilidad: null, banco: b, dias: null, diferencia: -b.importe, parecido: null,
      pista: pista(b, restoC),
    });
  }

  // Orden estable: por fecha (la más temprana del par) y orden original.
  const fechaPartida = (x) => Math.min(x.contabilidad ? x.contabilidad.dia : Infinity, x.banco ? x.banco.dia : Infinity);
  partidas.sort((x, y) => fechaPartida(x) - fechaPartida(y)
    || (x.contabilidad ? x.contabilidad.indice : Infinity) - (y.contabilidad ? y.contabilidad.indice : Infinity)
    || (x.banco ? x.banco.indice : Infinity) - (y.banco ? y.banco.indice : Infinity));

  return { partidas, contabilidad, banco, periodoContabilidad: periodoC, periodoBanco: periodoB, parametros: p };
}
