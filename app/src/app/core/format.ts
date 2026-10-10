import type { Einheit } from '@crime-stats/shared';

const ganz = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });
const eineStelle = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const kompakt = new Intl.NumberFormat('de-DE', { notation: 'compact', maximumFractionDigits: 1 });

export function formatWert(v: number | null | undefined, einheit: Einheit | 'index'): string {
  if (v === null || v === undefined) return '–';
  switch (einheit) {
    case 'anzahl':
      return ganz.format(v);
    case 'prozent':
      return `${eineStelle.format(v)} %`;
    case 'je_100000':
    case 'index':
      return eineStelle.format(v);
  }
}

/** Kurzform für Achsenbeschriftungen (z. B. "5,8 Mio."). */
export function formatAchse(v: number, einheit: Einheit | 'index'): string {
  if (einheit === 'prozent') return `${ganz.format(v)} %`;
  return Math.abs(v) >= 10_000 ? kompakt.format(v) : ganz.format(v);
}

export function formatVeraenderung(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return '–';
  return `${v > 0 ? '+' : ''}${eineStelle.format(v)} %`;
}
