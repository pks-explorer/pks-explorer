import type { DimensionDef, Hinweis } from '@crime-stats/shared';
import type { Filter } from '../core/pks-data';

export interface Serie {
  /** Eindeutig je Linie, z. B. "892000" oder "892000|weiblich" beim Vergleich nach einer Dimension. */
  id: string;
  /** Straftatenschlüssel der Linie. */
  schluessel: string;
  label: string;
  farbe: string;
  /** Werte passend zu `jahre` (gleiche Länge); null = kein Wert. */
  werte: (number | null)[];
}

/** Eine anzuzeigende Linie, bevor Werte und Farbe feststehen. */
export interface Linie {
  id: string;
  schluessel: string;
  label: string;
  filter: Filter;
}

/** Markierung eines methodischen Bruchs im Diagramm. */
export interface Markierung {
  jahr: number;
  text: string;
}

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

/** Dimension, deren Werte als eigene Linien gezeigt werden, mit den gewählten Werten. */
export interface Vergleich {
  dim: DimensionDef;
  werte: readonly string[];
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
