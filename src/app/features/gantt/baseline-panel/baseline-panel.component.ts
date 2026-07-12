import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { BaselineApiService } from '../data-access/baseline-api.service';
import {
  BaselineApiError,
  BaselineComparison,
  BaselineProjectRef,
  BaselineSummary,
  BaselineVariance,
  MAX_BASELINE_COUNT,
  MAX_BASELINE_INDEX,
  MIN_BASELINE_INDEX,
} from '../data-access/baseline.models';

/**
 * Baseline / écarts panel for a project's detailed Gantt (US22.4.9 — "Baselines multiples &
 * analyse des écarts"): pose (or overwrite) a baseline, delete one, pick an active baseline to
 * compare against the current temporal graph (per-task écarts), and compare two baselines with
 * each other.
 *
 * **Dedicated route, not inline in `wbs-tree` (documented scope decision).** The AC leaves the
 * choice open ("intégrée à l'arbre WBS/Gantt existant ou en panneau dédié"). This slice picks the
 * dedicated-route option, consistent with `TaskConstraintComponent`/`TaskSchedulingComponent`/
 * `DependencyManagerComponent` — every other Gantt write feature in this repo already lives on its
 * own route rather than editing `WbsTreeComponent` inline. It also sidesteps a real file-level
 * collision: `WbsTreeComponent`/`wbs.models.ts` are being modified in parallel on this same sprint
 * by US22.4.8 ("Suivi d'avancement", progress line rendered directly in the WBS tree, issue #40) —
 * touching those same files here would risk clobbering that concurrent work.
 *
 * **No "name" field (Gate 1 PO Agent resolution) — see `baseline.models.ts`'s class TSDoc.** The
 * pose form lets the caller optionally choose a `0..10` slot (left blank to auto-assign the lowest
 * free one); {@link baselineLabel} renders it MS Project-style (`"Baseline"` / `"Baseline 3"`).
 *
 * **Local, precise state updates — no full-list re-fetch after a mutation (unlike
 * `WbsTreeComponent`'s indent/outdent).** `setBaseline`/`deleteBaseline` each only ever affect the
 * single targeted slot and their responses already carry everything {@link BaselineSummary} needs
 * — this component patches {@link baselines} in place, mirroring `DependencyManagerComponent`'s
 * create/update/delete pattern, rather than `WbsTreeComponent`'s "re-fetch the whole tree" pattern
 * (only necessary there because one structural move can renumber every other node).
 *
 * **Who can use this.** `setBaseline`/`deleteBaseline` are gated server-side by
 * `BaselineEditPolicy` (fail-closed today — see `BaselineApiService`'s TSDoc); `variance`/`compare`
 * are not (Security AC — "un contributeur planning ne peut que consulter les écarts"). This
 * component shows every control unconditionally regardless of the caller's role — same established
 * posture as every other Gantt write feature in this repo (CLAUDE.md: isolation/authorization is
 * exclusively a backend concern) — a `403` surfaces as an explicit error, never pre-emptively
 * hidden nor retried with different data (tenant-isolation rule).
 *
 * **A11y (AC — "navigable au clavier" + "jamais uniquement par la couleur").** The baseline list
 * and both écarts tables are plain, semantic `<table>`s — every action is a native
 * `<button>`/`<select>`, reachable and operable with the keyboard alone, no custom widget. Every
 * variance/delta cell renders the backend's own colour-independent `*Label` sentence (see
 * `baseline.models.ts`'s class TSDoc "rendered verbatim" note) alongside the raw value; a decorative
 * `--behind`/`--ahead` modifier class is layered on top of that text, never the only signal. A
 * successful pose/delete is announced through an `aria-live="polite"` region ({@link announcement}),
 * mirroring every other mutating component in this repo.
 *
 * **Route.** Expects `tenantId`/`teamId`/`projectId` as route params — same gap-era shape as
 * `DependencyManagerComponent` (see {@link BaselineProjectRef}'s TSDoc).
 */
@Component({
  selector: 'app-baseline-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe],
  templateUrl: './baseline-panel.component.html',
  styleUrl: './baseline-panel.component.scss',
})
export class BaselinePanelComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly baselineApi = inject(BaselineApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly transloco = inject(TranslocoService);

  protected readonly minIndex = MIN_BASELINE_INDEX;
  protected readonly maxIndex = MAX_BASELINE_INDEX;

  protected readonly projectRef: BaselineProjectRef = this.readProjectRef();

  protected readonly baselines = signal<BaselineSummary[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadErrorKey = signal<string | null>(null);

  /** Last outcome (pose/delete), announced via an `aria-live="polite"` region (A11y AC). */
  protected readonly announcement = signal<string | null>(null);

  protected readonly usedIndices = computed(() => new Set(this.baselines().map(b => b.baselineIndex)));
  /** Error AC — "au-delà de la limite de 11" — known client-side from the last loaded snapshot (best-effort hint only, the server remains the race-safe source of truth, see {@link submitPose}). */
  protected readonly isAtLimit = computed(() => this.baselines().length >= MAX_BASELINE_COUNT);

  // --- pose form --------------------------------------------------------------------------------

  protected readonly poseIndexInput = signal('');
  protected readonly posing = signal(false);
  protected readonly poseErrorKey = signal<string | null>(null);

  // --- delete (Security AC — gated, no accidental removal) --------------------------------------

  protected readonly confirmingDeleteIndex = signal<number | null>(null);
  protected readonly deleteErrorKey = signal<string | null>(null);

  // --- variance (AC2 — écarts baseline vs réel) ---------------------------------------------------

  protected readonly varianceIndexInput = signal('');
  protected readonly varianceLoading = signal(false);
  protected readonly varianceErrorKey = signal<string | null>(null);
  protected readonly variance = signal<BaselineVariance | null>(null);

  // --- compare (AC3 — évolution entre deux baselines) ---------------------------------------------

  protected readonly compareFromInput = signal('');
  protected readonly compareToInput = signal('');
  protected readonly comparing = signal(false);
  protected readonly compareErrorKey = signal<string | null>(null);
  protected readonly comparison = signal<BaselineComparison | null>(null);

  private readProjectRef(): BaselineProjectRef {
    const params = this.route.snapshot.paramMap;
    return {
      tenantId: Number(params.get('tenantId')),
      teamId: Number(params.get('teamId')),
      projectId: Number(params.get('projectId')),
    };
  }

  ngOnInit(): void {
    this.loadBaselines();
  }

  protected retryLoad(): void {
    this.loadBaselines();
  }

  private loadBaselines(): void {
    this.loading.set(true);
    this.loadErrorKey.set(null);

    this.baselineApi
      .list(this.projectRef)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: baselines => {
          this.loading.set(false);
          this.baselines.set([...baselines].sort((a, b) => a.baselineIndex - b.baselineIndex));
        },
        error: (error: HttpErrorResponse) => {
          this.loading.set(false);
          this.loadErrorKey.set(
            error.status === 404 ? 'gantt.baselines.load.errors.NOT_FOUND' : 'gantt.baselines.load.errors.GENERIC',
          );
        },
      });
  }

  /** MS Project-style numbered label — see class TSDoc "no name field" note. */
  protected baselineLabel(baselineIndex: number): string {
    return baselineIndex === 0
      ? this.transloco.translate('gantt.baselines.slotLabel.base')
      : this.transloco.translate('gantt.baselines.slotLabel.numbered', { n: baselineIndex });
  }

  /** `yyyy-MM-dd` display for an ISO instant — same deterministic slice as `TaskSchedulingComponent.formatDate`. */
  protected formatDate(iso: string | null | undefined): string {
    return iso ? iso.slice(0, 10) : this.transloco.translate('gantt.baselines.notAvailable');
  }

  protected formatNumber(value: number | null | undefined): string {
    return value === null || value === undefined ? this.transloco.translate('gantt.baselines.notAvailable') : String(value);
  }

  // --- pose --------------------------------------------------------------------------------------

  protected onPoseIndexInput(event: Event): void {
    this.poseIndexInput.set((event.target as HTMLInputElement).value);
  }

  /** Error AC — a syntactically or range-invalid slot is rejected client-side; an at-capacity auto-assign is pre-empted with the same 409 message the server would return (best-effort, still server-enforced — see {@link isAtLimit}). */
  protected submitPose(): void {
    this.poseErrorKey.set(null);
    const raw = this.poseIndexInput().trim();

    let requestedIndex: number | null;
    if (raw === '') {
      requestedIndex = null;
      if (this.isAtLimit()) {
        this.poseErrorKey.set('gantt.baselines.pose.errors.BASELINE_LIMIT_EXCEEDED');
        return;
      }
    } else {
      const parsed = Number(raw);
      if (!Number.isInteger(parsed) || parsed < MIN_BASELINE_INDEX || parsed > MAX_BASELINE_INDEX) {
        this.poseErrorKey.set('gantt.baselines.pose.errors.INVALID_INDEX');
        return;
      }
      requestedIndex = parsed;
    }

    const wasOverwrite = requestedIndex !== null && this.usedIndices().has(requestedIndex);
    this.posing.set(true);
    this.baselineApi
      .setBaseline(this.projectRef, { baselineIndex: requestedIndex })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: summary => {
          this.posing.set(false);
          this.poseIndexInput.set('');
          this.baselines.update(list =>
            [...list.filter(b => b.baselineIndex !== summary.baselineIndex), summary].sort(
              (a, b) => a.baselineIndex - b.baselineIndex,
            ),
          );
          this.announcement.set(
            this.transloco.translate(wasOverwrite ? 'gantt.baselines.pose.announceOverwritten' : 'gantt.baselines.pose.announceCreated', {
              label: this.baselineLabel(summary.baselineIndex),
              count: summary.taskCount,
            }),
          );
        },
        error: (error: HttpErrorResponse) => {
          this.posing.set(false);
          this.poseErrorKey.set(this.resolvePoseErrorKey(error));
        },
      });
  }

  private resolvePoseErrorKey(error: HttpErrorResponse): string {
    const code = (error.error as BaselineApiError | undefined)?.code;
    if (error.status === 422 && code === 'INVALID_BASELINE_INDEX') {
      return 'gantt.baselines.pose.errors.INVALID_BASELINE_INDEX';
    }
    if (error.status === 409 && code === 'BASELINE_LIMIT_EXCEEDED') {
      return 'gantt.baselines.pose.errors.BASELINE_LIMIT_EXCEEDED';
    }
    if (error.status === 403) {
      return 'gantt.baselines.pose.errors.FORBIDDEN';
    }
    if (error.status === 404) {
      return 'gantt.baselines.pose.errors.NOT_FOUND';
    }
    return 'gantt.baselines.pose.errors.GENERIC';
  }

  // --- delete --------------------------------------------------------------------------------------

  /** Two-step inline confirm — no native `confirm()` dialog, mirrors `DependencyManagerComponent.requestDelete`. */
  protected requestDelete(baselineIndex: number): void {
    this.deleteErrorKey.set(null);
    this.confirmingDeleteIndex.set(baselineIndex);
  }

  protected cancelDelete(): void {
    this.confirmingDeleteIndex.set(null);
  }

  protected confirmDelete(baseline: BaselineSummary): void {
    this.deleteErrorKey.set(null);
    const label = this.baselineLabel(baseline.baselineIndex);

    this.baselineApi
      .deleteBaseline(this.projectRef, baseline.baselineIndex)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.baselines.update(list => list.filter(b => b.baselineIndex !== baseline.baselineIndex));
          this.confirmingDeleteIndex.set(null);
          this.clearStaleReferences(baseline.baselineIndex);
          this.announcement.set(this.transloco.translate('gantt.baselines.delete.announceDeleted', { label }));
        },
        error: (error: HttpErrorResponse) => {
          this.confirmingDeleteIndex.set(null);
          this.deleteErrorKey.set(this.resolveDeleteErrorKey(error));
        },
      });
  }

  /** A deleted baseline can no longer feed a currently-displayed écarts/comparison view — clears any that referenced it, never leaving a stale report on screen. */
  private clearStaleReferences(deletedIndex: number): void {
    if (this.variance()?.baselineIndex === deletedIndex) {
      this.variance.set(null);
      this.varianceIndexInput.set('');
    }
    const currentComparison = this.comparison();
    if (currentComparison && (currentComparison.fromIndex === deletedIndex || currentComparison.toIndex === deletedIndex)) {
      this.comparison.set(null);
    }
  }

  private resolveDeleteErrorKey(error: HttpErrorResponse): string {
    if (error.status === 403) {
      return 'gantt.baselines.delete.errors.FORBIDDEN';
    }
    if (error.status === 404) {
      return 'gantt.baselines.delete.errors.NOT_FOUND';
    }
    return 'gantt.baselines.delete.errors.GENERIC';
  }

  // --- variance --------------------------------------------------------------------------------------

  protected onVarianceIndexChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.varianceIndexInput.set(value);
    this.varianceErrorKey.set(null);
    if (value === '') {
      this.variance.set(null);
      return;
    }
    this.loadVariance(Number(value));
  }

  private loadVariance(baselineIndex: number): void {
    this.varianceLoading.set(true);
    this.variance.set(null);
    this.baselineApi
      .variance(this.projectRef, baselineIndex)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: response => {
          this.varianceLoading.set(false);
          this.variance.set(response);
        },
        error: (error: HttpErrorResponse) => {
          this.varianceLoading.set(false);
          this.varianceErrorKey.set(
            error.status === 404 ? 'gantt.baselines.variance.errors.NOT_FOUND' : 'gantt.baselines.variance.errors.GENERIC',
          );
        },
      });
  }

  // --- compare --------------------------------------------------------------------------------------

  protected onCompareFromChange(event: Event): void {
    this.compareFromInput.set((event.target as HTMLSelectElement).value);
  }

  protected onCompareToChange(event: Event): void {
    this.compareToInput.set((event.target as HTMLSelectElement).value);
  }

  /** Error AC (this US's third AC — "deux baselines... l'évolution... est visible") pre-validated client-side: both slots picked, and distinct — cannot round-trip to discover either, both are already fully known from the loaded {@link baselines} list. */
  protected submitCompare(): void {
    this.compareErrorKey.set(null);
    const fromRaw = this.compareFromInput();
    const toRaw = this.compareToInput();

    if (fromRaw === '' || toRaw === '') {
      this.compareErrorKey.set('gantt.baselines.compare.errors.SELECT_TWO');
      return;
    }
    const fromIndex = Number(fromRaw);
    const toIndex = Number(toRaw);
    if (fromIndex === toIndex) {
      this.compareErrorKey.set('gantt.baselines.compare.errors.SAME_INDEX');
      return;
    }

    this.comparing.set(true);
    this.baselineApi
      .compare(this.projectRef, fromIndex, toIndex)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: response => {
          this.comparing.set(false);
          this.comparison.set(response);
        },
        error: (error: HttpErrorResponse) => {
          this.comparing.set(false);
          this.compareErrorKey.set(
            error.status === 404 ? 'gantt.baselines.compare.errors.NOT_FOUND' : 'gantt.baselines.compare.errors.GENERIC',
          );
        },
      });
  }
}
