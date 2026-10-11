/** Schreibt Datasets (Parquet + Metadaten), Straftatenkatalog und Index nach data/processed/. */
import { createWriteStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { once } from 'node:events';
import { DuckDBInstance } from '@duckdb/node-api';
import {
  kennzahlVonSpalte,
  type DataIndex,
  type Dataset,
  type DatasetIndexEintrag,
  type DatasetMeta,
  type Straftat,
  type Zelle,
} from '@crime-stats/shared';

/**
 * Zeilen je Row Group. Die App liest beim Öffnen einmal den Datei-Footer (wächst mit der Zahl der
 * Row Groups) und je Auswahl die Row Groups, die den Zeilenbereich eines Delikts überdecken.
 */
export const ROW_GROUP_GROESSE = 25_000;

export class Ausgabe {
  private readonly eintraege: DatasetIndexEintrag[] = [];

  constructor(
    private readonly dir: string,
    private readonly jahrgang: number,
  ) {}

  /** Schreibt <id>.parquet (Zeilen, nach Schlüssel sortiert) und <id>.json (Metadaten mit Zeilenbereichen). */
  async dataset(ds: Dataset): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    const { id } = ds.meta;
    const zeilen = sortiereNachSchluessel(ds);
    const parquet = `${id}.parquet`;
    await schreibeParquet(ds.meta, zeilen, path.join(this.dir, parquet));
    await rm(path.join(this.dir, id), { recursive: true, force: true }); // Partitionen früherer Versionen

    const meta: DatasetMeta = {
      ...ds.meta,
      parquet: {
        datei: parquet,
        bytes: (await stat(path.join(this.dir, parquet))).size,
        zeilen: zeilenbereiche(ds.meta.spalten, zeilen),
      },
    };
    const datei = `${id}.json`;
    await writeFile(path.join(this.dir, datei), JSON.stringify(meta));

    const { titel, bereich, ebene, jahre, kennzahlen } = meta;
    this.eintraege.push({ id, titel, bereich, ebene, datei, jahre, kennzahlen });
    console.log(
      `  → ${parquet}: ${zeilen.length} Zeilen, ${jahre[0]}–${jahre.at(-1)}, ${Object.keys(meta.parquet.zeilen).length} Schlüssel`,
    );
  }

  /** Schreibt Straftatenkatalog und index.json; als Letztes aufrufen. */
  async abschliessen(straftaten: Straftat[]): Promise<void> {
    const index: DataIndex = {
      jahrgang: this.jahrgang,
      datasets: this.eintraege,
      straftaten: 'straftaten.json',
    };
    await writeFile(path.join(this.dir, index.straftaten), JSON.stringify(straftaten));
    await writeFile(path.join(this.dir, 'index.json'), JSON.stringify(index, null, 2));
  }
}

/** Sortiert nach Schlüssel, dann Region, Jahr und übrigen Zeilen-Dimensionen (stabil, reproduzierbar). */
function sortiereNachSchluessel(ds: Dataset): Zelle[][] {
  const dims = ds.meta.dimensionen
    .filter((d) => !d.inSpalte)
    .map((d) => ds.meta.spalten.indexOf(d.id));
  const reihenfolge = [
    ds.meta.spalten.indexOf('schluessel'),
    ...dims.filter((i) => i !== ds.meta.spalten.indexOf('schluessel')),
  ];
  return [...ds.zeilen].sort((a, b) => {
    for (const i of reihenfolge) {
      const x = a[i];
      const y = b[i];
      if (x === y) continue;
      return typeof x === 'number' && typeof y === 'number'
        ? x - y
        : String(x) < String(y)
          ? -1
          : 1;
    }
    return 0;
  });
}

function zeilenbereiche(spalten: string[], zeilen: Zelle[][]): Record<string, [number, number]> {
  const iKey = spalten.indexOf('schluessel');
  const bereiche: Record<string, [number, number]> = {};
  zeilen.forEach((z, i) => {
    const k = z[iKey] as string;
    const b = (bereiche[k] ??= [i, i]);
    b[1] = i + 1;
  });
  return bereiche;
}

/** SQL-Typ je Spalte: Jahr und Anzahlen als Ganzzahl, Raten/Anteile als Kommazahl, sonst Text. */
function sqlTyp(meta: Dataset['meta'], spalte: string): string {
  if (spalte === 'jahr') return 'INTEGER';
  if (meta.dimensionen.some((d) => d.id === spalte)) return 'VARCHAR';
  const einheit = meta.kennzahlen.find((k) => k.id === kennzahlVonSpalte(spalte))?.einheit;
  return einheit === 'anzahl' ? 'INTEGER' : 'DOUBLE';
}

const sqlText = (s: string) => `'${s.replace(/'/g, "''")}'`;
const sqlName = (s: string) => `"${s.replace(/"/g, '""')}"`;

async function schreibeParquet(
  meta: Dataset['meta'],
  zeilen: Zelle[][],
  ziel: string,
): Promise<void> {
  // Zwischendatei als NDJSON, die DuckDB mit festen Spaltentypen einliest
  const tmp = `${ziel}.ndjson`;
  const out = createWriteStream(tmp);
  for (const z of zeilen) {
    const o: Record<string, Zelle> = {};
    meta.spalten.forEach((s, i) => (o[s] = z[i] ?? null));
    if (!out.write(JSON.stringify(o) + '\n')) await once(out, 'drain');
  }
  out.end();
  await once(out, 'finish');

  const spalten = meta.spalten.map((s) => `${sqlText(s)}: ${sqlText(sqlTyp(meta, s))}`).join(', ');
  const instanz = await DuckDBInstance.create(':memory:');
  const con = await instanz.connect();
  try {
    const pfad = (p: string) => sqlText(p.replace(/\\/g, '/'));
    // Reihenfolge der Eingabe bleibt erhalten (preserve_insertion_order ist Standard)
    await con.run(
      `COPY (SELECT ${meta.spalten.map(sqlName).join(', ')} FROM read_ndjson(${pfad(tmp)}, columns = {${spalten}}))
       TO ${pfad(ziel)} (FORMAT parquet, COMPRESSION zstd, ROW_GROUP_SIZE ${ROW_GROUP_GROESSE})`,
    );
  } finally {
    con.closeSync();
    instanz.closeSync();
    await rm(tmp, { force: true });
  }
}
