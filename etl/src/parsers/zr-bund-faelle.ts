/**
 * Parser für "T01-ZR-Bund-Fälle": Grundtabelle Bund als Zeitreihe ab 1987, je Straftatenschlüssel und Jahr.
 *
 * Aufbau (Jahrgang 2024): Zeilen 1–10 Titel/Hinweise, Zeilen 11–14 mehrzeiliger Spaltenkopf,
 * Zeile 15 Spaltennummern 1..14, ab Zeile 16 Daten. Das Jahr 2024 kommt doppelt vor ("2024 Z11" / "2024 Z22"),
 * die Zeilen unterscheiden sich nur in der HZ (Bevölkerungsbasis Zensus 2011 bzw. 2022).
 */
import path from 'node:path';
import type { Dataset, Hinweis, KennzahlDef, Zelle } from '@crime-stats/shared';
import { normalizeText, readWorkbook, round, rowValues, toNumber } from '../lib/xlsx.js';
import type { StraftatenKatalog } from '../lib/straftaten.js';

const KENNZAHLEN: (KennzahlDef & {
  spalte: number;
  kopf: RegExp;
  stellen: number;
})[] = [
  {
    id: 'faelle',
    label: 'Erfasste Fälle',
    einheit: 'anzahl',
    spalte: 3,
    kopf: /Anzahl erfasste Fälle/,
    stellen: 0,
  },
  {
    id: 'hz',
    label: 'Häufigkeitszahl (HZ)',
    einheit: 'je_100000',
    spalte: 4,
    kopf: /^HZ/,
    stellen: 2,
    beschreibung:
      'Erfasste Fälle pro 100.000 Einwohner. 2024 auf Basis Zensus 2011 (vergleichbar mit 2013–2023).',
  },
  {
    id: 'versuche',
    label: 'Versuche',
    einheit: 'anzahl',
    spalte: 5,
    kopf: /Versuche.*Anzahl/,
    stellen: 0,
  },
  {
    id: 'versuche_anteil',
    label: 'Versuche (Anteil)',
    einheit: 'prozent',
    spalte: 6,
    kopf: /Versuche.*in %/,
    stellen: 2,
  },
  {
    id: 'schusswaffe_gedroht',
    label: 'Mit Schusswaffe gedroht',
    einheit: 'anzahl',
    spalte: 7,
    kopf: /Schusswaffe.*gedroht/,
    stellen: 0,
  },
  {
    id: 'schusswaffe_geschossen',
    label: 'Mit Schusswaffe geschossen',
    einheit: 'anzahl',
    spalte: 8,
    kopf: /Schusswaffe.*ge-schossen/,
    stellen: 0,
  },
  {
    id: 'aufgeklaert',
    label: 'Aufgeklärte Fälle',
    einheit: 'anzahl',
    spalte: 9,
    kopf: /Aufklärung.*Anzahl Fälle/,
    stellen: 0,
  },
  {
    id: 'aq',
    label: 'Aufklärungsquote (AQ)',
    einheit: 'prozent',
    spalte: 10,
    kopf: /Aufklärung.*\(AQ\)/,
    stellen: 2,
  },
  {
    id: 'tv',
    label: 'Tatverdächtige insgesamt',
    einheit: 'anzahl',
    spalte: 11,
    kopf: /Tat-verdächtige insgesamt/,
    stellen: 0,
  },
  {
    id: 'tv_nichtdeutsch',
    label: 'Nichtdeutsche Tatverdächtige',
    einheit: 'anzahl',
    spalte: 12,
    kopf: /Nichtdeutsche.*Anzahl/,
    stellen: 0,
  },
  {
    id: 'tv_nichtdeutsch_anteil',
    label: 'Nichtdeutsche Tatverdächtige (Anteil)',
    einheit: 'prozent',
    spalte: 13,
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

const HINWEISE: Hinweis[] = [
  {
    text: '1987–1990: nur früheres Bundesgebiet. 1991–1992: Erfassung in den neuen Ländern noch unvollständig, Vergleiche erst ab 1993 sinnvoll.',
    bisJahr: 1992,
    abJahr: 1993,
    bruch: true,
  },
  {
    text: 'Ab 2009 sind die Tatverdächtigen aufgrund der „echten“ Tatverdächtigenzählung nicht mit den Vorjahren vergleichbar.',
    kennzahlen: ['tv', 'tv_nichtdeutsch', 'tv_nichtdeutsch_anteil'],
    abJahr: 2009,
    bruch: true,
  },
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
  {
    text: 'Änderungen der registrierten Kriminalität entsprechen nicht immer der tatsächlichen Entwicklung (Anzeigeverhalten, Kontrollintensität, Rechtsänderungen, Erfassungsregeln).',
  },
];

/** "2024 Z22" → { jahr: 2024, zensus: "Z22" } */
function parseJahr(v: string | number | null): { jahr: number; zensus?: string } | null {
  if (typeof v === 'number') return { jahr: v };
  const m = typeof v === 'string' ? /^(\d{4})(?:\s+(Z\d{2}))?$/.exec(v.trim()) : null;
  return m ? { jahr: Number(m[1]), zensus: m[2] } : null;
}

export async function parseZrBundFaelle(
  file: string,
  jahrgang: number,
  katalog: StraftatenKatalog,
  url?: string,
): Promise<Dataset> {
  const wb = await readWorkbook(file);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error(`${file}: kein Tabellenblatt`);

  // Spaltenkopf finden und prüfen
  let headerStart = 0;
  for (let r = 1; r <= 30 && !headerStart; r++)
    if (rowValues(ws, r, 1)[0] === 'Schlüssel') headerStart = r;
  if (!headerStart) throw new Error(`${file}: Spaltenkopf "Schlüssel" nicht gefunden`);
  let dataStart = headerStart;
  while (rowValues(ws, dataStart, 1)[0] !== 1)
    if (++dataStart > headerStart + 10)
      throw new Error(`${file}: Spaltennummerierung nicht gefunden`);

  const kopf = Array.from({ length: 14 }, (_, c) => {
    const parts = new Set<string>();
    for (let r = headerStart; r < dataStart; r++) {
      const v = rowValues(ws, r, 14)[c];
      if (v !== null) parts.add(normalizeText(String(v)));
    }
    return [...parts].join(' ');
  });
  for (const k of KENNZAHLEN) {
    if (!k.kopf.test(kopf[k.spalte]!))
      throw new Error(
        `${file}: Spalte ${k.spalte + 1} erwartet ${k.kopf}, gefunden "${kopf[k.spalte]}"`,
      );
  }
  const stand = rowValues(ws, 5, 1)[0];

  // Daten lesen
  const zeilen = new Map<string, Zelle[]>(); // key = schluessel|jahr
  let ungueltig = 0;
  for (let r = dataStart + 1; r <= ws.rowCount; r++) {
    const v = rowValues(ws, r, 14);
    const schluessel = v[0] === null ? null : String(v[0]).trim();
    const j = parseJahr(v[2] ?? null);
    if (!schluessel || !j) continue;

    const key = `${schluessel}|${j.jahr}`;
    let zeile = zeilen.get(key);
    if (!zeile) {
      zeile = [j.jahr, 'DE', schluessel, ...KENNZAHLEN.map(() => null), null];
      zeilen.set(key, zeile);
    }
    const hzZ22Index = zeile.length - 1;
    if (j.zensus === 'Z22') {
      zeile[hzZ22Index] = round(toNumber(v[4] ?? null), 2);
      continue; // übrige Werte identisch mit der Z11-Zeile
    }
    katalog.add(schluessel, j.jahr, String(v[1] ?? ''));
    KENNZAHLEN.forEach((k, i) => {
      const raw = v[k.spalte] ?? null;
      const n = toNumber(raw);
      if (n === null && raw !== null && raw !== '-') ungueltig++;
      zeile[3 + i] = round(n, k.stellen);
    });
  }
  if (ungueltig)
    console.warn(
      `  ${path.basename(file)}: ${ungueltig} nicht-numerische Zellen als leer übernommen`,
    );

  const rows = [...zeilen.values()];
  const jahre = [...new Set(rows.map((z) => z[0] as number))].sort((a, b) => a - b);
  const kennzahlen = [
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
      quelle: {
        jahrgang,
        datei: path.basename(file),
        url,
        stand: typeof stand === 'string' ? stand : undefined,
      },
      dimensionen: [
        { id: 'jahr', label: 'Jahr' },
        { id: 'region', label: 'Region' },
        { id: 'schluessel', label: 'Straftatenschlüssel' },
      ],
      kennzahlen,
      spalten: ['jahr', 'region', 'schluessel', ...kennzahlen.map((k) => k.id)],
      jahre,
      hinweise: HINWEISE,
    },
    zeilen: rows,
  };
}
