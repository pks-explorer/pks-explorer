/**
 * Parser für die Falltabellen je Land (LA-F-02, "Fälle mit HZ") und je Stadt (ST-F-01, Städte ab
 * 100.000 Einwohnern und Landeshauptstädte) eines PKS-Jahrgangs. Jede Datei enthält genau ein Berichtsjahr.
 * Die Zeilen werden im Spaltenformat des Fälle-Datasets geliefert, damit Bund, Länder und Städte
 * in einem Dataset mit der Dimension "region" zusammenkommen.
 */
import type { Dataset, DimensionWert, Zelle } from '@crime-stats/shared';
import {
  normalisiereSchluessel,
  readBkaTabelle,
  type BkaTabelle,
  type Zeile,
} from '../lib/bka-tabelle.js';
import { LAENDER, REGION_DEUTSCHLAND } from '../lib/dimensionen.js';
import { round, toNumber } from '../lib/xlsx.js';
import { STELLEN } from './zr-bund-faelle.js';

export interface RegionaleZeilen {
  zeilen: Zelle[][];
  regionen: DimensionWert[];
  /** Fälle der Zeile "Bundesrepublik Deutschland" je Schlüssel (nur Länderdatei) – zur Kontrolle gegen den Bund. */
  bundKontrolle: Map<string, number | null>;
}

interface Optionen {
  /** Berichtsjahr der Datei (= PKS-Jahrgang). */
  jahr: number;
  /** Spaltenreihenfolge des Fälle-Datasets. */
  spalten: string[];
  /** Nur diese Straftatenschlüssel übernehmen. */
  schluessel: ReadonlySet<string>;
}

/** Spaltenköpfe der Länder-Tabelle je Kennzahl; ältere Jahrgänge haben z. B. nur eine HZ-Spalte. */
const LAND_SPALTEN: Record<string, RegExp> = {
  faelle: /^Anzahl erfasste Fälle$/,
  hz: /^HZ( \(Zensus 11\))?$/,
  hz_z22: /^HZ \(Zensus 22\)$/,
  versuche: /Versuche \| Anzahl$/,
  versuche_anteil: /Versuche \| in %$/,
  aufgeklaert: /^Aufklärung \| Anzahl Fälle$/,
  aq: /^Aufklärung \| (AQ|in %)/,
  tv: /^Tatver-?dächtige insgesamt$/,
  tv_nichtdeutsch: /^Nichtdeutsche Tat-?verdächtige \| Anzahl$/,
  tv_nichtdeutsch_anteil: /^Nichtdeutsche Tat-?verdächtige \| Anteil/,
};

/** Spaltenköpfe der Städte-Tabelle je Kennzahl. */
const STADT_SPALTEN: Record<string, RegExp> = {
  faelle: /^Anzahl erfasste Fälle$/,
  hz: /^HZ/,
  versuche: /Versuche \| Anzahl$/,
  versuche_anteil: /Versuche \| in %$/,
  schusswaffe_gedroht: /Schusswaffe \| gedroht$/,
  schusswaffe_geschossen: /Schusswaffe \| ge-?schossen$/,
  aufgeklaert: /^Aufklärung \| Anzahl Fälle$/,
  aq: /^Aufklärung \| (AQ|in %)/,
  tv: /^Tatverdächtige \| insgesamt$/,
  tv_nichtdeutsch: /^Nichtdeutsche Tatverdächtige \| Anzahl$/,
  tv_nichtdeutsch_anteil: /^Nichtdeutsche Tatverdächtige \| Anteil/,
};

/** Ordnet die Kennzahl-Spalten des Datasets den Spalten der BKA-Tabelle zu (fehlende bleiben leer). */
function spaltenZuordnen(t: BkaTabelle, spalten: string[], muster: Record<string, RegExp>) {
  const zuordnung = spalten.flatMap((id, ziel) => {
    const m = muster[id];
    const quelle = m ? t.spalteOptional(m) : undefined;
    return quelle === undefined ? [] : [{ ziel, quelle, stellen: STELLEN[id] ?? 2 }];
  });
  if (!zuordnung.some((z) => spalten[z.ziel] === 'faelle')) {
    throw new Error(`${t.datei}: Spalte "Anzahl erfasste Fälle" nicht gefunden`);
  }
  return zuordnung;
}

function zeileBauen(
  o: Optionen,
  region: string,
  schluessel: string,
  quelle: Zeile,
  zuordnung: ReturnType<typeof spaltenZuordnen>,
): Zelle[] {
  const z: Zelle[] = o.spalten.map(() => null);
  z[o.spalten.indexOf('jahr')] = o.jahr;
  z[o.spalten.indexOf('region')] = region;
  z[o.spalten.indexOf('schluessel')] = schluessel;
  for (const s of zuordnung) z[s.ziel] = round(toNumber(quelle[s.quelle] ?? null), s.stellen);
  return z;
}

export async function parseLaenderFaelle(datei: string, o: Optionen): Promise<RegionaleZeilen> {
  const t = await readBkaTabelle(datei);
  const zuordnung = spaltenZuordnen(t, o.spalten, LAND_SPALTEN);
  const iLand = t.spalte(/^Bundesland$/);
  const iFaelle = t.spalte(LAND_SPALTEN['faelle']!);

  const zeilen: Zelle[][] = [];
  const bundKontrolle = new Map<string, number | null>();
  const unbekannt = new Set<string>();
  for (const v of t.zeilen) {
    const schluessel = normalisiereSchluessel(v[0]);
    const land = typeof v[iLand] === 'string' ? (v[iLand] as string).trim() : '';
    if (!schluessel || !land || !o.schluessel.has(schluessel)) continue;
    if (/^Bundesrepublik/.test(land)) {
      bundKontrolle.set(schluessel, toNumber(v[iFaelle] ?? null));
      continue;
    }
    const id = LAENDER[land];
    if (!id) {
      unbekannt.add(land);
      continue;
    }
    zeilen.push(zeileBauen(o, id, schluessel, v, zuordnung));
  }
  if (unbekannt.size) throw new Error(`${t.datei}: unbekannte Länder ${[...unbekannt].join(', ')}`);

  const regionen = Object.entries(LAENDER).map(([label, id]) => ({ id, label, gruppe: 'Länder' }));
  return { zeilen, regionen, bundKontrolle };
}

export async function parseStaedteFaelle(datei: string, o: Optionen): Promise<RegionaleZeilen> {
  const t = await readBkaTabelle(datei);
  const zuordnung = spaltenZuordnen(t, o.spalten, STADT_SPALTEN);
  const iGemeinde = t.spalte(/^Gemeinde-?schlüssel$/);
  const iStadt = t.spalte(/^Stadt$/);

  const zeilen: Zelle[][] = [];
  const staedte = new Map<string, string>();
  for (const v of t.zeilen) {
    const schluessel = normalisiereSchluessel(v[0]);
    const roh = v[iGemeinde];
    // Gemeindeschlüssel sind 8-stellig; als Zahl gespeichert fehlt die führende Null
    const gemeinde =
      typeof roh === 'number' ? String(roh).padStart(8, '0') : String(roh ?? '').trim();
    if (!schluessel || !/^\d{8}$/.test(gemeinde) || !o.schluessel.has(schluessel)) continue;
    staedte.set(gemeinde, String(v[iStadt] ?? gemeinde).trim());
    zeilen.push(zeileBauen(o, gemeinde, schluessel, v, zuordnung));
  }

  const regionen = [...staedte].map(([id, label]) => ({ id, label, gruppe: 'Städte' }));
  return { zeilen, regionen, bundKontrolle: new Map() };
}

export interface RegionaleQuelle {
  /** Berichtsjahr = PKS-Jahrgang der Dateien. */
  jahr: number;
  laender?: string;
  staedte?: string;
}

/**
 * Ergänzt das Fälle-Dataset des Bundes um Länder und Städte aus den Jahrgangstabellen und macht
 * "region" zur auswählbaren Dimension. Prüft dabei die Länderzeile "Bundesrepublik Deutschland"
 * gegen die Bundes-Zeitreihe.
 */
export async function ergaenzeRegionen(ds: Dataset, quellen: RegionaleQuelle[]): Promise<void> {
  const { spalten } = ds.meta;
  const iJahr = spalten.indexOf('jahr');
  const iKey = spalten.indexOf('schluessel');
  const iFaelle = spalten.indexOf('faelle');
  const schluessel = new Set(ds.zeilen.map((z) => z[iKey] as string));
  const bund = new Map(ds.zeilen.map((z) => [`${z[iKey]}|${z[iJahr]}`, z[iFaelle]]));

  const regionen = new Map<string, DimensionWert>();
  const jahre = { laender: [] as number[], staedte: [] as number[] };
  // neueste Jahrgänge zuerst, damit aktuelle Städtenamen gelten
  for (const q of [...quellen].sort((a, b) => b.jahr - a.jahr)) {
    const o = { jahr: q.jahr, spalten, schluessel };
    for (const art of ['laender', 'staedte'] as const) {
      const datei = q[art];
      if (!datei) continue;
      const r = await (art === 'laender' ? parseLaenderFaelle : parseStaedteFaelle)(datei, o);
      ds.zeilen.push(...r.zeilen);
      for (const w of r.regionen) if (!regionen.has(w.id)) regionen.set(w.id, w);
      jahre[art].push(q.jahr);

      const abweichend = [...r.bundKontrolle].filter(([k, n]) => {
        const b = bund.get(`${k}|${q.jahr}`);
        return b !== undefined && b !== n;
      });
      const kontrolle = r.bundKontrolle.size
        ? `, Kontrolle Bund: ${r.bundKontrolle.size - abweichend.length}/${r.bundKontrolle.size} gleich`
        : '';
      console.log(`  ${q.jahr} ${art}: ${r.zeilen.length} Zeilen${kontrolle}`);
      if (abweichend.length)
        console.warn(
          `    abweichend: ${abweichend
            .slice(0, 5)
            .map(([k]) => k)
            .join(', ')} …`,
        );
    }
  }

  const sortiert = (gruppe: string) =>
    [...regionen.values()]
      .filter((w) => w.gruppe === gruppe)
      .sort((a, b) => a.label.localeCompare(b.label, 'de'));
  ds.meta.dimensionen = ds.meta.dimensionen.map((d) =>
    d.id === 'region'
      ? {
          ...d,
          werte: [REGION_DEUTSCHLAND, ...sortiert('Länder'), ...sortiert('Städte')],
          standard: REGION_DEUTSCHLAND.id,
        }
      : d,
  );
  ds.meta.jahre = [...new Set(ds.zeilen.map((z) => z[iJahr] as number))].sort((a, b) => a - b);

  const spanne = (j: number[]) => (j.length ? `${Math.min(...j)}–${Math.max(...j)}` : 'keine');
  ds.meta.hinweise.push(
    {
      text: `Länder (${spanne(jahre.laender)}) und Städte (${spanne(jahre.staedte)}) stammen aus den Tabellen der jeweiligen PKS-Jahrgänge; für Deutschland reicht die Zeitreihe bis 1987 zurück.`,
    },
    {
      text: 'Städte: nur ausgewählte Straftaten, Städte ab 100.000 Einwohnern sowie Landeshauptstädte. Erfasst wird am Tatort, nicht am Wohnort der Tatverdächtigen.',
    },
  );
}
