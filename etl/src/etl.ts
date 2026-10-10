/**
 * Wandelt die BKA-Rohdaten in data/raw/<jahrgang>/ in normalisierte Datasets unter data/processed/ um.
 *
 *   npm run etl -- --jahrgang 2024
 */
import path from 'node:path';
import { parseArgs } from 'node:util';
import { PROCESSED_DIR, rawYearDir } from './paths.js';
import { Ausgabe } from './lib/ausgabe.js';
import { downloadUrl, findeDatei, findeDateien } from './lib/dateien.js';
import { ergaenzeErlaeuterungen } from './lib/erlaeuterungen.js';
import { StraftatenKatalog } from './lib/straftaten.js';
import { parseDefinitionskatalog } from './parsers/definitionen-pdf.js';
import { parseStraftatenkatalog } from './parsers/katalog-pdf.js';
import { parseSummenschluessel } from './parsers/summenschluessel-pdf.js';
import { parseZrBundFaelle } from './parsers/zr-bund-faelle.js';
import { parseZrOpfer } from './parsers/zr-opfer.js';
import { parseZrTatverdaechtige } from './parsers/zr-tatverdaechtige.js';

const { values } = parseArgs({ options: { jahrgang: { type: 'string', default: '2024' } } });
const jahrgang = Number(values.jahrgang);
const raw = rawYearDir(jahrgang);

/** Optionale Quelle: fehlt die Datei oder scheitert das Lesen, wird nur gewarnt. */
async function optional<T>(
  muster: RegExp,
  parse: (datei: string) => Promise<T>,
): Promise<T | undefined> {
  try {
    const datei = await findeDatei(raw, muster);
    console.log(`Lese ${path.relative(raw, datei)}`);
    return await parse(datei);
  } catch (err) {
    console.warn(`  übersprungen: ${(err as Error).message}`);
    return undefined;
  }
}

const katalog = new StraftatenKatalog();
const ausgabe = new Ausgabe(PROCESSED_DIR, jahrgang);

// Fälle zuerst: Sie bestimmen die Bezeichnungen im Straftatenkatalog.
const faelle = await findeDatei(raw, /^T01-ZR-Bund-F(ä|ae)lle.*\.xlsx$/i);
console.log(`Lese ${path.relative(raw, faelle)}`);
await ausgabe.dataset(
  await parseZrBundFaelle(faelle, jahrgang, katalog, await downloadUrl(raw, faelle)),
);

console.log('Lese Tatverdächtige (ZR-TV, ZR-BZ T20/T40/T50)');
await ausgabe.dataset(
  await parseZrTatverdaechtige(
    await findeDateien(raw, /^ZR-TV-0\d-T(20|40|50)-.*\.xlsx$/i),
    await findeDateien(raw, /^ZR-BZ-0[1-3]-T(20|40|50)-.*\.xlsx$/i),
    jahrgang,
  ),
  { partitioniert: true },
);

console.log('Lese Opfer (ZR-O, ZR-BZ T91)');
await ausgabe.dataset(
  await parseZrOpfer(
    await findeDateien(raw, /^ZR-O-0[1-3]-T91-.*\.xlsx$/i),
    await findeDateien(raw, /^ZR-BZ-0[4-6]-T91-.*\.xlsx$/i),
    jahrgang,
    katalog,
  ),
  { partitioniert: true },
);

const straftaten = katalog.build();
const erlaeutert = ergaenzeErlaeuterungen(straftaten, {
  jahrgang,
  katalog: await optional(/^Straftatenkatalog\.pdf$/i, parseStraftatenkatalog),
  definitionen: await optional(/Definitionskatalog\.pdf$/i, parseDefinitionskatalog),
  summen: await optional(/^Uebersicht-Summenschluessel\.pdf$/i, parseSummenschluessel),
});
await ausgabe.abschliessen(straftaten);
console.log(
  `  → straftaten.json: ${straftaten.length} Schlüssel, davon ${erlaeutert} mit Erläuterung`,
);
