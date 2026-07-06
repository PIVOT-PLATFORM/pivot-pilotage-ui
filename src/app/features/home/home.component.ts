import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Route placeholder du squelette bootstrap-only.
 *
 * Composant temporaire : sert uniquement à valider que le workspace Angular
 * build/boot correctement en CI (lint, tests, build prod, E2E, Lighthouse).
 * Sera remplacé par les vraies features du domaine Pilotage (roadmap, Gantt,
 * portefeuille de projets) — aucune logique métier ici, voir CLAUDE.md.
 */
@Component({
  selector: 'app-home',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="home">
      <h1>Pivot Pilotage</h1>
      <p>Module en construction.</p>
    </main>
  `,
  styleUrl: './home.component.scss',
})
export class HomeComponent {}
