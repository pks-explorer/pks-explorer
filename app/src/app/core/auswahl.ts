import { Injectable, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { SCHLUESSEL_INSGESAMT } from '@crime-stats/shared';

export type Darstellung = 'absolut' | 'index';

/** Höchstzahl gleichzeitig angezeigter Linien (= Anzahl Farben der Palette). */
export const MAX_LINIEN = 8;
/** Standard-Startjahr: erst ab 1993 sind die Zahlen inkl. neuer Länder vergleichbar. */
export const STANDARD_VON = 1993;
export const STANDARD_DATASET = 'bund-faelle-zeitreihe';

/** Query-Parameter, die keine Dimensionsfilter sind. */
const FESTE_PARAMETER = new Set(['ds', 'k', 'modus', 'd', 'von', 'bis', 'vgl']);

/**
 * Aktuelle Auswahl (Bereich, Delikte, Kennzahl, Filter, Zeitraum, Darstellung).
 * Einzige Quelle ist die URL (Query-Parameter), damit jede Ansicht als Link teilbar ist.
 * Dimensionsfilter stehen unter ihrer Dimension-ID, z. B. `?geschlecht=weiblich&alter=14-16`.
 */
@Injectable({ providedIn: 'root' })
export class Auswahl {
  private readonly router = inject(Router);
  private readonly params = toSignal(inject(ActivatedRoute).queryParamMap, { requireSync: true });

  readonly datasetId = computed(() => this.params().get('ds') ?? STANDARD_DATASET);
  readonly kennzahl = computed(() => this.params().get('k'));
  readonly darstellung = computed<Darstellung>(() =>
    this.params().get('modus') === 'index' ? 'index' : 'absolut',
  );
  readonly delikte = computed(() => {
    const d = this.params().get('d');
    const list = d === null ? [SCHLUESSEL_INSGESAMT] : d.split(',').filter(Boolean);
    return [...new Set(list)].slice(0, MAX_LINIEN);
  });
  readonly von = computed(() => toInt(this.params().get('von')));
  readonly bis = computed(() => toInt(this.params().get('bis')));
  /** Dimension, deren Werte als eigene Linien verglichen werden (z. B. "geschlecht"). */
  readonly vergleich = computed(() => this.params().get('vgl'));
  /** Gewählte Dimensionswerte (alle übrigen Query-Parameter). */
  readonly filter = computed(() => {
    const p = this.params();
    const out: Record<string, string> = {};
    for (const k of p.keys) if (!FESTE_PARAMETER.has(k)) out[k] = p.get(k)!;
    return out as Readonly<Record<string, string>>;
  });

  /** Bereich wechseln: Kennzahl, Filter und Vergleich gehören zum Dataset und werden zurückgesetzt. */
  setDataset(id: string) {
    const reset: Record<string, null> = { k: null, vgl: null };
    for (const k of Object.keys(this.filter())) reset[k] = null;
    this.update({ ...reset, ds: id === STANDARD_DATASET ? null : id });
  }
  setKennzahl(k: string) {
    this.update({ k });
  }
  setDarstellung(modus: Darstellung) {
    this.update({ modus: modus === 'absolut' ? null : modus });
  }
  setZeitraum(von: number | null, bis: number | null) {
    this.update({ von, bis });
  }
  /** Filterwert setzen; `null` = Standardwert der Dimension. */
  setFilter(dimension: string, wert: string | null) {
    this.update({ [dimension]: wert });
  }
  setVergleich(dimension: string | null) {
    this.update({ vgl: dimension });
  }
  addDelikt(schluessel: string) {
    const d = this.delikte();
    if (d.includes(schluessel) || d.length >= MAX_LINIEN) return;
    this.update({ d: [...d, schluessel].join(',') });
  }
  removeDelikt(schluessel: string) {
    this.update({
      d: this.delikte()
        .filter((k) => k !== schluessel)
        .join(','),
    });
  }

  private update(queryParams: Record<string, string | number | null>) {
    void this.router.navigate([], { queryParams, queryParamsHandling: 'merge', replaceUrl: true });
  }
}

function toInt(v: string | null): number | null {
  const n = v === null ? NaN : Number(v);
  return Number.isInteger(n) ? n : null;
}
