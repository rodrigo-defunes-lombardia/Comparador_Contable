// Resumen, tabla por fecha, filtros y textos de estado a partir del resultado de `conciliar`.

import { TIPOS, MOTIVOS, gravedad } from './emparejado.js';
import { formatearEuros, formatearFecha, textoDias } from './valores.js';

/** Filtros disponibles para la tabla (los usan las tarjetas de resumen). */
export const FILTROS = {
  desfases: { nombre: 'Fechas con desfases', vale: (p) => p.tipo !== TIPOS.COINCIDE },
  todas: { nombre: 'Todas las fechas', vale: () => true },
  coincide: { nombre: 'Coinciden', vale: (p) => p.tipo === TIPOS.COINCIDE },
  desfase_fecha: { nombre: 'Coinciden con fecha desfasada', vale: (p) => p.motivo === MOTIVOS.DESFASE_FECHA },
  claro: { nombre: 'Desfases claros', vale: (p) => p.tipo === TIPOS.CLARO },
  dudoso: { nombre: 'Desfases dudosos', vale: (p) => p.tipo === TIPOS.DUDOSO },
  falta_banco: { nombre: 'Falta en el banco', vale: (p) => p.motivo === MOTIVOS.FALTA_BANCO },
  falta_contabilidad: { nombre: 'Falta en contabilidad', vale: (p) => p.motivo === MOTIVOS.FALTA_CONTABILIDAD },
  importe_distinto: { nombre: 'Importe distinto', vale: (p) => p.motivo === MOTIVOS.IMPORTE_DISTINTO },
  concepto_distinto: { nombre: 'Concepto distinto', vale: (p) => p.motivo === MOTIVOS.CONCEPTO_DISTINTO },
  fecha_muy_distinta: { nombre: 'Fecha muy distinta', vale: (p) => p.motivo === MOTIVOS.FECHA_MUY_DISTINTA },
  fuera_periodo: { nombre: 'Puede caer fuera del periodo', vale: (p) => p.motivo === MOTIVOS.FUERA_PERIODO },
};

/** Nombre corto de cada tipo, para la columna "Estado". */
export const NOMBRE_TIPO = {
  [TIPOS.COINCIDE]: 'Coincide',
  [TIPOS.CLARO]: 'Desfase claro',
  [TIPOS.DUDOSO]: 'Desfase dudoso',
};

/** Etiqueta de estado de una partida ("Falta en el banco", "Fecha desfasada 2 días"...). */
export function etiquetaPartida(p) {
  switch (p.motivo) {
    case MOTIVOS.MANUAL: return 'Emparejado a mano';
    case MOTIVOS.EXACTA: return 'Coincide';
    case MOTIVOS.DESFASE_FECHA: return `Fecha desfasada ${textoDias(p.dias)}`;
    case MOTIVOS.CONCEPTO_DISTINTO: return p.dias ? `Concepto distinto (fecha desfasada ${textoDias(p.dias)})` : 'Concepto distinto';
    case MOTIVOS.IMPORTE_DISTINTO: return `Importe distinto (diferencia ${formatearEuros(p.diferencia, { signo: true })})`;
    case MOTIVOS.FECHA_MUY_DISTINTA: return `Fecha muy distinta (${textoDias(p.dias)})`;
    case MOTIVOS.FALTA_BANCO: return 'Falta en el banco';
    case MOTIVOS.FALTA_CONTABILIDAD: return 'Falta en contabilidad';
    case MOTIVOS.FUERA_PERIODO: return p.contabilidad
      ? 'Falta en el banco, pero puede caer fuera del periodo'
      : 'Falta en contabilidad, pero puede caer fuera del periodo';
    default: return '';
  }
}

/** Texto de la pista "hay un movimiento sin emparejar con el mismo importe". */
export function textoPista(p) {
  if (!p.pista) return '';
  const donde = p.pista.origen === 'banco' ? 'el banco' : 'contabilidad';
  return `Pista: en ${donde} hay un movimiento sin emparejar del mismo importe el ${formatearFecha(p.pista.dia)} («${p.pista.concepto || 'sin concepto'}»).`;
}

/** Tarjetas de resumen. */
export function calcularResumen(resultado) {
  const contar = (f) => resultado.partidas.filter(f).length;
  const suma = (movs) => movs.reduce((s, m) => s + m.importe, 0);
  const conDesfase = resultado.partidas.filter((p) => p.tipo !== TIPOS.COINCIDE);
  let primeraFecha = null;
  for (const p of conDesfase) {
    for (const m of [p.contabilidad, p.banco]) if (m && (primeraFecha === null || m.dia < primeraFecha)) primeraFecha = m.dia;
  }
  const netoContabilidad = suma(resultado.contabilidad);
  const netoBanco = suma(resultado.banco);
  return {
    coinciden: contar((p) => p.tipo === TIPOS.COINCIDE),
    coincidenConDesfase: contar((p) => p.motivo === MOTIVOS.DESFASE_FECHA),
    claros: contar((p) => p.tipo === TIPOS.CLARO),
    faltaBanco: contar((p) => p.motivo === MOTIVOS.FALTA_BANCO),
    faltaContabilidad: contar((p) => p.motivo === MOTIVOS.FALTA_CONTABILIDAD),
    importeDistinto: contar((p) => p.motivo === MOTIVOS.IMPORTE_DISTINTO),
    dudosos: contar((p) => p.tipo === TIPOS.DUDOSO),
    conceptoDistinto: contar((p) => p.motivo === MOTIVOS.CONCEPTO_DISTINTO),
    fechaMuyDistinta: contar((p) => p.motivo === MOTIVOS.FECHA_MUY_DISTINTA),
    fueraPeriodo: contar((p) => p.motivo === MOTIVOS.FUERA_PERIODO),
    netoContabilidad,
    netoBanco,
    descuadre: netoContabilidad - netoBanco,
    primeraFecha,
    movimientosContabilidad: resultado.contabilidad.length,
    movimientosBanco: resultado.banco.length,
  };
}

/**
 * Una fila por fecha (unión de las fechas de ambos archivos), en orden.
 * Cada fila: totales de cada archivo, diferencia del día, descuadre acumulado, peor estado y
 * las partidas con algún movimiento en esa fecha.
 */
export function calcularPorFecha(resultado) {
  const dias = new Map();
  const fila = (dia) => {
    if (!dias.has(dia)) {
      dias.set(dia, {
        dia,
        contabilidad: { entradas: 0, salidas: 0, neto: 0, n: 0 },
        banco: { entradas: 0, salidas: 0, neto: 0, n: 0 },
        partidas: [],
      });
    }
    return dias.get(dia);
  };
  for (const lado of ['contabilidad', 'banco']) {
    for (const m of resultado[lado]) {
      const t = fila(m.dia)[lado];
      if (m.importe > 0) t.entradas += m.importe; else t.salidas -= m.importe;
      t.neto += m.importe;
      t.n++;
    }
  }
  for (const p of resultado.partidas) {
    const enDias = new Set([p.contabilidad && p.contabilidad.dia, p.banco && p.banco.dia].filter((d) => d !== null && d !== undefined));
    for (const d of enDias) fila(d).partidas.push(p);
  }
  const filas = [...dias.values()].sort((a, b) => a.dia - b.dia);
  let acumulado = 0;
  for (const f of filas) {
    f.diferencia = f.contabilidad.neto - f.banco.neto;
    acumulado += f.diferencia;
    f.acumulado = acumulado;
    f.peor = f.partidas.reduce((peor, p) => (!peor || gravedad(p) > gravedad(peor) ? p : peor), null);
    f.tipo = f.peor ? f.peor.tipo : TIPOS.COINCIDE;
  }
  return filas;
}

/** Estado de una fecha en texto ("Desfase claro: falta en el banco"). */
export function estadoFecha(f) {
  if (!f.peor) return NOMBRE_TIPO[TIPOS.COINCIDE];
  const p = f.peor;
  if (p.tipo === TIPOS.COINCIDE) return p.motivo === MOTIVOS.DESFASE_FECHA ? 'Coincide (con fecha desfasada)' : 'Coincide';
  const motivos = [...new Set(f.partidas.filter((x) => x.tipo === p.tipo).map((x) => FILTROS[x.motivo].nombre.toLowerCase()))];
  return `${NOMBRE_TIPO[p.tipo]}: ${motivos.join(', ')}`;
}

/** Filas de la tabla por fecha que pasan un filtro. */
export function filtrarFechas(filas, filtro) {
  const f = FILTROS[filtro] || FILTROS.desfases;
  if (filtro === 'todas') return filas;
  return filas.filter((fila) => fila.partidas.some(f.vale));
}
