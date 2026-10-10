/**
 * Gemeinsames Datenmodell für ETL und App.
 *
 * Jede BKA-Tabelle wird zu einem "Dataset": eine Faktentabelle, deren Spalten aus Dimensionen
 * (jahr, region, schluessel, später z. B. alter/geschlecht) und Kennzahlen (faelle, hz, …) bestehen.
 * Physisch werden die Zeilen kompakt als Arrays gespeichert (Spaltenreihenfolge = meta.spalten).
 */

/** Räumliche Ebene. */
export type Ebene = 'bund' | 'land' | 'kreis' | 'stadt';

export type Einheit = 'anzahl' | 'prozent' | 'je_100000';

export interface KennzahlDef {
  id: string;
  label: string;
  einheit: Einheit;
  beschreibung?: string;
}

export interface DimensionDef {
  id: string;
  label: string;
}

/** Methodischer Bruch oder Hinweis, optional auf Kennzahlen und einen Zeitraum bezogen. */
export interface Hinweis {
  text: string;
  /** Betroffene Kennzahlen; leer/fehlend = alle. */
  kennzahlen?: string[];
  /** Ab diesem Jahr gilt der Hinweis (für Markierungen im Diagramm). */
  abJahr?: number;
  /** Bis einschließlich diesem Jahr gilt der Hinweis. */
  bisJahr?: number;
  /** true = Werte vor/nach `abJahr` sind nicht direkt vergleichbar. */
  bruch?: boolean;
}

export interface Quelle {
  /** PKS-Jahrgang der Veröffentlichung. */
  jahrgang: number;
  datei: string;
  url?: string;
  /** Stand/Version laut Tabelle, z. B. "V1.1 erstellt am: 23.04.2025". */
  stand?: string;
}

export type Zelle = string | number | null;

export interface DatasetMeta {
  id: string;
  titel: string;
  ebene: Ebene;
  quelle: Quelle;
  dimensionen: DimensionDef[];
  kennzahlen: KennzahlDef[];
  /** Spaltenreihenfolge der Zeilen: erst Dimensions-, dann Kennzahl-IDs. */
  spalten: string[];
  jahre: number[];
  hinweise: Hinweis[];
}

export interface Dataset {
  meta: DatasetMeta;
  zeilen: Zelle[][];
}

/** Ein Eintrag im Straftatenkatalog. */
export interface Straftat {
  schluessel: string;
  /** Aktuellste Bezeichnung. */
  name: string;
  /**
   * Übergeordneter Schlüssel ("------" = Straftaten insgesamt). null für die Wurzel und für die
   * obersten 89xxxx-Summenschlüssel, die quer zur Hierarchie liegen (z. B. Gewaltkriminalität).
   */
  parent: string | null;
  /** Summenschlüssel: 89xxxx oder mit Platzhaltern wie 4***00 (Diebstahl, Teil der Hierarchie). */
  summenschluessel: boolean;
  /** Verlauf der Bezeichnung, chronologisch; nur vorhanden, wenn sie sich geändert hat. */
  namensverlauf?: { vonJahr: number; bisJahr: number; name: string }[];
}

export interface DatasetIndexEintrag {
  id: string;
  titel: string;
  ebene: Ebene;
  datei: string;
  jahre: number[];
  kennzahlen: KennzahlDef[];
}

/** data/processed/index.json */
export interface DataIndex {
  erstellt: string;
  datasets: DatasetIndexEintrag[];
  /** Datei mit dem Straftatenkatalog (Straftat[]). */
  straftaten: string;
}

/** Schlüssel für "Straftaten insgesamt". */
export const SCHLUESSEL_INSGESAMT = '------';
