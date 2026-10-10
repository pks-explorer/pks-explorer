import {
  normalisiereSchluessel,
  readBkaTabelle,
  type BkaTabelle,
  type Zeile,
} from './bka-tabelle.js';

export interface ZeitreihenZeile {
  schluessel: string;
  name: string;
  jahr: number;
  /** Bevölkerungsbasis bei doppelten Jahren, z. B. "Z11" / "Z22" in "2024 Z22". */
  zensus?: string;
  werte: Zeile;
}

export interface ZeitreihenTabelle extends Omit<BkaTabelle, 'zeilen'> {
  zeilen: ZeitreihenZeile[];
}

/** "2024 Z22" → { jahr: 2024, zensus: "Z22" } */
export function parseJahr(
  v: string | number | null | undefined,
): { jahr: number; zensus?: string } | null {
  if (typeof v === 'number') return Number.isInteger(v) ? { jahr: v } : null;
  const m = typeof v === 'string' ? /^(\d{4})(?:\s+(Z\d{2}))?$/.exec(v.trim()) : null;
  return m ? { jahr: Number(m[1]), zensus: m[2] } : null;
}

/** Liest eine BKA-Zeitreihentabelle (Spalten Schlüssel | Straftat | Jahr | Werte…). */
export async function readZeitreihe(file: string): Promise<ZeitreihenTabelle> {
  const t = await readBkaTabelle(file);
  const zeilen: ZeitreihenZeile[] = [];
  for (const v of t.zeilen) {
    const schluessel = normalisiereSchluessel(v[0]);
    const j = parseJahr(v[2]);
    if (!schluessel || !j) continue; // Fußnoten, Leerzeilen
    zeilen.push({ schluessel, name: String(v[1] ?? ''), jahr: j.jahr, zensus: j.zensus, werte: v });
  }
  return { ...t, zeilen };
}
