import type { DimensionDef } from '@crime-stats/shared';
import type { Filter } from './dataset-view';

export interface Serie {
  /** Eindeutig je Linie, z. B. "892000" oder "892000|weiblich" beim Vergleich nach einer Dimension. */
  id: string;
  /** Straftatenschlüssel der Linie. */
  schluessel: string;
  label: string;
  farbe: string;
  /** Werte passend zu `jahre` (gleiche Länge); null = kein Wert. */
  werte: (number | null)[];
}

/** Eine anzuzeigende Linie, bevor Werte und Farbe feststehen. */
export interface Linie {
  id: string;
  schluessel: string;
  label: string;
  filter: Filter;
}

/** Markierung eines methodischen Bruchs im Diagramm. */
export interface Markierung {
  jahr: number;
  text: string;
}

/** Dimension, deren Werte als eigene Linien gezeigt werden, mit den gewählten Werten. */
export interface Vergleich {
  dim: DimensionDef;
  werte: readonly string[];
}
