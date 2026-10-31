// Genera los dos Excel ficticios de /ejemplos (unas 200 filas cada uno).
// Uso: node scripts/generar-ejemplos.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import * as XLSX from '../vendor/sheetjs/xlsx.mjs';
import { generarHojas } from '../js/ejemplo.js';

const FORMATO_EUROS = '#,##0.00 "€"';
const carpeta = new URL('../ejemplos/', import.meta.url);
mkdirSync(carpeta, { recursive: true });

const hojas = generarHojas();
for (const [nombre, filas] of Object.entries(hojas)) {
  const ws = XLSX.utils.aoa_to_sheet(filas);
  // Formato de fecha y de euros en las celdas de datos, como en un Excel real.
  const rango = XLSX.utils.decode_range(ws['!ref']);
  for (let r = rango.s.r; r <= rango.e.r; r++) {
    const fecha = ws[XLSX.utils.encode_cell({ r, c: 0 })];
    if (fecha && fecha.t === 'n') fecha.z = 'dd/mm/yyyy';
    for (const c of [2, 3]) {
      const celda = ws[XLSX.utils.encode_cell({ r, c })];
      if (celda && celda.t === 'n') celda.z = FORMATO_EUROS;
    }
  }
  ws['!cols'] = [{ wch: 14 }, { wch: 40 }, { wch: 14 }, { wch: 14 }];
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, ws, 'Movimientos');
  const archivo = new URL(`${nombre}_ejemplo.xlsx`, carpeta);
  writeFileSync(archivo, XLSX.write(libro, { type: 'buffer', bookType: 'xlsx', compression: true }));
  console.log(`Creado ejemplos/${nombre}_ejemplo.xlsx (${filas.length} filas)`);
}
