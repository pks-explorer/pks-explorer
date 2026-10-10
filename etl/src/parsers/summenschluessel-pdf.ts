/**
 * Parser für "Übersicht Summenschlüssel": aus welchen Straftatenschlüsseln sich ein Summenschlüssel zusammensetzt
 * (z. B. 892000 Gewaltkriminalität = 010000 Mord + 020000 Totschlag + …).
 *
 * Aufbau (Jahrgang 2024): fette Überschrift je Summenschlüssel, darunter ein Einleitungssatz
 * ("Der Summenschlüssel "892000 …" umfasst …") und eine zweispaltige Liste Schlüssel | Bezeichnung.
 * Mehrzeilige Bezeichnungen sind vertikal um den Schlüssel verteilt.
 */
import { groupLines, joinWrapped, readPdfItems, type PdfItem } from '../lib/pdf.js';

export interface Summenschluessel {
  schluessel: string;
  titel: string;
  /** Einleitung und Hinweise, z. B. zur Sonderkennung Wirtschaftskriminalität. */
  text: string;
  umfasst: { schluessel: string; name: string; ohne?: boolean }[];
}

const KEY = /^([0-9*]{6}|(- ){5}-|-{6})$/;

export async function parseSummenschluessel(file: string): Promise<Summenschluessel[]> {
  const items = (await readPdfItems(file)).filter((i) => i.y > 40 && i.y < 790 && i.size < 18);
  const einleitung = items.find((i) => i.str.startsWith('Der Summenschlüssel'));
  if (!einleitung) throw new Error(`${file}: keine Summenschlüssel-Beschreibung gefunden`);
  const textX = einleitung.x;
  const textFont = einleitung.font;

  // Seiten 1–2 sind Titel und Inhaltsverzeichnis
  const lines = groupLines(items.filter((i) => i.page >= 3));
  const keyItems = items.filter((i) => i.page >= 3 && KEY.test(i.str.trim()) && i.x > textX + 10);
  const listKeyX = keyItems[0]?.x ?? textX + 25;

  // Blöcke: jede fette Zeile am linken Rand beginnt einen neuen Summenschlüssel
  const bloecke: { titel: string; start: PdfItem; zeilen: typeof lines }[] = [];
  for (const l of lines) {
    const istUeberschrift = Math.abs(l.x - textX) < 2 && l.items.every((i) => i.font !== textFont);
    if (istUeberschrift) bloecke.push({ titel: l.text, start: l.items[0]!, zeilen: [] });
    else bloecke.at(-1)?.zeilen.push(l);
  }

  const out: Summenschluessel[] = [];
  for (const b of bloecke) {
    const text = joinWrapped(b.zeilen.filter((l) => Math.abs(l.x - textX) < 2).map((l) => l.text));
    const m = /Summenschlüssel\s*[„"“]?\s*([0-9*]{6})/.exec(text);
    if (!m) continue;

    // Listeneinträge: Schlüssel in der linken Listenspalte, Bezeichnungszeilen rechts davon
    const listItems = b.zeilen.flatMap((l) => l.items).filter((i) => i.x > textX + 10);
    const keys = listItems.filter((i) => Math.abs(i.x - listKeyX) < 3 && KEY.test(i.str.trim()));
    const ohne = listItems.filter((i) => Math.abs(i.x - listKeyX) < 3 && i.str.trim() === 'ohne');
    const nameLines = groupLines(listItems.filter((i) => i.x > listKeyX + 20));
    const umfasst = keys.map((k) => {
      const teile = nameLines
        .filter((l) => l.page === k.page && Math.abs(l.y - k.y) < 12)
        .filter((l) =>
          keys.every(
            (o) => o === k || o.page !== l.page || Math.abs(o.y - l.y) >= Math.abs(k.y - l.y),
          ),
        );
      const schluessel = k.str.replace(/\s/g, '');
      return {
        schluessel,
        name: joinWrapped(teile.map((t) => t.text)),
        ...(ohne.some((o) => o.page === k.page && o.y > k.y && o.y - k.y < 25)
          ? { ohne: true }
          : {}),
      };
    });
    out.push({ schluessel: m[1]!, titel: b.titel, text, umfasst });
  }
  return out;
}
