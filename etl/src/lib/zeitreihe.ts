import path from 'node:path';
import { normalizeText, readWorkbook, rowValues } from './xlsx.js';

export interface ZeitreihenZeile {
  schluessel: string;
  name: string;
  jahr: number;
  /** Bevölkerungsbasis bei doppelten Jahren, z. B. "Z11" / "Z22" in "2024 Z22". */
  zensus?: string;
  werte: (string | number | null)[];
}

export interface ZeitreihenTabelle {
  datei: string;
  stand?: string;
  /** Zusammengesetzter Spaltenkopf je Spalte, Teile mit " | " getrennt, z. B. "Kinder | 6 bis unter 8 | Anzahl". */
  kopf: string[];
  zeilen: ZeitreihenZeile[];
  /** Index der einzigen Spalte, deren Kopf auf das Muster passt; sonst Fehler. */
  spalte(muster: RegExp): number;
}

/**
 * Schlüssel als Text. Manche Tabellen speichern Schlüssel als Zahl: führende Nullen fehlen dann
 * (10000 statt "010000"), und Platzhalter-Schlüssel wie "3**100" hat Excel als 3E+100 gelesen.
 */
export function normalisiereSchluessel(v: string | number | null): string {
  if (v === null) return '';
  if (typeof v === 'number') {
    const exp = /^(\d)e\+(\d{3})$/.exec(String(v));
    if (exp) return `${exp[1]}**${exp[2]}`;
    return Number.isInteger(v) && v >= 0 ? String(v).padStart(6, '0') : String(v);
  }
  return v.trim();
}

/** "2024 Z22" → { jahr: 2024, zensus: "Z22" } */
export function parseJahr(v: string | number | null): { jahr: number; zensus?: string } | null {
  if (typeof v === 'number') return Number.isInteger(v) ? { jahr: v } : null;
  const m = typeof v === 'string' ? /^(\d{4})(?:\s+(Z\d{2}))?$/.exec(v.trim()) : null;
  return m ? { jahr: Number(m[1]), zensus: m[2] } : null;
}

/**
 * Liest eine BKA-Zeitreihentabelle (Spalten Schlüssel | Straftat | Jahr | Werte…). Der mehrzeilige
 * Spaltenkopf steht zwischen der Zeile mit "Schlüssel" und der Zeile mit der Spaltennummerierung 1, 2, 3 ….
 */
export async function readZeitreihe(file: string): Promise<ZeitreihenTabelle> {
  const ws = (await readWorkbook(file)).worksheets[0];
  const name = path.basename(file);
  if (!ws) throw new Error(`${name}: kein Tabellenblatt`);

  let kopfStart = 0;
  for (let r = 1; r <= 30 && !kopfStart; r++)
    if (rowValues(ws, r, 1)[0] === 'Schlüssel') kopfStart = r;
  if (!kopfStart) throw new Error(`${name}: Spaltenkopf "Schlüssel" nicht gefunden`);
  let nummern = kopfStart;
  while (rowValues(ws, nummern, 1)[0] !== 1) {
    if (++nummern > kopfStart + 12) throw new Error(`${name}: Spaltennummerierung nicht gefunden`);
  }

  const spalten = ws.columnCount;
  const kopfZeilen = Array.from({ length: nummern - kopfStart }, (_, i) =>
    rowValues(ws, kopfStart + i, spalten),
  );
  const kopf = Array.from({ length: spalten }, (_, c) => {
    const teile: string[] = [];
    for (const z of kopfZeilen) {
      const v = z[c];
      if (v === null) continue;
      const t = normalizeText(String(v));
      if (!teile.includes(t)) teile.push(t);
    }
    return teile.join(' | ');
  });

  const stand = Array.from({ length: kopfStart - 1 }, (_, i) => rowValues(ws, i + 1, 1)[0])
    .map((v) => (typeof v === 'string' ? v : ''))
    .find((v) => /erstellt am/i.test(v));

  const zeilen: ZeitreihenZeile[] = [];
  for (let r = nummern + 1; r <= ws.rowCount; r++) {
    const v = rowValues(ws, r, spalten);
    const schluessel = normalisiereSchluessel(v[0] ?? null);
    const j = parseJahr(v[2] ?? null);
    if (!schluessel || !j) continue; // Fußnoten, Leerzeilen
    zeilen.push({ schluessel, name: String(v[1] ?? ''), jahr: j.jahr, zensus: j.zensus, werte: v });
  }

  return {
    datei: name,
    stand,
    kopf,
    zeilen,
    spalte(muster: RegExp) {
      const treffer = kopf.flatMap((k, i) => (muster.test(k) ? [i] : []));
      if (treffer.length !== 1) {
        throw new Error(
          `${name}: Spalte ${muster} ${treffer.length ? 'mehrdeutig' : 'nicht gefunden'} (Köpfe: ${kopf.slice(3).join(' / ')})`,
        );
      }
      return treffer[0]!;
    },
  };
}
