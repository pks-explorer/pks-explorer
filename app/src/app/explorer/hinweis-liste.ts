import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ExplorerZustand } from './explorer-zustand';

/** Hinweise zur Vergleichbarkeit: methodische Brüche, Gruppenabgrenzungen und Bezeichnungsänderungen. */
@Component({
  selector: 'app-hinweis-liste',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul>
      @for (h of z.hinweise(); track h.text) {
        <li>
          @if (h.bruch && h.abJahr) {
            <span class="badge">Bruch {{ h.abJahr }}</span>
          }
          {{ h.text }}
        </li>
      }
      @for (n of z.namensaenderungen(); track n.schluessel + n.jahr) {
        <li>
          <span class="badge">{{ n.jahr }}</span>
          Bezeichnung von {{ n.schluessel }} geändert: „{{ n.vorher }}“ → „{{ n.nachher }}“. Der
          Deliktsumfang kann sich dabei geändert haben.
        </li>
      }
    </ul>
  `,
  styles: `
    ul {
      margin: 0;
      padding-left: 18px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-size: 13px;
      color: var(--text-secondary);
    }
    .badge {
      display: inline-block;
      padding: 0 6px;
      margin-right: 4px;
      border: 1px solid var(--border);
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
      color: var(--text-primary);
      font-variant-numeric: tabular-nums;
    }
  `,
})
export class HinweisListe {
  protected readonly z = inject(ExplorerZustand);
}
