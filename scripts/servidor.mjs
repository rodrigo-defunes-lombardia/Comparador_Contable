// Servidor estático mínimo para probar la web en local (sin dependencias).
// Uso: node scripts/servidor.mjs [puerto] [carpeta]   → http://localhost:8080
// (carpeta: por defecto la del proyecto; "publicar" para probar lo que se va a publicar)
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PUERTO = Number(process.argv[2] || process.env.PORT || 8080);
const RAIZ = resolve(fileURLToPath(new URL('..', import.meta.url)), process.argv[3] || '.');
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.md': 'text/plain; charset=utf-8',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.png': 'image/png', '.ico': 'image/x-icon',
};

createServer(async (req, res) => {
  try {
    const ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let archivo = normalize(join(RAIZ, ruta));
    if (!archivo.startsWith(RAIZ)) { res.writeHead(403).end(); return; }
    // Como Cloudflare Pages: ".../index.html" redirige a ".../", para probar en local lo mismo que en la web.
    if (ruta.endsWith('/index.html')) { res.writeHead(308, { Location: ruta.slice(0, -'index.html'.length) }).end(); return; }
    if ((await stat(archivo).catch(() => null))?.isDirectory()) archivo = join(archivo, 'index.html');
    const datos = await readFile(archivo);
    res.writeHead(200, { 'Content-Type': TIPOS[extname(archivo).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(datos);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('No encontrado');
  }
}).listen(PUERTO, '127.0.0.1', () => console.log(`Comparador en http://localhost:${PUERTO}`));
