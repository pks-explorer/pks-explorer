import { Injectable, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { SCHLUESSEL_INSGESAMT } from '@crime-stats/shared';

export type Darstellung = 'absolut' | 'index';

/** Höchstzahl gleichzeitig verglichener Delikte (= Anzahl Farben der Palette). */
export const MAX_DELIKTE = 8;
/** Standard-Startjahr: erst ab 1993 sind die Zahlen inkl. neuer Länder vergleichbar. */
export const STANDARD_VON = 1993;

/**
 * Aktuelle Auswahl (Dataset, Delikte, Kennzahl, Zeitraum, Darstellung).
 * Einzige Quelle ist die URL (Query-Parameter), damit jede Ansicht als Link teilbar ist.
 */
@Injectable({ providedIn: 'root' })
export class Auswahl {
  private readonly router = inject(Router);
  private readonly params = toSignal(inject(ActivatedRoute).queryParamMap, { requireSync: true });

  readonly datasetId = computed(() => this.params().get('ds') ?? 'bund-faelle-zeitreihe');
  readonly kennzahl = computed(() => this.params().get('k') ?? 'faelle');
  readonly darstellung = computed<Darstellung>(() =>
    this.params().get('modus') === 'index' ? 'index' : 'absolut',
  );
  readonly delikte = computed(() => {
    const d = this.params().get('d');
    const list = d === null ? [SCHLUESSEL_INSGESAMT] : d.split(',').filter(Boolean);
    return [...new Set(list)].slice(0, MAX_DELIKTE);
  });
  readonly von = computed(() => toInt(this.params().get('von')));
  readonly bis = computed(() => toInt(this.params().get('bis')));

  /**
   * Farbslot je Delikt. Die Farbe gehört zum Delikt, nicht zur Position: Beim Entfernen eines Delikts
   * behalten die übrigen ihre Farbe, neue Delikte bekommen den niedrigsten freien Slot.
   */
  private slots = new Map<string, number>();
  readonly farbSlots = computed(() => {
    const next = new Map<string, number>();
    const delikte = this.delikte();
    for (const k of delikte) {
      const s = this.slots.get(k);
      if (s !== undefined) next.set(k, s);
    }
    for (const k of delikte) {
      if (next.has(k)) continue;
      const used = new Set(next.values());
      let s = 0;
      while (used.has(s)) s++;
      next.set(k, s);
    }
    this.slots = next;
    return next;
  });

  setKennzahl(k: string) {
    this.update({ k });
  }
  setDarstellung(modus: Darstellung) {
    this.update({ modus: modus === 'absolut' ? null : modus });
  }
  setZeitraum(von: number | null, bis: number | null) {
    this.update({ von, bis });
  }
  addDelikt(schluessel: string) {
    const d = this.delikte();
    if (d.includes(schluessel) || d.length >= MAX_DELIKTE) return;
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
