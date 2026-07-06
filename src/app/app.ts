import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/**
 * Composant racine du squelette bootstrap-only de pivot-pilotage-ui.
 *
 * Pas de header/footer ici : dans l'intégration finale, ce repo n'est pas un
 * portail standalone (header/footer/OIDC vivent dans pivot-ui) — il expose
 * uniquement des routes/composants feature lazy-loadés depuis le shell.
 * `<router-outlet>` seul suffit pour ce squelette.
 */
@Component({
  selector: 'app-root',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet],
  template: '<router-outlet />',
  styles: [':host { display: contents; }'],
})
export class App {}
