/**
 * Parser für die Zeitreihen der Opfer (ZR-O-01…03, Tabelle 91) und der Opfergefährdungszahlen
 * (ZR-BZ-04…06). Je Datei: Straftaten insgesamt / Versuche / vollendet; Alter und Geschlecht in den Spalten.
 */
import path from 'node:path';
import { spaltenId, type Dataset, type DimensionWert, type Zelle } from '@crime-stats/shared';
import { readZeitreihe } from '../lib/zeitreihe.js';
import { round, toNumber } from '../lib/xlsx.js';
import type { StraftatenKatalog } from '../lib/straftaten.js';
import { basisDimensionen, GESCHLECHT, GESCHLECHT_KOPF, alsWerte } from '../lib/dimensionen.js';
import { hinweisZensus } from '../lib/hinweise.js';

interface AlterDef extends DimensionWert {
  opfer: RegExp;
  ogz: RegExp;
}

export const ALTER_OPFER: AlterDef[] = [
  { id: 'insgesamt', label: 'Alle Altersgruppen', opfer: /^Opfer \|/, ogz: /^OGZ insgesamt \|/ },
  {
    id: 'kinder',
    label: 'Kinder (unter 14)',
    opfer: /^Kinder \| bis unter 14 \|/,
    ogz: /^OGZ Kinder bis unter 14 \|/,
  },
  {
    id: 'jugendliche',
    label: 'Jugendliche (14 bis 17)',
    opfer: /^Jugendliche \| 14 bis unter 18 \|/,
    ogz: /^OGZ Jugendliche 14 bis unter 18 \|/,
  },
  {
    id: 'heranwachsende',
    label: 'Heranwachsende (18 bis 20)',
    opfer: /^Heranwachsende \| 18 bis unter 21 \|/,
    ogz: /^OGZ Heranwachsende 18 bis unter 21 \|/,
  },
  {
    id: '21-60',
    label: '21 bis 59 Jahre',
    opfer: /^Erwachsene \| 21 bis unter 60 \|/,
    ogz: /^OGZ Erwachsene \| 21 bis unter 60 \|/,
  },
  {
    id: '60+',
    label: '60 Jahre und älter',
    opfer: /^Erwachsene \| 60 und älter \|/,
    ogz: /^OGZ Erwachsene \| 60 und älter \|/,
  },
  {
    id: 'erwachsene',
    label: 'Erwachsene (ab 21)',
    opfer: /^Erwachsene \| insgesamt \|/,
    ogz: /^OGZ Erwachsene \| insgesamt \|/,
  },
];

const VOLLENDUNG: DimensionWert[] = [
  { id: 'insgesamt', label: 'Versuche und vollendete Taten' },
  { id: 'versuch', label: 'Nur Versuche' },
  { id: 'vollendet', label: 'Nur vollendete Taten' },
];

const HINWEISE = [
  {
    text: 'Opfer werden nur bei bestimmten Delikten erfasst (Opferdelikte, z. B. Tötungs-, Sexual- und Rohheitsdelikte). „Straftaten insgesamt“ der Opferdelikte erst ab 2009.',
  },
  {
    text: 'Opfergefährdungszahl (OGZ): Opfer je 100.000 Einwohner der jeweiligen Gruppe.',
    kennzahlen: ['ogz'],
  },
  hinweisZensus('ogz', 'OGZ'),
];

const vollendungAus = (datei: string) =>
  /Versuch/i.test(datei) ? 'versuch' : /vollendet/i.test(datei) ? 'vollendet' : 'insgesamt';

export async function parseZrOpfer(
  opferDateien: string[],
  ogzDateien: string[],
  jahrgang: number,
  katalog: StraftatenKatalog,
): Promise<Dataset> {
  const wertSpalten = (['opfer', 'ogz'] as const).flatMap((k) =>
    ALTER_OPFER.flatMap((a) => GESCHLECHT.map((g) => spaltenId(k, [a.id, g.id]))),
  );
  const spalten = ['jahr', 'region', 'schluessel', 'vollendung', ...wertSpalten];
  const idx = new Map(spalten.map((s, i) => [s, i]));
  const zeilen = new Map<string, Zelle[]>();

  let stand: string | undefined;
  const lesen = async (datei: string, kennzahl: 'opfer' | 'ogz') => {
    const t = await readZeitreihe(datei);
    stand ??= t.stand;
    const vollendung = vollendungAus(t.datei);
    const cols = ALTER_OPFER.flatMap((a) =>
      GESCHLECHT.map((g) => {
        const alterMuster = kennzahl === 'opfer' ? a.opfer : a.ogz;
        // beide Bedingungen unabhängig prüfen ("Opfer | insgesamt" teilt sich den Trenner)
        const muster = new RegExp(
          `(?=${alterMuster.source})(?=.*${GESCHLECHT_KOPF[g.id]!.source})`,
        );
        return { spalte: t.spalte(muster), ziel: idx.get(spaltenId(kennzahl, [a.id, g.id]))! };
      }),
    );
    let n = 0;
    for (const r of t.zeilen) {
      if (r.zensus === 'Z22') continue;
      katalog.ergaenze(r.schluessel, r.jahr, r.name); // z. B. Unterschlüssel 2391xx zu Menschenhandel
      const key = `${r.schluessel}|${r.jahr}|${vollendung}`;
      let z = zeilen.get(key);
      if (!z)
        zeilen.set(
          key,
          (z = [r.jahr, 'DE', r.schluessel, vollendung, ...wertSpalten.map(() => null)]),
        );
      for (const c of cols)
        z[c.ziel] = round(toNumber(r.werte[c.spalte] ?? null), kennzahl === 'opfer' ? 0 : 1);
      n++;
    }
    console.log(`  ${t.datei}: ${n} Zeilen (${vollendung})`);
  };

  for (const f of opferDateien) await lesen(f, 'opfer');
  for (const f of ogzDateien) await lesen(f, 'ogz');

  const rows = [...zeilen.values()];
  const jahre = [...new Set(rows.map((z) => z[0] as number))].sort((a, b) => a - b);
  return {
    meta: {
      id: 'bund-opfer-zeitreihe',
      titel: 'Bund – Opfer nach Alter und Geschlecht (Zeitreihe)',
      bereich: 'Opfer',
      ebene: 'bund',
      quelle: {
        jahrgang,
        datei: `${opferDateien.length + ogzDateien.length} Tabellen (${path.basename(opferDateien[0]!)} …)`,
        stand,
      },
      dimensionen: [
        ...basisDimensionen(),
        {
          id: 'vollendung',
          label: 'Versuch/Vollendung',
          werte: VOLLENDUNG,
          standard: 'insgesamt',
          vergleich: ['versuch', 'vollendet'],
        },
        {
          id: 'alter',
          label: 'Alter',
          inSpalte: true,
          standard: 'insgesamt',
          vergleich: ['kinder', 'jugendliche', 'heranwachsende', '21-60', '60+'],
          werte: alsWerte(ALTER_OPFER),
        },
        {
          id: 'geschlecht',
          label: 'Geschlecht',
          inSpalte: true,
          standard: 'insgesamt',
          vergleich: ['maennlich', 'weiblich'],
          werte: GESCHLECHT,
        },
      ],
      kennzahlen: [
        { id: 'opfer', label: 'Opfer', einheit: 'anzahl' },
        {
          id: 'ogz',
          label: 'Opfergefährdungszahl (OGZ)',
          einheit: 'je_100000',
          beschreibung: 'Opfer je 100.000 Einwohner der jeweiligen Gruppe.',
        },
      ],
      spalten,
      jahre,
      hinweise: HINWEISE,
    },
    zeilen: rows,
  };
}
