// Genera los iconos PNG de la aplicación (sin dependencias: rasterizador y codificador PNG propios).
// Diseño neutro: dos columnas de apuntes comparadas y un círculo con un símbolo de verificación.
// Uso: node scripts/generar-iconos.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const AZUL = [10, 88, 168];
const BLANCO = [255, 255, 255];
const FILA = [178, 205, 235];
const VERDE = [29, 122, 60];

// ---------- Geometría (coordenadas normalizadas 0..1) ----------

function rectRedondeado(x, y, x0, y0, x1, y1, r) {
  const cx = Math.max(x0 + r, Math.min(x, x1 - r));
  const cy = Math.max(y0 + r, Math.min(y, y1 - r));
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r && x >= x0 && x <= x1 && y >= y0 && y <= y1;
}

function circulo(x, y, cx, cy, r) {
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function trazo(x, y, ax, ay, bx, by, ancho) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
  return (x - ax - t * dx) ** 2 + (y - ay - t * dy) ** 2 <= (ancho / 2) ** 2;
}

/**
 * Color de un punto. `escala` encoge el dibujo hacia el centro (para la zona segura de los
 * iconos maskable) y `fondoCompleto` pinta el fondo hasta los bordes.
 */
function colorEn(px, py, { escala, fondoCompleto }) {
  if (!fondoCompleto && !rectRedondeado(px, py, 0, 0, 1, 1, 0.2)) return null;
  const x = 0.5 + (px - 0.5) / escala;
  const y = 0.5 + (py - 0.5) / escala;

  // Círculo de verificación (encima de todo).
  if (circulo(x, y, 0.5, 0.66, 0.2)) {
    if (trazo(x, y, 0.405, 0.665, 0.475, 0.735, 0.06) || trazo(x, y, 0.475, 0.735, 0.605, 0.595, 0.06)) return BLANCO;
    return VERDE;
  }
  if (circulo(x, y, 0.5, 0.66, 0.235)) return AZUL; // separación entre círculo y columnas

  // Dos columnas con filas de apuntes.
  for (const x0 of [0.17, 0.55]) {
    const x1 = x0 + 0.28;
    if (rectRedondeado(x, y, x0, 0.16, x1, 0.8, 0.04)) {
      for (const fy of [0.24, 0.34, 0.44, 0.54, 0.64, 0.74]) {
        if (rectRedondeado(x, y, x0 + 0.05, fy - 0.022, x1 - 0.05, fy + 0.022, 0.02)) return FILA;
      }
      return BLANCO;
    }
  }
  return AZUL;
}

// ---------- Rasterizado con suavizado (4×4 muestras por píxel) ----------

function rasterizar(tam, opciones) {
  const M = 4;
  const datos = Buffer.alloc(tam * tam * 4);
  for (let j = 0; j < tam; j++) {
    for (let i = 0; i < tam; i++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sj = 0; sj < M; sj++) {
        for (let si = 0; si < M; si++) {
          const c = colorEn((i + (si + 0.5) / M) / tam, (j + (sj + 0.5) / M) / tam, opciones);
          if (c) { r += c[0]; g += c[1]; b += c[2]; a++; }
        }
      }
      const k = (j * tam + i) * 4;
      if (a) { datos[k] = Math.round(r / a); datos[k + 1] = Math.round(g / a); datos[k + 2] = Math.round(b / a); }
      datos[k + 3] = Math.round((a / (M * M)) * 255);
    }
  }
  return datos;
}

// ---------- Codificador PNG ----------

const TABLA_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = TABLA_CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function bloque(tipo, datos) {
  const largo = Buffer.alloc(4); largo.writeUInt32BE(datos.length);
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(cuerpo));
  return Buffer.concat([largo, cuerpo, crc]);
}
function png(tam, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(tam, 0); ihdr.writeUInt32BE(tam, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8 bits, RGBA
  const filas = Buffer.alloc((tam * 4 + 1) * tam);
  for (let j = 0; j < tam; j++) rgba.copy(filas, j * (tam * 4 + 1) + 1, j * tam * 4, (j + 1) * tam * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloque('IHDR', ihdr), bloque('IDAT', deflateSync(filas, { level: 9 })), bloque('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- Salida ----------

const carpeta = new URL('../img/', import.meta.url);
mkdirSync(carpeta, { recursive: true });
const ICONOS = [
  ['icono-192.png', 192, { escala: 1, fondoCompleto: false }],
  ['icono-512.png', 512, { escala: 1, fondoCompleto: false }],
  // Maskable: fondo hasta los bordes y dibujo dentro del 80 % central (zona segura).
  ['icono-maskable-512.png', 512, { escala: 0.78, fondoCompleto: true }],
  ['icono-maskable-192.png', 192, { escala: 0.78, fondoCompleto: true }],
  // Safari (Añadir al Dock / pantalla de inicio): sin transparencia.
  ['apple-touch-icon.png', 180, { escala: 0.9, fondoCompleto: true }],
];
for (const [nombre, tam, opciones] of ICONOS) {
  writeFileSync(new URL(nombre, carpeta), png(tam, rasterizar(tam, opciones)));
  console.log(`Creado img/${nombre}`);
}
