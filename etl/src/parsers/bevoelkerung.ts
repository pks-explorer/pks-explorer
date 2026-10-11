/**
 * Bevölkerungstabellen des BKA (Seite "Bevölkerungszahlen", Quelle Statistisches Bundesamt):
 *   02-BU-BV-OGZ-insg  Bund ab 2000 nach Alter und Geschlecht
 *   03-LA-BV-insg      Länder (und Bund) nach Staatsangehörigkeit und Geschlecht, je Jahrgang
 *   04-KR-BV-insg      Kreise nach Geschlecht, je Jahrgang
 *   05-ST-BV-insg      Städte nach Geschlecht, je Jahrgang
 * Bevölkerungsstand jeweils 31.12. des Vorjahres; ab 2013 auf Basis Zensus 2011 (für 2024 wie bei den
 * Raten des BKA die Zensus-2011-Fortschreibung, damit die Reihe vergleichbar bleibt).
 */
import { bevoelkerungsSchluessel, type Bevoelkerung } from '@crime-stats/shared';
import { readBkaTabelle, type BkaTabelle } from '../lib/bka-tabelle.js';
import { GESCHLECHT_KOPF, LAENDER } from '../lib/dimensionen.js';
import { toNumber } from '../lib/xlsx.js';
import { parseJahr } from '../lib/zeitreihe.js';

type Zeile = Bevoelkerung['zeilen'][number];

/** Altersgruppen der Bundestabelle (IDs wie bei Opfern und Tatverdächtigen). */
const ALTER_BUND: Record<string, RegExp> = {
  insgesamt: /^Wohnbevölkerung -insgesamt-/,
  kinder: /(^|\| )unter 14 \|/,
  jugendliche: /14 bis unter 18/,
  heranwachsende: /18 bis unter 21/,
  '21-60': /21 bis unter 60/,
  '60+': /60 und älter/,
  erwachsene: /Erwachsene \| insgesamt \|/,
};

const STAATSANGEHOERIGKEIT: Record<string, RegExp> = {
  insgesamt: /^Bevölkerung insgesamt/,
  deutsch: /^Deutsche Bevölkerung/,
  nichtdeutsch: /^Nichtdeutsche Bevölkerung/,
};

/** Spalte für zwei unabhängige Bedingungen an den Spaltenkopf. */
const spalteMit = (t: BkaTabelle, a: RegExp, b: RegExp) =>
  t.spalte(new RegExp(`(?=.*${a.source})(?=.*${b.source})`));

const anzahl = (v: string | number | null | undefined) => {
  const n = toNumber(v ?? null);
  return n === null ? null : Math.round(n);
};

/** Bund: alle Berichtsjahre einer Tabelle (Bereich 20 = Bundesgebiet). */
export async function parseBundBevoelkerung(datei: string): Promise<Zeile[]> {
  const t = await readBkaTabelle(datei, { kopfBeginn: /^Be- ?reich$/ });
  const iJahr = t.spalte(/Berichtsjahr/);
  const spalten = Object.entries(ALTER_BUND).flatMap(([alter, a]) =>
    Object.entries(GESCHLECHT_KOPF).map(([geschlecht, g]) => ({
      alter,
      geschlecht,
      i: spalteMit(t, a, g),
    })),
  );
  const zeilen: Zeile[] = [];
  for (const v of t.zeilen) {
    if (String(v[0]).trim() !== '20') continue;
    const j = parseJahr(v[iJahr]);
    if (!j || j.zensus === 'Z22') continue; // vergleichbare Reihe (Zensus 2011) verwenden
    for (const s of spalten) {
      const n = anzahl(v[s.i]);
      if (n !== null) zeilen.push([j.jahr, 'DE', s.geschlecht, 'insgesamt', s.alter, n]);
    }
  }
  return zeilen;
}

/** Länder (und Bund) eines Berichtsjahres nach Staatsangehörigkeit und Geschlecht. */
export async function parseLaenderBevoelkerung(datei: string, jahr: number): Promise<Zeile[]> {
  const t = await readBkaTabelle(datei, { kopfBeginn: /^Land$/ });
  const iKennung = t.spalte(/^Land \| Schlüssel$/);
  const iName = t.spalte(/^Land \| Bezeichnung$/);
  const laenderIds = new Set(Object.values(LAENDER));
  const spalten = Object.entries(STAATSANGEHOERIGKEIT).flatMap(([staat, s]) =>
    (['insgesamt', 'maennlich', 'weiblich'] as const).map((geschlecht) => ({
      staat,
      geschlecht,
      i: spalteMit(
        t,
        s,
        geschlecht === 'insgesamt' ? /\| insgesamt$/ : GESCHLECHT_KOPF[geschlecht]!,
      ),
    })),
  );
  const zeilen: Zeile[] = [];
  for (const v of t.zeilen) {
    const kennung = String(v[iKennung] ?? '')
      .trim()
      .padStart(2, '0');
    const name = String(v[iName] ?? '').trim();
    const region = laenderIds.has(kennung)
      ? kennung
      : /^(Bund|Deutschland|Bundesrepublik)/.test(name)
        ? 'DE'
        : null;
    if (!region) continue;
    for (const s of spalten) {
      const n = anzahl(v[s.i]);
      if (n !== null) zeilen.push([jahr, region, s.geschlecht, s.staat, 'insgesamt', n]);
    }
  }
  return zeilen;
}

/**
 * Vergleichbarer Ortsname: ohne Zusatz in Klammern, nach Komma ("Rostock, Hanse- und Universitätsstadt")
 * oder zweitsprachigen Namen ("Cottbus/Chóśebuz").
 */
export const ortsname = (s: string) =>
  s
    .split(/[/,]/)[0]!
    .replace(/\(.*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

/**
 * Kreise (5-stelliger Gemeindeschlüssel) oder Städte (8-stellig) eines Berichtsjahres nach Geschlecht.
 * Mit `namen` (Ortsname → Region) gilt der Name: In der Städtetabelle 2024 sind die Schlüssel ab
 * Cottbus um eine Zeile verrutscht (Hamburg trägt dort den Schlüssel von Halle), Namen und Werte nicht.
 */
export async function parseGemeindeBevoelkerung(
  datei: string,
  jahr: number,
  stellen: 5 | 8,
  namen?: Map<string, string>,
): Promise<Zeile[]> {
  const t = await readBkaTabelle(datei, { kopfBeginn: /^Bundes-? ?land$/ });
  const iKennung = t.spalte(/Gemeinde-?schlüssel/);
  const iName = t.spalte(/^Stadt( \/ Landkreis)?$/);
  const spalten = (['insgesamt', 'maennlich', 'weiblich'] as const).map((geschlecht) => ({
    geschlecht,
    i: spalteMit(t, /^Bevölkerung/, GESCHLECHT_KOPF[geschlecht]!),
  }));
  const zeilen: Zeile[] = [];
  let korrigiert = 0;
  const unbekannt: string[] = [];
  for (const v of t.zeilen) {
    const roh = v[iKennung];
    const schluessel =
      typeof roh === 'number' ? String(roh).padStart(stellen, '0') : String(roh ?? '').trim();
    if (!new RegExp(`^\\d{${stellen}}$`).test(schluessel)) continue;
    const name = String(v[iName] ?? '');
    // Mit Namenszuordnung nur bekannte Orte übernehmen – der Schlüssel könnte ja verrutscht sein
    const region = namen ? namen.get(ortsname(name)) : schluessel;
    if (!region) {
      unbekannt.push(name);
      continue;
    }
    if (region !== schluessel) korrigiert++;
    for (const s of spalten) {
      const n = anzahl(v[s.i]);
      if (n !== null) zeilen.push([jahr, region, s.geschlecht, 'insgesamt', 'insgesamt', n]);
    }
  }
  if (korrigiert)
    console.log(`  ${t.datei} ${jahr}: ${korrigiert} Schlüssel über den Namen korrigiert`);
  if (unbekannt.length)
    console.log(`  ${t.datei} ${jahr}: ohne Fallzahlen übergangen: ${unbekannt.join(', ')}`);
  return zeilen;
}

/** Fügt Zeilen zusammen; spätere Quellen überschreiben frühere nicht (erste Angabe je Schlüssel gilt). */
export function bevoelkerungZusammenfuehren(teile: Zeile[][], quellen: string[]): Bevoelkerung {
  const gesehen = new Set<string>();
  const zeilen: Zeile[] = [];
  for (const teil of teile) {
    for (const z of teil) {
      const k = z.slice(0, 5).join('|');
      if (gesehen.has(k)) continue;
      gesehen.add(k);
      zeilen.push(z);
    }
  }
  zeilen.sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1]));
  return {
    spalten: ['jahr', 'region', 'geschlecht', 'staatsangehoerigkeit', 'alter', 'einwohner'],
    zeilen,
    quellen,
  };
}

/**
 * Kontrolle: Fälle ÷ Bevölkerung × 100.000 muss die amtliche HZ treffen (Straftaten insgesamt).
 * Liefert je Region die größte relative Abweichung, sortiert absteigend.
 */
export function kontrolliereGegenHz(
  bevoelkerung: Bevoelkerung,
  faelle: { jahr: number; region: string; faelle: number; hz: number }[],
): { region: string; jahr: number; abweichung: number }[] {
  const einwohner = new Map(
    bevoelkerung.zeilen.map((z) => [bevoelkerungsSchluessel(z[0], z[1], z[2], z[3], z[4]), z[5]]),
  );
  return faelle
    .flatMap(({ jahr, region, faelle: f, hz }) => {
      const e = einwohner.get(bevoelkerungsSchluessel(jahr, region));
      return e && hz ? [{ region, jahr, abweichung: Math.abs((f / e) * 1e5 - hz) / hz }] : [];
    })
    .sort((a, b) => b.abweichung - a.abweichung);
}
