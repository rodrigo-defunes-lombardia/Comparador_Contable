import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aDia, aCentimos, diaDesdeComponentes, formatearFecha, formatearEuros, serieExcel } from '../js/valores.js';

const d = (dd, mm, aaaa) => diaDesdeComponentes(aaaa, mm, dd);

test('fechas: número de serie de Excel', () => {
  assert.equal(formatearFecha(aDia(46082)), '01/03/2026');
  assert.equal(aDia(46082.75), d(1, 3, 2026), 'la hora se descarta');
  assert.equal(aDia(serieExcel(d(15, 4, 2026))), d(15, 4, 2026));
  assert.equal(aDia(46082 - 1462, { fecha1904: true }), d(1, 3, 2026));
});

test('fechas: texto dd/mm/aaaa y variantes', () => {
  assert.equal(aDia('03/02/2026'), d(3, 2, 2026), 'día primero, no formato americano');
  assert.equal(aDia(' 3-2-26 '), d(3, 2, 2026));
  assert.equal(aDia('03.02.2026'), d(3, 2, 2026));
  assert.equal(aDia('2026-02-03'), d(3, 2, 2026));
  assert.equal(aDia('03/02/2026 10:15'), d(3, 2, 2026));
  assert.equal(aDia('31/02/2026'), null, 'fecha inexistente');
  assert.equal(aDia('Fecha'), null);
  assert.equal(aDia('Saldo'), null);
  assert.equal(aDia(''), null);
  assert.equal(aDia(null), null);
  assert.equal(aDia(12.5), null, 'número fuera de rango de años');
});

test('fechas: objetos Date sin desfase de zona horaria', () => {
  assert.equal(aDia(new Date(Date.UTC(2026, 2, 1))), d(1, 3, 2026));
  assert.equal(aDia(new Date(2026, 2, 1)), d(1, 3, 2026), 'medianoche local');
  assert.equal(aDia(new Date(2026, 2, 1, 23, 0)), d(2, 3, 2026), 'se redondea al día más cercano');
});

test('importes: números y texto en formato español', () => {
  assert.equal(aCentimos(1234.56), 123456);
  assert.equal(aCentimos(0.1 + 0.2), 30);
  assert.equal(aCentimos(1.005), 101);
  assert.equal(aCentimos('1.234,56'), 123456);
  assert.equal(aCentimos('1234,5'), 123450);
  assert.equal(aCentimos('12,30 €'), 1230);
  assert.equal(aCentimos('-45,00'), -4500);
  assert.equal(aCentimos('(45,00)'), -4500);
  assert.equal(aCentimos('45,00-'), -4500);
  assert.equal(aCentimos('1.234'), 123400, 'punto de miles');
  assert.equal(aCentimos('12.5'), 1250, 'punto decimal');
  assert.equal(aCentimos('1,234.56'), 123456, 'formato inglés');
  assert.equal(aCentimos('1.234.567,89'), 123456789);
  assert.equal(aCentimos(''), null);
  assert.equal(aCentimos('   '), null);
  assert.equal(aCentimos(null), null);
  assert.ok(Number.isNaN(aCentimos('abc')));
});

test('formato de euros', () => {
  assert.equal(formatearEuros(123456), '1.234,56 €');
  assert.equal(formatearEuros(-5), '−0,05 €');
  assert.equal(formatearEuros(1000, { signo: true }), '+10,00 €');
  assert.equal(formatearEuros(0), '0,00 €');
});
