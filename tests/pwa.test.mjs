import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const raiz = new URL('../', import.meta.url);
const leer = (ruta) => readFileSync(new URL(ruta, raiz), 'utf8');

function archivosPrecache() {
  const m = /const ARCHIVOS = (\[[\s\S]*?\]);/.exec(leer('sw.js'));
  assert.ok(m, 'sw.js debe definir const ARCHIVOS = [...]');
  return JSON.parse(m[1]);
}

test('service worker: tiene versión de caché explícita', () => {
  assert.match(leer('sw.js'), /const CACHE_VERSION = '[^']+';/);
});

test('service worker: todos los archivos de la lista existen', () => {
  for (const ruta of archivosPrecache()) {
    if (ruta === './') continue;
    assert.ok(existsSync(new URL(ruta, raiz)), `no existe ${ruta}`);
  }
});

test('service worker: precachea toda la web (HTML, CSS, JS, iconos y SheetJS)', () => {
  const lista = new Set(archivosPrecache());
  const deCarpeta = (carpeta, filtro) => readdirSync(new URL(carpeta, raiz)).filter(filtro).map((f) => `${carpeta}${f}`);
  const necesarios = [
    'index.html', 'manifest.json',
    ...deCarpeta('css/', (f) => f.endsWith('.css')),
    ...deCarpeta('js/', (f) => f.endsWith('.js')),
    ...deCarpeta('img/', (f) => /\.(png|svg)$/.test(f)),
    ...deCarpeta('vendor/sheetjs/', (f) => f.endsWith('.mjs')),
  ];
  for (const ruta of necesarios) assert.ok(lista.has(ruta), `falta ${ruta} en ARCHIVOS de sw.js`);
});

test('manifest: rutas relativas, idioma y iconos 192, 512 y maskable', () => {
  const m = JSON.parse(leer('manifest.json'));
  assert.equal(m.lang, 'es');
  assert.equal(m.display, 'standalone');
  assert.equal(m.start_url, './');
  assert.equal(m.scope, './');
  assert.ok(m.name && m.short_name && m.theme_color && m.background_color);
  const tamano = (ruta) => { const b = readFileSync(new URL(ruta, raiz)); return `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`; };
  for (const icono of m.icons) assert.equal(tamano(icono.src), icono.sizes, icono.src);
  assert.ok(m.icons.some((i) => i.sizes === '192x192' && i.purpose === 'any'));
  assert.ok(m.icons.some((i) => i.sizes === '512x512' && i.purpose === 'any'));
  assert.ok(m.icons.some((i) => i.purpose === 'maskable'));
});

test('index.html: enlaza el manifest y la CSP permite manifest y service worker', () => {
  const html = leer('index.html');
  assert.match(html, /<link rel="manifest" href="manifest.json">/);
  assert.match(html, /manifest-src 'self'/);
  assert.match(html, /worker-src 'self'/);
  assert.match(html, /connect-src 'none'/);
  assert.doesNotMatch(html, /https?:\/\/(?!localhost)/, 'sin recursos externos');
});

test('publicación: _headers con la misma CSP que index.html, pero no aplicada a sw.js', async () => {
  const { cabeceras, cspDeIndex, archivosWeb } = await import('../scripts/preparar-publicacion.mjs');
  const texto = cabeceras();
  assert.ok(texto.includes(`Content-Security-Policy: ${cspDeIndex()}; frame-ancestors 'none'`));
  const bloques = texto.split(/\n(?=\S)/);
  const bloqueSw = bloques.find((b) => b.startsWith('/sw.js'));
  assert.ok(bloqueSw && !/Content-Security-Policy/.test(bloqueSw));
  assert.ok(!bloques.find((b) => b.startsWith('/*')).includes('Content-Security-Policy'), 'la CSP no puede ir en /* (bloquearía al service worker)');
  const archivos = archivosWeb();
  assert.ok(archivos.includes('sw.js') && archivos.includes('index.html'));
  assert.ok(!archivos.some((a) => /^(tests|scripts|ejemplos)\/|README|package\.json/.test(a)));
});
