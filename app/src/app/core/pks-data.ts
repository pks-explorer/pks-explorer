import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { AsyncBuffer, FileMetaData } from 'hyparquet';
import {
  spaltenId,
  type DataIndex,
  type DatasetMeta,
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

/** Liest einen Zeilenbereich mit den angegebenen Spalten; liefert je Spalte die Werte in Zeilenreihenfolge. */
export type SpaltenLeser = (
  bereich: [number, number],
  spalten: readonly string[],
) => Promise<Record<string, Zelle[]>>;

/**
 * Ein Dataset mit Zugriff über Schlüssel, Jahr und Filter. Die Werte liegen spaltenweise je
 * Straftatenschlüssel vor und werden gezielt nachgeladen (`laden`): nur die gewählten Delikte und nur
 * die Spalten, die die aktuelle Ansicht braucht. Danach ist der Zugriff synchron.
 */
export class DatasetView {
  /** Schlüssel → Spalte → Werte (alle Spalten eines Schlüssels haben dieselbe Zeilenreihenfolge). */
  private readonly daten = new Map<string, Map<string, Zelle[]>>();
  /** Laufende Ladevorgänge je "schluessel|spalte". */
  private readonly ladend = new Map<string, Promise<void>>();
  private readonly zeilenDims: DimensionDef[];
  private readonly spaltenDims: DimensionDef[];
  /** Spalten, die jede Zeitreihe braucht: Jahr und Zeilen-Dimensionen. */
  private readonly basisSpalten: string[];

  constructor(
    readonly meta: DatasetMeta,
    private readonly lesen: SpaltenLeser,
  ) {
    const dims = filterDimensionen(meta);
    this.zeilenDims = dims.filter((d) => !d.inSpalte);
    this.spaltenDims = dims.filter((d) => d.inSpalte);
    this.basisSpalten = ['jahr', ...this.zeilenDims.map((d) => d.id)];
  }

  hatSchluessel(schluessel: string): boolean {
    return schluessel in this.meta.parquet.zeilen;
  }

  /** Wert der Dimension laut Filter, sonst ihr Standardwert. */
  wert(filter: Filter, dim: DimensionDef): string | undefined {
    return filter[dim.id] ?? dim.standard;
  }

  /** Wertespalte für Kennzahl und Filter, z. B. "tv|14-16" (Altersgruppe ist Spalten-Dimension). */
  wertSpalte(kennzahl: string, filter: Filter = {}): string {
    return spaltenId(
      kennzahl,
      this.spaltenDims.map((d) => this.wert(filter, d) ?? ''),
    );
  }

  /** Lädt fehlende Spalten der angegebenen Schlüssel (Basisspalten kommen automatisch dazu). */
  async laden(schluessel: readonly string[], wertSpalten: readonly string[]): Promise<void> {
    const spalten = [...new Set([...this.basisSpalten, ...wertSpalten])];
    await Promise.all(
      schluessel.filter((k) => this.hatSchluessel(k)).map((k) => this.ladeSchluessel(k, spalten)),
    );
  }

  private async ladeSchluessel(schluessel: string, spalten: string[]): Promise<void> {
    const vorhanden = this.daten.get(schluessel);
    const fehlend = spalten.filter(
      (s) => !vorhanden?.has(s) && !this.ladend.has(`${schluessel}|${s}`),
    );
    if (fehlend.length) {
      const p = this.lesen(this.meta.parquet.zeilen[schluessel]!, fehlend).then((werte) => {
        const ziel = this.daten.get(schluessel) ?? new Map<string, Zelle[]>();
        for (const s of fehlend) ziel.set(s, werte[s] ?? []);
        this.daten.set(schluessel, ziel);
      });
      for (const s of fehlend) this.ladend.set(`${schluessel}|${s}`, p);
      // nach Abschluss (auch bei Fehler) nicht mehr als "ladend" führen; Fehler gibt der Aufrufer weiter
      p.finally(() => fehlend.forEach((s) => this.ladend.delete(`${schluessel}|${s}`))).catch(
        () => {},
      );
    }
    // auch auf Ladevorgänge warten, die ein anderer Aufruf für dieselben Spalten gestartet hat
    await Promise.all(spalten.map((s) => this.ladend.get(`${schluessel}|${s}`)));
  }

  /** Zeitreihe aus bereits geladenen Spalten; fehlt eine Spalte, ist die Reihe leer. */
  zeitreihe(schluessel: string, kennzahl: string, filter: Filter = {}): Zeitreihe {
    const out: Zeitreihe = new Map();
    const d = this.daten.get(schluessel);
    const werte = d?.get(this.wertSpalte(kennzahl, filter));
    const jahre = d?.get('jahr');
    if (!werte || !jahre) return out;
    const bedingungen = this.zeilenDims.map(
      (dim) => [d!.get(dim.id), this.wert(filter, dim)] as const,
    );
    if (bedingungen.some(([spalte]) => !spalte)) return out;
    for (let i = 0; i < jahre.length; i++) {
      if (bedingungen.every(([spalte, w]) => spalte![i] === w)) {
        out.set(jahre[i] as number, werte[i] as number | null);
      }
    }
    return out;
  }
}

/**
 * Zugriff auf die aufbereiteten PKS-Daten. Die Komponenten kennen nur diese Schnittstelle;
 * die Implementierung ist austauschbar (heute Parquet über HTTP-Range-Requests, ohne Backend).
 */
export abstract class PksDataSource {
  abstract index(): Promise<DataIndex>;
  abstract straftaten(): Promise<Straftat[]>;
  abstract dataset(id: string): Promise<DatasetView>;
}

interface OffeneDatei {
  file: AsyncBuffer;
  metadata: FileMetaData;
  lesen: typeof import('hyparquet').parquetReadObjects;
  compressors: typeof import('hyparquet-compressors').compressors;
}

/** Erste Leseanfrage am Dateiende; deckt kleine Footer in einer Anfrage ab (größere werden nachgeladen). */
const FOOTER_ANFRAGE = 64 * 1024;

@Injectable()
export class ParquetPksDataSource extends PksDataSource {
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
      const meta = await this.get<DatasetMeta>(eintrag.datei);
      return new DatasetView(meta, this.parquetLeser(meta));
    });
  }

  /** Leser für die Parquet-Datei eines Datasets; Footer und gelesene Bereiche werden zwischengespeichert. */
  private parquetLeser(meta: DatasetMeta): SpaltenLeser {
    // Datei erst beim ersten Lesen öffnen; nach einem Fehler beim nächsten Lesen erneut versuchen
    let datei: Promise<OffeneDatei> | null = null;
    const oeffnen = () =>
      (datei ??= (async (): Promise<OffeneDatei> => {
        // Parquet-Bibliothek erst bei Bedarf laden (nicht im Start-Bundle)
        const [hyparquet, { compressors }] = await Promise.all([
          import('hyparquet'),
          import('hyparquet-compressors'),
        ]);
        const file = hyparquet.cachedAsyncBuffer(
          await hyparquet.asyncBufferFromUrl({
            url: this.base + meta.parquet.datei,
            byteLength: meta.parquet.bytes,
          }),
        );
        const metadata = await hyparquet.parquetMetadataAsync(file, {
          initialFetchSize: FOOTER_ANFRAGE,
        });
        return { file, metadata, lesen: hyparquet.parquetReadObjects, compressors };
      })().catch((err) => {
        datei = null;
        throw err;
      }));

    return async ([rowStart, rowEnd], spalten) => {
      const { file, metadata, lesen, compressors } = await oeffnen();
      const zeilen = await lesen({
        file,
        metadata,
        columns: [...spalten],
        rowStart,
        rowEnd,
        compressors,
      });
      const out: Record<string, Zelle[]> = {};
      for (const s of spalten) out[s] = zeilen.map((z) => (z[s] ?? null) as Zelle);
      return out;
    };
  }
}
