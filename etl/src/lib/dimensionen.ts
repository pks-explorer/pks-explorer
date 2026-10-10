/** Dimensionswerte und Spaltenköpfe, die in mehreren BKA-Tabellen gleich sind. */
import type { DimensionDef, DimensionWert } from '@crime-stats/shared';

export const GESCHLECHT: DimensionWert[] = [
  { id: 'insgesamt', label: 'Alle' },
  { id: 'maennlich', label: 'Männlich' },
  { id: 'weiblich', label: 'Weiblich' },
];

/** Spaltenkopf-Endungen für das Geschlecht ("… | insges." / "… | männl." / …). */
export const GESCHLECHT_KOPF: Record<string, RegExp> = {
  insgesamt: /\| (insgesamt|insges\.|insg\.)$/,
  maennlich: /\| (männlich|männl\.)$/,
  weiblich: /\| (weiblich|weibl\.)$/,
};

/** Dimensionen, die jede Zeitreihe hat. */
export const BASIS_DIMENSIONEN: DimensionDef[] = [
  { id: 'jahr', label: 'Jahr' },
  { id: 'region', label: 'Region' },
  { id: 'schluessel', label: 'Straftatenschlüssel' },
];

/** Nur die Felder eines Dimensionswerts übernehmen (Parser-Definitionen enthalten zusätzlich Spaltenmuster). */
export const alsWerte = (defs: DimensionWert[]): DimensionWert[] =>
  defs.map(({ id, label, hinweis, hinweisKennzahlen }) => ({
    id,
    label,
    ...(hinweis ? { hinweis } : {}),
    ...(hinweisKennzahlen ? { hinweisKennzahlen } : {}),
  }));
