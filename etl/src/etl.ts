/**
 * Wandelt die BKA-Rohdaten in data/raw/<jahrgang>/ in normalisierte Datasets unter data/processed/ um.
 *
 *   npm run etl -- --jahrgang 2024
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import type { DataIndex, Dataset } from '@crime-stats/shared';
import { PROCESSED_DIR, rawYearDir } from './paths.js';
import { StraftatenKatalog } from './lib/straftaten.js';
import { parseZrBundFaelle } from './parsers/zr-bund-faelle.js';

async function findFile(dir: string, pattern: RegExp): Promise<string> {
  const entries = await readdir(dir, { recursive: true });
  const hit = entries.find((e) => pattern.test(path.basename(e)));
  if (!hit) throw new Error(`Keine Datei passend zu ${pattern} unter ${dir}`);
  return path.join(dir, hit);
}

/** Original-Download-URL aus der Inventur (falls vorhanden). */
async function sourceUrl(jahrgang: number, file: string): Promise<string | undefined> {
  try {
    const inv = JSON.parse(await readFile(path.join(rawYearDir(jahrgang), 'inventory.json'), 'utf-8'));
    const name = path.basename(file);
    for (const [p, d] of Object.entries<{ url: string }>(inv.downloads)) {
      if (path.basename(decodeURIComponent(p)) === name) return d.url;
    }
  } catch {}
  return undefined;
}

const { values } = parseArgs({ options: { jahrgang: { type: 'string', default: '2024' } } });
const jahrgang = Number(values.jahrgang);
const raw = rawYearDir(jahrgang);

const katalog = new StraftatenKatalog();
const datasets: Dataset[] = [];

const zrFaelle = await findFile(raw, /^T01-ZR-Bund-F(ä|ae)lle.*\.xlsx$/i);
console.log(`Lese ${path.relative(raw, zrFaelle)}`);
datasets.push(await parseZrBundFaelle(zrFaelle, jahrgang, katalog, await sourceUrl(jahrgang, zrFaelle)));

await mkdir(PROCESSED_DIR, { recursive: true });
const index: DataIndex = { erstellt: new Date().toISOString(), datasets: [], straftaten: 'straftaten.json' };

for (const ds of datasets) {
  const datei = `${ds.meta.id}.json`;
  await writeFile(path.join(PROCESSED_DIR, datei), JSON.stringify(ds));
  index.datasets.push({ id: ds.meta.id, titel: ds.meta.titel, ebene: ds.meta.ebene, datei, jahre: ds.meta.jahre, kennzahlen: ds.meta.kennzahlen });
  console.log(`  → ${datei}: ${ds.zeilen.length} Zeilen, ${ds.meta.jahre[0]}–${ds.meta.jahre.at(-1)}`);
}

const straftaten = katalog.build();
await writeFile(path.join(PROCESSED_DIR, index.straftaten), JSON.stringify(straftaten, null, 1));
await writeFile(path.join(PROCESSED_DIR, 'index.json'), JSON.stringify(index, null, 2));
console.log(`  → straftaten.json: ${straftaten.length} Schlüssel`);
