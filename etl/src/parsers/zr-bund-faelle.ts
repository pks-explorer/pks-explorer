/**
 * Parser für "T01-ZR-Bund-Fälle": Grundtabelle Bund als Zeitreihe ab 1987, je Straftatenschlüssel und Jahr.
 *
 * Das Jahr 2024 kommt doppelt vor ("2024 Z11" / "2024 Z22"); die Zeilen unterscheiden sich nur in der HZ
 * (Bevölkerungsbasis Zensus 2011 bzw. 2022). Die Z22-HZ wird als eigene Kennzahl übernommen.
 */
import type { Dataset, KennzahlDef, Zelle } from '@crime-stats/shared';
import { round, toNumber } from '../lib/xlsx.js';
import { readZeitreihe } from '../lib/zeitreihe.js';
import { BASIS_DIMENSIONEN } from '../lib/dimensionen.js';
import {
  HINWEIS_GEBIETSSTAND,
  HINWEIS_REGISTRIERTE_KRIMINALITAET,
  hinweisTatverdaechtigenzaehlung,
} from '../lib/hinweise.js';
import type { StraftatenKatalog } from '../lib/straftaten.js';

interface KennzahlSpalte extends KennzahlDef {
  kopf: RegExp;
  /** Nachkommastellen. */
  stellen: number;
}

const KENNZAHLEN: KennzahlSpalte[] = [
  {
    id: 'faelle',
    label: 'Erfasste Fälle',
    einheit: 'anzahl',
    kopf: /Anzahl erfasste Fälle/,
    stellen: 0,
  },
  {
    id: 'hz',
    label: 'Häufigkeitszahl (HZ)',
    einheit: 'je_100000',
    kopf: /^HZ/,
    stellen: 2,
    beschreibung:
      'Erfasste Fälle pro 100.000 Einwohner. 2024 auf Basis Zensus 2011 (vergleichbar mit 2013–2023).',
  },
  { id: 'versuche', label: 'Versuche', einheit: 'anzahl', kopf: /Versuche.*Anzahl/, stellen: 0 },
  {
    id: 'versuche_anteil',
    label: 'Versuche (Anteil)',
    einheit: 'prozent',
    kopf: /Versuche.*in %/,
    stellen: 2,
  },
  {
    id: 'schusswaffe_gedroht',
    label: 'Mit Schusswaffe gedroht',
    einheit: 'anzahl',
    kopf: /Schusswaffe.*gedroht/,
    stellen: 0,
  },
  {
    id: 'schusswaffe_geschossen',
    label: 'Mit Schusswaffe geschossen',
    einheit: 'anzahl',
    kopf: /Schusswaffe.*ge-schossen/,
    stellen: 0,
  },
  {
    id: 'aufgeklaert',
    label: 'Aufgeklärte Fälle',
    einheit: 'anzahl',
    kopf: /Aufklärung.*Anzahl Fälle/,
    stellen: 0,
  },
  {
    id: 'aq',
    label: 'Aufklärungsquote (AQ)',
    einheit: 'prozent',
    kopf: /Aufklärung.*\(AQ\)/,
    stellen: 2,
  },
  {
    id: 'tv',
    label: 'Tatverdächtige insgesamt',
    einheit: 'anzahl',
    kopf: /Tat-verdächtige insgesamt/,
    stellen: 0,
  },
  {
    id: 'tv_nichtdeutsch',
    label: 'Nichtdeutsche Tatverdächtige',
    einheit: 'anzahl',
    kopf: /Nichtdeutsche.*Anzahl/,
    stellen: 0,
  },
  {
    id: 'tv_nichtdeutsch_anteil',
    label: 'Nichtdeutsche Tatverdächtige (Anteil)',
    einheit: 'prozent',
    kopf: /Nichtdeutsche.*Anteil/,
    stellen: 2,
  },
];

const HZ_Z22: KennzahlDef = {
  id: 'hz_z22',
  label: 'Häufigkeitszahl (HZ, Zensus 2022)',
  einheit: 'je_100000',
  beschreibung:
    'HZ auf Basis Zensus 2022; erst ab 2024 verfügbar, mit Vorjahren nur eingeschränkt vergleichbar.',
};

export async function parseZrBundFaelle(
  datei: string,
  jahrgang: number,
  katalog: StraftatenKatalog,
  url?: string,
): Promise<Dataset> {
  const t = await readZeitreihe(datei);
  const spalten = KENNZAHLEN.map((k) => t.spalte(k.kopf));
  const iHz = t.spalte(/^HZ/);

  const zeilen = new Map<string, Zelle[]>(); // schluessel|jahr
  let ungueltig = 0;
  for (const r of t.zeilen) {
    const key = `${r.schluessel}|${r.jahr}`;
    let zeile = zeilen.get(key);
    if (!zeile) {
      zeile = [r.jahr, 'DE', r.schluessel, ...KENNZAHLEN.map(() => null), null];
      zeilen.set(key, zeile);
    }
    if (r.zensus === 'Z22') {
      zeile[zeile.length - 1] = round(toNumber(r.werte[iHz] ?? null), 2);
      continue; // übrige Werte identisch mit der Z11-Zeile
    }
    katalog.add(r.schluessel, r.jahr, r.name);
    KENNZAHLEN.forEach((k, i) => {
      const roh = r.werte[spalten[i]!] ?? null;
      const n = toNumber(roh);
      if (n === null && roh !== null && roh !== '-') ungueltig++;
      zeile[3 + i] = round(n, k.stellen);
    });
  }
  if (ungueltig)
    console.warn(`  ${t.datei}: ${ungueltig} nicht-numerische Zellen als leer übernommen`);

  const rows = [...zeilen.values()];
  const kennzahlen: KennzahlDef[] = [
    ...KENNZAHLEN.map(({ id, label, einheit, beschreibung }) => ({
      id,
      label,
      einheit,
      beschreibung,
    })),
    HZ_Z22,
  ];

  return {
    meta: {
      id: 'bund-faelle-zeitreihe',
      titel: 'Bund – Fälle, Aufklärung und Tatverdächtige (Zeitreihe)',
      bereich: 'Fälle',
      ebene: 'bund',
      quelle: { jahrgang, datei: t.datei, url, stand: t.stand },
      dimensionen: BASIS_DIMENSIONEN,
      kennzahlen,
      spalten: ['jahr', 'region', 'schluessel', ...kennzahlen.map((k) => k.id)],
      jahre: [...new Set(rows.map((z) => z[0] as number))].sort((a, b) => a - b),
      hinweise: [
        HINWEIS_GEBIETSSTAND,
        hinweisTatverdaechtigenzaehlung(['tv', 'tv_nichtdeutsch', 'tv_nichtdeutsch_anteil']),
        {
          text: 'Durch Wegfall von Plausibilitäten sind die Daten ab 2009 bei „Schusswaffenverwendung“ nicht mit den Vorjahren vergleichbar.',
          kennzahlen: ['schusswaffe_gedroht', 'schusswaffe_geschossen'],
          abJahr: 2009,
          bruch: true,
        },
        {
          text: 'HZ ab 2013 auf Basis Zensus 2011; Vergleichbarkeit mit den Vorjahren eingeschränkt.',
          kennzahlen: ['hz'],
          abJahr: 2013,
          bruch: true,
        },
        {
          text: 'HZ (Zensus 2022) ab 2024; Vergleich mit den Vorjahren nur eingeschränkt möglich.',
          kennzahlen: ['hz_z22'],
          abJahr: 2024,
        },
        HINWEIS_REGISTRIERTE_KRIMINALITAET,
      ],
    },
    zeilen: rows,
  };
}
