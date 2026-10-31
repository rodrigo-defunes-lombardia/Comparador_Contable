// Prepara la carpeta "publicar/" con solo los archivos de la web (los mismos que guarda el
// service worker) y el archivo _headers con las cabeceras de seguridad para Cloudflare Pages.
// Así no se publican los tests, los scripts, el README ni los Excel de ejemplo.
//
// Uso: node scripts/preparar-publicacion.mjs
// En Cloudflare Pages: comando de compilación = este mismo, carpeta de salida = publicar
import { readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = new URL('../', import.meta.url);
const destino = new URL('publicar/', raiz);

/** Lista ARCHIVOS de sw.js (la misma que comprueban los tests). */
export function archivosWeb() {
  const m = /const ARCHIVOS = (\[[\s\S]*?\]);/.exec(readFileSync(new URL('sw.js', raiz), 'utf8'));
  if (!m) throw new Error('No se encuentra la lista ARCHIVOS en sw.js');
  return [...JSON.parse(m[1]).filter((ruta) => ruta !== './'), 'sw.js'];
}

/** Content-Security-Policy de la etiqueta <meta> de index.html (una sola fuente para las dos). */
export function cspDeIndex() {
  const m = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(readFileSync(new URL('index.html', raiz), 'utf8'));
  if (!m) throw new Error('No se encuentra la Content-Security-Policy en index.html');
  return m[1];
}

/**
 * Cabeceras de Cloudflare Pages. La CSP solo se aplica a la página: si se aplicara también a sw.js,
 * su "connect-src 'none'" impediría al service worker descargar los archivos para usarlos sin conexión.
 * Por cabecera se puede añadir frame-ancestors (no funciona en <meta>): nadie puede incrustar la web.
 */
export function cabeceras() {
  const csp = `${cspDeIndex()}; frame-ancestors 'none'`;
  return `# Generado por scripts/preparar-publicacion.mjs. No editar a mano.
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  X-Frame-Options: DENY
  Cross-Origin-Opener-Policy: same-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()

/
  Content-Security-Policy: ${csp}

/index.html
  Content-Security-Policy: ${csp}

/sw.js
  Cache-Control: no-cache

/manifest.json
  Cache-Control: no-cache
`;
}

function preparar() {
  rmSync(destino, { recursive: true, force: true });
  const archivos = archivosWeb();
  for (const ruta of archivos) {
    const salida = new URL(ruta, destino);
    mkdirSync(dirname(fileURLToPath(salida)), { recursive: true });
    copyFileSync(new URL(ruta, raiz), salida);
  }
  writeFileSync(new URL('_headers', destino), cabeceras());
  console.log(`Carpeta publicar/ lista: ${archivos.length} archivos y _headers.`);
}

if (process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])) preparar();
