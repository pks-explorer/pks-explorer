import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { DataIndex, Dataset, DatasetMeta, Straftat } from '@crime-stats/shared';

/** Werte einer Kennzahl je Jahr für einen Schlüssel. */
export type Zeitreihe = Map<number, number | null>;

/** Ein geladenes Dataset mit Schnellzugriff über Schlüssel und Jahr. */
export class DatasetView {
  private readonly byKey = new Map<string, Map<number, (string | number | null)[]>>();
  private readonly colIndex: Map<string, number>;

  constructor(
    readonly meta: DatasetMeta,
    zeilen: Dataset['zeilen'],
  ) {
    this.colIndex = new Map(meta.spalten.map((s, i) => [s, i]));
    const iJahr = this.col('jahr');
    const iKey = this.col('schluessel');
    for (const z of zeilen) {
      const key = z[iKey] as string;
      let m = this.byKey.get(key);
      if (!m) this.byKey.set(key, (m = new Map()));
      m.set(z[iJahr] as number, z);
    }
  }

  private col(id: string): number {
    const i = this.colIndex.get(id);
    if (i === undefined) throw new Error(`Spalte ${id} fehlt in ${this.meta.id}`);
    return i;
  }

  hasSchluessel(schluessel: string): boolean {
    return this.byKey.has(schluessel);
  }

  zeitreihe(schluessel: string, kennzahl: string): Zeitreihe {
    const i = this.col(kennzahl);
    const out: Zeitreihe = new Map();
    for (const [jahr, z] of this.byKey.get(schluessel) ?? []) out.set(jahr, z[i] as number | null);
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
      return new DatasetView(ds.meta, ds.zeilen);
    });
  }
}
