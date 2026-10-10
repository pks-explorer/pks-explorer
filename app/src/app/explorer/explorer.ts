import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Auswahl, MAX_LINIEN } from '../core/auswahl';
import { DeliktInfoPopover } from './delikt-info-popover';
import { DeliktPicker } from './delikt-picker';
import { ExplorerZustand } from './explorer-zustand';
import { FilterLeiste } from './filter-leiste';
import { HinweisListe } from './hinweis-liste';
import { TrendChart } from './trend-chart';
import { TrendTable } from './trend-table';

/** Hauptseite: Delikt-Auswahl, Filter, Diagramm, Hinweise und Tabelle. */
@Component({
  selector: 'app-explorer',
  imports: [DeliktPicker, DeliktInfoPopover, FilterLeiste, HinweisListe, TrendChart, TrendTable],
  providers: [ExplorerZustand],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './explorer.html',
  styleUrl: './explorer.scss',
})
export class Explorer {
  protected readonly auswahl = inject(Auswahl);
  protected readonly z = inject(ExplorerZustand);
  protected readonly maxLinien = MAX_LINIEN;
}
