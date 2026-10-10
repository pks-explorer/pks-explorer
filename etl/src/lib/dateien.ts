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
