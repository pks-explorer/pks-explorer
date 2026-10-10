import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  imports: [RouterOutlet],
  selector: 'app-root',
  template: `
    <header class="kopf">
      <h1>PKS Explorer</h1>
      <p>
        Entwicklung der polizeilich registrierten Kriminalität in Deutschland – Daten: Polizeiliche
        Kriminalstatistik des BKA
      </p>
    </header>
    <main><router-outlet /></main>
  `,
  styles: `
    :host {
      display: block;
      max-width: 1440px;
      margin: 0 auto;
      padding: 20px 16px 40px;
    }
    .kopf {
      margin-bottom: 20px;
    }
    h1 {
      margin: 0;
      font-size: 22px;
      font-weight: 700;
      color: var(--text-primary);
    }
    p {
      margin: 4px 0 0;
      color: var(--text-secondary);
      font-size: 14px;
    }
  `,
})
export class App {}
