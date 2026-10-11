/**
 * Tatverdächtigentabellen je Land (LA-TV-01/03/05) und Stadt (ST-TV-01/03/05) eines PKS-Jahrgangs.
 * Je Datei eine Staatsangehörigkeit (T20 alle, T40 deutsch, T50 nichtdeutsch); das Geschlecht steht
 * in der Spalte "Sexus" (M, W, X = insgesamt), die Altersgruppen in den Spalten.
 * Belastungszahlen (TVBZ) gibt es regional nicht.
 */
import { spaltenId, type Zelle } from '@crime-stats/shared';
import { normalisiereSchluessel, type BkaTabelle } from '../lib/bka-tabelle.js';
import { leseRegionaleTabelle, type RegionEbene, type RegionalTeil } from '../lib/regionen.js';
import { round, toNumber } from '../lib/xlsx.js';
import { ALTER_TV, staatsangehoerigkeitAus } from './zr-tatverdaechtige.js';

/** Spaltenköpfe der Jahrgangstabellen je Altersgruppe (abweichend von der Bundes-Zeitreihe). */
const ALTER_KOPF: Record<string, RegExp> = {
  insgesamt: /^Tatver-?dächtige insgesamt$/,
  '0-6': /^Kinder \| bis unter 6$/,
  kinder: /Kinder unter 14$/,
  jugendliche: /Jugendl(iche|\.) 14 ?< ?18$/,
  heranwachsende: /Heran-?wachsende \| 18 bis unter 21$/,
  'unter-21': /^Tatver-?dächtige unter 21$/,
  '21-25': /Erwach-?sene 21 ?< ?25$/,
  '60+': /\| 60 und älter$/,
  erwachsene: /Erwach-?sene ab 21$/,
};
const alterKopf = (id: string) => {
  const spanne = /^(\d+)-(\d+)$/.exec(id);
  return (
    ALTER_KOPF[id] ?? (spanne ? new RegExp(`\\| ${spanne[1]} bis unter ${spanne[2]}$`) : undefined)
  );
};

const SEXUS: Record<string, string> = { M: 'maennlich', W: 'weiblich', X: 'insgesamt' };

interface Optionen {
  jahr: number;
  spalten: string[];
  schluessel: ReadonlySet<string>;
}

function umsetzer(t: BkaTabelle, o: Optionen) {
  const staatsangehoerigkeit = staatsangehoerigkeitAus(t.datei);
  const iSexus = t.spalte(/^Sexus$/);
  const zuordnung = ALTER_TV.map((a) => {
    const muster = alterKopf(a.id);
    if (!muster) throw new Error(`Kein Spaltenmuster für Altersgruppe ${a.id}`);
    return { quelle: t.spalte(muster), ziel: o.spalten.indexOf(spaltenId('tv', [a.id])) };
  });

  return (v: (string | number | null)[], region: string): Zelle[][] => {
    const schluessel = normalisiereSchluessel(v[0]);
    const geschlecht = SEXUS[String(v[iSexus] ?? '').trim()];
    if (!o.schluessel.has(schluessel) || !geschlecht) return [];
    const z: Zelle[] = o.spalten.map(() => null);
    const setze = (spalte: string, wert: Zelle) => (z[o.spalten.indexOf(spalte)] = wert);
    setze('jahr', o.jahr);
    setze('region', region);
    setze('schluessel', schluessel);
    setze('geschlecht', geschlecht);
    setze('staatsangehoerigkeit', staatsangehoerigkeit);
    for (const s of zuordnung) z[s.ziel] = round(toNumber(v[s.quelle] ?? null), 0);
    return [z];
  };
}

export const parseRegionaleTatverdaechtige = (
  datei: string,
  ebene: RegionEbene,
  o: Optionen,
): Promise<RegionalTeil> => leseRegionaleTabelle(datei, ebene, o.jahr, (t) => umsetzer(t, o));
