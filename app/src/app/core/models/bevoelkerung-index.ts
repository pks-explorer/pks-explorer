import { bevoelkerungsSchluessel, type Bevoelkerung } from '@crime-stats/shared';
import type { Filter } from './dataset-view';

/** Bezugsgröße einer Rate: je 100.000 Einwohner oder Anteil der Bevölkerung in Prozent. */
export type Rate = 'je100k' | 'anteil';

export const RATE_FAKTOR: Record<Rate, number> = { je100k: 100_000, anteil: 100 };

/**
 * Wohnbevölkerung je Jahr, Region und Gruppe für eigene Raten. Gruppen werden aus dem Linienfilter
 * gelesen (Region, Geschlecht, Staatsangehörigkeit, Alter); fehlt eine Dimension, gilt "insgesamt".
 */
export class BevoelkerungIndex {
  private readonly einwohner: Map<string, number>;

  constructor(daten: Bevoelkerung) {
    this.einwohner = new Map(
      daten.zeilen.map(([jahr, region, geschlecht, staat, alter, n]) => [
        bevoelkerungsSchluessel(jahr, region, geschlecht, staat, alter),
        n,
      ]),
    );
  }

  /**
   * Einwohner der Gruppe einer Linie; null, wenn es die Zahl nicht gibt (z. B. Alter für Länder) oder
   * sie keine sinnvolle Bezugsgröße ist: Nichtdeutsche Tatverdächtige umfassen auch Personen ohne
   * Wohnsitz in Deutschland (Touristen, Durchreisende), die die Bevölkerungszahl nicht enthält.
   */
  fuer(jahr: number, filter: Filter): number | null {
    const staat = filter['staatsangehoerigkeit'] ?? 'insgesamt';
    if (staat === 'nichtdeutsch') return null;
    const k = bevoelkerungsSchluessel(
      jahr,
      filter['region'] ?? 'DE',
      filter['geschlecht'] ?? 'insgesamt',
      staat,
      filter['alter'] ?? 'insgesamt',
    );
    return this.einwohner.get(k) ?? null;
  }

  /** Werte einer Reihe als Rate; null, wo Wert oder Bevölkerung fehlen. */
  rate(werte: (number | null)[], jahre: number[], filter: Filter, rate: Rate): (number | null)[] {
    return werte.map((v, i) => {
      const e = v === null ? null : this.fuer(jahre[i]!, filter);
      return v === null || !e ? null : (v / e) * RATE_FAKTOR[rate];
    });
  }
}
