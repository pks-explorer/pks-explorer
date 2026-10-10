/**
 * Parser für "Straftatenkatalog <jahr>.pdf": je Schlüssel amtliche Bezeichnung, Ebene, Merkmale und Änderungskennzeichen.
 *
 * Tabellenaufbau (Jahrgang 2024): Spalten Lfd.-Nr. | Änderung | Schaden | Opfer | Erfassungsschl. | Ebene | Schlüssel | Bezeichnung.
 * Die Spaltenköpfe sind gedreht; ihre x-Position bestimmt die Zuordnung. Mehrzeilige Bezeichnungen sind vertikal
 * um die Schlüsselzeile verteilt, daher wird jede Bezeichnungszeile dem nächstgelegenen Schlüssel zugeordnet.
 */
import { groupLines, joinWrapped, readPdfItems } from '../lib/pdf.js';

export interface KatalogEintrag {
  schluessel: string;
  name: string;
  ebene: number | null;
  aenderung: string | null;
  schaden: boolean;
  opfer: boolean;
  erfassungsschluessel: boolean;
}

export const AENDERUNG: Record<string, string> = {
  Ä: 'Inhaltliche Änderung gegenüber dem Vorjahr – Vergleich mit dem Vorjahr nicht möglich.',
  I: 'Inhaltliche Änderung gegenüber dem Vorjahr – Vergleich mit dem Vorjahr nur eingeschränkt möglich.',
  N: 'Neuer Straftatenschlüssel.',
  P: 'Geänderte Plausibilitätsregeln.',
  R: 'Redaktionelle Änderung (ohne Auswirkung auf die Vergleichbarkeit).',
};

const KEY = /^([0-9*]{6}|-{6})$/;
const KOPF: Record<string, keyof typeof SPALTEN_DEFAULT> = {
  Änderung: 'aenderung',
  Schaden: 'schaden',
  Opfer: 'opfer',
  'Erfassungsschl.: J/N': 'erfassung',
  Ebene: 'ebene',
};
const SPALTEN_DEFAULT = {
  aenderung: 0,
  schaden: 0,
  opfer: 0,
  erfassung: 0,
  ebene: 0,
};

export async function parseStraftatenkatalog(file: string): Promise<KatalogEintrag[]> {
  const items = await readPdfItems(file);

  // Spaltenpositionen aus den (gedrehten) Kopfzellen bestimmen
  const spalten = { ...SPALTEN_DEFAULT };
  for (const [label, id] of Object.entries(KOPF)) {
    const kopf = items.find((i) => i.str.trim() === label);
    if (!kopf) throw new Error(`${file}: Spaltenkopf "${label}" nicht gefunden`);
    spalten[id] = kopf.x;
  }
  const keyX = items.find((i) => KEY.test(i.str.trim()))?.x;
  if (keyX === undefined) throw new Error(`${file}: keine Schlüsselspalte gefunden`);
  const nameMinX = keyX + 30;
  const spalteVon = (x: number) => {
    let best: keyof typeof spalten | null = null;
    let dist = 8;
    for (const [id, sx] of Object.entries(spalten) as [keyof typeof spalten, number][]) {
      if (Math.abs(sx - x) < dist) [best, dist] = [id, Math.abs(sx - x)];
    }
    return best;
  };

  const eintraege: (KatalogEintrag & {
    page: number;
    y: number;
    nameTeile: { y: number; text: string }[];
  })[] = [];
  const gesehen = new Set<string>();
  // Abschnitt 1 enthält alle Schlüssel inkl. Summenschlüssel; spätere Wiederholungen (Abschnitt 2/3) ignorieren
  const keys = items.filter((i) => KEY.test(i.str.trim()) && Math.abs(i.x - keyX) < 5);
  for (const k of keys) {
    if (gesehen.has(k.str.trim())) continue;
    gesehen.add(k.str.trim());
    // Merkmale stehen bei mehrzeiligen Einträgen teils leicht versetzt: je Spalte den nächstgelegenen Wert nehmen
    const zeile = items.filter(
      (i) => i.page === k.page && Math.abs(i.y - k.y) < 8 && i.x < keyX - 2 && i.size > 9,
    );
    const wert = (id: keyof typeof spalten) =>
      zeile
        .filter((i) => spalteVon(i.x) === id)
        .sort((a, b) => Math.abs(a.y - k.y) - Math.abs(b.y - k.y))[0]
        ?.str.trim() ?? null;
    const ebene = wert('ebene');
    eintraege.push({
      schluessel: k.str.trim(),
      name: '',
      ebene: ebene && /^\d$/.test(ebene) ? Number(ebene) : null,
      aenderung: wert('aenderung'),
      schaden: wert('schaden') === 'S',
      opfer: wert('opfer') === 'O',
      erfassungsschluessel: wert('erfassung') === 'J',
      page: k.page,
      y: k.y,
      nameTeile: [],
    });
  }

  // Bezeichnungszeilen dem nächstgelegenen Schlüssel derselben Seite zuordnen
  const nameLines = groupLines(
    items.filter((i) => i.x >= nameMinX && i.size < 12 && i.y > 40 && i.y < 790),
  );
  for (const l of nameLines) {
    let best: (typeof eintraege)[number] | undefined;
    let dist = 16;
    for (const e of eintraege) {
      if (e.page !== l.page) continue;
      const d = Math.abs(e.y - l.y);
      if (d < dist) [best, dist] = [e, d];
    }
    best?.nameTeile.push({ y: l.y, text: l.text });
  }

  return eintraege.map(({ page, y, nameTeile, ...e }) => ({
    ...e,
    name: joinWrapped(nameTeile.sort((a, b) => b.y - a.y).map((t) => t.text)),
  }));
}

/** Direkte Unterschlüssel je Schlüssel, abgeleitet aus Reihenfolge und Ebene im Katalog. */
export function unterschluessel(liste: KatalogEintrag[]): Map<string, KatalogEintrag[]> {
  const out = new Map<string, KatalogEintrag[]>();
  liste.forEach((e, i) => {
    if (e.ebene === null) return;
    const kinder: KatalogEintrag[] = [];
    for (let j = i + 1; j < liste.length; j++) {
      const c = liste[j]!;
      if (c.ebene === null) continue;
      if (c.ebene <= e.ebene) break;
      if (c.ebene === e.ebene + 1) kinder.push(c);
    }
    if (kinder.length) out.set(e.schluessel, kinder);
  });
  return out;
}
