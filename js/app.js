// Interfaz: carga de archivos, resumen, tabla por fecha, filtros, exportación y preferencias.

import { leerArchivo, ErrorLectura } from './lector.js';
import { filasAMovimientos } from './filas.js';
import { conciliar, TIPOS, MOTIVOS, gravedad } from './emparejado.js';
import {
  calcularResumen, calcularPorFecha, filtrarFechas, estadoFecha, etiquetaPartida, textoPista, FILTROS,
} from './resumen.js';
import { formatearFecha, formatearFechaLarga, formatearEuros } from './valores.js';
import { icono, pintarIconos } from './iconos.js';
import { iniciarPWA } from './pwa.js';

const NOMBRES = { contabilidad: 'contabilidad', banco: 'banco' };

const estado = {
  archivos: { contabilidad: null, banco: null },
  resultado: null,
  resumen: null,
  porFecha: [],
  filtro: 'desfases',
  abiertos: new Set(),
  esEjemplo: false,
};

const $ = (sel) => document.querySelector(sel);

/** Crea un elemento: el('td', {class: 'x', 'data-a': 1}, 'texto', otroNodo). El texto nunca se interpreta como HTML. */
function el(etiqueta, atributos = {}, ...hijos) {
  const nodo = document.createElement(etiqueta);
  for (const [k, v] of Object.entries(atributos)) {
    if (v === false || v === null || v === undefined) continue;
    if (k === 'class') nodo.className = v;
    else if (k === 'texto') nodo.textContent = v;
    else if (k.startsWith('on')) nodo.addEventListener(k.slice(2), v);
    else nodo.setAttribute(k, v === true ? '' : String(v));
  }
  for (const h of hijos.flat()) if (h !== null && h !== undefined && h !== false) nodo.append(h);
  return nodo;
}

const ocultoVisual = (texto) => el('span', { class: 'oculto-visual', texto });

// ---------- Avisos para lectores de pantalla ----------

let temporizadorAnuncio;
function anunciar(texto) {
  const region = $('#anuncios');
  clearTimeout(temporizadorAnuncio);
  region.textContent = '';
  temporizadorAnuncio = setTimeout(() => { region.textContent = texto; }, 100);
}

// ---------- Preferencias de accesibilidad ----------

function guardarPreferencias() {
  const raiz = document.documentElement;
  try {
    localStorage.setItem('comparador-preferencias', JSON.stringify({ letra: raiz.dataset.letra, tema: raiz.dataset.tema }));
  } catch { /* sin almacenamiento: no pasa nada */ }
}

function iniciarPreferencias() {
  const raiz = document.documentElement;
  for (const nombre of ['letra', 'tema']) {
    for (const radio of document.querySelectorAll(`input[name="${nombre}"]`)) {
      radio.checked = radio.value === raiz.dataset[nombre];
      radio.addEventListener('change', () => {
        if (!radio.checked) return;
        raiz.dataset[nombre] = radio.value;
        guardarPreferencias();
      });
    }
  }
}

// ---------- Carga de archivos ----------

function textoLeido(info) {
  const n = info.movimientos.length;
  return `${n} ${n === 1 ? 'movimiento leído' : 'movimientos leídos'}, del ${formatearFecha(info.desde)} al ${formatearFecha(info.hasta)}`;
}

function pintarEstadoZona(origen, { tipo, info, mensaje, nombre } = {}) {
  const caja = $(`#estado-${origen}`);
  const zona = $(`#zona-${origen}`);
  const accion = zona.querySelector('.zona__accion');
  caja.replaceChildren();
  caja.removeAttribute('role');
  zona.classList.remove('zona--ok', 'zona--error', 'zona--cargando');
  accion.textContent = `Elegir archivo ${origen === 'banco' ? 'del banco' : 'de contabilidad'}`;

  if (tipo === 'cargando') {
    zona.classList.add('zona--cargando');
    caja.append(el('p', { class: 'zona__mensaje' }, icono('cargando'), `Leyendo «${nombre}»…`));
  } else if (tipo === 'ok') {
    zona.classList.add('zona--ok');
    accion.textContent = `Cambiar archivo ${origen === 'banco' ? 'del banco' : 'de contabilidad'}`;
    const p = el('p', { class: 'zona__mensaje' }, icono('coincide'),
      el('span', {}, el('strong', { texto: info.nombre }), el('br'), `${textoLeido(info)}.`));
    caja.append(p);
    const notas = [];
    if (info.ignoradas > 0) notas.push(`Se han ignorado ${info.ignoradas} ${info.ignoradas === 1 ? 'fila' : 'filas'} sin fecha o sin importe (cabeceras, totales, saldos…).`);
    if (info.hoja) notas.push(`Hoja usada: «${info.hoja}».`);
    if (notas.length) caja.append(el('p', { class: 'zona__nota', texto: notas.join(' ') }));
    caja.append(el('p', { class: 'zona__nota', texto: 'Comprueba que el número de movimientos y las fechas son los que esperas.' }));
  } else if (tipo === 'error') {
    zona.classList.add('zona--error');
    caja.setAttribute('role', 'alert');
    caja.append(el('p', { class: 'zona__mensaje' }, icono('error'),
      el('span', {}, el('strong', { texto: 'No se ha podido leer el archivo.' }), ' ', mensaje)));
  }
}

async function procesarArchivo(origen, archivo) {
  if (!archivo) return;
  estado.esEjemplo = false;
  pintarEstadoZona(origen, { tipo: 'cargando', nombre: archivo.name });
  try {
    const info = await leerArchivo(archivo, origen);
    info.nombre = archivo.name;
    info.tamano = archivo.size;
    estado.archivos[origen] = info;
    pintarEstadoZona(origen, { tipo: 'ok', info });
    anunciar(`Archivo de ${NOMBRES[origen]} cargado: ${textoLeido(info)}.`);
  } catch (e) {
    estado.archivos[origen] = null;
    const mensaje = e instanceof ErrorLectura ? e.message
      : 'Ha ocurrido un error inesperado al leerlo. Prueba a abrirlo en Excel, guardarlo como .xlsx y elegirlo de nuevo.';
    if (!(e instanceof ErrorLectura)) console.error(e);
    pintarEstadoZona(origen, { tipo: 'error', mensaje });
  }
  actualizarResultado();
}

function iniciarZonas() {
  for (const origen of ['contabilidad', 'banco']) {
    const zona = $(`#zona-${origen}`);
    const input = $(`#archivo-${origen}`);
    input.addEventListener('change', () => {
      procesarArchivo(origen, input.files[0]);
      input.value = '';
    });
    let contador = 0;
    zona.addEventListener('dragenter', (e) => { e.preventDefault(); contador++; zona.classList.add('zona--encima'); });
    zona.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
    zona.addEventListener('dragleave', () => { if (--contador <= 0) { contador = 0; zona.classList.remove('zona--encima'); } });
    zona.addEventListener('drop', (e) => {
      e.preventDefault();
      contador = 0;
      zona.classList.remove('zona--encima');
      const archivo = e.dataTransfer.files && e.dataTransfer.files[0];
      if (archivo) procesarArchivo(origen, archivo);
    });
  }
  // Soltar un archivo fuera de las zonas no debe abrirlo en el navegador.
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => e.preventDefault());
}

async function cargarEjemplo() {
  const { generarHojas } = await import('./ejemplo.js');
  const hojas = generarHojas();
  for (const origen of ['contabilidad', 'banco']) {
    const info = filasAMovimientos(hojas[origen], { origen });
    info.nombre = `${origen}_ejemplo.xlsx`;
    info.hoja = null;
    estado.archivos[origen] = info;
    pintarEstadoZona(origen, { tipo: 'ok', info });
  }
  estado.esEjemplo = true;
  actualizarResultado({ enfocar: true });
}

function reiniciar() {
  estado.archivos = { contabilidad: null, banco: null };
  estado.esEjemplo = false;
  for (const origen of ['contabilidad', 'banco']) pintarEstadoZona(origen);
  actualizarResultado();
  anunciar('Se han quitado los archivos. Puedes elegir otros.');
  $('#archivo-contabilidad').focus();
}

// ---------- Comparación ----------

function actualizarResultado({ enfocar = false } = {}) {
  const { contabilidad, banco } = estado.archivos;
  $('#boton-reiniciar').hidden = !(contabilidad || banco);
  if (!contabilidad || !banco) {
    estado.resultado = null;
    $('#resultados').hidden = true;
    return;
  }
  estado.resultado = conciliar(contabilidad.movimientos, banco.movimientos);
  estado.resumen = calcularResumen(estado.resultado);
  estado.porFecha = calcularPorFecha(estado.resultado);
  estado.filtro = 'desfases';
  estado.abiertos.clear();
  $('#ejemplo-aviso').hidden = !estado.esEjemplo;
  pintarTarjetas();
  pintarTabla();
  $('#resultados').hidden = false;

  const r = estado.resumen;
  const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
  let texto = `Comparación terminada. ${plural(r.coinciden, 'movimiento coincide', 'movimientos coinciden')}. `
    + `${plural(r.claros, 'desfase claro', 'desfases claros')} y ${plural(r.dudosos, 'dudoso', 'dudosos')}. `
    + (r.descuadre === 0 ? 'Los totales cuadran.' : `Descuadre total: ${formatearEuros(r.descuadre)}.`);
  const avisos = avisosCarga();
  if (avisos.length) texto += ` Atención: ${avisos.join(' ')}`;
  anunciar(texto);
  if (enfocar) $('#titulo-resultados').focus();
}

function avisosCarga() {
  const { contabilidad: c, banco: b } = estado.archivos;
  const avisos = [];
  if (!estado.esEjemplo && c.nombre === b.nombre && c.tamano === b.tamano) {
    avisos.push('Parece que has elegido el mismo archivo para contabilidad y para el banco.');
  }
  if (c.hasta < b.desde || b.hasta < c.desde) {
    avisos.push('Los periodos de los dos archivos no se solapan: comprueba que son del mismo mes.');
  }
  return avisos;
}

// ---------- Tarjetas de resumen ----------

function botonFiltro(filtro, contenido, clase = '') {
  return el('button', {
    type: 'button', class: clase, 'data-filtro': filtro, 'aria-pressed': String(estado.filtro === filtro),
    onclick: () => aplicarFiltro(filtro),
  }, contenido);
}

function lineaDesglose(filtro, n, texto) {
  return el('li', {}, botonFiltro(filtro, [el('span', { class: 'cifra-pequena', texto: String(n) }), ` ${texto}`], 'desglose__boton'));
}

function pintarTarjetas() {
  const r = estado.resumen;
  const cont = $('#tarjetas');
  cont.replaceChildren();

  const avisos = avisosCarga();
  if (avisos.length) {
    cont.append(el('div', { class: 'aviso', role: 'note' }, icono('error'), el('p', { texto: avisos.join(' ') })));
  }

  const tarjeta = (clase, iconoNombre, titulo, cifra, filtro, desglose) => el('section', { class: `tarjeta tarjeta--${clase}`, 'aria-label': titulo },
    botonFiltro(filtro, [
      el('span', { class: 'tarjeta__cabecera' }, icono(iconoNombre), el('span', { class: 'tarjeta__titulo', texto: titulo })),
      el('span', { class: 'tarjeta__cifra', texto: String(cifra) }),
      el('span', { class: 'tarjeta__ver', texto: 'Ver en la tabla' }),
    ], 'tarjeta__principal'),
    desglose ? el('ul', { class: 'desglose' }, desglose) : null);

  cont.append(
    tarjeta('coincide', 'coincide', 'Coinciden', r.coinciden, 'coincide', [
      lineaDesglose('desfase_fecha', r.coincidenConDesfase, 'con fecha desfasada 1-2 días'),
    ]),
    tarjeta('claro', 'claro', 'Desfases claros', r.claros, 'claro', [
      lineaDesglose('falta_banco', r.faltaBanco, 'Falta en el banco'),
      lineaDesglose('falta_contabilidad', r.faltaContabilidad, 'Falta en contabilidad'),
      lineaDesglose('importe_distinto', r.importeDistinto, 'Importe distinto'),
    ]),
    tarjeta('dudoso', 'dudoso', 'Desfases dudosos', r.dudosos, 'dudoso', [
      lineaDesglose('concepto_distinto', r.conceptoDistinto, 'Concepto distinto'),
      lineaDesglose('fecha_muy_distinta', r.fechaMuyDistinta, 'Fecha muy distinta'),
      lineaDesglose('fuera_periodo', r.fueraPeriodo, 'Posible fuera de periodo'),
    ]),
  );

  const cuadra = r.descuadre === 0;
  cont.append(el('section', { class: `tarjeta tarjeta--dato ${cuadra ? 'tarjeta--cuadra' : 'tarjeta--descuadre'}`, 'aria-label': 'Descuadre total' },
    el('div', { class: 'tarjeta__cuerpo' },
      el('span', { class: 'tarjeta__cabecera' }, icono(cuadra ? 'coincide' : 'euro'), el('span', { class: 'tarjeta__titulo', texto: 'Descuadre total' })),
      el('span', { class: 'tarjeta__cifra tarjeta__cifra--importe', texto: cuadra ? 'Cuadra' : formatearEuros(r.descuadre, { signo: true }) }),
      el('span', { class: 'tarjeta__nota' },
        `Neto contabilidad ${formatearEuros(r.netoContabilidad)}`, el('br'), `menos neto banco ${formatearEuros(r.netoBanco)}`))));

  const primera = r.primeraFecha;
  cont.append(el('section', { class: 'tarjeta tarjeta--dato', 'aria-label': 'Primera fecha con descuadre' },
    primera === null
      ? el('div', { class: 'tarjeta__cuerpo' },
        el('span', { class: 'tarjeta__cabecera' }, icono('calendario'), el('span', { class: 'tarjeta__titulo', texto: 'Primera fecha con descuadre' })),
        el('span', { class: 'tarjeta__cifra tarjeta__cifra--importe', texto: 'Ninguna' }))
      : el('button', { type: 'button', class: 'tarjeta__principal', onclick: () => irAFecha(primera) },
        el('span', { class: 'tarjeta__cabecera' }, icono('calendario'), el('span', { class: 'tarjeta__titulo', texto: 'Primera fecha con descuadre' })),
        el('span', { class: 'tarjeta__cifra tarjeta__cifra--importe', texto: formatearFecha(primera) }),
        el('span', { class: 'tarjeta__ver', texto: 'Ir a esa fecha' }))));
}

function actualizarBotonesFiltro() {
  for (const b of document.querySelectorAll('#resultados [data-filtro]')) {
    b.setAttribute('aria-pressed', String(b.dataset.filtro === estado.filtro));
  }
}

function aplicarFiltro(filtro) {
  estado.filtro = filtro;
  actualizarBotonesFiltro();
  pintarTabla();
  const n = filtrarFechas(estado.porFecha, filtro).length;
  anunciar(`Filtro: ${FILTROS[filtro].nombre}. ${n} ${n === 1 ? 'fecha' : 'fechas'} en la tabla.`);
}

function irAFecha(dia) {
  if (!filtrarFechas(estado.porFecha, estado.filtro).some((f) => f.dia === dia)) {
    estado.filtro = 'desfases';
    actualizarBotonesFiltro();
  }
  estado.abiertos.add(dia);
  pintarTabla();
  const boton = document.getElementById(`boton-fecha-${dia}`);
  if (boton) {
    boton.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    boton.focus({ preventScroll: true });
  }
}

// ---------- Tabla por fecha ----------

function insignia(tipo, motivo, texto) {
  const nombreIcono = tipo === TIPOS.CLARO ? 'claro' : tipo === TIPOS.DUDOSO ? 'dudoso'
    : motivo === MOTIVOS.DESFASE_FECHA ? 'reloj' : 'coincide';
  return el('span', { class: `estado estado--${tipo}` }, icono(nombreIcono), el('span', { texto }));
}

function celdaImporte(cent, etiqueta, { signo = false, vacio = false } = {}) {
  const td = el('td', { class: 'num', 'data-etiqueta': etiqueta });
  if (vacio) td.append(el('span', { 'aria-hidden': 'true', texto: '—' }), ocultoVisual('Sin movimientos'));
  else td.textContent = formatearEuros(cent, { signo });
  return td;
}

function pintarTabla() {
  const filas = filtrarFechas(estado.porFecha, estado.filtro);
  const cont = $('#contenedor-tabla');
  const activo = $('#filtro-activo');
  activo.replaceChildren();
  const generico = estado.filtro === 'desfases' || estado.filtro === 'todas';
  activo.append(el('p', {},
    `Mostrando ${filas.length} de ${estado.porFecha.length} fechas`,
    generico ? '.' : [': ', el('strong', { texto: FILTROS[estado.filtro].nombre }), '. ']),
  );
  if (!generico) {
    activo.firstChild.append(el('button', { type: 'button', class: 'boton boton--terciario boton--pequeno', onclick: () => aplicarFiltro('desfases') }, 'Quitar filtro'));
  }

  if (filas.length === 0) {
    const vacio = estado.filtro === 'desfases'
      ? 'No hay fechas con desfases: todos los movimientos coinciden.'
      : 'No hay fechas con este filtro.';
    cont.replaceChildren(el('p', { class: 'tabla-vacia' }, icono('info'), vacio));
    return;
  }

  const tabla = el('table', { class: 'tabla' },
    el('caption', { class: 'oculto-visual', texto: `Movimientos por fecha. ${FILTROS[estado.filtro].nombre}. Pulsa en una fecha para ver sus movimientos.` }),
    el('colgroup', {}, el('col', {})),
    el('colgroup', { span: 3, class: 'grupo-contabilidad' }),
    el('colgroup', { span: 3, class: 'grupo-banco' }),
    el('colgroup', { span: 3 }),
    el('thead', {},
      el('tr', {},
        el('th', { scope: 'col', rowspan: 2, texto: 'Fecha' }),
        el('th', { scope: 'colgroup', colspan: 3, class: 'grupo', texto: 'Contabilidad' }),
        el('th', { scope: 'colgroup', colspan: 3, class: 'grupo', texto: 'Banco' }),
        el('th', { scope: 'col', rowspan: 2, class: 'num', texto: 'Diferencia del día' }),
        el('th', { scope: 'col', rowspan: 2, class: 'num', texto: 'Descuadre acumulado' }),
        el('th', { scope: 'col', rowspan: 2, texto: 'Estado' })),
      el('tr', {},
        ...['Entradas', 'Salidas', 'Neto', 'Entradas', 'Salidas', 'Neto'].map((t) => el('th', { scope: 'col', class: 'num', texto: t })))));

  for (const f of filas) tabla.append(cuerpoFecha(f));
  cont.replaceChildren(tabla);
}

function cuerpoFecha(f) {
  const abierto = estado.abiertos.has(f.dia);
  const idDetalle = `detalle-${f.dia}`;
  const boton = el('button', {
    type: 'button', class: 'desplegar', id: `boton-fecha-${f.dia}`,
    'aria-expanded': String(abierto), 'aria-controls': idDetalle,
    onclick: () => alternarFecha(f, boton, detalle),
  }, icono('flecha'), el('span', { texto: formatearFecha(f.dia) }), ocultoVisual(`, ${f.partidas.length} ${f.partidas.length === 1 ? 'movimiento' : 'movimientos'}`));

  const lado = (t, nombre) => [
    celdaImporte(t.entradas, `${nombre}: entradas`, { vacio: t.n === 0 }),
    celdaImporte(t.salidas, `${nombre}: salidas`, { vacio: t.n === 0 }),
    celdaImporte(t.neto, `${nombre}: neto`, { vacio: t.n === 0 }),
  ];

  const fila = el('tr', { class: `fila-fecha fila-fecha--${f.tipo}` },
    el('th', { scope: 'row' }, boton),
    ...lado(f.contabilidad, 'Contabilidad'),
    ...lado(f.banco, 'Banco'),
    celdaImporte(f.diferencia, 'Diferencia del día', { signo: true }),
    celdaImporte(f.acumulado, 'Descuadre acumulado', { signo: true }),
    el('td', { 'data-etiqueta': 'Estado' }, insignia(f.tipo, f.peor && f.peor.motivo, estadoFecha(f))));

  const celdaDetalle = el('td', { colspan: 10 });
  const detalle = el('tr', { class: 'fila-detalle', id: idDetalle, hidden: !abierto }, celdaDetalle);
  if (abierto) celdaDetalle.append(detalleFecha(f));
  return el('tbody', {}, fila, detalle);
}

function alternarFecha(f, boton, detalle) {
  const abrir = boton.getAttribute('aria-expanded') !== 'true';
  boton.setAttribute('aria-expanded', String(abrir));
  detalle.hidden = !abrir;
  if (abrir) {
    estado.abiertos.add(f.dia);
    if (!detalle.firstChild.hasChildNodes()) detalle.firstChild.append(detalleFecha(f));
  } else estado.abiertos.delete(f.dia);
}

function celdaMovimiento(m, dia, otroLado) {
  if (!m) {
    return el('td', { class: 'mov mov--vacio', 'data-etiqueta': otroLado },
      el('span', { 'aria-hidden': 'true', texto: '—' }), ocultoVisual(`No está en ${otroLado === 'Banco' ? 'el banco' : 'contabilidad'}`));
  }
  const notas = [`Fila ${m.fila} del archivo`];
  if (m.dia !== dia) notas.unshift(`Apuntado el ${formatearFecha(m.dia)}`);
  return el('td', { class: 'mov', 'data-etiqueta': otroLado },
    el('span', { class: 'mov__concepto', texto: m.concepto || '(sin concepto)' }),
    el('span', { class: 'mov__importe', texto: formatearEuros(m.importe, { signo: true }) }),
    el('span', { class: 'mov__nota', texto: notas.join(' · ') }));
}

function detalleFecha(f) {
  const partidas = [...f.partidas].sort((a, b) => gravedad(b) - gravedad(a));
  const tabla = el('table', { class: 'tabla-detalle' },
    el('caption', { texto: `Movimientos del ${formatearFechaLarga(f.dia)}` }),
    el('thead', {}, el('tr', {},
      el('th', { scope: 'col', texto: 'Contabilidad' }),
      el('th', { scope: 'col', texto: 'Estado' }),
      el('th', { scope: 'col', texto: 'Banco' }))));
  const cuerpo = el('tbody');
  for (const p of partidas) {
    const enlazado = p.contabilidad && p.banco;
    const pista = textoPista(p);
    cuerpo.append(el('tr', { class: `partida partida--${p.tipo}` },
      celdaMovimiento(p.contabilidad, f.dia, 'Contabilidad'),
      el('td', { class: 'partida__estado', 'data-etiqueta': 'Estado' },
        enlazado ? el('span', { class: 'enlace-par' }, icono('enlace'), el('span', { class: 'oculto-visual', texto: 'Emparejados:' })) : null,
        insignia(p.tipo, p.motivo, etiquetaPartida(p)),
        pista ? el('p', { class: 'pista' }, icono('info'), pista) : null),
      celdaMovimiento(p.banco, f.dia, 'Banco')));
  }
  tabla.append(cuerpo);
  return el('div', { class: 'detalle' }, tabla);
}

function desplegarTodas(abrir) {
  const filas = filtrarFechas(estado.porFecha, estado.filtro);
  for (const f of filas) { if (abrir) estado.abiertos.add(f.dia); else estado.abiertos.delete(f.dia); }
  pintarTabla();
  anunciar(abrir ? `Desplegadas ${filas.length} fechas.` : 'Todas las fechas plegadas.');
}

// ---------- Exportar ----------

async function exportar() {
  const boton = $('#boton-exportar');
  boton.disabled = true;
  try {
    const { generarExcel } = await import('./exportar.js');
    const { bytes, nombre } = generarExcel(estado.resultado, {
      archivoContabilidad: estado.archivos.contabilidad.nombre,
      archivoBanco: estado.archivos.banco.nombre,
    });
    const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: nombre, class: 'oculto-visual' });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    anunciar(`Se ha descargado el archivo ${nombre}.`);
  } catch (e) {
    console.error(e);
    anunciar('No se ha podido crear el Excel. Vuelve a intentarlo.');
  } finally {
    boton.disabled = false;
  }
}

// ---------- Imprimir ----------

function abrirDialogoImprimir() {
  $('#dialogo-imprimir').showModal();
  $('#impresion-desfases').checked = true;
  $('#impresion-desfases').focus();
}

/** Imprime "solo desfases" o "todo": cambia temporalmente el filtro, despliega todas las fechas y lo restaura después. */
function imprimir(modo) {
  $('#dialogo-imprimir').close();
  const anterior = { filtro: estado.filtro, abiertos: new Set(estado.abiertos) };
  estado.filtro = modo === 'todo' ? 'todas' : 'desfases';
  estado.abiertos = new Set(filtrarFechas(estado.porFecha, estado.filtro).map((f) => f.dia));
  actualizarBotonesFiltro();
  pintarTabla();
  const raiz = document.documentElement;
  raiz.dataset.impresion = modo;
  const { contabilidad: c, banco: b } = estado.archivos;
  $('#cabecera-impresion').textContent = `${modo === 'todo' ? 'Informe completo (desfases y coincidencias)' : 'Informe de desfases'}`
    + ` · Contabilidad: ${c.nombre} · Banco: ${b.nombre} · Impreso el ${new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;

  const restaurar = () => {
    delete raiz.dataset.impresion;
    estado.filtro = anterior.filtro;
    estado.abiertos = anterior.abiertos;
    actualizarBotonesFiltro();
    pintarTabla();
    $('#boton-imprimir').focus();
  };
  window.addEventListener('afterprint', restaurar, { once: true });
  window.print();
}

// ---------- Inicio ----------

function iniciar() {
  pintarIconos();
  iniciarPWA({ hayTrabajo: () => Boolean(estado.archivos.contabilidad || estado.archivos.banco) });
  iniciarPreferencias();
  iniciarZonas();
  $('#boton-ejemplo').addEventListener('click', cargarEjemplo);
  $('#boton-reiniciar').addEventListener('click', reiniciar);
  $('#boton-exportar').addEventListener('click', exportar);
  $('#boton-imprimir').addEventListener('click', abrirDialogoImprimir);
  $('#boton-confirmar-imprimir').addEventListener('click', () => imprimir($('#impresion-todo').checked ? 'todo' : 'desfases'));
  $('#boton-cancelar-imprimir').addEventListener('click', () => { $('#dialogo-imprimir').close(); $('#boton-imprimir').focus(); });
  $('#boton-desplegar').addEventListener('click', () => desplegarTodas(true));
  $('#boton-plegar').addEventListener('click', () => desplegarTodas(false));
  for (const b of document.querySelectorAll('.filtro-vista [data-filtro]')) {
    b.addEventListener('click', () => aplicarFiltro(b.dataset.filtro));
  }
}

iniciar();
