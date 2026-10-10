/**
 * Wandelt die BKA-Rohdaten in data/raw/<jahrgang>/ in normalisierte Datasets unter data/processed/ um.
 *
 *   npm run etl -- --jahrgang 2024
 */
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import {
  partitionsDatei,
  type DataIndex,
  type Dataset,
  type DatasetPartition,
} from '@crime-stats/shared';
import { PROCESSED_DIR, rawYearDir } from './paths.js';
import { StraftatenKatalog } from './lib/straftaten.js';
import { parseZrBundFaelle } from './parsers/zr-bund-faelle.js';
import { parseZrTatverdaechtige } from './parsers/zr-tatverdaechtige.js';
import { parseZrOpfer } from './parsers/zr-opfer.js';
import { parseStraftatenkatalog } from './parsers/katalog-pdf.js';
import { parseDefinitionskatalog } from './parsers/definitionen-pdf.js';
import { parseSummenschluessel } from './parsers/summenschluessel-pdf.js';
import { ergaenzeErlaeuterungen } from './lib/erlaeuterungen.js';

/** Optionale Quelle: fehlt die Datei, wird nur gewarnt. */
async function optional<T>(
  dir: string,
  pattern: RegExp,
  parse: (file: string) => Promise<T>,
): Promise<T | undefined> {
  try {
    const file = await findFile(dir, pattern);
    console.log(`Lese ${path.relative(dir, file)}`);
    return await parse(file);
  } catch (err) {
    console.warn(`  übersprungen: ${(err as Error).message}`);
    return undefined;
  }
}

async function findFile(dir: string, pattern: RegExp): Promise<string> {
  const entries = await readdir(dir, { recursive: true });
  const hit = entries.find((e) => pattern.test(path.basename(e)));
  if (!hit) throw new Error(`Keine Datei passend zu ${pattern} unter ${dir}`);
  return path.join(dir, hit);
}

/** Alle passenden Dateien; dieselbe Datei kann unter mehreren Seiten-Ordnern liegen und zählt einmal. */
async function findFiles(dir: string, pattern: RegExp): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true });
  const byName = new Map<string, string>();
  for (const e of entries) {
    const name = path.basename(e);
    if (pattern.test(name) && !byName.has(name)) byName.set(name, path.join(dir, e));
  }
  if (!byName.size) throw new Error(`Keine Dateien passend zu ${pattern} unter ${dir}`);
  return [...byName.keys()].sort().map((n) => byName.get(n)!);
}

/**
 * Schreibt ein großes Dataset aufgeteilt nach Straftatenschlüssel: Metadaten in <id>.json,
 * Zeilen je Schlüssel in <id>/<schluessel>.json. Die App lädt nur die gewählten Delikte.
 */
async function schreibePartitionen(ds: Dataset) {
  const iKey = ds.meta.spalten.indexOf('schluessel');
  const teile = new Map<string, Dataset['zeilen']>();
  for (const z of ds.zeilen) {
    const k = z[iKey] as string;
    const liste = teile.get(k) ?? [];
    liste.push(z);
    teile.set(k, liste);
  }
  const verzeichnis = ds.meta.id;
  const ziel = path.join(PROCESSED_DIR, verzeichnis);
  await rm(ziel, { recursive: true, force: true }); // veraltete Partitionen entfernen
  await mkdir(ziel, { recursive: true });
  for (const [k, zeilen] of teile) {
    const teil: DatasetPartition = { zeilen };
    await writeFile(path.join(ziel, partitionsDatei(k)), JSON.stringify(teil));
  }
  ds.meta.partitionen = { nach: 'schluessel', verzeichnis, schluessel: [...teile.keys()] };
  await writeFile(
    path.join(PROCESSED_DIR, `${ds.meta.id}.json`),
    JSON.stringify({ meta: ds.meta, zeilen: [] }),
  );
}

/** Original-Download-URL aus der Inventur (falls vorhanden). */
async function sourceUrl(jahrgang: number, file: string): Promise<string | undefined> {
  try {
    const inv = JSON.parse(
      await readFile(path.join(rawYearDir(jahrgang), 'inventory.json'), 'utf-8'),
    );
    const name = path.basename(file);
    for (const [p, d] of Object.entries<{ url: string }>(inv.downloads)) {
      if (path.basename(decodeURIComponent(p)) === name) return d.url;
    }
  } catch {}
  return undefined;
}

const { values } = parseArgs({
  options: { jahrgang: { type: 'string', default: '2024' } },
});
const jahrgang = Number(values.jahrgang);
const raw = rawYearDir(jahrgang);

const katalog = new StraftatenKatalog();
const datasets: { ds: Dataset; partitioniert: boolean }[] = [];

const zrFaelle = await findFile(raw, /^T01-ZR-Bund-F(ä|ae)lle.*\.xlsx$/i);
console.log(`Lese ${path.relative(raw, zrFaelle)}`);
datasets.push({
  ds: await parseZrBundFaelle(zrFaelle, jahrgang, katalog, await sourceUrl(jahrgang, zrFaelle)),
  partitioniert: false,
});

console.log('Lese Tatverdächtige (ZR-TV, ZR-BZ T20/T40/T50)');
datasets.push({
  ds: await parseZrTatverdaechtige(
    await findFiles(raw, /^ZR-TV-0\d-T(20|40|50)-.*\.xlsx$/i),
    await findFiles(raw, /^ZR-BZ-0[1-3]-T(20|40|50)-.*\.xlsx$/i),
    jahrgang,
  ),
  partitioniert: true,
});

console.log('Lese Opfer (ZR-O, ZR-BZ T91)');
datasets.push({
  ds: await parseZrOpfer(
    await findFiles(raw, /^ZR-O-0[1-3]-T91-.*\.xlsx$/i),
    await findFiles(raw, /^ZR-BZ-0[4-6]-T91-.*\.xlsx$/i),
    jahrgang,
    katalog,
  ),
  partitioniert: true,
});

await mkdir(PROCESSED_DIR, { recursive: true });
const index: DataIndex = {
  jahrgang,
  datasets: [],
  straftaten: 'straftaten.json',
};

for (const { ds, partitioniert } of datasets) {
  const datei = `${ds.meta.id}.json`;
  if (partitioniert) await schreibePartitionen(ds);
  else await writeFile(path.join(PROCESSED_DIR, datei), JSON.stringify(ds));
  index.datasets.push({
    id: ds.meta.id,
    titel: ds.meta.titel,
    bereich: ds.meta.bereich,
    ebene: ds.meta.ebene,
    datei,
    jahre: ds.meta.jahre,
    kennzahlen: ds.meta.kennzahlen,
  });
  console.log(
    `  → ${datei}: ${ds.zeilen.length} Zeilen, ${ds.meta.jahre[0]}–${ds.meta.jahre.at(-1)}` +
      (partitioniert ? `, ${ds.meta.partitionen!.schluessel.length} Partitionen` : ''),
  );
}

const straftaten = katalog.build();
const erlaeutert = ergaenzeErlaeuterungen(straftaten, {
  jahrgang,
  katalog: await optional(raw, /^Straftatenkatalog\.pdf$/i, parseStraftatenkatalog),
  definitionen: await optional(raw, /Definitionskatalog\.pdf$/i, parseDefinitionskatalog),
  summen: await optional(raw, /^Uebersicht-Summenschluessel\.pdf$/i, parseSummenschluessel),
});
await writeFile(path.join(PROCESSED_DIR, index.straftaten), JSON.stringify(straftaten, null, 1));
await writeFile(path.join(PROCESSED_DIR, 'index.json'), JSON.stringify(index, null, 2));
console.log(
  `  → straftaten.json: ${straftaten.length} Schlüssel, davon ${erlaeutert} mit Erläuterung`,
);
