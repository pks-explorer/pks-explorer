/**
 * Wandelt die BKA-Rohdaten in data/raw/<jahrgang>/ in normalisierte Datasets unter data/processed/ um.
 * Länder, Städte und Kreise kommen aus den Jahrgangstabellen aller Jahrgänge unter data/raw/.
 *
 *   npm run etl -- --jahrgang 2024
 */
import path from 'node:path';
import { parseArgs } from 'node:util';
import type { Dataset } from '@crime-stats/shared';
import { PROCESSED_DIR, RAW_DIR, rawYearDir } from './paths.js';
import { Ausgabe } from './lib/ausgabe.js';
import {
  downloadUrl,
  findeDatei,
  findeDateien,
  findeDateienOptional,
  vorhandeneJahrgaenge,
} from './lib/dateien.js';
import { ergaenzeErlaeuterungen } from './lib/erlaeuterungen.js';
import { fuegeRegionenHinzu, type RegionEbene, type RegionalTeil } from './lib/regionen.js';
import { StraftatenKatalog } from './lib/straftaten.js';
import { parseDefinitionskatalog } from './parsers/definitionen-pdf.js';
import { parseStraftatenkatalog } from './parsers/katalog-pdf.js';
import { HINWEISE_REGIONALE_FAELLE, parseRegionaleFaelle } from './parsers/regionale-faelle.js';
import { parseRegionaleOpfer } from './parsers/regionale-opfer.js';
import { parseRegionaleTatverdaechtige } from './parsers/regionale-tatverdaechtige.js';
import { parseSummenschluessel } from './parsers/summenschluessel-pdf.js';
import { parseZrBundFaelle } from './parsers/zr-bund-faelle.js';
import { parseZrOpfer } from './parsers/zr-opfer.js';
import { parseZrTatverdaechtige } from './parsers/zr-tatverdaechtige.js';

const { values } = parseArgs({ options: { jahrgang: { type: 'string', default: '2024' } } });
const jahrgang = Number(values.jahrgang);
const raw = rawYearDir(jahrgang);
const jahrgaenge = (await vorhandeneJahrgaenge(RAW_DIR)).filter((j) => j <= jahrgang);

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

type RegionalParser = (
  datei: string,
  ebene: RegionEbene,
  o: { jahr: number; spalten: string[] },
) => Promise<RegionalTeil>;

/**
 * Liest die Jahrgangstabellen je Ebene für alle vorhandenen Jahrgänge – mit allen Schlüsseln, auch
 * feineren Unterschlüsseln, die es in der Bundes-Zeitreihe nicht gibt. Deren Bezeichnungen kommen
 * in den Straftatenkatalog.
 */
async function regionaleTeile(
  ds: Dataset,
  dateien: { ebene: RegionEbene; muster: RegExp }[],
  parse: RegionalParser,
): Promise<RegionalTeil[]> {
  const teile: RegionalTeil[] = [];
  for (const jahr of jahrgaenge) {
    for (const { ebene, muster } of dateien) {
      for (const datei of await findeDateienOptional(rawYearDir(jahr), muster)) {
        const teil = await parse(datei, ebene, { jahr, spalten: ds.meta.spalten });
        for (const [schluessel, name] of teil.namen) katalog.ergaenze(schluessel, jahr, name);
        teile.push(teil);
      }
    }
  }
  return teile;
}

const katalog = new StraftatenKatalog();
const ausgabe = new Ausgabe(PROCESSED_DIR, jahrgang);

// Fälle zuerst: Sie bestimmen die Bezeichnungen im Straftatenkatalog.
const faelle = await findeDatei(raw, /^T01-ZR-Bund-F(ä|ae)lle.*\.xlsx$/i);
console.log(`Lese ${path.relative(raw, faelle)}`);
const faelleDs = await parseZrBundFaelle(faelle, jahrgang, katalog, await downloadUrl(raw, faelle));
console.log('Lese Fälle je Land, Stadt und Kreis (LA-F-02, ST-F-01, KR-F-01)');
const faelleRegional = await regionaleTeile(
  faelleDs,
  [
    { ebene: 'laender', muster: /^LA-F-02-T01-Laender-Faelle-HZ.*\.xlsx$/i },
    { ebene: 'staedte', muster: /^ST-F-01-T01-Staedte-Faelle-HZ.*\.xlsx$/i },
    { ebene: 'kreise', muster: /^KR-F-01-T01-Kreise-Faelle-HZ.*\.xlsx$/i },
  ],
  parseRegionaleFaelle,
);
fuegeRegionenHinzu(faelleDs, faelleRegional, {
  kontrollSpalte: 'faelle',
  hinweise: HINWEISE_REGIONALE_FAELLE,
});
await ausgabe.dataset(faelleDs);

console.log('Lese Tatverdächtige (ZR-TV, ZR-BZ T20/T40/T50)');
const tvDs = await parseZrTatverdaechtige(
  await findeDateien(raw, /^ZR-TV-0\d-T(20|40|50)-.*\.xlsx$/i),
  await findeDateien(raw, /^ZR-BZ-0[1-3]-T(20|40|50)-.*\.xlsx$/i),
  jahrgang,
);
console.log('Lese Tatverdächtige je Land und Stadt (LA-TV, ST-TV T20/T40/T50)');
fuegeRegionenHinzu(
  tvDs,
  await regionaleTeile(
    tvDs,
    [
      { ebene: 'laender', muster: /^LA-TV-0[135]-T(20|40|50)-.*\.xlsx$/i },
      { ebene: 'staedte', muster: /^ST-TV-0[135]-T(20|40|50)-.*\.xlsx$/i },
    ],
    parseRegionaleTatverdaechtige,
  ),
  {
    kontrollSpalte: 'tv|insgesamt',
    hinweise: [{ text: 'Länder und Städte: keine Belastungszahlen (TVBZ), nur Anzahlen.' }],
  },
);
await ausgabe.dataset(tvDs);

console.log('Lese Opfer (ZR-O, ZR-BZ T91)');
const opferDs = await parseZrOpfer(
  await findeDateien(raw, /^ZR-O-0[1-3]-T91-.*\.xlsx$/i),
  await findeDateien(raw, /^ZR-BZ-0[4-6]-T91-.*\.xlsx$/i),
  jahrgang,
  katalog,
);
console.log('Lese Opfer je Land und Stadt (LA-O-01, ST-O-01)');
fuegeRegionenHinzu(
  opferDs,
  await regionaleTeile(
    opferDs,
    [
      { ebene: 'laender', muster: /^LA-O-01-T91-.*\.xlsx$/i },
      { ebene: 'staedte', muster: /^ST-O-01-T91-.*\.xlsx$/i },
    ],
    parseRegionaleOpfer,
  ),
  {
    kontrollSpalte: 'opfer|insgesamt|insgesamt',
    hinweise: [{ text: 'Länder und Städte: keine Gefährdungszahlen (OGZ), nur Anzahlen.' }],
  },
);
await ausgabe.dataset(opferDs);

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
