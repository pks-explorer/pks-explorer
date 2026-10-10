import type { Hinweis } from '@crime-stats/shared';
import { indexiere, markierungen, relevanteHinweise, veraenderung } from './serien';

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
