import type { DimensionDef, Hinweis } from '@crime-stats/shared';
import {
  datenbereich,
  indexiere,
  linienBilden,
  markierungen,
  relevanteHinweise,
  veraenderung,
  wertHinweise,
} from './serien';

const GESCHLECHT: DimensionDef = {
  id: 'geschlecht',
  label: 'Geschlecht',
  standard: 'insgesamt',
  vergleich: ['maennlich', 'weiblich'],
  werte: [
    { id: 'insgesamt', label: 'Alle' },
    { id: 'maennlich', label: 'Männlich' },
    { id: 'weiblich', label: 'Weiblich' },
  ],
};
const ALTER: DimensionDef = {
  id: 'alter',
  label: 'Alter',
  standard: 'insgesamt',
  werte: [
    {
      id: 'insgesamt',
      label: 'Alle',
      hinweis: 'TVBZ ohne Kinder unter 8.',
      hinweisKennzahlen: ['tvbz'],
    },
    { id: 'kinder', label: 'Kinder' },
  ],
};

describe('linienBilden', () => {
  const name = (k: string) => `Delikt ${k}`;

  it('eine Linie je Delikt ohne Vergleich', () => {
    const l = linienBilden(['a', 'b'], { geschlecht: 'weiblich' }, undefined, name);
    expect(l.map((x) => [x.id, x.label, x.filter['geschlecht']])).toEqual([
      ['a', 'Delikt a', 'weiblich'],
      ['b', 'Delikt b', 'weiblich'],
    ]);
  });

  it('beim Vergleich eine Linie je Vergleichswert, bei einem Delikt nur mit Wertname', () => {
    const l = linienBilden(['a'], { geschlecht: 'insgesamt' }, GESCHLECHT, name);
    expect(l.map((x) => [x.id, x.label, x.filter['geschlecht']])).toEqual([
      ['a|maennlich', 'Männlich', 'maennlich'],
      ['a|weiblich', 'Weiblich', 'weiblich'],
    ]);
    expect(linienBilden(['a', 'b'], {}, GESCHLECHT, name)[3]!.label).toBe('Delikt b · Weiblich');
  });
});

describe('datenbereich', () => {
  it('schneidet Jahre ohne Werte am Rand ab', () => {
    expect(datenbereich([[null, null, 1, null, 2, null]], 6)).toEqual({ lo: 2, hi: 4 });
    expect(
      datenbereich(
        [
          [null, 5],
          [3, null],
        ],
        2,
      ),
    ).toEqual({ lo: 0, hi: 1 });
  });
  it('ist null ohne jeden Wert', () => {
    expect(datenbereich([[null, null]], 2)).toBeNull();
    expect(datenbereich([], 3)).toBeNull();
  });
});

describe('wertHinweise', () => {
  it('zeigt Hinweise zu gewählten Werten nur für die passenden Kennzahlen', () => {
    expect(wertHinweise([ALTER], { alter: 'insgesamt' }, undefined, 'tvbz')).toHaveLength(1);
    expect(wertHinweise([ALTER], { alter: 'insgesamt' }, undefined, 'tv')).toHaveLength(0);
    expect(wertHinweise([ALTER], { alter: 'kinder' }, undefined, 'tvbz')).toHaveLength(0);
  });
});

describe('indexiere', () => {
  it('setzt den ersten vorhandenen Wert auf 100', () => {
    expect(indexiere([null, 200, 300, null, 100])).toEqual([null, 100, 150, null, 50]);
  });
  it('liefert nur null ohne gültige Basis', () => {
    expect(indexiere([null, 0, 0])).toEqual([null, null, null]);
  });
});

describe('veraenderung', () => {
  it('rechnet vom ersten zum letzten vorhandenen Wert', () => {
    expect(veraenderung([null, 200, 250, null])).toBe(25);
  });
  it('ist null bei weniger als zwei Werten', () => {
    expect(veraenderung([null, 5, null])).toBeNull();
  });
});

describe('Hinweise', () => {
  const hinweise: Hinweis[] = [
    { text: 'TV-Zählung', kennzahlen: ['tv'], abJahr: 2009, bruch: true },
    { text: 'Neue Länder', bisJahr: 1992, abJahr: 1993, bruch: true },
    { text: 'Allgemein' },
  ];

  it('filtert nach Kennzahl und Zeitraum', () => {
    expect(relevanteHinweise(hinweise, 'faelle', 1993, 2024).map((h) => h.text)).toEqual([
      'Allgemein',
    ]);
    expect(relevanteHinweise(hinweise, 'tv', 2000, 2024).map((h) => h.text)).toEqual([
      'TV-Zählung',
      'Allgemein',
    ]);
    expect(relevanteHinweise(hinweise, 'faelle', 1987, 2024).map((h) => h.text)).toEqual([
      'Neue Länder',
      'Allgemein',
    ]);
  });

  it('markiert nur Brüche innerhalb des Zeitraums', () => {
    expect(markierungen(hinweise, 2000, 2024)).toEqual([{ jahr: 2009, text: 'TV-Zählung' }]);
    expect(markierungen(hinweise, 2009, 2024)).toEqual([]); // Bruch am Startjahr ist kein Bruch im Diagramm
  });
});
