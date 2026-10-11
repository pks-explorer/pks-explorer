import {
  Injectable,
  computed,
  effect,
  inject,
  linkedSignal,
  resource,
  type Resource,
} from '@angular/core';
import type { Hinweis, KennzahlDef } from '@crime-stats/shared';
import { Auswahl, MAX_LINIEN, STANDARD_VON } from '../core/auswahl';
import { DeliktInfo } from '../core/delikt-info';
import { StabileSlots } from '../core/farben';
import { DatasetView, PksDataSource, filterDimensionen, type Filter } from '../core/pks-data';
import { Theme } from '../core/theme';
import {
  datenbereich,
  indexiere,
  linienBilden,
  markierungen,
  relevanteHinweise,
  wertHinweise,
  vergleichWerte,
  wertLabel,
  type Vergleich,
  type Linie,
  type Serie,
} from './serien';

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Wert einer Ressource oder `undefined` – `value()` selbst wirft im Fehlerzustand. */
const wert = <T>(r: Resource<T>): T | undefined => (r.hasValue() ? r.value() : undefined);

/** Was geladen wird bzw. zuletzt geladen wurde: Dataset, Kennzahl und Linien. */
interface Ladestand {
  ds: DatasetView;
  kennzahl: KennzahlDef;
  linien: Linie[];
}

/**
 * Daten und abgeleiteter Zustand der Explorer-Seite: lädt Index, Katalog und Dataset, löst die
 * Auswahl aus der URL gegen die Metadaten auf und berechnet Linien, Werte und Hinweise.
 * Wird von der Explorer-Komponente bereitgestellt und von ihren Teilkomponenten genutzt.
 */
@Injectable()
export class ExplorerZustand {
  private readonly data = inject(PksDataSource);
  private readonly theme = inject(Theme);
  private readonly auswahl = inject(Auswahl);
  private readonly slots = new StabileSlots();

  // --- Laden ------------------------------------------------------------------------------

  private readonly indexRes = resource({ loader: () => this.data.index() });
  private readonly straftatenRes = resource({ loader: () => this.data.straftaten() });
  private readonly datasetRes = resource({
    params: () => this.auswahl.datasetId(),
    loader: ({ params }) => this.data.dataset(params),
  });
  /** Lädt für die angezeigten Linien die benötigten Spalten der gewählten Delikte nach. */
  private readonly ladeRes = resource({
    params: (): Ladestand | undefined => {
      const ds = wert(this.datasetRes);
      const kennzahl = this.kennzahl();
      if (!ds || !kennzahl) return undefined;
      const linien = this.linien();
      return { ds, kennzahl, linien };
    },
    loader: async ({ params: { ds, kennzahl, linien } }) => {
      const schluessel = [...new Set(linien.map((l) => l.schluessel))];
      const spalten = [...new Set(linien.map((l) => ds.wertSpalte(kennzahl.id, l.filter)))];
      await ds.laden(schluessel, spalten);
      return { ds, kennzahl, linien };
    },
  });
  private readonly index = computed(() => wert(this.indexRes));
  private readonly katalog = computed(() => wert(this.straftatenRes) ?? []);
  private readonly dataset = computed(() => wert(this.datasetRes));

  /**
   * Zuletzt vollständig geladener Stand. Werte und Linien werden daraus berechnet, damit die Ansicht
   * erst wechselt, wenn die neuen Daten da sind (kein Flackern beim Nachladen).
   */
  private readonly geladen = linkedSignal<Ladestand | undefined, Ladestand | undefined>({
    source: () => wert(this.ladeRes),
    computation: (neu, vorher) => neu ?? vorher?.value,
  });

  constructor() {
    const info = inject(DeliktInfo);
    effect(() => info.setKatalog(this.katalog()));
  }

  readonly fehler = computed(
    () =>
      this.indexRes.error() ??
      this.straftatenRes.error() ??
      this.datasetRes.error() ??
      this.ladeRes.error(),
  );
  readonly laedt = computed(() => this.datasetRes.isLoading() || this.ladeRes.isLoading());

  // --- Metadaten und Auswahl --------------------------------------------------------------

  readonly bereiche = computed(() => this.index()?.datasets ?? []);
  readonly meta = computed(() => this.dataset()?.meta);
  readonly kennzahlen = computed(() => this.meta()?.kennzahlen ?? []);
  readonly kennzahl = computed<KennzahlDef | undefined>(
    () => this.kennzahlen().find((k) => k.id === this.auswahl.kennzahl()) ?? this.kennzahlen()[0],
  );

  readonly dimensionen = computed(() => {
    const m = this.meta();
    return m ? filterDimensionen(m) : [];
  });
  /** Gültige Filterwerte je Dimension (ungültige URL-Werte fallen auf den Standard zurück). */
  readonly filterWerte = computed<Filter>(() => {
    const roh = this.auswahl.filter();
    const out: Record<string, string> = {};
    for (const d of this.dimensionen()) {
      const w = roh[d.id];
      out[d.id] = w && d.werte!.some((x) => x.id === w) ? w : (d.standard ?? d.werte![0]!.id);
    }
    return out;
  });
  readonly vergleichbar = computed(() => this.dimensionen().filter((d) => d.werte!.length > 1));
  readonly vergleichDim = computed(() =>
    this.vergleichbar().find((d) => d.id === this.auswahl.vergleich()),
  );
  readonly vergleich = computed<Vergleich | undefined>(() => {
    const dim = this.vergleichDim();
    return dim ? { dim, werte: vergleichWerte(dim, this.auswahl.vergleichWerte()) } : undefined;
  });

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
  private readonly zeitraumJahre = computed(() => {
    const { von, bis } = this.zeitraum();
    return this.alleJahre().filter((j) => j >= von && j <= bis);
  });

  // --- Delikte ----------------------------------------------------------------------------

  /** Katalog, eingeschränkt auf Schlüssel, die im aktuellen Dataset vorkommen. */
  readonly straftaten = computed(() => {
    const ds = this.dataset();
    return this.katalog().filter((s) => ds?.hatSchluessel(s.schluessel));
  });
  private readonly straftatByKey = computed(
    () => new Map(this.katalog().map((s) => [s.schluessel, s])),
  );
  readonly name = (k: string) => this.straftatByKey().get(k)?.name ?? k;

  /** Gewählte Delikte, die es im aktuellen Bereich nicht gibt (z. B. Diebstahl bei den Opfern). */
  readonly fehlendeDelikte = computed(() => {
    const ds = this.dataset();
    if (!ds) return [];
    return this.auswahl
      .delikte()
      .filter((k) => !ds.hatSchluessel(k))
      .map(this.name);
  });

  // --- Linien und Werte -------------------------------------------------------------------

  /** Gewählte Delikte, die es im aktuellen Bereich gibt. */
  readonly delikteImBereich = computed(() => {
    const ds = this.dataset();
    return ds ? this.auswahl.delikte().filter((k) => ds.hatSchluessel(k)) : [];
  });
  /** Wie viele Vergleichswerte wählbar sind, damit es höchstens MAX_LINIEN Linien werden. */
  readonly maxVergleichWerte = computed(() =>
    Math.max(1, Math.floor(MAX_LINIEN / Math.max(1, this.delikteImBereich().length))),
  );

  private readonly alleLinien = computed(() =>
    linienBilden(this.delikteImBereich(), this.filterWerte(), this.vergleich(), this.name),
  );
  readonly linien = computed(() => this.alleLinien().slice(0, MAX_LINIEN));
  readonly ausgeblendeteLinien = computed(() => this.alleLinien().length - this.linien().length);

  private readonly linienFarben = computed(() => {
    const modus = this.theme.modus();
    const slots = this.slots.zuordnen(this.linien().map((l) => l.id));
    return new Map([...slots].map(([id, s]) => [id, this.theme.serienFarbe(s, modus)]));
  });
  /** Farben für die Auswahl-Chips; beim Vergleich hat ein Delikt mehrere Linien, dann keine Farbe. */
  readonly deliktFarben = computed(() =>
    this.vergleichDim() ? new Map<string, string>() : this.linienFarben(),
  );

  /** Linien des zuletzt geladenen Stands (nur aus dem aktuellen Dataset). */
  private readonly angezeigteLinien = computed(() => {
    const g = this.geladen();
    return g && g.ds === this.dataset() ? g.linien : [];
  });

  /** Absolute Werte über den gewählten Zeitraum, noch ohne Kürzung (je angezeigter Linie). */
  private readonly rohwerte = computed(() => {
    const g = this.geladen();
    if (!g || g.ds !== this.dataset()) return [];
    const jahre = this.zeitraumJahre();
    return g.linien.map((l) => {
      const zr = g.ds.zeitreihe(l.schluessel, g.kennzahl.id, l.filter);
      return jahre.map((j) => zr.get(j) ?? null);
    });
  });

  /** Jahre ohne jeden Wert am Anfang/Ende ausblenden (z. B. TVBZ erst ab 2009). */
  private readonly bereich = computed(() =>
    datenbereich(this.rohwerte(), this.zeitraumJahre().length),
  );
  readonly jahre = computed(() => {
    const b = this.bereich();
    return b ? this.zeitraumJahre().slice(b.lo, b.hi + 1) : [];
  });

  readonly einheit = computed(() =>
    this.auswahl.darstellung() === 'index' ? 'index' : (this.kennzahl()?.einheit ?? 'anzahl'),
  );

  readonly serien = computed<Serie[]>(() => {
    const b = this.bereich();
    if (!b) return [];
    const farben = this.linienFarben();
    const index = this.auswahl.darstellung() === 'index';
    const linien = this.angezeigteLinien();
    return this.rohwerte().map((werte, i) => {
      const linie = linien[i]!;
      const ausschnitt = werte.slice(b.lo, b.hi + 1);
      return {
        id: linie.id,
        schluessel: linie.schluessel,
        label: linie.label,
        farbe: farben.get(linie.id) ?? this.theme.serienFarbe(0),
        werte: index ? indexiere(ausschnitt) : ausschnitt,
      };
    });
  });

  /** Es gibt Delikte, aber für die gewählte Kombination keine Werte. */
  readonly keineDaten = computed(() => this.rohwerte().length > 0 && !this.bereich());

  // --- Texte und Hinweise -----------------------------------------------------------------

  /** Angezeigter Zeitraum (nach Kürzung), sonst der gewählte. */
  private readonly anzeigeZeitraum = computed(() => {
    const j = this.jahre();
    return { von: j[0] ?? this.zeitraum().von, bis: j.at(-1) ?? this.zeitraum().bis };
  });

  readonly hinweise = computed<Hinweis[]>(() => {
    const m = this.meta();
    const k = this.kennzahl();
    if (!m || !k) return [];
    const { von, bis } = this.anzeigeZeitraum();
    return [
      ...relevanteHinweise(m.hinweise, k.id, von, bis),
      ...wertHinweise(this.dimensionen(), this.filterWerte(), this.vergleich(), k.id),
    ];
  });
  readonly markierungen = computed(() => {
    const j = this.jahre();
    return j.length ? markierungen(this.hinweise(), j[0]!, j.at(-1)!) : [];
  });

  /** Bezeichnungsänderungen der gewählten Delikte im Zeitraum – oft ein Hinweis auf geänderte Definitionen. */
  readonly namensaenderungen = computed(() => {
    if (!this.jahre().length) return [];
    const { von, bis } = this.anzeigeZeitraum();
    return this.auswahl.delikte().flatMap((schluessel) => {
      const verlauf = this.straftatByKey().get(schluessel)?.namensverlauf ?? [];
      return verlauf
        .slice(1)
        .flatMap((n, i) =>
          n.vonJahr > von && n.vonJahr <= bis
            ? [{ jahr: n.vonJahr, vorher: verlauf[i]!.name, nachher: n.name, schluessel }]
            : [],
        );
    });
  });

  readonly titel = computed(() => {
    const k = this.kennzahl();
    if (!k) return '';
    const { von, bis } = this.anzeigeZeitraum();
    const f = this.filterWerte();
    const vgl = this.vergleichDim();
    const filterText = this.dimensionen()
      .filter((d) => d !== vgl && f[d.id] !== d.standard)
      .map((d) => wertLabel(d, f[d.id]!));
    const teile = [k.label, ...(filterText.length ? [filterText.join(', ')] : [])];
    if (vgl) teile.push(`nach ${vgl.label}`);
    const index = this.auswahl.darstellung() === 'index' ? ` (Index, ${von} = 100)` : '';
    // Beim Vergleich mit nur einem Delikt steht dessen Name im Titel, die Linien heißen nur "Männlich" usw.
    const schluessel = new Set(this.linien().map((l) => l.schluessel));
    const delikt = vgl && schluessel.size === 1 ? `${this.name([...schluessel][0]!)}: ` : '';
    return `${delikt}${teile.join(' – ')}${index}, ${von}–${bis}`;
  });
}
