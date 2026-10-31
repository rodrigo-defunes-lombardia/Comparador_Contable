// Service worker: guarda la web completa en el ordenador para que funcione sin conexión.
// Estrategia: caché primero. Los archivos de Excel del usuario nunca pasan por aquí
// (se leen en el navegador y no se piden a ninguna red).
//
// PARA PUBLICAR UNA VERSIÓN NUEVA: cambia CACHE_VERSION. Si añades o renombras archivos de la web,
// actualiza también ARCHIVOS (los tests comprueban que la lista está completa).

const CACHE_VERSION = '2026-10-31.1';
const PREFIJO = 'comparador-';
const CACHE = `${PREFIJO}${CACHE_VERSION}`;

const ARCHIVOS = [
  "./",
  "index.html",
  "manifest.json",
  "css/estilos.css",
  "js/app.js",
  "js/concepto.js",
  "js/config.js",
  "js/ejemplo.js",
  "js/emparejado.js",
  "js/exportar.js",
  "js/filas.js",
  "js/iconos.js",
  "js/lector.js",
  "js/preferencias-inicio.js",
  "js/pwa.js",
  "js/resumen.js",
  "js/valores.js",
  "vendor/sheetjs/xlsx.mjs",
  "vendor/sheetjs/cpexcel.full.mjs",
  "img/icono.svg",
  "img/icono-192.png",
  "img/icono-512.png",
  "img/icono-maskable-192.png",
  "img/icono-maskable-512.png",
  "img/apple-touch-icon.png"
];

self.addEventListener('install', (evento) => {
  // cache: 'reload' evita copiar archivos antiguos de la caché HTTP del navegador.
  evento.waitUntil(caches.open(CACHE).then((cache) =>
    cache.addAll(ARCHIVOS.map((ruta) => new Request(ruta, { cache: 'reload' })))));
  // No se activa sola: espera a que la usuaria pulse "Actualizar" (mensaje ACTUALIZAR).
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil((async () => {
    const nombres = await caches.keys();
    await Promise.all(nombres.filter((n) => n.startsWith(PREFIJO) && n !== CACHE).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (evento) => {
  if (evento.data === 'ACTUALIZAR') self.skipWaiting();
  if (evento.data === 'VERSION' && evento.source) evento.source.postMessage({ version: CACHE_VERSION });
});

self.addEventListener('fetch', (evento) => {
  const peticion = evento.request;
  if (peticion.method !== 'GET' || new URL(peticion.url).origin !== self.location.origin) return;

  evento.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const navegacion = peticion.mode === 'navigate';
    // Abrir la web (con o sin "index.html", con o sin parámetros): la página principal guardada.
    if (navegacion && new URL(peticion.url).pathname.endsWith('/')) {
      const pagina = await cache.match('index.html');
      if (pagina) return pagina;
    }
    const guardada = await cache.match(peticion, { ignoreSearch: true });
    if (guardada) return guardada;
    try {
      return await fetch(peticion);
    } catch {
      // Sin conexión y fuera de lo guardado: en una navegación se muestra la web igualmente.
      const pagina = navegacion && await cache.match('index.html');
      return pagina || Response.error();
    }
  })());
});
