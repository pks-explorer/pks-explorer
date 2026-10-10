/**
 * Parser für "Anlage 3 – Definitionskatalog" der PKS-Richtlinien: kriminologische Begriffe mit Erläuterung
 * und zugeordneten Schlüsseln (z. B. "Schlüssel: 5181**", Platzhalter * für beliebige Ziffern).
 *
 * Aufbau (Jahrgang 2024): Begriffe als 14-pt-Überschrift, rechts daneben/darunter "Schlüssel: …",
 * darunter Fließtext; Quellenverweise wie "(41)" am rechten Rand werden verworfen.
 */
import type { Definition } from '@crime-stats/shared';
import { groupLines, joinWrapped, readPdfItems } from '../lib/pdf.js';

const ENDE = /^(Quellennachweis|Änderungsnachweis|Impressum)$/;

export async function parseDefinitionskatalog(file: string): Promise<Definition[]> {
  const items = await readPdfItems(file);
  const start = items.find((i) => i.str.trim() === 'Definitionen' && i.size >= 18);
  if (!start) throw new Error(`${file}: Abschnitt "Definitionen" nicht gefunden`);

  const body = items.filter(
    (i) =>
      (i.page > start.page || (i.page === start.page && i.y < start.y)) &&
      i.y > 40 &&
      i.y < 790 && // Kopf-/Fußzeilen
      !/^(\(\d+\)\s*)+$/.test(i.str.trim()) && // Quellenverweise
      !/^Tabelle \d+$/.test(i.str.trim()) && // Tabellenverweise am rechten Rand
      !(i.size < 9 && /^\d$/.test(i.str.trim())), // Hochzahlen (Definition steht in den Richtlinien)
  );
  const lines = groupLines(body);

  const defs: Definition[] = [];
  let cur: (Definition & { absatz: string[]; lastY: number; lastPage: number }) | null = null;
  const absatzEnde = () => {
    if (cur && cur.absatz.length) cur.text.push(joinWrapped(cur.absatz));
    if (cur) cur.absatz = [];
  };

  for (const l of lines) {
    const ueberschrift = l.items.every((i) => i.size >= 13);
    if (ueberschrift) {
      if (ENDE.test(l.text)) break;
      // zweite Zeile einer umbrochenen Überschrift
      if (
        cur &&
        !cur.schluessel.length &&
        !cur.text.length &&
        !cur.absatz.length &&
        cur.lastPage === l.page &&
        cur.lastY - l.y < 22
      ) {
        cur.titel = joinWrapped([cur.titel, l.text]);
        cur.lastY = l.y;
        continue;
      }
      absatzEnde();
      cur = {
        titel: l.text.replace(/\s*•\s*/g, ' '),
        schluessel: [],
        text: [],
        absatz: [],
        lastY: l.y,
        lastPage: l.page,
      };
      defs.push(cur);
      continue;
    }
    if (!cur) continue;
    const s = /^Schlüssel:\s*(.+)$/.exec(l.text);
    if (s && cur.text.length === 0 && cur.absatz.length === 0) {
      cur.schluessel.push(
        ...s[1]!
          .split(/[,;]\s*|\s+und\s+/)
          .map((k) => k.trim())
          .filter((k) => /^[0-9*]{6}$/.test(k)),
      );
      continue;
    }
    // Neuer Absatz bei größerem Zeilenabstand, Seitenwechsel oder Aufzählungspunkt
    if (l.page !== cur.lastPage || cur.lastY - l.y > 18 || l.text.startsWith('•')) absatzEnde();
    cur.absatz.push(l.text);
    cur.lastY = l.y;
    cur.lastPage = l.page;
  }
  absatzEnde();
  return defs.map(({ titel, schluessel, text }) => ({
    titel,
    schluessel,
    text,
  }));
}
