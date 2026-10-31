// Lectura de archivos .xlsx, .xls y .csv en el navegador (o en Node, para los tests).
// Un único lector para los dos archivos: devuelve los movimientos y el periodo leído.

import * as XLSX from '../vendor/sheetjs/xlsx.mjs';
import * as cptable from '../vendor/sheetjs/cpexcel.full.mjs';
import { filasAMovimientos, ErrorLectura } from './filas.js';
import { MAX_BYTES } from './config.js';

XLSX.set_cptable(cptable);

export { ErrorLectura };

/** Decodifica texto en UTF-8 y, si no es válido, en Windows-1252 (habitual en CSV de bancos). */
export function decodificarTexto(bytes) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

/** Parser de CSV con comillas. Detecta el separador (; , o tabulador). Devuelve texto sin convertir. */
export function parsearCSV(texto) {
  const muestra = texto.split(/\r?\n/).filter((l) => l.trim() !== '').slice(0, 20).join('\n');
  const contar = (sep) => {
    let n = 0, comillas = false;
    for (const ch of muestra) {
      if (ch === '"') comillas = !comillas;
      else if (ch === sep && !comillas) n++;
    }
    return n;
  };
  const sep = [';', '\t', ','].reduce((a, b) => (contar(b) > contar(a) ? b : a));

  const filas = [];
  let fila = [], celda = '', comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (comillas) {
      if (ch === '"') {
        if (texto[i + 1] === '"') { celda += '"'; i++; } else comillas = false;
      } else celda += ch;
    } else if (ch === '"') comillas = true;
    else if (ch === sep) { fila.push(celda); celda = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && texto[i + 1] === '\n') i++;
      fila.push(celda); filas.push(fila); fila = []; celda = '';
    } else celda += ch;
  }
  if (celda !== '' || fila.length) { fila.push(celda); filas.push(fila); }
  return filas.map((f) => f.map((c) => (c.trim() === '' ? null : c.trim())));
}

function extension(nombre) {
  const m = /\.([a-z0-9]+)$/i.exec(nombre || '');
  return m ? m[1].toLowerCase() : '';
}

/**
 * Lee los bytes de un archivo y devuelve el resultado de `filasAMovimientos`
 * más el nombre de la hoja usada. Si el libro tiene varias hojas, usa la que más movimientos tenga.
 */
export function leerBytes(bytes, nombre, origen) {
  const ext = extension(nombre);
  if (!['xlsx', 'xls', 'csv', 'xlsm', 'txt'].includes(ext)) {
    throw new ErrorLectura(`El archivo «${nombre}» no es un Excel ni un CSV. Elige un archivo terminado en .xlsx, .xls o .csv.`);
  }
  if (bytes.byteLength === 0) throw new ErrorLectura(`El archivo «${nombre}» está vacío. Vuelve a exportarlo desde la aplicación o el banco.`);
  if (bytes.byteLength > MAX_BYTES) throw new ErrorLectura(`El archivo «${nombre}» es demasiado grande. Comprueba que es el archivo correcto.`);

  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const pareceZipOOle = (u8[0] === 0x50 && u8[1] === 0x4b) || (u8[0] === 0xd0 && u8[1] === 0xcf);

  if ((ext === 'csv' || ext === 'txt') && !pareceZipOOle) {
    return { ...filasAMovimientos(parsearCSV(decodificarTexto(u8)), { origen }), hoja: null };
  }

  let libro;
  try {
    // raw: no interpretar textos como fechas/números con formato americano; cellDates: false
    // para recibir las fechas como número de serie (sin zona horaria).
    libro = XLSX.read(u8, { type: 'array', cellDates: false, raw: true, cellHTML: false, cellFormula: false });
  } catch (e) {
    const cifrado = /password|encrypt/i.test(String(e && e.message));
    throw new ErrorLectura(cifrado
      ? `El archivo «${nombre}» está protegido con contraseña. Ábrelo en Excel, quita la contraseña y guárdalo de nuevo.`
      : `No se ha podido abrir «${nombre}». Puede estar dañado o no ser un Excel. Prueba a abrirlo en Excel y guardarlo como .xlsx.`);
  }

  const fecha1904 = Boolean(libro.Workbook && libro.Workbook.WBProps && libro.Workbook.WBProps.date1904);
  let mejor = null, primerError = null;
  for (const nombreHoja of libro.SheetNames) {
    const hoja = libro.Sheets[nombreHoja];
    const filas = XLSX.utils.sheet_to_json(hoja, { header: 1, raw: true, defval: null, blankrows: true });
    try {
      const r = filasAMovimientos(filas, { origen, fecha1904 });
      if (!mejor || r.movimientos.length > mejor.movimientos.length) mejor = { ...r, hoja: nombreHoja };
    } catch (e) {
      if (!(e instanceof ErrorLectura)) throw e;
      primerError = primerError || e;
    }
  }
  if (!mejor) throw primerError || new ErrorLectura(`El archivo «${nombre}» no tiene hojas con datos.`);
  return mejor;
}

/** Lee un objeto File del navegador. */
export async function leerArchivo(archivo, origen) {
  let bytes;
  try {
    bytes = await archivo.arrayBuffer();
  } catch {
    throw new ErrorLectura(`No se ha podido leer «${archivo.name}». Si está abierto en Excel, ciérralo y vuelve a intentarlo.`);
  }
  return leerBytes(bytes, archivo.name, origen);
}
