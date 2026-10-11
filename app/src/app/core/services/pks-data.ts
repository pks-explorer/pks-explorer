import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { AsyncBuffer, FileMetaData } from 'hyparquet';
import type { Bevoelkerung, DataIndex, DatasetMeta, Straftat, Zelle } from '@crime-stats/shared';
import { BevoelkerungIndex } from '../models/bevoelkerung-index';
import { DatasetView, type SpaltenLeser } from '../models/dataset-view';

/**
 * Zugriff auf die aufbereiteten PKS-Daten. Die Komponenten kennen nur diese Schnittstelle;
 * die Implementierung ist austauschbar (heute Parquet über HTTP-Range-Requests, ohne Backend).
 */
export abstract class PksDataSource {
  abstract index(): Promise<DataIndex>;
  abstract straftaten(): Promise<Straftat[]>;
  abstract dataset(id: string): Promise<DatasetView>;
  /** Bevölkerungszahlen für Raten je Einwohner; null, wenn die Daten keine enthalten. */
  abstract bevoelkerung(): Promise<BevoelkerungIndex | null>;
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

  /**
   * index.json immer frisch laden (am Zeitstempel vorbei am Browser- und CDN-Cache): Sie verweist auf
   * die übrigen Dateien, deren Namen einen Inhalts-Hash tragen und daher beliebig lange gecacht werden dürfen.
   */
  index(): Promise<DataIndex> {
    return this.cached('index.json', () =>
      firstValueFrom(this.http.get<DataIndex>(`${this.base}index.json?t=${Date.now()}`)),
    );
  }

  async straftaten(): Promise<Straftat[]> {
    return this.get((await this.index()).straftaten);
  }

  bevoelkerung(): Promise<BevoelkerungIndex | null> {
    return this.cached('bevoelkerung', async () => {
      const datei = (await this.index()).bevoelkerung;
      return datei ? new BevoelkerungIndex(await this.get<Bevoelkerung>(datei)) : null;
    });
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
