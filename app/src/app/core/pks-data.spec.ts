import type { DatasetMeta, Zelle } from '@crime-stats/shared';
import { DatasetView, type SpaltenLeser } from './pks-data';

/** Kleines Dataset: Schlüssel "A" mit zwei Jahren × zwei Geschlechtern, Altersgruppe als Spalten-Dimension. */
const META: DatasetMeta = {
  id: 'test',
  titel: 'Test',
  bereich: 'Test',
  ebene: 'bund',
  quelle: { jahrgang: 2024, datei: 'test.xlsx' },
  dimensionen: [
    { id: 'jahr', label: 'Jahr' },
    { id: 'region', label: 'Region' },
    { id: 'schluessel', label: 'Schlüssel' },
    {
      id: 'geschlecht',
      label: 'Geschlecht',
      standard: 'insgesamt',
      werte: [
        { id: 'insgesamt', label: 'Alle' },
        { id: 'weiblich', label: 'Weiblich' },
      ],
    },
    {
      id: 'alter',
      label: 'Alter',
      inSpalte: true,
      standard: 'insgesamt',
      werte: [
        { id: 'insgesamt', label: 'Alle' },
        { id: 'kinder', label: 'Kinder' },
      ],
    },
  ],
  kennzahlen: [{ id: 'tv', label: 'TV', einheit: 'anzahl' }],
  spalten: ['jahr', 'region', 'schluessel', 'geschlecht', 'tv|insgesamt', 'tv|kinder'],
  jahre: [2023, 2024],
  hinweise: [],
  parquet: { datei: 'test.parquet', bytes: 0, zeilen: { A: [0, 4] } },
};

const DATEN: Record<string, Zelle[]> = {
  jahr: [2023, 2023, 2024, 2024],
  region: ['DE', 'DE', 'DE', 'DE'],
  schluessel: ['A', 'A', 'A', 'A'],
  geschlecht: ['insgesamt', 'weiblich', 'insgesamt', 'weiblich'],
  'tv|insgesamt': [100, 40, 110, 45],
  'tv|kinder': [10, 4, 12, 5],
};

function leserMitProtokoll() {
  const anfragen: string[][] = [];
  const lesen: SpaltenLeser = async ([von, bis], spalten) => {
    anfragen.push([...spalten]);
    return Object.fromEntries(spalten.map((s) => [s, DATEN[s]!.slice(von, bis)]));
  };
  return { lesen, anfragen };
}

describe('DatasetView', () => {
  it('liefert nach dem Laden die gefilterte Zeitreihe', async () => {
    const { lesen } = leserMitProtokoll();
    const ds = new DatasetView(META, lesen);
    const spalte = ds.wertSpalte('tv', { alter: 'kinder' });
    expect(spalte).toBe('tv|kinder');
    await ds.laden(['A'], [spalte]);
    expect([...ds.zeitreihe('A', 'tv', { alter: 'kinder', geschlecht: 'weiblich' })]).toEqual([
      [2023, 4],
      [2024, 5],
    ]);
  });

  it('lädt nur fehlende Spalten nach und gleichzeitige Anfragen nur einmal', async () => {
    const { lesen, anfragen } = leserMitProtokoll();
    const ds = new DatasetView(META, lesen);
    await Promise.all([ds.laden(['A'], ['tv|insgesamt']), ds.laden(['A'], ['tv|insgesamt'])]);
    await ds.laden(['A'], ['tv|insgesamt', 'tv|kinder']);
    expect(anfragen).toEqual([['jahr', 'geschlecht', 'tv|insgesamt'], ['tv|kinder']]);
  });

  it('liefert eine leere Reihe für ungeladene Spalten und unbekannte Schlüssel', async () => {
    const { lesen } = leserMitProtokoll();
    const ds = new DatasetView(META, lesen);
    expect(ds.zeitreihe('A', 'tv').size).toBe(0);
    expect(ds.hatSchluessel('B')).toBe(false);
    await ds.laden(['B'], ['tv|insgesamt']);
    expect(ds.zeitreihe('B', 'tv').size).toBe(0);
  });

  it('versucht es nach einem Lesefehler erneut', async () => {
    let fehlschlagen = true;
    const lesen: SpaltenLeser = async ([von, bis], spalten) => {
      if (fehlschlagen) throw new Error('Netzwerk');
      return Object.fromEntries(spalten.map((s) => [s, DATEN[s]!.slice(von, bis)]));
    };
    const ds = new DatasetView(META, lesen);
    await expect(ds.laden(['A'], ['tv|insgesamt'])).rejects.toThrow('Netzwerk');
    fehlschlagen = false;
    await ds.laden(['A'], ['tv|insgesamt']);
    expect(ds.zeitreihe('A', 'tv').get(2024)).toBe(110);
  });
});
