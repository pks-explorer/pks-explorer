import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  viewChild,
} from '@angular/core';
import { DeliktInfo } from '../../core/services/delikt-info';

const MAX_UMFASST = 8;
const MAX_DEFINITION_ZEICHEN = 700;
const BREITE = 420;
const RAND = 16;
/** Ab so viel Platz unter dem Element öffnet das Popover immer nach unten. */
const GENUG_PLATZ = 420;

const norm = (s: string) => s.toLocaleLowerCase('de').replace(/[^\p{L}\p{N}§]+/gu, '');
const kuerzen = (s: string, n: number) =>
  s.length > n ? s.slice(0, s.lastIndexOf(' ', n)) + ' …' : s;

/** Einziges Popover für Erläuterungen zu Straftatenschlüsseln; gesteuert über `DeliktInfo`. */
@Component({
  selector: 'app-delikt-info-popover',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './delikt-info-popover.html',
  styleUrl: './delikt-info-popover.scss',
})
export class DeliktInfoPopover {
  protected readonly info = inject(DeliktInfo);

  protected readonly inhalt = computed(() => {
    const s = this.info.straftat();
    if (!s) return null;
    const e = s.erlaeuterung;
    const umfasst = e?.umfasst ?? [];
    return {
      name: s.name,
      schluessel: s.schluessel,
      katalogName: e?.katalogName && norm(e.katalogName) !== norm(s.name) ? e.katalogName : null,
      definitionen: (e?.definitionen ?? []).map((d) => ({
        titel: d.titel,
        schluessel: d.schluessel.join(', '),
        text: d.text.map((t) => kuerzen(t, MAX_DEFINITION_ZEICHEN)).slice(0, 3),
      })),
      zusammensetzung: e?.zusammensetzung ?? null,
      umfasstTitel: s.summenschluessel ? 'Setzt sich zusammen aus' : 'Umfasst',
      umfasst: umfasst.slice(0, MAX_UMFASST),
      weitere: Math.max(0, umfasst.length - MAX_UMFASST),
      merkmale: e?.merkmale ?? [],
      aenderung: e?.aenderung ?? null,
      frueher: (s.namensverlauf ?? []).slice(0, -1).reverse().slice(0, 3),
      quellen: e?.quellen ?? [],
      nichtImKatalog: !e,
    };
  });

  /** Unter dem Element, oder darüber, wenn unten wenig Platz ist; horizontal im Fenster gehalten. */
  protected readonly position = computed(() => {
    const a = this.info.aktiv();
    if (!a) return null;
    const r = a.anker.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const breite = Math.min(BREITE, vw - 2 * RAND);
    const left = Math.min(Math.max(RAND, r.left), vw - breite - RAND);
    const obenPlatz = r.top;
    const untenPlatz = vh - r.bottom;
    return untenPlatz >= GENUG_PLATZ || untenPlatz >= obenPlatz
      ? { left, breite, top: r.bottom + 6, bottom: null, maxHoehe: untenPlatz - 6 - RAND }
      : { left, breite, top: null, bottom: vh - r.top + 6, maxHoehe: obenPlatz - 6 - RAND };
  });

  /** Reicht der Platz nicht, unten weich ausblenden, damit erkennbar ist, dass Inhalt fehlt. */
  private readonly box = viewChild<ElementRef<HTMLElement>>('box');
  constructor() {
    afterRenderEffect(() => {
      this.position();
      const el = this.box()?.nativeElement;
      el?.classList.toggle('abgeschnitten', el.scrollHeight > el.clientHeight + 1);
    });
  }
}
