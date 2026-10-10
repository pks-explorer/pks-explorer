import type { Definition, Erlaeuterung, Straftat } from '@crime-stats/shared';
import { AENDERUNG, unterschluessel, type KatalogEintrag } from '../parsers/katalog-pdf.js';
import type { Summenschluessel } from '../parsers/summenschluessel-pdf.js';
import { cleanName } from './straftaten.js';

export interface ErlaeuterungsQuellen {
  jahrgang: number;
  katalog?: KatalogEintrag[];
  definitionen?: Definition[];
  summen?: Summenschluessel[];
}

/** Das Muster deckt den Schlüssel ab, wenn jede Stelle gleich ist oder im Muster ein Platzhalter steht. */
const passt = (muster: string, k: string) => [...muster].every((c, i) => c === '*' || c === k[i]);

/** Standard-Einleitung ohne Zusatzinformation ("Der Summenschlüssel "…" umfasst die folgenden Straftatenschlüssel:"). */
const STANDARD_EINLEITUNG =
  /^Der Summenschlüssel\s*[„"“].*[“"”]\s*(umfasst|enthält)\s+(die\s+)?folgenden?\s+(Straftaten)?[Ss]chlüssel\s*:?$/;

/** Definition gehört zum Schlüssel, wenn ihr Muster ihn abdeckt oder sie einen Unterschlüssel (xxxxNN) davon beschreibt. */
function definitionPasst(muster: string, k: string): boolean {
  if (!/^[0-9*]{6}$/.test(k)) return false;
  // Platzhalter an erster Stelle steht für einfachen (3) oder schweren (4) Diebstahl, z. B. *90*** = Taschendiebstahl
  if (muster.startsWith('*') && !/^[34*]/.test(k)) return false;
  if (passt(muster, k)) return true;
  return k.endsWith('00') && !muster.includes('*') && muster.startsWith(k.slice(0, 4));
}

export function ergaenzeErlaeuterungen(straftaten: Straftat[], q: ErlaeuterungsQuellen): number {
  const katalog = new Map((q.katalog ?? []).map((e) => [e.schluessel, e]));
  const kinder = unterschluessel(q.katalog ?? []);
  const summen = new Map((q.summen ?? []).map((s) => [s.schluessel, s]));
  const defs = (q.definitionen ?? []).filter((d) => d.schluessel.length && d.text.length);
  let n = 0;

  for (const s of straftaten) {
    const e: Erlaeuterung = { quellen: [] };
    const kat = katalog.get(s.schluessel);
    if (kat) {
      e.katalogName = cleanName(kat.name);
      const merkmale = [kat.opfer && 'Opfererfassung', kat.schaden && 'Schadenserfassung'].filter(
        (m): m is string => !!m,
      );
      if (merkmale.length) e.merkmale = merkmale;
      if (kat.aenderung && AENDERUNG[kat.aenderung]) e.aenderung = AENDERUNG[kat.aenderung];
      e.quellen.push(`Straftatenkatalog ${q.jahrgang}`);
    }

    const summe = summen.get(s.schluessel);
    if (summe) {
      if (!STANDARD_EINLEITUNG.test(summe.text)) e.zusammensetzung = summe.text;
      if (summe.umfasst.length)
        e.umfasst = summe.umfasst.map((u) => ({
          ...u,
          name: cleanName(u.name),
        }));
      e.quellen.push(`Übersicht Summenschlüssel ${q.jahrgang}`);
    } else {
      const k = kinder.get(s.schluessel);
      if (k)
        e.umfasst = k.map((c) => ({
          schluessel: c.schluessel,
          name: cleanName(c.name),
        }));
    }

    const passend = defs.filter((d) => d.schluessel.some((m) => definitionPasst(m, s.schluessel)));
    if (passend.length) {
      e.definitionen = passend;
      e.quellen.push(`Definitionskatalog (PKS-Richtlinien ${q.jahrgang}, Anlage 3)`);
    }

    if (e.quellen.length) {
      s.erlaeuterung = e;
      n++;
    }
  }
  return n;
}
