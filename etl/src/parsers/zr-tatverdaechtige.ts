/**
 * Parser für die Zeitreihen der Tatverdächtigen (ZR-TV-01…09, Tabelle 20/40/50) und der
 * Tatverdächtigenbelastungszahlen (ZR-BZ-01…03). Je Datei eine Kombination aus Geschlecht
 * (insgesamt/männlich/weiblich) und Staatsangehörigkeit (T20 alle, T40 deutsch, T50 nichtdeutsch);
 * die Altersgruppen stehen in den Spalten.
 */
import path from 'node:path';
import { spaltenId, type Dataset, type DimensionWert, type Zelle } from '@crime-stats/shared';
import { readZeitreihe } from '../lib/zeitreihe.js';
import { round, toNumber } from '../lib/xlsx.js';
import { BASIS_DIMENSIONEN, GESCHLECHT, alsWerte } from '../lib/dimensionen.js';
import {
  HINWEIS_GEBIETSSTAND,
  hinweisTatverdaechtigenzaehlung,
  hinweisZensus,
} from '../lib/hinweise.js';

interface AlterDef extends DimensionWert {
  /** Spaltenkopf in den Anzahl-Tabellen. */
  tv: RegExp;
  /** Spaltenkopf in den TVBZ-Tabellen; null = dort nicht ausgewiesen. */
  tvbz: RegExp | null;
}

const spanne = (von: number, bis: number, tvbz = true): AlterDef => ({
  id: `${von}-${bis}`,
  label: `${von} bis ${bis - 1} Jahre`,
  tv: new RegExp(`\\| ${von} bis unter ${bis} \\| Anzahl$`),
  tvbz: tvbz ? new RegExp(`\\| ${von} bis unter ${bis}$`) : null,
});

export const ALTER_TV: AlterDef[] = [
  {
    id: 'insgesamt',
    label: 'Alle Altersgruppen',
    tv: /^Tatver-dächtige insgesamt \| Anzahl$/,
    tvbz: /^TVBZ insgesamt ohne Kinder unter 8 Jahre$/,
    hinweis: 'TVBZ ohne Kinder unter 8 Jahren.',
    hinweisKennzahlen: ['tvbz'],
  },
  { id: '0-6', label: 'unter 6 Jahre', tv: /^Kinder \| bis unter 6 \| Anzahl$/, tvbz: null },
  spanne(6, 8, false),
  spanne(8, 10),
  spanne(10, 12),
  spanne(12, 14),
  {
    id: 'kinder',
    label: 'Kinder (unter 14)',
    tv: /Kinder unter 14 \| Anzahl$/,
    tvbz: /Kinder 8<14$/,
    hinweis: 'TVBZ nur 8 bis 13 Jahre.',
    hinweisKennzahlen: ['tvbz'],
  },
  spanne(14, 16),
  spanne(16, 18),
  {
    id: 'jugendliche',
    label: 'Jugendliche (14 bis 17)',
    tv: /Jugendliche 14 < 18 \| Anzahl$/,
    tvbz: /Jugendl\. 14<18$/,
  },
  {
    id: 'heranwachsende',
    label: 'Heranwachsende (18 bis 20)',
    tv: /^Heranwachsende 18 bis unter 21 \| Anzahl$/,
    tvbz: /Heran-wachsende \| 18 bis unter 21$/,
  },
  {
    id: 'unter-21',
    label: 'unter 21 Jahre',
    tv: /^Tatverdächtige unter 21 \| Anzahl$/,
    tvbz: /^TVBZ Personen 8 bis unter 21$/,
    hinweis: 'TVBZ nur 8 bis 20 Jahre.',
    hinweisKennzahlen: ['tvbz'],
  },
  spanne(21, 23),
  spanne(23, 25),
  {
    id: '21-25',
    label: '21 bis 24 Jahre',
    tv: /Erwachsene 21 < 25 \| Anzahl$/,
    tvbz: /Erwach-sene 21<25$/,
  },
  spanne(25, 30),
  spanne(30, 40),
  spanne(40, 50),
  spanne(50, 60),
  {
    id: '60+',
    label: '60 Jahre und älter',
    tv: /\| 60 und älter \| Anzahl$/,
    tvbz: /\| 60 und älter$/,
  },
  {
    id: 'erwachsene',
    label: 'Erwachsene (ab 21)',
    tv: /\| Erwachsene ab 21 \| Anzahl$/,
    tvbz: /Erwach-sene ab 21$/,
  },
];

const STAATSANGEHOERIGKEIT: DimensionWert[] = [
  { id: 'insgesamt', label: 'Alle' },
  { id: 'deutsch', label: 'Deutsch' },
  {
    id: 'nichtdeutsch',
    label: 'Nichtdeutsch',
    hinweis:
      'Anzahl einschließlich Personen ohne Wohnsitz in Deutschland; die TVBZ zählt nur in Deutschland ansässige.',
  },
];

const HINWEISE = [
  HINWEIS_GEBIETSSTAND,
  hinweisTatverdaechtigenzaehlung(['tv']),
  {
    text: 'Tatverdächtigenbelastungszahl (TVBZ): in Deutschland ansässige Tatverdächtige je 100.000 Einwohner der jeweiligen Gruppe, ohne Kinder unter 8 Jahren; erst ab 2009 verfügbar.',
    kennzahlen: ['tvbz'],
  },
  hinweisZensus('tvbz', 'TVBZ'),
  { text: 'Tatverdächtige sind ermittelte, nicht verurteilte Personen.' },
];

/** Staatsangehörigkeit aus der Tabellennummer, Geschlecht aus dem Dateinamen. */
function zuordnung(datei: string): { geschlecht: string; staatsangehoerigkeit: string } {
  const t = /-T(20|40|50)-/.exec(datei)?.[1];
  if (!t) throw new Error(`${datei}: Tabellennummer T20/T40/T50 nicht erkennbar`);
  const staatsangehoerigkeit = { '20': 'insgesamt', '40': 'deutsch', '50': 'nichtdeutsch' }[t]!;
  const geschlecht = /maennlich/i.test(datei)
    ? 'maennlich'
    : /weiblich/i.test(datei)
      ? 'weiblich'
      : 'insgesamt';
  return { geschlecht, staatsangehoerigkeit };
}

export async function parseZrTatverdaechtige(
  tvDateien: string[],
  tvbzDateien: string[],
  jahrgang: number,
): Promise<Dataset> {
  const kennzahlSpalten = [
    ...ALTER_TV.map((a) => spaltenId('tv', [a.id])),
    ...ALTER_TV.map((a) => spaltenId('tvbz', [a.id])),
  ];
  const spalten = [
    'jahr',
    'region',
    'schluessel',
    'geschlecht',
    'staatsangehoerigkeit',
    ...kennzahlSpalten,
  ];
  const idx = new Map(spalten.map((s, i) => [s, i]));
  const zeilen = new Map<string, Zelle[]>();
  const zeile = (jahr: number, schluessel: string, g: string, s: string) => {
    const key = `${schluessel}|${jahr}|${g}|${s}`;
    let z = zeilen.get(key);
    if (!z)
      zeilen.set(key, (z = [jahr, 'DE', schluessel, g, s, ...kennzahlSpalten.map(() => null)]));
    return z;
  };

  let stand: string | undefined;
  const lesen = async (datei: string, kennzahl: 'tv' | 'tvbz') => {
    const t = await readZeitreihe(datei);
    stand ??= t.stand;
    const { geschlecht, staatsangehoerigkeit } = zuordnung(t.datei);
    const cols = ALTER_TV.flatMap((a) => {
      const muster = kennzahl === 'tv' ? a.tv : a.tvbz;
      return muster
        ? [{ spalte: t.spalte(muster), ziel: idx.get(spaltenId(kennzahl, [a.id]))! }]
        : [];
    });
    let n = 0;
    for (const r of t.zeilen) {
      if (r.zensus === 'Z22') continue; // vergleichbare Reihe auf Basis Zensus 2011 verwenden
      const z = zeile(r.jahr, r.schluessel, geschlecht, staatsangehoerigkeit);
      for (const c of cols)
        z[c.ziel] = round(toNumber(r.werte[c.spalte] ?? null), kennzahl === 'tv' ? 0 : 1);
      n++;
    }
    console.log(`  ${t.datei}: ${n} Zeilen (${geschlecht}, ${staatsangehoerigkeit})`);
  };

  for (const f of tvDateien) await lesen(f, 'tv');
  for (const f of tvbzDateien) await lesen(f, 'tvbz');

  // Nur Schlüssel der Gesamttabelle (alle Geschlechter/Staatsangehörigkeiten): Die Tabellen für
  // nichtdeutsche TV enthalten zusätzlich feinere Unterschlüssel, die es sonst nirgends gibt.
  const basis = new Set(
    [...zeilen.values()]
      .filter(
        (z) => z[3] === 'insgesamt' && z[4] === 'insgesamt' && z[idx.get('tv|insgesamt')!] !== null,
      )
      .map((z) => z[2] as string),
  );
  const rows = [...zeilen.values()].filter((z) => basis.has(z[2] as string));
  const verworfen = new Set(
    [...zeilen.values()].map((z) => z[2] as string).filter((k) => !basis.has(k)),
  );
  if (verworfen.size) console.log(`  ${verworfen.size} Schlüssel nur in Teiltabellen – verworfen`);
  const jahre = [...new Set(rows.map((z) => z[0] as number))].sort((a, b) => a - b);
  return {
    meta: {
      id: 'bund-tatverdaechtige-zeitreihe',
      titel: 'Bund – Tatverdächtige nach Alter, Geschlecht und Staatsangehörigkeit (Zeitreihe)',
      bereich: 'Tatverdächtige',
      ebene: 'bund',
      quelle: {
        jahrgang,
        datei: `${tvDateien.length + tvbzDateien.length} Tabellen (${path.basename(tvDateien[0]!)} …)`,
        stand,
      },
      dimensionen: [
        ...BASIS_DIMENSIONEN,
        {
          id: 'geschlecht',
          label: 'Geschlecht',
          werte: GESCHLECHT,
          standard: 'insgesamt',
          vergleich: ['maennlich', 'weiblich'],
        },
        {
          id: 'staatsangehoerigkeit',
          label: 'Staatsangehörigkeit',
          werte: alsWerte(STAATSANGEHOERIGKEIT),
          standard: 'insgesamt',
          vergleich: ['deutsch', 'nichtdeutsch'],
        },
        {
          id: 'alter',
          label: 'Alter',
          inSpalte: true,
          standard: 'insgesamt',
          vergleich: ['kinder', 'jugendliche', 'heranwachsende', 'erwachsene'],
          werte: alsWerte(ALTER_TV),
        },
      ],
      kennzahlen: [
        { id: 'tv', label: 'Tatverdächtige', einheit: 'anzahl' },
        {
          id: 'tvbz',
          label: 'Tatverdächtigenbelastungszahl (TVBZ)',
          einheit: 'je_100000',
          beschreibung:
            'In Deutschland ansässige Tatverdächtige je 100.000 Einwohner der jeweiligen Gruppe (ab 2009, ohne Kinder unter 8).',
        },
      ],
      spalten,
      jahre,
      hinweise: HINWEISE,
    },
    zeilen: rows,
  };
}
