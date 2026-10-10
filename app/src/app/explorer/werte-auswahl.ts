import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import type { DimensionDef, DimensionWert } from '@crime-stats/shared';

export interface WerteGruppe {
  gruppe: string;
  werte: DimensionWert[];
}

/** Werte nach `gruppe` zusammenfassen (Reihenfolge wie in den Daten). */
export function nachGruppe(werte: readonly DimensionWert[]): WerteGruppe[] {
  const gruppen = new Map<string, DimensionWert[]>();
  for (const w of werte) {
    const g = w.gruppe ?? '';
    gruppen.set(g, [...(gruppen.get(g) ?? []), w]);
  }
  return [...gruppen].map(([gruppe, werte]) => ({ gruppe, werte }));
}

const norm = (s: string) => s.toLocaleLowerCase('de');

/** Mehrfachauswahl der Werte einer Dimension für den Linienvergleich, z. B. Regionen. */
@Component({
  selector: 'app-werte-auswahl',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <details>
      <summary>{{ zusammenfassung() }}</summary>
      <div class="panel">
        @if (dim().werte!.length > 10) {
          <input
            type="search"
            placeholder="Suchen …"
            [attr.aria-label]="dim().label + ' suchen'"
            [value]="suche()"
            (input)="suche.set($any($event.target).value)"
          />
        }
        <p class="hinweis">
          Höchstens {{ max() }} Werte – zusammen mit den Delikten maximal 8 Linien.
        </p>
        <div class="liste">
          @for (g of gruppen(); track g.gruppe) {
            @if (g.gruppe) {
              <div class="gruppe">{{ g.gruppe }}</div>
            }
            @for (w of g.werte; track w.id) {
              <label>
                <input
                  type="checkbox"
                  [checked]="gewaehlt().includes(w.id)"
                  [disabled]="!gewaehlt().includes(w.id) && gewaehlt().length >= max()"
                  (change)="umschalten(w.id)"
                />
                {{ w.label }}
              </label>
            }
          }
        </div>
      </div>
    </details>
  `,
  styles: `
    :host {
      position: relative;
      display: block;
    }
    summary {
      padding: 6px 8px;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: var(--surface-1);
      color: var(--text-primary);
      font-size: 14px;
      cursor: pointer;
      max-width: 260px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .panel {
      position: absolute;
      z-index: 10;
      top: calc(100% + 4px);
      left: 0;
      display: flex;
      flex-direction: column;
      gap: 6px;
      width: min(320px, calc(100vw - 32px));
      padding: 8px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--surface-1);
      box-shadow: 0 6px 24px rgba(0, 0, 0, 0.18);
    }
    input[type='search'] {
      padding: 6px 8px;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: var(--surface-1);
      color: var(--text-primary);
      font: inherit;
    }
    .hinweis {
      margin: 0;
      color: var(--text-muted);
      font-size: 12px;
    }
    .liste {
      max-height: 320px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
    }
    .gruppe {
      padding: 6px 0 2px;
      color: var(--text-muted);
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
    }
    label {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 3px 0;
      color: var(--text-primary);
      font-size: 13px;
    }
  `,
})
export class WerteAuswahl {
  readonly dim = input.required<DimensionDef>();
  readonly gewaehlt = input.required<readonly string[]>();
  readonly max = input.required<number>();
  readonly aendern = output<string[]>();

  protected readonly suche = signal('');

  protected readonly gruppen = computed(() => {
    const q = norm(this.suche().trim());
    const werte = (this.dim().werte ?? []).filter((w) => !q || norm(w.label).includes(q));
    return nachGruppe(werte);
  });

  protected readonly zusammenfassung = computed(() => {
    const labels = new Map(this.dim().werte?.map((w) => [w.id, w.label]));
    const namen = this.gewaehlt().map((id) => labels.get(id) ?? id);
    return namen.length ? namen.join(', ') : 'Werte wählen …';
  });

  protected umschalten(id: string) {
    const g = this.gewaehlt();
    this.aendern.emit(g.includes(id) ? g.filter((x) => x !== id) : [...g, id]);
  }
}
