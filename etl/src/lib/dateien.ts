/** Suche nach BKA-Rohdateien unter data/raw/<jahrgang>/. */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Alle passenden Dateien, sortiert nach Name. Dieselbe Datei kann unter mehreren
 * Seiten-Ordnern liegen (auf mehreren BKA-Seiten verlinkt) und zählt nur einmal.
 */
export async function findeDateien(dir: string, muster: RegExp): Promise<string[]> {
  const byName = new Map<string, string>();
  for (const e of await readdir(dir, { recursive: true })) {
    const name = path.basename(e);
    if (muster.test(name) && !byName.has(name)) byName.set(name, path.join(dir, e));
  }
  if (!byName.size) throw new Error(`Keine Dateien passend zu ${muster} unter ${dir}`);
  return [...byName.keys()].sort().map((n) => byName.get(n)!);
}

export async function findeDatei(dir: string, muster: RegExp): Promise<string> {
  return (await findeDateien(dir, muster))[0]!;
}

/** Original-Download-URL laut inventory.json des Jahrgangs (falls vorhanden). */
export async function downloadUrl(rawDir: string, datei: string): Promise<string | undefined> {
  try {
    const inv = JSON.parse(await readFile(path.join(rawDir, 'inventory.json'), 'utf-8'));
    const name = path.basename(datei);
    for (const [p, d] of Object.entries<{ url: string }>(inv.downloads)) {
      if (path.basename(decodeURIComponent(p)) === name) return d.url;
    }
  } catch {
    // keine Inventur vorhanden – URL ist optional
  }
  return undefined;
}

/** Wie `findeDatei`, aber `undefined`, wenn es keine passende Datei gibt. */
export async function findeDateiOptional(dir: string, muster: RegExp): Promise<string | undefined> {
  try {
    return await findeDatei(dir, muster);
  } catch {
    return undefined;
  }
}

/** PKS-Jahrgänge, für die Rohdaten vorliegen (Ordner data/raw/<jahr>), aufsteigend. */
export async function vorhandeneJahrgaenge(rawRoot: string): Promise<number[]> {
  const eintraege = await readdir(rawRoot, { withFileTypes: true });
  return eintraege
    .filter((e) => e.isDirectory() && /^\d{4}$/.test(e.name))
    .map((e) => Number(e.name))
    .sort((a, b) => a - b);
}

/** Wie `findeDateien`, aber eine leere Liste, wenn es keine passende Datei gibt. */
export async function findeDateienOptional(dir: string, muster: RegExp): Promise<string[]> {
  try {
    return await findeDateien(dir, muster);
  } catch {
    return [];
  }
}
