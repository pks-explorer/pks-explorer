/**
 * Falltabellen je Land (LA-F-02), Stadt (ST-F-01) und Kreis (KR-F-01) eines PKS-Jahrgangs, umgesetzt
 * in das Spaltenformat des Fälle-Datasets.
 */
import type { Zelle } from '@crime-stats/shared';
import { normalisiereSchluessel, type BkaTabelle } from '../lib/bka-tabelle.js';
import { leseRegionaleTabelle, type RegionEbene, type RegionalTeil } from '../lib/regionen.js';
import { round, toNumber } from '../lib/xlsx.js';
import { STELLEN } from './zr-bund-faelle.js';

/** Gemeinsame Spaltenköpfe; die Schreibweise wechselt zwischen Jahrgängen (z. B. 2019 "erfasste Fälle"). */
const GEMEINSAM: Record<string, RegExp> = {
  faelle: /^(Anzahl )?erfasste Fälle$/,
  versuche: /Versuche \| Anzahl$/,
  versuche_anteil: /Versuche \| in %$/,
  aufgeklaert: /^Aufklärung \| (Anzahl Fälle|Anzahl|Fälle)$/,
  aq: /^Aufklärung \| (AQ|in %)/,
};

/** Spaltenköpfe je Ebene und Kennzahl; fehlende Spalten bleiben leer. */
const SPALTEN: Record<RegionEbene, Record<string, RegExp>> = {
  laender: {
    ...GEMEINSAM,
    hz: /^HZ( \(Zensus 11\)| nach Zensus)?$/,
    hz_z22: /^HZ \(Zensus 22\)$/,
    tv: /^Tatver-?dächtige insg(esamt|\.)$/,
    tv_nichtdeutsch: /^Nichtdeutsche Tat-?verdächtige \| Anzahl$/,
    tv_nichtdeutsch_anteil: /^Nichtdeutsche Tat-?verdächtige \| (Anteil|in %)/,
  },
  staedte: {
    ...GEMEINSAM,
    hz: /^HZ( nach Zensus)?$/,
    schusswaffe_gedroht: /Schusswaffe \| gedroht$/,
    schusswaffe_geschossen: /Schusswaffe \| ge-?schossen$/,
    // 2019: "Tat-verdächtige insgesamt", Unterspalten mit Vorsatz "von Spalte 13 | …"
    tv: /^(Tatverdächtige \| insgesamt|Tat-verdächtige insgesamt)$/,
    tv_nichtdeutsch: /Nichtdeutsche Tatverdächtige \| Anzahl$/,
    tv_nichtdeutsch_anteil: /Nichtdeutsche Tatverdächtige \| (Anteil|in %)/,
  },
  kreise: {
    ...GEMEINSAM,
    // ab 2024 weist das BKA die Kreis-HZ auf Basis Zensus 2022 aus
    hz: /^HZ( nach Zensus( 2011)?)?$/,
    hz_z22: /^HZ nach Zensus 2022$/,
    schusswaffe_gedroht: /Schusswaffe \| gedroht$/,
    schusswaffe_geschossen: /Schusswaffe \| ge-?schossen$/,
    tv: /^(Tatverdächtige \| insgesamt|Tat-verdächtige insgesamt)$/,
    tv_nichtdeutsch: /Nichtdeutsche Tatverdächtige \| Anzahl$/,
    tv_nichtdeutsch_anteil: /Nichtdeutsche Tatverdächtige \| (Anteil|in %)/,
  },
};

interface Optionen {
  jahr: number;
  /** Spaltenreihenfolge des Fälle-Datasets. */
  spalten: string[];
  /** Nur diese Straftatenschlüssel übernehmen; fehlt = alle (auch feinere Unterschlüssel). */
  schluessel?: ReadonlySet<string>;
}

function umsetzer(t: BkaTabelle, ebene: RegionEbene, o: Optionen) {
  const zuordnung = o.spalten.flatMap((id, ziel) => {
    const muster = SPALTEN[ebene][id];
    const quelle = muster ? t.spalteOptional(muster) : undefined;
    return quelle === undefined ? [] : [{ ziel, quelle, stellen: STELLEN[id] ?? 2 }];
  });
  if (!zuordnung.some((z) => o.spalten[z.ziel] === 'faelle')) {
    throw new Error(`${t.datei}: Spalte "erfasste Fälle" nicht gefunden`);
  }
  const iJahr = o.spalten.indexOf('jahr');
  const iRegion = o.spalten.indexOf('region');
  const iKey = o.spalten.indexOf('schluessel');

  return (v: (string | number | null)[], region: string): Zelle[][] => {
    const schluessel = normalisiereSchluessel(v[0]);
    if (!schluessel || (o.schluessel && !o.schluessel.has(schluessel))) return [];
    const z: Zelle[] = o.spalten.map(() => null);
    z[iJahr] = o.jahr;
    z[iRegion] = region;
    z[iKey] = schluessel;
    for (const s of zuordnung) z[s.ziel] = round(toNumber(v[s.quelle] ?? null), s.stellen);
    return [z];
  };
}

export const parseRegionaleFaelle = (
  datei: string,
  ebene: RegionEbene,
  o: Optionen,
): Promise<RegionalTeil> =>
  leseRegionaleTabelle(datei, ebene, o.jahr, (t) => umsetzer(t, ebene, o));

export const HINWEISE_REGIONALE_FAELLE = [
  {
    text: 'Städte: nur ausgewählte Straftaten, Städte ab 100.000 Einwohnern sowie Landeshauptstädte. Kreise: nur ausgewählte Straftaten. Erfasst wird am Tatort, nicht am Wohnort der Tatverdächtigen.',
  },
  {
    text: 'Kreise 2024: HZ nur auf Basis Zensus 2022 (Kennzahl „HZ, Zensus 2022“); die HZ-Reihe auf Basis Zensus 2011 endet für Kreise 2023.',
    kennzahlen: ['hz', 'hz_z22'],
  },
];
