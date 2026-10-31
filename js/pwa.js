// Aplicación instalable: registro del service worker, aviso de versión nueva y botón "Instalar".

import { icono } from './iconos.js';

const UNA_HORA = 60 * 60 * 1000;

const $ = (sel) => document.querySelector(sel);

function estaInstalada() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function esSafariMac() {
  const ua = navigator.userAgent;
  return /Macintosh/.test(ua) && /Safari\//.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|Firefox|FxiOS/.test(ua);
}

// ---------- Botón "Instalar la aplicación" ----------

function iniciarInstalacion() {
  const boton = $('#boton-instalar');
  const notaSafari = $('#nota-safari');
  let peticion = null;

  const actualizar = () => {
    const instalada = estaInstalada();
    boton.hidden = instalada || !peticion;
    notaSafari.hidden = instalada || !esSafariMac();
  };

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // se muestra nuestro botón en lugar del aviso automático
    peticion = e;
    actualizar();
  });
  window.addEventListener('appinstalled', () => { peticion = null; actualizar(); });
  window.matchMedia('(display-mode: standalone)').addEventListener('change', actualizar);

  boton.addEventListener('click', async () => {
    if (!peticion) return;
    const p = peticion;
    peticion = null;
    p.prompt();
    await p.userChoice.catch(() => null);
    actualizar();
  });
  actualizar();
}

// ---------- Service worker y aviso de versión nueva ----------

function mostrarAvisoVersion(registro, hayTrabajo) {
  const aviso = $('#aviso-version');
  const contenido = document.createElement('div');
  contenido.className = 'aviso-version__caja';

  const texto = document.createElement('p');
  texto.append(icono('info'), document.createTextNode(' Hay una versión nueva.'));
  if (hayTrabajo()) {
    const nota = document.createElement('span');
    nota.className = 'aviso-version__nota';
    nota.textContent = 'Al actualizar se recargará la página y tendrás que volver a elegir los archivos. Puedes hacerlo cuando termines.';
    texto.append(nota);
  }

  const actualizar = document.createElement('button');
  actualizar.type = 'button';
  actualizar.className = 'boton boton--primario';
  actualizar.append(icono('reiniciar'), document.createTextNode('Actualizar'));
  actualizar.addEventListener('click', () => {
    actualizar.disabled = true;
    sessionStorageSeguro('comparador-actualizando', '1');
    if (registro.waiting) registro.waiting.postMessage('ACTUALIZAR');
    else window.location.reload();
  });

  const despues = document.createElement('button');
  despues.type = 'button';
  despues.className = 'boton boton--terciario';
  despues.textContent = 'Más tarde';
  despues.addEventListener('click', () => aviso.replaceChildren());

  const botones = document.createElement('div');
  botones.className = 'aviso-version__botones';
  botones.append(actualizar, despues);
  contenido.append(texto, botones);
  // La región (role="status") ya existe en la página, así que el lector de pantalla lo anuncia
  // sin mover el foco ni interrumpir lo que se esté haciendo.
  aviso.replaceChildren(contenido);
}

function sessionStorageSeguro(clave, valor) {
  try {
    if (valor === undefined) return sessionStorage.getItem(clave);
    if (valor === null) sessionStorage.removeItem(clave); else sessionStorage.setItem(clave, valor);
  } catch { /* sin almacenamiento */ }
  return null;
}

function pedirVersion() {
  const controlador = navigator.serviceWorker.controller;
  if (controlador) controlador.postMessage('VERSION');
}

async function registrarServiceWorker(hayTrabajo) {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;

  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data && e.data.version) $('#version').textContent = `Versión ${e.data.version}`;
  });

  let recargando = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Solo se recarga si la usuaria pulsó "Actualizar" (no en la primera instalación).
    if (recargando || !sessionStorageSeguro('comparador-actualizando')) { pedirVersion(); return; }
    recargando = true;
    sessionStorageSeguro('comparador-actualizando', null);
    window.location.reload();
  });

  let registro;
  try {
    registro = await navigator.serviceWorker.register('./sw.js', { scope: './' });
  } catch (e) {
    console.warn('No se ha podido activar el modo sin conexión.', e);
    return;
  }
  sessionStorageSeguro('comparador-actualizando', null);
  pedirVersion();

  const vigilar = (trabajador) => {
    trabajador.addEventListener('statechange', () => {
      if (trabajador.state === 'installed' && navigator.serviceWorker.controller) mostrarAvisoVersion(registro, hayTrabajo);
    });
  };
  if (registro.waiting && navigator.serviceWorker.controller) mostrarAvisoVersion(registro, hayTrabajo);
  if (registro.installing) vigilar(registro.installing);
  registro.addEventListener('updatefound', () => vigilar(registro.installing));

  // Si la web se queda abierta mucho tiempo, comprobar de vez en cuando si hay versión nueva.
  const comprobar = () => { if (navigator.onLine) registro.update().catch(() => {}); };
  setInterval(comprobar, UNA_HORA);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') comprobar(); });
}

/**
 * @param {object} opciones
 * @param {() => boolean} opciones.hayTrabajo  true si hay archivos cargados (para avisar antes de recargar)
 */
export function iniciarPWA({ hayTrabajo = () => false } = {}) {
  iniciarInstalacion();
  registrarServiceWorker(hayTrabajo);
}
