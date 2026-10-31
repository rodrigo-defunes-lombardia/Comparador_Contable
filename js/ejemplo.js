// Generador de datos ficticios para probar la web (marzo de 2026, unas 200 filas por archivo).
// Lo usa el botón "Probar con datos de ejemplo" y el script que crea los .xlsx de /ejemplos.
// Es determinista: siempre genera los mismos datos. Ningún dato es real.

import { diaDesdeComponentes, serieExcel } from './valores.js';

const ANIO = 2026, MES = 3, DIAS_MES = 31;

// [concepto en contabilidad, concepto en el banco, importe mínimo, importe máximo] (euros; negativo = salida)
const HABITUALES = [
  ['Iberdrola luz', 'RECIBO IBERDROLA CLIENTES SAU', -120, -40],
  ['Vodafone teléfono', 'RECIBO VODAFONE ESPAÑA', -60, -30],
  ['Mercadona compra', 'COMPRA TARJ. MERCADONA', -150, -10],
  ['Gasolinera Repsol', 'COMPRA TARJ. REPSOL ESTACION', -80, -30],
  ['Cliente Pérez factura', 'TRANSFERENCIA DE PEREZ MARTIN JOSE', 100, 900],
  ['Cliente Ortega factura', 'TRANSF. ORTEGA SL', 150, 1200],
  ['Material oficina Lyreco', 'RECIBO LYRECO', -90, -15],
  ['Gestoría López', 'RECIBO GESTORIA LOPEZ ASESORES', -150, -90],
  ['Venta mostrador TPV', 'ABONO TPV COMERCIO', 20, 600],
  ['Amazon material', 'COMPRA AMAZON EU', -120, -8],
  ['Correos envíos', 'COMPRA TARJ. CORREOS', -40, -4],
  ['Agua Canal Isabel II', 'RECIBO CANAL ISABEL II', -70, -25],
  ['Bizum Lucía', 'BIZUM DE LUCIA FERNANDEZ', 10, 80],
  ['Proveedor Frutas Gómez', 'TRANSFERENCIA FRUTAS GOMEZ', -400, -60],
  ['Taller Hermanos Ruiz', 'COMPRA TARJ. TALLER HNOS RUIZ', -350, -40],
];

/** Casos preparados: uno o más de cada tipo de desfase. [día, concepto, euros] */
const CASOS = {
  contabilidad: [
    [9, 'Ferretería Martín', -37.85],            // concepto distinto (banco: BRICOMART)
    [13, 'Imprenta Sol tarjetas', -120],         // importe distinto (banco: 102,00)
    [5, 'Alquiler local marzo', -850],           // fecha muy distinta (banco el día 12)
    [18, 'Cheque proveedor Hidalgo', -310],      // falta en el banco
    [15, 'Cobro cliente Navarro', 250],          // falta en el banco (con pista: el banco tiene 250 € el 24)
    [16, 'Devolución Amazon', 59.9],             // apuntado como entrada, en el banco es una salida
    [31, 'Seguridad social autónomos', -294],    // puede caer fuera del periodo (el banco lo carga en abril)
    [11, 'Cliente Pérez factura', 480],          // coincide con 2 días de desfase
  ],
  banco: [
    [9, 'COMPRA TARJ. BRICOMART', -37.85],
    [13, 'RECIBO IMPRENTA SOL', -102],
    [12, 'RECIBO ALQUILER LOCAL COMERCIAL', -850],
    [21, 'INTERESES DESCUBIERTO', -4.12],        // falta en contabilidad
    [24, 'TRANSFERENCIA DE GARCIA RUIZ ANA', 250],// falta en contabilidad (con pista)
    [16, 'COMPRA AMAZON EU', -59.9],
    [1, 'ABONO TPV COMERCIO', 86.4],             // puede caer fuera del periodo (apuntado en febrero)
    [13, 'TRANSFERENCIA DE PEREZ MARTIN JOSE', 480],
  ],
};

/** Generador pseudoaleatorio con semilla (mulberry32). */
function aleatorio(semilla) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Movimientos ficticios: {contabilidad: [[dia, concepto, céntimos]], banco: [...]} sin cabeceras. */
export function generarMovimientos({ semilla = 20260301, cantidad = 190 } = {}) {
  const r = aleatorio(semilla);
  const contabilidad = [], banco = [];
  for (let i = 0; i < cantidad; i++) {
    const dia = 1 + Math.floor(r() * DIAS_MES);
    const [cc, cb, min, max] = HABITUALES[Math.floor(r() * HABITUALES.length)];
    const cent = Math.round((min + r() * (max - min)) * 100);
    const azar = r();
    // 85 % el mismo día; 10 % un día más tarde; 5 % dos días más tarde (sin salirse del mes).
    const retraso = dia > DIAS_MES - 2 ? 0 : azar < 0.85 ? 0 : azar < 0.95 ? 1 : 2;
    contabilidad.push([dia, cc, cent]);
    banco.push([dia + retraso, cb, cent]);
  }
  for (const lado of ['contabilidad', 'banco']) {
    for (const [dia, concepto, euros] of CASOS[lado]) {
      (lado === 'banco' ? banco : contabilidad).push([dia, concepto, Math.round(euros * 100)]);
    }
  }
  const orden = (a, b) => a[0] - b[0];
  contabilidad.sort(orden);
  banco.sort(orden);
  return { contabilidad, banco };
}

const euros = (cent) => Math.round(cent) / 100;

/**
 * Hojas completas (matriz de celdas) como las exportaría cada programa, con filas de título,
 * cabeceras, filas vacías y totales. Las fechas van como número de serie de Excel.
 */
export function generarHojas(opciones) {
  const { contabilidad, banco } = generarMovimientos(opciones);
  const fila = ([dia, concepto, cent]) => [
    serieExcel(diaDesdeComponentes(ANIO, MES, dia)),
    concepto,
    cent > 0 ? euros(cent) : null,
    cent < 0 ? euros(-cent) : null,
  ];
  const totales = (lista) => [
    lista.filter((m) => m[2] > 0).reduce((s, m) => s + m[2], 0),
    lista.filter((m) => m[2] < 0).reduce((s, m) => s - m[2], 0),
  ];
  const [ec, sc] = totales(contabilidad);
  const [eb, sb] = totales(banco);
  const saldoInicial = 1250000;

  return {
    contabilidad: [
      ['Mi Pequeño Negocio (datos ficticios) - Libro de caja'],
      ['Periodo: marzo 2026'],
      [],
      ['Fecha', 'Concepto', 'Entradas', 'Salidas'],
      ...contabilidad.map(fila),
      [],
      ['Totales', null, euros(ec), euros(sc)],
    ],
    banco: [
      ['Extracto de movimientos (datos ficticios)'],
      ['Cuenta: ES00 0000 0000 0000 0000 0000'],
      ['Saldo anterior', null, euros(saldoInicial), null],
      [],
      ['Fecha contable', 'Concepto', 'Entradas', 'Salidas'],
      ...banco.map(fila),
      [],
      ['Total movimientos', null, euros(eb), euros(sb)],
      ['Saldo final', null, euros(saldoInicial + eb - sb), null],
    ],
  };
}
