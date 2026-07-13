import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { RoadmapCaptureService } from '../roadmap-capture.service';

/**
 * PNG/PDF export trigger (US22.3.5 — "Partage & export de la roadmap", AC1). Purely a thin UI
 * wrapper around `RoadmapCaptureService` — this component owns none of the capture logic itself,
 * only the `exporting`/`errorKey` UI state and wiring the two buttons to it.
 *
 * **`target` is a plain `HTMLElement`, not a CSS selector.** The caller (`RoadmapBoardComponent`,
 * `RoadmapPublicShareViewComponent`) resolves it via a template reference variable + `viewChild`
 * on whichever container it wants captured (its own timeline markup) and passes the
 * `nativeElement` down — this avoids this component ever doing a global `document.querySelector`
 * (which would blindly capture whatever matches first, anywhere in the page — fragile and, in a
 * shell hosting several lazy-loaded modules, a potential wrong-content capture). `null` (target
 * not yet rendered, e.g. no lanes loaded yet) disables both buttons.
 *
 * **Not exclusive to the editable board.** Exporting is a read-only, client-only rendering
 * operation (never touches `RoadmapApiService`/`RoadmapShareApiService`) — safe to reuse verbatim
 * on `RoadmapPublicShareViewComponent`'s strictly read-only view (AC "diffuser la direction hors
 * de l'outil" — the recipient of a share link should be able to make their own copy without
 * needing edit rights).
 */
@Component({
  selector: 'app-roadmap-export-button',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe],
  templateUrl: './roadmap-export-button.component.html',
  styleUrl: './roadmap-export-button.component.scss',
})
export class RoadmapExportButtonComponent {
  readonly target = input<HTMLElement | null>(null);
  /** Filename without extension — each format appends its own (`.png`/`.pdf`). */
  readonly filenamePrefix = input<string>('roadmap');

  private readonly capture = inject(RoadmapCaptureService);

  protected readonly exporting = signal(false);
  protected readonly errorKey = signal<string | null>(null);

  protected exportPng(): void {
    void this.runExport(element => this.capture.exportPng(element, this.filenamePrefix()));
  }

  protected exportPdf(): void {
    void this.runExport(element => this.capture.exportPdf(element, this.filenamePrefix()));
  }

  private async runExport(run: (element: HTMLElement) => Promise<void>): Promise<void> {
    const element = this.target();
    if (!element || this.exporting()) {
      return;
    }

    this.exporting.set(true);
    this.errorKey.set(null);
    try {
      await run(element);
    } catch {
      this.errorKey.set('roadmap.export.errors.GENERIC');
    } finally {
      this.exporting.set(false);
    }
  }
}
