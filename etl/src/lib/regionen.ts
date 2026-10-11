/**
 * Länder-, Städte- und Kreistabellen der PKS-Jahrgänge in ein Bundes-Dataset einfügen.
 *
 * Die Jahrgangstabellen enthalten je Region (Land, Stadt, Kreis) ein Berichtsjahr. Jeder Bereich
 * (Fälle, Tatverdächtige, Opfer) liefert nur die Umsetzung einer Tabellenzeile in Datensatzzeilen;
 * Regionserkennung, Kontrolle gegen die Bundeswerte und die Dimension "region" sind hier gemeinsam.
 */
import type { Dataset, DimensionWert, Hinweis, Zelle } from '@crime-stats/shared';
import { readBkaTabelle, type BkaTabelle, type Zeile } from './bka-tabelle.js';
import { LAENDER, REGION_DEUTSCHLAND } from './dimensionen.js';

export type RegionEbene = 'laender' | 'staedte' | 'kreise';

const GRUPPE: Record<RegionEbene, string> = {
  laender: 'Länder',
  staedte: 'Städte',
  kreise: 'Kreise',
};

/** Kreisart laut BKA-Tabelle → Zusatz in der Bezeichnung (unterscheidet z. B. Stadt und Landkreis gleichen Namens). */
const KREISART: Record<string, string> = {
  KfS: 'kreisfreie Stadt',
  SK: 'Stadtkreis',
  K: 'Kreis',
  LK: 'Landkreis',
  RV: 'Regionalverband',
};

/** Ein eingelesener Teil: eine Tabelle eines Jahrgangs. */
export interface RegionalTeil {
  ebene: RegionEbene;
  jahr: number;
  datei: string;
  zeilen: Zelle[][];
  regionen: DimensionWert[];
  /** Zeilen "Bundesrepublik Deutschland" (Region "DE") – nur zur Kontrolle gegen die Bundes-Zeitreihe. */
  bundZeilen: Zelle[][];
}

/** Setzt eine Tabellenzeile in null bis mehrere Datensatzzeilen für die Region um. */
export type ZeilenUmsetzer = (v: Zeile, region: string) => Zelle[][];

interface RegionSpalten {
  name: number;
  kennung?: number;
  art?: number;
}

function regionSpalten(t: BkaTabelle, ebene: RegionEbene): RegionSpalten {
  switch (ebene) {
    case 'laender':
      return { name: t.spalte(/^Bundesland$/) };
    case 'staedte':
      return { name: t.spalte(/^Stadt$/), kennung: t.spalte(/^Gemeinde-?schlüssel$/) };
    case 'kreise':
      return {
        name: t.spalte(/^Stadt-?\/ ?Landkreis$/),
        kennung: t.spalte(/^Gemeinde-?schlüssel$/),
        art: t.spalteOptional(/^Kreisart$/),
      };
  }
}

/** Amtlicher Schlüssel mit fester Stellenzahl (als Zahl gespeichert fehlen führende Nullen). */
const kennung = (roh: string | number | null | undefined, stellen: number) =>
  typeof roh === 'number' ? String(roh).padStart(stellen, '0') : String(roh ?? '').trim();

/** Region einer Zeile: Wert der Dimension, "DE" für Deutschland oder null (keine Datenzeile). */
function regionAus(v: Zeile, s: RegionSpalten, ebene: RegionEbene): DimensionWert | 'DE' | null {
  const name = String(v[s.name] ?? '').trim();
  if (!name) return null;
  if (/^Bundesrepublik/.test(name)) return 'DE';
  const gruppe = GRUPPE[ebene];
  if (ebene === 'laender') {
    const id = LAENDER[name];
    if (!id) throw new Error(`Unbekanntes Land "${name}"`);
    return { id, label: name, gruppe };
  }
  const stellen = ebene === 'staedte' ? 8 : 5;
  const id = kennung(v[s.kennung!], stellen);
  if (!new RegExp(`^\\d{${stellen}}$`).test(id)) return null; // Summen- oder Fußzeilen
  const art = s.art === undefined ? undefined : KREISART[String(v[s.art] ?? '').trim()];
  return { id, label: art ? `${name} (${art})` : name, gruppe };
}

/** Liest eine Jahrgangstabelle und setzt jede Zeile mit `umsetzer(t)` um. */
export async function leseRegionaleTabelle(
  datei: string,
  ebene: RegionEbene,
  jahr: number,
  umsetzer: (t: BkaTabelle) => ZeilenUmsetzer,
): Promise<RegionalTeil> {
  const t = await readBkaTabelle(datei);
  const spalten = regionSpalten(t, ebene);
  const umsetzen = umsetzer(t);
  const teil: RegionalTeil = {
    ebene,
    jahr,
    datei: t.datei,
    zeilen: [],
    regionen: [],
    bundZeilen: [],
  };
  const regionen = new Map<string, DimensionWert>();
  for (const v of t.zeilen) {
    const region = regionAus(v, spalten, ebene);
    if (!region) continue;
    const id = region === 'DE' ? 'DE' : region.id;
    const zeilen = umsetzen(v, id);
    if (region === 'DE') teil.bundZeilen.push(...zeilen);
    else if (zeilen.length) {
      teil.zeilen.push(...zeilen);
      regionen.set(id, region);
    }
  }
  teil.regionen = [...regionen.values()];
  return teil;
}

/** Spalten, die eine Zeile eindeutig machen (Zeilen-Dimensionen). */
const zeilenSchluessel = (ds: Dataset) => {
  const ids = ds.meta.dimensionen.filter((d) => !d.inSpalte).map((d) => d.id);
  const idx = ids.map((id) => ds.meta.spalten.indexOf(id));
  return (z: Zelle[], ohne?: number) => idx.map((i) => (i === ohne ? '' : String(z[i]))).join('|');
};

/**
 * Fügt die regionalen Teile in das Dataset ein, macht "region" zur auswählbaren Dimension und prüft
 * die Deutschland-Zeilen der Ländertabellen gegen die vorhandenen Bundeswerte (`kontrollSpalte`).
 */
export function fuegeRegionenHinzu(
  ds: Dataset,
  teile: RegionalTeil[],
  o: { kontrollSpalte: string; hinweise?: Hinweis[] },
): void {
  const { spalten } = ds.meta;
  const iJahr = spalten.indexOf('jahr');
  const iRegion = spalten.indexOf('region');
  const iKontrolle = spalten.indexOf(o.kontrollSpalte);
  const key = zeilenSchluessel(ds);
  const bund = new Map(ds.zeilen.map((z) => [key(z, iRegion), z[iKontrolle]]));

  const regionen = new Map<string, DimensionWert>();
  const jahre: Record<RegionEbene, number[]> = { laender: [], staedte: [], kreise: [] };
  // neueste Jahrgänge zuerst, damit aktuelle Bezeichnungen gelten
  for (const teil of [...teile].sort((a, b) => b.jahr - a.jahr)) {
    ds.zeilen.push(...teil.zeilen);
    for (const w of teil.regionen) if (!regionen.has(w.id)) regionen.set(w.id, w);
    if (!jahre[teil.ebene].includes(teil.jahr)) jahre[teil.ebene].push(teil.jahr);

    const verglichen = teil.bundZeilen.filter((z) => bund.has(key(z, iRegion)));
    const abweichend = verglichen.filter((z) => bund.get(key(z, iRegion)) !== z[iKontrolle]);
    const kontrolle = verglichen.length
      ? `, Kontrolle Bund: ${verglichen.length - abweichend.length}/${verglichen.length} gleich`
      : '';
    console.log(`  ${teil.jahr} ${teil.ebene}: ${teil.zeilen.length} Zeilen${kontrolle}`);
    if (abweichend.length) {
      console.warn(
        `    abweichend z. B.: ${abweichend
          .slice(0, 3)
          .map((z) => key(z, iRegion))
          .join('; ')}`,
      );
    }
  }

  const sortiert = (ebene: RegionEbene) =>
    [...regionen.values()]
      .filter((w) => w.gruppe === GRUPPE[ebene])
      .sort((a, b) => a.label.localeCompare(b.label, 'de'));
  ds.meta.dimensionen = ds.meta.dimensionen.map((d) =>
    d.id === 'region'
      ? {
          ...d,
          werte: [
            REGION_DEUTSCHLAND,
            ...sortiert('laender'),
            ...sortiert('staedte'),
            ...sortiert('kreise'),
          ],
          standard: REGION_DEUTSCHLAND.id,
        }
      : d,
  );
  ds.meta.jahre = [...new Set(ds.zeilen.map((z) => z[iJahr] as number))].sort((a, b) => a - b);

  const spanne = (j: number[]) => `${Math.min(...j)}–${Math.max(...j)}`;
  const vorhanden = (Object.keys(jahre) as RegionEbene[]).filter((e) => jahre[e].length);
  ds.meta.hinweise.push(
    {
      text: `${vorhanden.map((e) => `${GRUPPE[e]} (${spanne(jahre[e])})`).join(', ')} stammen aus den Tabellen der jeweiligen PKS-Jahrgänge; für Deutschland reicht die Zeitreihe weiter zurück.`,
    },
    ...(o.hinweise ?? []),
  );
}
