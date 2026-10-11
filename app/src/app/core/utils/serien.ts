import type { DimensionDef, Hinweis } from '@crime-stats/shared';
import type { Filter } from '../models/dataset-view';
import type { Linie, Markierung, Vergleich } from '../models/serie';
import type { Rate } from '../models/bevoelkerung-index';

export const wertLabel = (d: DimensionDef, id: string) =>
  d.werte?.find((w) => w.id === id)?.label ?? id;

/**
 * Eine Linie je Delikt – oder beim Vergleich je Delikt und Vergleichswert. Bei nur einem Delikt
 * heißen die Linien nur wie der Vergleichswert ("Männlich"), sonst "Delikt · Männlich".
 */
export function linienBilden(
  delikte: readonly string[],
  filter: Filter,
  vergleich: Vergleich | undefined,
  name: (schluessel: string) => string,
): Linie[] {
  return delikte.flatMap((schluessel) => {
    if (!vergleich) return [{ id: schluessel, schluessel, label: name(schluessel), filter }];
    const { dim, werte } = vergleich;
    return werte.map((w) => ({
      id: `${schluessel}|${w}`,
      schluessel,
      label: delikte.length > 1 ? `${name(schluessel)} · ${wertLabel(dim, w)}` : wertLabel(dim, w),
      filter: { ...filter, [dim.id]: w },
    }));
  });
}

/**
 * Vergleichswerte: eigene Auswahl aus der URL (nur gültige Werte), sonst die Vorauswahl der Dimension,
 * sonst ihr Standardwert – dann wählt man weitere Werte selbst dazu.
 */
export function vergleichWerte(dim: DimensionDef, gewaehlt: readonly string[] | null): string[] {
  const gueltig = new Set(dim.werte?.map((w) => w.id));
  if (gewaehlt) return gewaehlt.filter((w) => gueltig.has(w));
  return dim.vergleich ?? (dim.standard ? [dim.standard] : []);
}

/** Bereich der Jahre (Indizes), in dem mindestens eine Reihe einen Wert hat; null = keine Werte. */
export function datenbereich(
  reihen: (number | null)[][],
  anzahl: number,
): { lo: number; hi: number } | null {
  const hatWert = (i: number) => reihen.some((r) => r[i] !== null && r[i] !== undefined);
  let lo = 0;
  while (lo < anzahl && !hatWert(lo)) lo++;
  if (lo === anzahl) return null;
  let hi = anzahl - 1;
  while (hi > lo && !hatWert(hi)) hi--;
  return { lo, hi };
}

/** Index mit erstem vorhandenem Wert im Zeitraum = 100. */
export function indexiere(werte: (number | null)[]): (number | null)[] {
  const basis = werte.find((v) => v !== null && v !== 0);
  if (basis === undefined || basis === null) return werte.map(() => null);
  return werte.map((v) => (v === null ? null : (v / basis) * 100));
}

/** Prozentuale Veränderung vom ersten zum letzten vorhandenen Wert. */
export function veraenderung(werte: (number | null)[]): number | null {
  const vorhanden = werte.filter((v): v is number => v !== null);
  const erster = vorhanden[0];
  const letzter = vorhanden.at(-1);
  if (vorhanden.length < 2 || !erster || letzter === undefined) return null;
  return ((letzter - erster) / erster) * 100;
}

export function relevanteHinweise(
  hinweise: Hinweis[],
  kennzahl: string,
  von: number,
  bis: number,
): Hinweis[] {
  return hinweise.filter((h) => {
    if (h.kennzahlen && !h.kennzahlen.includes(kennzahl)) return false;
    if (h.abJahr !== undefined && h.abJahr > bis) return false;
    if (h.bisJahr !== undefined && h.bisJahr < von) return false;
    return true;
  });
}

/**
 * Hinweise zu gewählten oder verglichenen Dimensionswerten, z. B. „Alter ‚Kinder‘: TVBZ nur 8 bis 13 Jahre“ –
 * nur, wenn sie für die Kennzahl gelten.
 */
export function wertHinweise(
  dimensionen: DimensionDef[],
  filter: Filter,
  vergleich: Vergleich | undefined,
  kennzahl: string,
): Hinweis[] {
  return dimensionen.flatMap((d) => {
    const ids = d === vergleich?.dim ? vergleich.werte : [filter[d.id]];
    return (d.werte ?? [])
      .filter((w) => ids.includes(w.id) && w.hinweis)
      .filter((w) => !w.hinweisKennzahlen || w.hinweisKennzahlen.includes(kennzahl))
      .map((w) => ({ text: `${d.label} „${w.label}“: ${w.hinweis}` }));
  });
}

/** Brüche, die innerhalb des gewählten Zeitraums liegen, als senkrechte Markierung. */
export function markierungen(hinweise: Hinweis[], von: number, bis: number): Markierung[] {
  return hinweise
    .filter(
      (h): h is Hinweis & { abJahr: number } =>
        !!h.bruch && h.abJahr !== undefined && h.abJahr > von && h.abJahr <= bis,
    )
    .map((h) => ({ jahr: h.abJahr, text: h.text }));
}

/**
 * Hinweise zu eigenen Raten je Einwohner: Berechnung, Bevölkerungsbruch 2014, fehlende Bezugsgrößen
 * (`luecken` = mindestens eine Linie ohne Werte) und Nichtdeutsche.
 */
export function rateHinweise(
  rate: Rate,
  filter: Filter,
  vergleich: Vergleich | undefined,
  luecken: boolean,
): Hinweis[] {
  const bezug = rate === 'je100k' ? 'je 100.000 Einwohner' : 'in % der Bevölkerung';
  const hinweise: Hinweis[] = [
    {
      text:
        `Eigene Berechnung: Anzahl ${bezug} (Bevölkerung am 31.12. des Vorjahres laut BKA, Quelle Statistisches ` +
        'Bundesamt). Die amtlichen Raten (Häufigkeitszahl, Belastungs- und Gefährdungszahlen) sind als Kennzahl ' +
        'wählbar und können abweichen.',
    },
    {
      text:
        'Bevölkerung ab 2014 auf Basis des Zensus 2011 – rund 1,3 Mio. Einwohner weniger als nach der alten ' +
        'Fortschreibung; Raten davor fallen dadurch etwas niedriger aus.',
      abJahr: 2014,
      bruch: true,
    },
  ];
  if (luecken) {
    hinweise.push({
      text:
        'Nicht für jede Gruppe gibt es Bevölkerungszahlen: nach Alter nur für Deutschland insgesamt, ' +
        'nach Staatsangehörigkeit nur für Deutschland und die Länder, Länder, Städte und Kreise erst ab 2019 (einzelne Städte nicht in jedem Jahr).',
    });
  }
  const staat =
    vergleich?.dim.id === 'staatsangehoerigkeit'
      ? vergleich.werte
      : [filter['staatsangehoerigkeit']];
  if (staat.includes('nichtdeutsch')) {
    hinweise.push({
      text:
        'Für Nichtdeutsche keine Rate: Unter den Tatverdächtigen sind auch Personen ohne Wohnsitz in Deutschland ' +
        '(z. B. Touristen, Durchreisende), die in der Bevölkerungszahl nicht enthalten sind.',
    });
  }
  return hinweise;
}
