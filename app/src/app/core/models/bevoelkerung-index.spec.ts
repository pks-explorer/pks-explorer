import type { Bevoelkerung } from '@crime-stats/shared';
import { BevoelkerungIndex } from './bevoelkerung-index';

const DATEN: Bevoelkerung = {
  spalten: ['jahr', 'region', 'geschlecht', 'staatsangehoerigkeit', 'alter', 'einwohner'],
  zeilen: [
    [2023, 'DE', 'insgesamt', 'insgesamt', 'insgesamt', 1_000_000],
    [2024, 'DE', 'insgesamt', 'insgesamt', 'insgesamt', 2_000_000],
    [2024, 'DE', 'weiblich', 'insgesamt', 'kinder', 50_000],
    [2024, 'DE', 'insgesamt', 'nichtdeutsch', 'insgesamt', 200_000],
    [2024, '01', 'insgesamt', 'insgesamt', 'insgesamt', 100_000],
  ],
  quellen: [],
};

describe('BevoelkerungIndex', () => {
  const b = new BevoelkerungIndex(DATEN);

  it('liest die Gruppe aus dem Filter, fehlende Dimensionen = insgesamt', () => {
    expect(b.fuer(2024, {})).toBe(2_000_000);
    expect(b.fuer(2024, { region: '01' })).toBe(100_000);
    expect(b.fuer(2024, { geschlecht: 'weiblich', alter: 'kinder' })).toBe(50_000);
  });

  it('liefert null ohne passende Zahl und für Nichtdeutsche', () => {
    expect(b.fuer(2024, { region: '01', alter: 'kinder' })).toBeNull();
    expect(b.fuer(2022, {})).toBeNull();
    expect(b.fuer(2024, { staatsangehoerigkeit: 'nichtdeutsch' })).toBeNull();
  });

  it('rechnet je 100.000 Einwohner und als Anteil in Prozent', () => {
    expect(b.rate([5_000, 5_000, null], [2023, 2024, 2024], {}, 'je100k')).toEqual([
      500,
      250,
      null,
    ]);
    const [fehlt, anteil] = b.rate([5_000, 1], [2022, 2024], {}, 'anteil');
    expect(fehlt).toBeNull();
    expect(anteil).toBeCloseTo(0.00005, 10);
  });
});
