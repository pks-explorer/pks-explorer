import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import type { DimensionDef } from '@crime-stats/shared';
import { Auswahl, type Darstellung } from '../../core/services/auswahl';
import { ExplorerZustand } from '../../core/services/explorer-zustand';
import { WerteAuswahl, nachGruppe } from '../werte-auswahl/werte-auswahl';

interface Preset {
  label: string;
  von: (erstes: number, letztes: number) => number;
}

const PRESETS: Preset[] = [
  { label: 'Alle Jahre', von: (erstes) => erstes },
  { label: 'Ab 1993', von: (erstes) => Math.max(erstes, 1993) },
  { label: '10 Jahre', von: (_, letztes) => letztes - 9 },
  { label: '5 Jahre', von: (_, letztes) => letztes - 4 },
];

const DARSTELLUNGEN: { id: Darstellung; label: string; titel: string; rate?: boolean }[] = [
  { id: 'absolut', label: 'Absolut', titel: 'Werte wie in der PKS' },
  {
    id: 'je100k',
    label: 'Je 100.000 Einw.',
    titel: 'Anzahl je 100.000 Einwohner der Region bzw. Gruppe (eigene Berechnung)',
    rate: true,
  },
  {
    id: 'anteil',
    label: '% der Bevölkerung',
    titel: 'Anzahl in Prozent der Einwohner der Region bzw. Gruppe (eigene Berechnung)',
    rate: true,
  },
  {
    id: 'index',
    label: 'Index',
    titel: 'Erstes Jahr = 100 – macht Delikte unterschiedlicher Größe vergleichbar',
  },
];

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Bereich, Kennzahl, Dimensionsfilter, Vergleich, Zeitraum und Darstellung – schreibt in die URL. */
@Component({
  selector: 'app-filter-leiste',
  imports: [WerteAuswahl],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './filter-leiste.html',
  styleUrl: './filter-leiste.scss',
})
export class FilterLeiste {
  protected readonly auswahl = inject(Auswahl);
  protected readonly z = inject(ExplorerZustand);
  protected readonly presets = PRESETS;
  protected readonly darstellungen = DARSTELLUNGEN;

  protected gruppiert(d: DimensionDef) {
    return nachGruppe(d.werte ?? []);
  }

  protected setFilter(d: DimensionDef, wert: string) {
    this.auswahl.setFilter(d.id, wert === d.standard ? null : wert);
  }

  protected setVergleich(id: string) {
    this.auswahl.setVergleich(id || null);
  }

  protected setVon(v: string) {
    this.auswahl.setZeitraum(Number(v), this.z.zeitraum().bis);
  }

  protected setBis(v: string) {
    this.auswahl.setZeitraum(this.z.zeitraum().von, Number(v));
  }

  private presetVon(p: Preset) {
    const { erstes, letztes } = this.z.zeitraum();
    return clamp(p.von(erstes, letztes), erstes, letztes);
  }

  protected setPreset(p: Preset) {
    this.auswahl.setZeitraum(this.presetVon(p), this.z.zeitraum().letztes);
  }

  protected presetAktiv(p: Preset) {
    const { von, bis, letztes } = this.z.zeitraum();
    return bis === letztes && von === this.presetVon(p);
  }
}
