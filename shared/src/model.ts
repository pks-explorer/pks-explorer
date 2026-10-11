/**
 * Gemeinsames Datenmodell für ETL und App.
 *
 * Jede BKA-Tabelle wird zu einem "Dataset": eine Faktentabelle, deren Spalten aus Dimensionen
 * (jahr, region, schluessel, geschlecht, alter, …) und Kennzahlen (faelle, hz, tv, …) bestehen.
 * Physisch werden die Zeilen kompakt als Arrays gespeichert (Spaltenreihenfolge = meta.spalten).
 * Dimensionen mit `inSpalte` (z. B. Altersgruppen) sind in die Spalten-IDs eingefaltet, damit breite
 * BKA-Tabellen nicht vervielfacht werden müssen.
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

export interface DimensionWert {
  id: string;
  label: string;
  /** Kurze Erläuterung, z. B. wenn die Gruppe anders abgegrenzt ist als üblich. */
  hinweis?: string;
  /** Kennzahlen, für die der Hinweis gilt; fehlt = alle. */
  hinweisKennzahlen?: string[];
  /** Gruppe für die Auswahl, z. B. "Länder" oder "Städte". */
  gruppe?: string;
}

export interface DimensionDef {
  id: string;
  label: string;
  /** Mögliche Werte (für Filter); fehlt bei jahr, region und schluessel. */
  werte?: DimensionWert[];
  /** Vorauswahl, z. B. "insgesamt". */
  standard?: string;
  /**
   * Vorauswahl für "Vergleichen nach": überschneidungsfreie Werte, z. B. männlich/weiblich oder
   * Kinder/Jugendliche/…. Fehlt sie (z. B. bei Regionen), wählt man die Werte selbst.
   */
  vergleich?: string[];
  /**
   * Der Wert steht nicht in einer eigenen Zeilenspalte, sondern ist Teil der Spalten-ID
   * (spart Platz bei breiten Tabellen, z. B. Altersgruppen). Siehe `spaltenId`.
   */
  inSpalte?: boolean;
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
  /** Kurzname für die Auswahl in der App, z. B. "Tatverdächtige". */
  bereich: string;
  ebene: Ebene;
  quelle: Quelle;
  dimensionen: DimensionDef[];
  kennzahlen: KennzahlDef[];
  /**
   * Spaltenreihenfolge der Zeilen: erst die Zeilen-Dimensionen, dann die Wertespalten.
   * Wertespalten heißen wie die Kennzahl, bei Spalten-Dimensionen ergänzt um deren Werte (siehe `spaltenId`).
   */
  spalten: string[];
  jahre: number[];
  hinweise: Hinweis[];
  /** Große Datasets sind je Straftatenschlüssel in eigene Dateien aufgeteilt. */
  partitionen?: Partitionierung;
}

export interface Partitionierung {
  nach: 'schluessel';
  /** Verzeichnis relativ zu data/processed. */
  verzeichnis: string;
  /** Vorhandene Schlüssel (je eine Datei, siehe `partitionsDatei`). */
  schluessel: string[];
}

/** Inhalt einer Partitionsdatei: Zeilen im Format von `meta.spalten`. */
export interface DatasetPartition {
  zeilen: Zelle[][];
}

/** ID einer Wertespalte, z. B. "tv|14-16" (Kennzahl tv, Altersgruppe 14–16). */
export const spaltenId = (kennzahl: string, spaltenWerte: string[] = []) =>
  [kennzahl, ...spaltenWerte].join('|');

/** Dateiname einer Partition; "*" ist in Dateinamen nicht überall erlaubt. */
export const partitionsDatei = (schluessel: string) => `${schluessel.replace(/\*/g, 'x')}.json`;

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
  /**
   * Summenschlüssel: 89xxxx, BKA-intern 9xxxxx oder mit Platzhaltern wie 4***00
   * (Diebstahl, Teil der Hierarchie).
   */
  summenschluessel: boolean;
  /** Verlauf der Bezeichnung, chronologisch; nur vorhanden, wenn sie sich geändert hat. */
  namensverlauf?: { vonJahr: number; bisJahr: number; name: string }[];
  /** Erläuterungen aus Straftatenkatalog, Summenschlüssel-Übersicht und Definitionskatalog des BKA. */
  erlaeuterung?: Erlaeuterung;
}

export interface SchluesselVerweis {
  schluessel: string;
  name: string;
  /** Bestandteil wird abgezogen (z. B. "Straftaten insgesamt ohne 725000"). */
  ohne?: boolean;
}

export interface Definition {
  titel: string;
  /** Schlüssel(-muster) der Definition, z. B. "5181**"; kann auch einen Unterschlüssel betreffen. */
  schluessel: string[];
  /** Absätze. */
  text: string[];
}

export interface Erlaeuterung {
  /** Amtliche Bezeichnung im Straftatenkatalog (mit Paragrafen). */
  katalogName?: string;
  /** Beschreibung der Zusammensetzung eines Summenschlüssels. */
  zusammensetzung?: string;
  /** Enthaltene Schlüssel: Bestandteile eines Summenschlüssels bzw. direkte Unterschlüssel laut Katalog. */
  umfasst?: SchluesselVerweis[];
  /** Begriffsdefinitionen aus dem Definitionskatalog (Anlage 3 der PKS-Richtlinien). */
  definitionen?: Definition[];
  /** Erfassungsmerkmale, z. B. "Opfererfassung". */
  merkmale?: string[];
  /** Änderung gegenüber dem Vorjahr laut Straftatenkatalog. */
  aenderung?: string;
  /** Herkunft der Angaben, z. B. "Straftatenkatalog 2024". */
  quellen: string[];
}

export interface DatasetIndexEintrag {
  id: string;
  titel: string;
  bereich: string;
  ebene: Ebene;
  datei: string;
  jahre: number[];
  kennzahlen: KennzahlDef[];
}

/** data/processed/index.json */
export interface DataIndex {
  /** PKS-Jahrgang, aus dem die Daten stammen. */
  jahrgang: number;
  datasets: DatasetIndexEintrag[];
  /** Datei mit dem Straftatenkatalog (Straftat[]). */
  straftaten: string;
}

/** Schlüssel für "Straftaten insgesamt". */
export const SCHLUESSEL_INSGESAMT = '------';
