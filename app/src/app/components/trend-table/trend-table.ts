import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { Einheit } from '@crime-stats/shared';
import { formatVeraenderung, formatWert } from '../../core/utils/format';
import type { Serie } from '../../core/models/serie';
import { veraenderung } from '../../core/utils/serien';
import { DeliktInfoDirective } from '../../core/directives/delikt-info.directive';

@Component({
  selector: 'app-trend-table',
  imports: [DeliktInfoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toolbar">
      <span class="hint">{{ jahre().length }} Jahre · {{ serien().length }} Delikt(e)</span>
      <button type="button" class="btn" (click)="exportCsv()">CSV herunterladen</button>
    </div>
    <div class="scroll" tabindex="0" role="region" aria-label="Datentabelle">
      <table>
        <thead>
          <tr>
            <th scope="col" class="sticky">Delikt</th>
            @for (j of jahre(); track j) {
              <th scope="col" class="num">{{ j }}</th>
            }
            <th scope="col" class="num">Veränderung {{ jahre()[0] }}–{{ jahre().at(-1) }}</th>
          </tr>
        </thead>
        <tbody>
          @for (z of zeilen(); track z.serie.id) {
            <tr>
              <th scope="row" class="sticky">
                <div class="cell" tabindex="0" [appDeliktInfo]="z.serie.schluessel">
                  <span class="key" [style.background]="z.serie.farbe"></span>
                  <span class="label">{{ z.serie.label }}</span>
                  <span class="code">{{ z.serie.schluessel }}</span>
                </div>
              </th>
              @for (w of z.werte; track $index) {
                <td class="num">{{ w }}</td>
              }
              <td class="num">{{ z.deltaText }}</td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styleUrl: './trend-table.scss',
})
export class TrendTable {
  readonly jahre = input.required<number[]>();
  readonly serien = input.required<Serie[]>();
  readonly einheit = input.required<Einheit | 'index'>();
  /** Name der Kennzahl für den CSV-Export. */
  readonly kennzahlLabel = input('');

  readonly zeilen = computed(() =>
    this.serien().map((serie) => {
      const delta = veraenderung(serie.werte);
      // Beginnt die Reihe später als der Zeitraum (z. B. Länder ab 2019), das Startjahr nennen
      const start = serie.werte.findIndex((v) => v !== null);
      const ab = delta !== null && start > 0 ? ` (ab ${this.jahre()[start]})` : '';
      return {
        serie,
        werte: serie.werte.map((v) => formatWert(v, this.einheit())),
        deltaText: formatVeraenderung(delta) + ab,
      };
    }),
  );

  exportCsv() {
    const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const header = ['Schlüssel', 'Delikt', 'Kennzahl', ...this.jahre().map(String)];
    const rows = this.serien().map((s) => [
      q(s.schluessel),
      q(s.label),
      q(this.kennzahlLabel()),
      ...s.werte.map((v) => (v === null ? '' : String(v).replace('.', ','))),
    ]);
    const csv = '﻿' + [header.map(q), ...rows].map((r) => r.join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `pks-${this.jahre()[0]}-${this.jahre().at(-1)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
