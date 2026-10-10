import { ChangeDetectionStrategy, Component, computed, inject, resource } from '@angular/core';
import type { KennzahlDef } from '@crime-stats/shared';
import { Auswahl, MAX_DELIKTE, STANDARD_VON, type Darstellung } from '../core/auswahl';
import { PksDataSource } from '../core/pks-data';
import { Theme } from '../core/theme';
import { DeliktPicker } from './delikt-picker';
import { indexiere, markierungen, relevanteHinweise, type Serie } from './serien';
import { TrendChart } from './trend-chart';
import { TrendTable } from './trend-table';

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

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

@Component({
  selector: 'app-explorer',
  imports: [DeliktPicker, TrendChart, TrendTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './explorer.html',
  styleUrl: './explorer.scss',
})
export class Explorer {
  private readonly data = inject(PksDataSource);
  private readonly theme = inject(Theme);
  protected readonly auswahl = inject(Auswahl);
  protected readonly maxDelikte = MAX_DELIKTE;
  protected readonly presets = PRESETS;

  private readonly straftatenRes = resource({ loader: () => this.data.straftaten() });
  private readonly datasetRes = resource({
    params: () => this.auswahl.datasetId(),
    loader: ({ params }) => this.data.dataset(params),
  });

  readonly fehler = computed(() => this.straftatenRes.error() ?? this.datasetRes.error());
  readonly laedt = computed(() => this.straftatenRes.isLoading() || this.datasetRes.isLoading());

  readonly meta = computed(() => this.datasetRes.value()?.meta);
  readonly kennzahlen = computed(() => this.meta()?.kennzahlen ?? []);
  readonly kennzahl = computed<KennzahlDef | undefined>(
    () => this.kennzahlen().find((k) => k.id === this.auswahl.kennzahl()) ?? this.kennzahlen()[0],
  );

  readonly alleJahre = computed(() => this.meta()?.jahre ?? []);
  readonly zeitraum = computed(() => {
    const j = this.alleJahre();
    const erstes = j[0] ?? STANDARD_VON;
    const letztes = j.at(-1) ?? erstes;
    let von = clamp(this.auswahl.von() ?? Math.max(STANDARD_VON, erstes), erstes, letztes);
    let bis = clamp(this.auswahl.bis() ?? letztes, erstes, letztes);
    if (von > bis) [von, bis] = [bis, von];
    return { von, bis, erstes, letztes };
  });
  readonly jahre = computed(() => {
    const { von, bis } = this.zeitraum();
    return this.alleJahre().filter((j) => j >= von && j <= bis);
  });

  /** Katalog, eingeschränkt auf Schlüssel, die im aktuellen Dataset vorkommen. */
  readonly straftaten = computed(() => {
    const ds = this.datasetRes.value();
    return (this.straftatenRes.value() ?? []).filter((s) => ds?.hasSchluessel(s.schluessel));
  });
  private readonly straftatByKey = computed(
    () => new Map(this.straftaten().map((s) => [s.schluessel, s])),
  );

  readonly farben = computed(() => {
    const modus = this.theme.modus();
    return new Map(
      [...this.auswahl.farbSlots()].map(([k, slot]) => [k, this.theme.serienFarbe(slot, modus)]),
    );
  });

  readonly einheit = computed(() =>
    this.auswahl.darstellung() === 'index' ? 'index' : (this.kennzahl()?.einheit ?? 'anzahl'),
  );

  readonly serien = computed<Serie[]>(() => {
    const ds = this.datasetRes.value();
    const k = this.kennzahl();
    if (!ds || !k) return [];
    const jahre = this.jahre();
    const farben = this.farben();
    return this.auswahl
      .delikte()
      .filter((s) => ds.hasSchluessel(s))
      .map((schluessel) => {
        const zr = ds.zeitreihe(schluessel, k.id);
        const werte = jahre.map((j) => zr.get(j) ?? null);
        return {
          schluessel,
          label: this.straftatByKey().get(schluessel)?.name ?? schluessel,
          farbe: farben.get(schluessel) ?? this.theme.serienFarbe(0),
          werte: this.auswahl.darstellung() === 'index' ? indexiere(werte) : werte,
        };
      });
  });

  readonly hinweise = computed(() => {
    const m = this.meta();
    const k = this.kennzahl();
    if (!m || !k) return [];
    const { von, bis } = this.zeitraum();
    return relevanteHinweise(m.hinweise, k.id, von, bis);
  });
  readonly markierungen = computed(() =>
    markierungen(this.hinweise(), this.zeitraum().von, this.zeitraum().bis),
  );

  /** Bezeichnungsänderungen der gewählten Delikte im Zeitraum – oft ein Hinweis auf geänderte Definitionen. */
  readonly namensaenderungen = computed(() => {
    const { von, bis } = this.zeitraum();
    return this.auswahl.delikte().flatMap((k) => {
      const verlauf = this.straftatByKey().get(k)?.namensverlauf ?? [];
      return verlauf
        .map((n, i) => ({
          jahr: n.vonJahr,
          vorher: verlauf[i - 1]?.name,
          nachher: n.name,
          schluessel: k,
        }))
        .filter((c) => c.vorher && c.jahr > von && c.jahr <= bis);
    });
  });

  readonly titel = computed(() => {
    const k = this.kennzahl();
    const { von, bis } = this.zeitraum();
    const zusatz = this.auswahl.darstellung() === 'index' ? ` (Index, ${von} = 100)` : '';
    return k ? `${k.label}${zusatz}, ${von}–${bis}` : '';
  });

  setKennzahl(id: string) {
    this.auswahl.setKennzahl(id);
  }
  setVon(v: string) {
    this.auswahl.setZeitraum(Number(v), this.zeitraum().bis);
  }
  setBis(v: string) {
    this.auswahl.setZeitraum(this.zeitraum().von, Number(v));
  }
  setPreset(p: Preset) {
    const { erstes, letztes } = this.zeitraum();
    this.auswahl.setZeitraum(clamp(p.von(erstes, letztes), erstes, letztes), letztes);
  }
  presetAktiv(p: Preset) {
    const { von, bis, erstes, letztes } = this.zeitraum();
    return bis === letztes && von === clamp(p.von(erstes, letztes), erstes, letztes);
  }
  setDarstellung(d: Darstellung) {
    this.auswahl.setDarstellung(d);
  }
}
