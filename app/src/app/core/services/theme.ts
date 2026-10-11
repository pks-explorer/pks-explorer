import { Injectable, signal } from '@angular/core';

/** Kategoriale Palette (feste Reihenfolge, validiert für Farbfehlsichtigkeit) – je Modus eigene Stufen. */
const SERIEN = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
};

const CHROME = {
  light: {
    surface: '#fcfcfb',
    text: '#0b0b0b',
    textSecondary: '#52514e',
    muted: '#898781',
    grid: '#e1e0d9',
    axis: '#c3c2b7',
  },
  dark: {
    surface: '#1a1a19',
    text: '#ffffff',
    textSecondary: '#c3c2b7',
    muted: '#898781',
    grid: '#2c2c2a',
    axis: '#383835',
  },
};

export type Modus = 'light' | 'dark';

@Injectable({ providedIn: 'root' })
export class Theme {
  private readonly mq = window.matchMedia('(prefers-color-scheme: dark)');
  readonly modus = signal<Modus>(this.mq.matches ? 'dark' : 'light');

  constructor() {
    this.mq.addEventListener('change', (e) => this.modus.set(e.matches ? 'dark' : 'light'));
  }

  serienFarbe(slot: number, modus: Modus = this.modus()): string {
    return SERIEN[modus][slot % SERIEN[modus].length]!;
  }

  chrome(modus: Modus = this.modus()) {
    return CHROME[modus];
  }
}
