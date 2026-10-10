import { Directive, ElementRef, OnDestroy, computed, inject, input } from '@angular/core';
import { DeliktInfo } from '../core/delikt-info';

const VERZOEGERUNG_MS = 350;

/** Zeigt beim Überfahren oder Fokussieren eines Elements die Erläuterung zum Straftatenschlüssel an. */
@Directive({
  selector: '[appDeliktInfo]',
  host: {
    '(mouseenter)': 'planen()',
    '(mouseleave)': 'schliessen()',
    '(focusin)': 'oeffnen()',
    '(focusout)': 'schliessen()',
    '(keydown.escape)': 'schliessen()',
    '[attr.aria-describedby]': 'beschrieben() ? info.popoverId : null',
  },
})
export class DeliktInfoDirective implements OnDestroy {
  readonly appDeliktInfo = input.required<string>();

  protected readonly info = inject(DeliktInfo);
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private timer?: ReturnType<typeof setTimeout>;

  protected readonly beschrieben = computed(() => this.info.aktiv()?.anker === this.el);

  protected planen() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.oeffnen(), VERZOEGERUNG_MS);
  }

  protected oeffnen() {
    clearTimeout(this.timer);
    this.info.zeigen(this.appDeliktInfo(), this.el);
  }

  protected schliessen() {
    clearTimeout(this.timer);
    this.info.verbergen(this.el);
  }

  ngOnDestroy() {
    this.schliessen();
  }
}
