/**
 * Opfertabellen je Land (LA-O-01) und Stadt (ST-O-01) eines PKS-Jahrgangs. Die Spalte "Fallstatus"
 * unterscheidet insgesamt / Versuch / vollendet; Alter und Geschlecht stehen in den Spalten.
 * Gefährdungszahlen (OGZ) gibt es regional nicht.
 */
import { spaltenId, type Zelle } from '@crime-stats/shared';
import { normalisiereSchluessel, type BkaTabelle } from '../lib/bka-tabelle.js';
import { GESCHLECHT, GESCHLECHT_KOPF } from '../lib/dimensionen.js';
import { leseRegionaleTabelle, type RegionEbene, type RegionalTeil } from '../lib/regionen.js';
import { round, toNumber } from '../lib/xlsx.js';
import { ALTER_OPFER } from './zr-opfer.js';

/** Spaltenköpfe je Altersgruppe; "Kinder" heißt in den Jahrgangstabellen "Kinder | insgesamt". */
const ALTER_KOPF: Record<string, RegExp> = {
  insgesamt: /^Opfer \|/,
  kinder: /^Kinder \| (insgesamt|bis unter 14) \|/,
  jugendliche: /^Jugendliche \| 14 bis unter 18 \|/,
  heranwachsende: /^Heranwachsende \| 18 bis unter 21 \|/,
  '21-60': /^Erwachsene \| 21 bis unter 60 \|/,
  '60+': /^Erwachsene \| 60 und älter \|/,
  erwachsene: /^Erwachsene \| insgesamt \|/,
};

const FALLSTATUS: Record<string, string> = {
  'insg.': 'insgesamt',
  'vers.': 'versuch',
  'voll.': 'vollendet',
};

interface Optionen {
  jahr: number;
  spalten: string[];
  schluessel: ReadonlySet<string>;
}

function umsetzer(t: BkaTabelle, o: Optionen) {
  const iStatus = t.spalte(/^Fall-?status$/);
  const zuordnung = ALTER_OPFER.flatMap((a) =>
    GESCHLECHT.map((g) => {
      const alter = ALTER_KOPF[a.id];
      if (!alter) throw new Error(`Kein Spaltenmuster für Altersgruppe ${a.id}`);
      // beide Bedingungen unabhängig prüfen ("Opfer | insgesamt" teilt sich den Trenner)
      const muster = new RegExp(`(?=${alter.source})(?=.*${GESCHLECHT_KOPF[g.id]!.source})`);
      return {
        quelle: t.spalte(muster),
        ziel: o.spalten.indexOf(spaltenId('opfer', [a.id, g.id])),
      };
    }),
  );

  return (v: (string | number | null)[], region: string): Zelle[][] => {
    const schluessel = normalisiereSchluessel(v[0]);
    const vollendung = FALLSTATUS[String(v[iStatus] ?? '').trim()];
    if (!o.schluessel.has(schluessel) || !vollendung) return [];
    const z: Zelle[] = o.spalten.map(() => null);
    const setze = (spalte: string, wert: Zelle) => (z[o.spalten.indexOf(spalte)] = wert);
    setze('jahr', o.jahr);
    setze('region', region);
    setze('schluessel', schluessel);
    setze('vollendung', vollendung);
    for (const s of zuordnung) z[s.ziel] = round(toNumber(v[s.quelle] ?? null), 0);
    return [z];
  };
}

export const parseRegionaleOpfer = (
  datei: string,
  ebene: RegionEbene,
  o: Optionen,
): Promise<RegionalTeil> => leseRegionaleTabelle(datei, ebene, o.jahr, (t) => umsetzer(t, o));
