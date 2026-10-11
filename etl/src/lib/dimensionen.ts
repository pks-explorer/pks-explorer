/** Dimensionswerte und Spaltenköpfe, die in mehreren BKA-Tabellen gleich sind. */
import type { DimensionDef, DimensionWert } from '@crime-stats/shared';

export const GESCHLECHT: DimensionWert[] = [
  { id: 'insgesamt', label: 'Alle' },
  { id: 'maennlich', label: 'Männlich' },
  { id: 'weiblich', label: 'Weiblich' },
];

/** Spaltenkopf-Endungen für das Geschlecht ("… | insges." / "… | männl." / …). */
export const GESCHLECHT_KOPF: Record<string, RegExp> = {
  insgesamt: /\| (insgesamt|insge-samt|insges\.|insg\.)$/,
  maennlich: /\| (männlich|männl\.)$/,
  weiblich: /\| (weiblich|weibl\.)$/,
};

/** Dimensionen, die jede Zeitreihe hat (je Aufruf neue Objekte, da Datasets sie erweitern). */
export const basisDimensionen = (): DimensionDef[] => [
  { id: 'jahr', label: 'Jahr' },
  { id: 'region', label: 'Region' },
  { id: 'schluessel', label: 'Straftatenschlüssel' },
];

/** Nur die Felder eines Dimensionswerts übernehmen (Parser-Definitionen enthalten zusätzlich Spaltenmuster). */
export const alsWerte = (defs: DimensionWert[]): DimensionWert[] =>
  defs.map(({ id, label, hinweis, hinweisKennzahlen, gruppe }) => ({
    id,
    label,
    ...(hinweis ? { hinweis } : {}),
    ...(hinweisKennzahlen ? { hinweisKennzahlen } : {}),
    ...(gruppe ? { gruppe } : {}),
  }));

/** Bundesländer mit amtlicher Kennziffer (erste zwei Stellen des Gemeindeschlüssels). */
export const LAENDER: Record<string, string> = {
  'Schleswig-Holstein': '01',
  Hamburg: '02',
  Niedersachsen: '03',
  Bremen: '04',
  'Nordrhein-Westfalen': '05',
  Hessen: '06',
  'Rheinland-Pfalz': '07',
  'Baden-Württemberg': '08',
  Bayern: '09',
  Saarland: '10',
  Berlin: '11',
  Brandenburg: '12',
  'Mecklenburg-Vorpommern': '13',
  Sachsen: '14',
  'Sachsen-Anhalt': '15',
  Thüringen: '16',
};

export const REGION_DEUTSCHLAND: DimensionWert = { id: 'DE', label: 'Deutschland', gruppe: 'Bund' };
