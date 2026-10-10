import path from 'node:path';
import { normalizeText, readWorkbook, rowValues } from './xlsx.js';

export type Zeile = (string | number | null)[];

export interface BkaTabelle {
  datei: string;
  /** Version laut Tabelle, z. B. "V1.1 erstellt am: 23.04.2025". */
  stand?: string;
  /** Zusammengesetzter Spaltenkopf je Spalte, Teile mit " | " getrennt, z. B. "Kinder | 6 bis unter 8 | Anzahl". */
  kopf: string[];
  /** Alle Zeilen nach der Spaltennummerierung (inkl. Fußnoten – der Aufrufer filtert). */
  zeilen: Zeile[];
  /** Index der einzigen Spalte, deren Kopf auf das Muster passt; sonst Fehler. */
  spalte(muster: RegExp): number;
  /** Wie `spalte`, aber `undefined`, wenn es die Spalte nicht gibt (mehrdeutig bleibt ein Fehler). */
  spalteOptional(muster: RegExp): number | undefined;
}

const istEins = (v: string | number | null | undefined) => v === 1 || v === '1';

/**
 * Liest das erste Blatt einer BKA-Tabelle. Aufbau aller PKS-Tabellen: Titelzeilen, dann ein mehrzeiliger
 * Spaltenkopf ab der Zeile mit "Schlüssel", dann eine Zeile mit der Spaltennummerierung 1, 2, 3 …,
 * danach die Daten.
 */
export async function readBkaTabelle(file: string): Promise<BkaTabelle> {
  const ws = (await readWorkbook(file)).worksheets[0];
  const datei = path.basename(file);
  if (!ws) throw new Error(`${datei}: kein Tabellenblatt`);

  let kopfStart = 0;
  for (let r = 1; r <= 30 && !kopfStart; r++)
    if (rowValues(ws, r, 1)[0] === 'Schlüssel') kopfStart = r;
  if (!kopfStart) throw new Error(`${datei}: Spaltenkopf "Schlüssel" nicht gefunden`);
  let nummern = kopfStart;
  while (!istEins(rowValues(ws, nummern, 1)[0])) {
    if (++nummern > kopfStart + 12) throw new Error(`${datei}: Spaltennummerierung nicht gefunden`);
  }

  const breite = ws.columnCount;
  const kopfZeilen = Array.from({ length: nummern - kopfStart }, (_, i) =>
    rowValues(ws, kopfStart + i, breite),
  );
  const kopf = Array.from({ length: breite }, (_, c) => {
    const teile: string[] = [];
    for (const z of kopfZeilen) {
      const v = z[c];
      if (v === null || v === undefined) continue;
      const t = normalizeText(String(v));
      if (!teile.includes(t)) teile.push(t);
    }
    return teile.join(' | ');
  });

  const stand = Array.from({ length: kopfStart - 1 }, (_, i) => rowValues(ws, i + 1, 1)[0])
    .map((v) => (typeof v === 'string' ? v : ''))
    .find((v) => /erstellt am/i.test(v));

  const zeilen: Zeile[] = [];
  for (let r = nummern + 1; r <= ws.rowCount; r++) zeilen.push(rowValues(ws, r, breite));

  const spalteOptional = (muster: RegExp) => {
    const treffer = kopf.flatMap((k, i) => (muster.test(k) ? [i] : []));
    if (treffer.length > 1) {
      throw new Error(`${datei}: Spalte ${muster} mehrdeutig (Köpfe: ${kopf.join(' / ')})`);
    }
    return treffer[0];
  };

  return {
    datei,
    stand,
    kopf,
    zeilen,
    spalteOptional,
    spalte(muster: RegExp) {
      const i = spalteOptional(muster);
      if (i === undefined) {
        throw new Error(`${datei}: Spalte ${muster} nicht gefunden (Köpfe: ${kopf.join(' / ')})`);
      }
      return i;
    },
  };
}

/**
 * Schlüssel als Text. Manche Tabellen speichern Schlüssel als Zahl: führende Nullen fehlen dann
 * (10000 statt "010000"), und Platzhalter-Schlüssel wie "3**100" hat Excel als 3E+100 gelesen.
 */
export function normalisiereSchluessel(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') {
    const exp = /^(\d)e\+(\d{3})$/.exec(String(v));
    if (exp) return `${exp[1]}**${exp[2]}`;
    return Number.isInteger(v) && v >= 0 ? String(v).padStart(6, '0') : String(v);
  }
  return v.trim();
}
