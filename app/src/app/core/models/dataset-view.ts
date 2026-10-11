import { spaltenId, type DatasetMeta, type DimensionDef, type Zelle } from '@crime-stats/shared';

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
