import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  partitionsDatei,
  spaltenId,
  type DataIndex,
  type Dataset,
  type DatasetMeta,
  type DatasetPartition,
  type DimensionDef,
  type Straftat,
  type Zelle,
} from '@crime-stats/shared';

/** Werte einer Kennzahl je Jahr für einen Schlüssel. */
export type Zeitreihe = Map<number, number | null>;

/** Gewählter Wert je Dimension (Dimension-ID → Wert-ID); fehlende Dimensionen nutzen ihren Standardwert. */
export type Filter = Readonly<Record<string, string>>;

/** Dimensionen außer jahr/region/schluessel, nach denen gefiltert werden kann. */
export const filterDimensionen = (meta: DatasetMeta): DimensionDef[] =>
  meta.dimensionen.filter((d) => d.werte?.length);

/**
 * Ein Dataset mit Schnellzugriff über Schlüssel, Jahr und Filter. Aufgeteilte Datasets laden ihre
 * Zeilen je Straftatenschlüssel erst bei Bedarf (`laden`); danach ist der Zugriff synchron.
 */
export class DatasetView {
  private readonly zeilenJeSchluessel = new Map<string, Zelle[][]>();
  private readonly ladend = new Map<string, Promise<void>>();
  private readonly colIndex: Map<string, number>;
  private readonly verfuegbar: ReadonlySet<string>;
  private readonly zeilenDims: DimensionDef[];
  private readonly spaltenDims: DimensionDef[];

  constructor(
    readonly meta: DatasetMeta,
    zeilen: Zelle[][],
    private readonly ladePartition?: (schluessel: string) => Promise<Zelle[][]>,
  ) {
    this.colIndex = new Map(meta.spalten.map((s, i) => [s, i]));
    this.einsortieren(zeilen);
    this.verfuegbar = new Set(meta.partitionen?.schluessel ?? this.zeilenJeSchluessel.keys());
    const dims = filterDimensionen(meta);
    this.zeilenDims = dims.filter((d) => !d.inSpalte);
    this.spaltenDims = dims.filter((d) => d.inSpalte);
  }

  private col(id: string): number {
    const i = this.colIndex.get(id);
    if (i === undefined) throw new Error(`Spalte ${id} fehlt in ${this.meta.id}`);
    return i;
  }

  private einsortieren(zeilen: Zelle[][]) {
    const iKey = this.col('schluessel');
    for (const z of zeilen) {
      const k = z[iKey] as string;
      const liste = this.zeilenJeSchluessel.get(k) ?? [];
      liste.push(z);
      this.zeilenJeSchluessel.set(k, liste);
    }
  }

  hatSchluessel(schluessel: string): boolean {
    return this.verfuegbar.has(schluessel);
  }

  /** Lädt fehlende Partitionen der angegebenen Schlüssel (bei nicht aufgeteilten Datasets: nichts zu tun). */
  async laden(schluessel: readonly string[]): Promise<void> {
    const lader = this.ladePartition;
    if (!lader) return;
    await Promise.all(
      schluessel
        .filter((k) => this.verfuegbar.has(k) && !this.zeilenJeSchluessel.has(k))
        .map((k) => {
          let p = this.ladend.get(k);
          if (!p) {
            p = lader(k).then((z) => this.einsortieren(z));
            p.catch(() => this.ladend.delete(k));
            this.ladend.set(k, p);
          }
          return p;
        }),
    );
  }

  /** Wert der Dimension laut Filter, sonst ihr Standardwert. */
  wert(filter: Filter, dim: DimensionDef): string | undefined {
    return filter[dim.id] ?? dim.standard;
  }

  zeitreihe(schluessel: string, kennzahl: string, filter: Filter = {}): Zeitreihe {
    const iWert = this.col(
      spaltenId(
        kennzahl,
        this.spaltenDims.map((d) => this.wert(filter, d) ?? ''),
      ),
    );
    const iJahr = this.col('jahr');
    const bedingungen = this.zeilenDims.map((d) => [this.col(d.id), this.wert(filter, d)] as const);
    const out: Zeitreihe = new Map();
    for (const z of this.zeilenJeSchluessel.get(schluessel) ?? []) {
      if (bedingungen.every(([i, w]) => z[i] === w))
        out.set(z[iJahr] as number, z[iWert] as number | null);
    }
    return out;
  }
}

/**
 * Zugriff auf die aufbereiteten PKS-Daten. Die Komponenten kennen nur diese Schnittstelle;
 * die Implementierung (heute statische JSON-Dateien, später z. B. Parquet + DuckDB-WASM) ist austauschbar.
 */
export abstract class PksDataSource {
  abstract index(): Promise<DataIndex>;
  abstract straftaten(): Promise<Straftat[]>;
  abstract dataset(id: string): Promise<DatasetView>;
}

@Injectable()
export class JsonPksDataSource extends PksDataSource {
  private readonly http = inject(HttpClient);
  private readonly base = 'data/';
  private readonly cache = new Map<string, Promise<unknown>>();

  private cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    let p = this.cache.get(key);
    if (!p) {
      p = load();
      p.catch(() => this.cache.delete(key)); // Fehlschläge nicht cachen
      this.cache.set(key, p);
    }
    return p as Promise<T>;
  }

  private get<T>(file: string): Promise<T> {
    return this.cached(file, () => firstValueFrom(this.http.get<T>(this.base + file)));
  }

  index(): Promise<DataIndex> {
    return this.get('index.json');
  }

  async straftaten(): Promise<Straftat[]> {
    return this.get((await this.index()).straftaten);
  }

  dataset(id: string): Promise<DatasetView> {
    return this.cached(`view:${id}`, async () => {
      const eintrag = (await this.index()).datasets.find((d) => d.id === id);
      if (!eintrag) throw new Error(`Unbekanntes Dataset: ${id}`);
      const ds = await this.get<Dataset>(eintrag.datei);
      const p = ds.meta.partitionen;
      const lader = p
        ? (k: string) =>
            firstValueFrom(
              this.http.get<DatasetPartition>(
                `${this.base}${p.verzeichnis}/${encodeURIComponent(partitionsDatei(k))}`,
              ),
            ).then((t) => t.zeilen)
        : undefined;
      return new DatasetView(ds.meta, ds.zeilen, lader);
    });
  }
}
