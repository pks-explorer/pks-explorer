import { SCHLUESSEL_INSGESAMT, type Straftat } from '@crime-stats/shared';
import { normalizeText } from './xlsx.js';

/** Bezeichnung bereinigen: Leerraum und Tabellen-Füllwörter ("darunter:", "davon:", "und zwar") entfernen. */
export function cleanName(raw: string): string {
  return normalizeText(raw)
    .replace(/\s*(darunter|davon|und zwar)\s*:?\s*$/i, '')
    .replace(/\s*:\s*$/, '');
}

/** Summenschlüssel: Platzhalter (Diebstahl), 89xxxx (Standard) und 9xxxxx (BKA-intern, z. B. Drogenarten). */
export const isSummenschluessel = (k: string) => k.includes('*') || /^(89|9)/.test(k);

/** "011000" → "011", "000000" → "0" */
const significant = (k: string) => k.replace(/0+$/, '') || '0';

/** Platzhalter-Schlüssel `a` deckt `b` ab, wenn jede Stelle gleich oder in `a` ein "*" ist. */
const covers = (a: string, b: string) => a !== b && [...a].every((c, i) => c === '*' || c === b[i]);
const stars = (k: string) => [...k].filter((c) => c === '*').length;
const leadingFixed = (k: string) => (k.search(/\*/) === -1 ? k.length : k.search(/\*/));

/** Spezifischster Platzhalter-Schlüssel (z. B. 4***00), der `k` abdeckt. */
function coveringWildcard(k: string, all: Set<string>): string | undefined {
  const cands = [...all].filter((c) => c.includes('*') && covers(c, k));
  cands.sort((a, b) => stars(a) - stars(b) || leadingFixed(b) - leadingFixed(a));
  return cands[0];
}

function findParent(k: string, all: Set<string>): string | null {
  if (k === SCHLUESSEL_INSGESAMT) return null;
  // Platzhalter-Schlüssel bilden die Diebstahls-Hierarchie (****00 = Diebstahl insgesamt)
  if (k.includes('*')) return coveringWildcard(k, all) ?? SCHLUESSEL_INSGESAMT;
  // Diebstahl (3…/4…): Die Stellen kodieren Ort und Gegenstand, ein Präfix ist keine Unterordnung
  // (300100 "Kraftwagen" gehört zu 3**100, nicht zu 300000 "sonstiger einfacher Diebstahl").
  if (/^[34]/.test(k)) {
    const platzhalter = coveringWildcard(k, all);
    if (platzhalter) return platzhalter;
  }

  // reguläre Schlüssel (und 89er-Summenschlüssel untereinander): längster existierender Präfix
  const sig = significant(k);
  const summe = isSummenschluessel(k);
  for (let len = sig.length - 1; len >= 1; len--) {
    const parent = sig.slice(0, len).padEnd(6, '0');
    if (parent !== k && all.has(parent) && isSummenschluessel(parent) === summe) return parent;
  }
  if (summe) return null; // 89er-Gruppen stehen außerhalb der regulären Hierarchie
  return SCHLUESSEL_INSGESAMT;
}

/** Sammelt Bezeichnungen je Schlüssel und Jahr und erzeugt daraus den Straftatenkatalog. */
export class StraftatenKatalog {
  private names = new Map<string, Map<number, string>>();
  private order: string[] = [];

  add(schluessel: string, jahr: number, rawName: string) {
    let m = this.names.get(schluessel);
    if (!m) {
      m = new Map();
      this.names.set(schluessel, m);
      this.order.push(schluessel);
    }
    m.set(jahr, cleanName(rawName));
  }

  private ergaenzt = new Set<string>();

  /**
   * Bezeichnung aus einer weiteren Tabelle übernehmen – nur für Schlüssel, die die Haupttabelle (Fälle)
   * nicht kennt. Bekannte Schlüssel behalten ihre Bezeichnungen (z. B. heißt "------" in den
   * Opfertabellen "Straftaten insgesamt (Opferdelikte)").
   */
  ergaenze(schluessel: string, jahr: number, rawName: string) {
    if (this.names.has(schluessel) && !this.ergaenzt.has(schluessel)) return;
    this.ergaenzt.add(schluessel);
    this.add(schluessel, jahr, rawName);
  }

  build(): Straftat[] {
    const all = new Set(this.order);
    return this.order.map((schluessel) => {
      const byYear = [...this.names.get(schluessel)!].sort(([a], [b]) => a - b);
      const verlauf: NonNullable<Straftat['namensverlauf']> = [];
      for (const [jahr, name] of byYear) {
        const last = verlauf.at(-1);
        if (last && last.name === name) last.bisJahr = jahr;
        else verlauf.push({ vonJahr: jahr, bisJahr: jahr, name });
      }
      return {
        schluessel,
        name: verlauf.at(-1)!.name,
        parent: findParent(schluessel, all),
        summenschluessel: isSummenschluessel(schluessel),
        ...(verlauf.length > 1 ? { namensverlauf: verlauf } : {}),
      };
    });
  }
}
