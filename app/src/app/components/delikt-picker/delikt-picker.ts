import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { SCHLUESSEL_INSGESAMT, type Straftat } from '@crime-stats/shared';
import { DeliktInfoDirective } from '../../core/directives/delikt-info.directive';

interface Knoten {
  straftat: Straftat;
  tiefe: number;
  hatKinder: boolean;
  offen: boolean;
}

const norm = (s: string) =>
  s
    .toLocaleLowerCase('de')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/ß/g, 'ss');

@Component({
  selector: 'app-delikt-picker',
  imports: [DeliktInfoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './delikt-picker.html',
  styleUrl: './delikt-picker.scss',
})
export class DeliktPicker {
  readonly straftaten = input.required<Straftat[]>();
  readonly ausgewaehlt = input.required<string[]>();
  readonly farben = input.required<Map<string, string>>();
  readonly max = input.required<number>();

  readonly hinzufuegen = output<string>();
  readonly entfernen = output<string>();

  readonly suche = signal('');
  private readonly offen = signal(new Set<string>([SCHLUESSEL_INSGESAMT]));

  private readonly bySchluessel = computed(
    () => new Map(this.straftaten().map((s) => [s.schluessel, s])),
  );
  private readonly kinder = computed(() => {
    const m = new Map<string | null, Straftat[]>();
    for (const s of this.straftaten()) {
      const list = m.get(s.parent) ?? [];
      list.push(s);
      m.set(s.parent, list);
    }
    return m;
  });

  readonly gewaehlteStraftaten = computed(() =>
    this.ausgewaehlt().map(
      (k) =>
        this.bySchluessel().get(k) ?? {
          schluessel: k,
          name: k,
          parent: null,
          summenschluessel: false,
        },
    ),
  );
  readonly voll = computed(() => this.ausgewaehlt().length >= this.max());

  /** Sichtbare Baumknoten: reguläre Hierarchie ab "Straftaten insgesamt", danach die 89er-Summenschlüssel. */
  readonly baum = computed(() => {
    const kinder = this.kinder();
    const offen = this.offen();
    const out: { titel: string; knoten: Knoten[] }[] = [];
    const walk = (s: Straftat, tiefe: number, into: Knoten[]) => {
      const k = kinder.get(s.schluessel) ?? [];
      const isOffen = offen.has(s.schluessel);
      into.push({ straftat: s, tiefe, hatKinder: k.length > 0, offen: isOffen });
      if (isOffen) for (const c of k) walk(c, tiefe + 1, into);
    };
    const haupt: Knoten[] = [];
    for (const root of kinder.get(null) ?? []) if (!root.summenschluessel) walk(root, 0, haupt);
    out.push({ titel: 'Straftatenkatalog', knoten: haupt });
    const summen: Knoten[] = [];
    for (const root of kinder.get(null) ?? []) if (root.summenschluessel) walk(root, 0, summen);
    if (summen.length)
      out.push({
        titel: 'Summenschlüssel (z. B. Gewalt-, Straßen-, Cyberkriminalität)',
        knoten: summen,
      });
    return out;
  });

  readonly treffer = computed(() => {
    const q = norm(this.suche().trim());
    if (!q) return [];
    const by = this.bySchluessel();
    return this.straftaten()
      .filter(
        (s) =>
          s.schluessel.includes(q) ||
          norm(s.name).includes(q) ||
          s.namensverlauf?.some((n) => norm(n.name).includes(q)),
      )
      .slice(0, 60)
      .map((s) => {
        const pfad: string[] = [];
        for (let p = s.parent; p && p !== SCHLUESSEL_INSGESAMT; p = by.get(p)?.parent ?? null)
          pfad.unshift(by.get(p)?.name ?? p);
        return { straftat: s, pfad: pfad.join(' › ') };
      });
  });

  istGewaehlt(k: string) {
    return this.ausgewaehlt().includes(k);
  }

  umschalten(s: Straftat) {
    if (this.istGewaehlt(s.schluessel)) this.entfernen.emit(s.schluessel);
    else if (!this.voll()) this.hinzufuegen.emit(s.schluessel);
  }

  aufklappen(k: string) {
    this.offen.update((set) => {
      const n = new Set(set);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  }
}
