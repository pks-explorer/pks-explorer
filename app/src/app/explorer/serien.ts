import type { Hinweis } from '@crime-stats/shared';

export interface Serie {
  schluessel: string;
  label: string;
  farbe: string;
  /** Werte passend zu `jahre` (gleiche Länge); null = kein Wert. */
  werte: (number | null)[];
}

/** Markierung eines methodischen Bruchs im Diagramm. */
export interface Markierung {
  jahr: number;
  text: string;
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

/** Brüche, die innerhalb des gewählten Zeitraums liegen, als senkrechte Markierung. */
export function markierungen(hinweise: Hinweis[], von: number, bis: number): Markierung[] {
  return hinweise
    .filter(
      (h): h is Hinweis & { abJahr: number } =>
        !!h.bruch && h.abJahr !== undefined && h.abJahr > von && h.abJahr <= bis,
    )
    .map((h) => ({ jahr: h.abJahr, text: h.text }));
}
