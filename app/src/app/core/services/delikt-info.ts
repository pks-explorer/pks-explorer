import { Injectable, computed, signal } from '@angular/core';
import type { Straftat } from '@crime-stats/shared';

export interface AktiveInfo {
  schluessel: string;
  anker: HTMLElement;
}

/** Hält den Straftatenkatalog und welche Erläuterung gerade angezeigt wird (es gibt nur ein Popover). */
@Injectable({ providedIn: 'root' })
export class DeliktInfo {
  readonly popoverId = 'delikt-info-popover';

  private readonly katalog = signal<ReadonlyMap<string, Straftat>>(new Map());
  readonly aktiv = signal<AktiveInfo | null>(null);
  readonly straftat = computed(() => {
    const a = this.aktiv();
    return a ? (this.katalog().get(a.schluessel) ?? null) : null;
  });

  setKatalog(straftaten: Straftat[]) {
    this.katalog.set(new Map(straftaten.map((s) => [s.schluessel, s])));
  }

  zeigen(schluessel: string, anker: HTMLElement) {
    this.aktiv.set({ schluessel, anker });
  }

  verbergen(anker?: HTMLElement) {
    if (!anker || this.aktiv()?.anker === anker) this.aktiv.set(null);
  }
}
