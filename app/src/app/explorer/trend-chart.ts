import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { NgxEchartsDirective } from 'ngx-echarts';
import type { EChartsCoreOption } from 'echarts/core';
import type { Einheit } from '@crime-stats/shared';
import { Theme } from '../core/theme';
import { formatAchse, formatWert } from '../core/format';
import type { Markierung, Serie } from './serien';

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const kurz = (s: string, n = 28) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

@Component({
  selector: 'app-trend-chart',
  imports: [NgxEchartsDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (serien().length >= 2) {
      <ul class="legende" aria-label="Legende">
        @for (s of serien(); track s.schluessel) {
          <li><span class="key" [style.background]="s.farbe"></span>{{ s.label }}</li>
        }
      </ul>
    }
    <div
      echarts
      class="chart"
      [options]="options()"
      role="img"
      [attr.aria-label]="ariaLabel()"
    ></div>
  `,
  styles: `
    :host {
      display: block;
    }
    .legende {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 16px;
      margin: 0 0 8px;
      padding: 0;
      list-style: none;
      font-size: 13px;
      color: var(--text-secondary);
    }
    .legende li {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .key {
      width: 16px;
      height: 3px;
      border-radius: 2px;
      flex: none;
    }
    .chart {
      height: 440px;
      width: 100%;
    }
    @media (max-width: 640px) {
      .chart {
        height: 340px;
      }
    }
  `,
})
export class TrendChart {
  readonly jahre = input.required<number[]>();
  readonly serien = input.required<Serie[]>();
  readonly einheit = input.required<Einheit | 'index'>();
  readonly markierungen = input<Markierung[]>([]);

  private readonly theme = inject(Theme);

  /** Direkte Linienbeschriftungen brauchen Platz rechts – auf schmalen Bildschirmen reicht die Legende. */
  private readonly breit = (() => {
    const mq = window.matchMedia('(min-width: 641px)');
    const s = signal(mq.matches);
    const onChange = (e: MediaQueryListEvent) => s.set(e.matches);
    mq.addEventListener('change', onChange);
    inject(DestroyRef).onDestroy(() => mq.removeEventListener('change', onChange));
    return s.asReadonly();
  })();

  readonly ariaLabel = computed(() => {
    const j = this.jahre();
    return `Liniendiagramm ${j[0]}–${j.at(-1)}: ${this.serien()
      .map((s) => s.label)
      .join(', ')}`;
  });

  readonly options = computed<EChartsCoreOption>(() => {
    const c = this.theme.chrome();
    const serien = this.serien();
    const einheit = this.einheit();
    const direktLabels = serien.length <= 4 && this.breit();
    const markLine = {
      silent: false,
      symbol: 'none',
      lineStyle: { color: c.muted, type: 'dashed', width: 1 },
      label: { formatter: 'Bruch', color: c.muted, fontSize: 11, position: 'insideEndTop' },
      tooltip: { formatter: (p: { data: { text: string } }) => escape(p.data.text) },
      data: this.markierungen().map((m) => ({ xAxis: String(m.jahr), text: m.text })),
    };

    return {
      backgroundColor: 'transparent',
      textStyle: {
        fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
        color: c.textSecondary,
      },
      animationDuration: 300,
      grid: { left: 8, right: direktLabels ? 190 : 16, top: 16, bottom: 8, containLabel: true },
      tooltip: {
        trigger: 'axis',
        backgroundColor: c.surface,
        borderColor: c.grid,
        textStyle: { color: c.text },
        axisPointer: { type: 'line', lineStyle: { color: c.axis } },
        formatter: (
          params: { axisValue: string; seriesName: string; value: number | null; color: string }[],
        ) => {
          const rows = [...params]
            .sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity))
            .map(
              (p) =>
                `<div style="display:flex;gap:8px;align-items:center">` +
                `<span style="width:12px;height:2px;background:${p.color};flex:none"></span>` +
                `<b style="min-width:72px;text-align:right;font-variant-numeric:tabular-nums">${formatWert(p.value, einheit)}</b>` +
                `<span style="color:${c.textSecondary}">${escape(kurz(p.seriesName, 48))}</span></div>`,
            );
          return `<div style="font-weight:600;margin-bottom:4px">${escape(params[0]?.axisValue ?? '')}</div>${rows.join('')}`;
        },
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: this.jahre().map(String),
        axisLine: { lineStyle: { color: c.axis } },
        axisTick: { show: false },
        axisLabel: { color: c.muted },
      },
      yAxis: {
        type: 'value',
        scale: einheit === 'index',
        splitLine: { lineStyle: { color: c.grid } },
        axisLabel: { color: c.muted, formatter: (v: number) => formatAchse(v, einheit) },
      },
      series: serien.map((s, i) => ({
        type: 'line',
        name: s.label,
        data: s.werte,
        color: s.farbe,
        lineStyle: { width: 2 },
        showSymbol: false,
        symbolSize: 8,
        connectNulls: false,
        emphasis: { focus: 'series' },
        endLabel: {
          show: direktLabels,
          color: c.textSecondary,
          formatter: () => kurz(s.label),
        },
        labelLayout: { moveOverlap: 'shiftY' },
        ...(i === 0 && this.markierungen().length ? { markLine } : {}),
      })),
    };
  });
}
