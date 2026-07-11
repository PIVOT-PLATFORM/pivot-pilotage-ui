import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { forkJoin } from 'rxjs';
import { DependencyApiService } from '../data-access/dependency-api.service';
import {
  Dependency,
  DependencyApiError,
  DependencyLinkType,
  DependencyProjectRef,
  TaskOption,
} from '../data-access/dependency.models';

/** The four typed links this form offers, in a stable display order (FS is the AC's default). */
const LINK_TYPES: readonly DependencyLinkType[] = ['FS', 'SS', 'FF', 'SF'];

/**
 * Reference conversion used **only** to display a days-equivalent hint next to a worked-minute lag
 * input (8h/day). This is guidance, never a computation input — see class TSDoc "Lag unit" note.
 */
const WORKED_MINUTES_PER_DAY = 480;

/**
 * Typed-dependency management view (US22.4.3 — "Dépendances typées (FS/SS/FF/SF) + retard/
 * avance"): create a link between two tasks (FS/SS/FF/SF + signed lag/lead), list a project's
 * dependencies, retype/relag or delete one.
 *
 * **List/form, not mouse-drag-on-bars (documented scope decision).** The backlog's third AC
 * ("Given un lien, when je le crée à la souris entre deux barres...") describes creating a link by
 * dragging between two Gantt bars — there are no real Gantt bars yet (F22.4's bar/timeline
 * rendering ships with US22.4.10a; the WBS tree itself is a parallel, separately-tracked item,
 * `feat/us22-4-1abc-wbs-tree-ui`). Per this US's own "Hors périmètre" (mouse drag-and-drop between
 * bars is explicitly deferred to US22.4.10), this Gate-1 slice implements the **model and its
 * validation** through a keyboard-first list/form UI instead: two `<select>` task pickers + a
 * link-type `<select>` (defaulting to `FS`, freely changeable — the AC's "typé FS par défaut et
 * modifiable", read here as applying to the *value*, not the *input modality*) + a signed lag
 * input. Editing an existing link's type/lag after creation (`DependencyApiService.update`, backed
 * by the equally-real `PUT` endpoint) is the "modifiable" half of that same AC once a link already
 * exists.
 *
 * **Task pickers.** Populated from `DependencyApiService.listTasks` — a minimal read of the WBS
 * tree (US22.4.1a) for labelling only; this component never edits the tree.
 *
 * **Lag unit (decision D7, backend).** The API's `lagMinutes` is a signed **worked-minute** offset
 * on the successor's calendar — not a generic day count, since a calendar's hours-per-day isn't
 * exposed to this frontend yet (US22.4.5, not consumed here). Rather than silently assume a
 * calendar and convert a user-entered day count (which could misrepresent the actually-persisted
 * value on a non-standard calendar), this form takes the **exact API unit** (minutes) as input and
 * only ever *displays* a days-equivalent hint computed against a documented 8h/day reference
 * ({@link WORKED_MINUTES_PER_DAY}) — never the other way around. This is the PO Agent's Gate 1
 * resolution of the backlog file's own flagged ambiguity ("à clarifier au moment de
 * l'implémentation").
 *
 * **Who can use this.** Every write here hits an endpoint gated server-side by `WbsEditPolicy`
 * (fail-closed today, `DenyAllWbsEditPolicy` — see `DependencyApiService`'s TSDoc). This component
 * does not hide itself behind any client-side permission check — same established posture as
 * `RoadmapSharePanelComponent`/`RoadmapBoardComponent`: shown unconditionally, a `403` is surfaced
 * as an explicit error rather than pre-emptively hidden (Security AC — the backend gate, plus its
 * own audit logging of a denied attempt, is the actual enforcement; this UI never bypasses or
 * retries with different data on a 403/404, per this repo's CLAUDE.md tenant-isolation rule).
 *
 * **A11y (AC).** Every interactive control is a native `<select>`/`<input>`/`<button>` — reachable
 * and operable with the keyboard alone, no drag gesture required (the "sans souris" AC). A
 * successful create/update/delete is announced through an `aria-live="polite"` region
 * ({@link announcement}), mirroring `RoadmapBoardComponent`'s identical pattern for its own
 * optimistic mutations.
 *
 * **Route.** Expects `tenantId`/`teamId`/`projectId` as route params — same gap-era shape as
 * `RoadmapBoardComponent` (see {@link DependencyProjectRef}'s TSDoc).
 */
@Component({
  selector: 'app-dependency-manager',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe],
  templateUrl: './dependency-manager.component.html',
  styleUrl: './dependency-manager.component.scss',
})
export class DependencyManagerComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly dependencyApi = inject(DependencyApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly transloco = inject(TranslocoService);

  protected readonly linkTypes = LINK_TYPES;

  protected readonly projectRef: DependencyProjectRef = this.readProjectRef();

  protected readonly tasks = signal<TaskOption[]>([]);
  protected readonly dependencies = signal<Dependency[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadErrorKey = signal<string | null>(null);

  protected readonly hasEnoughTasks = computed(() => this.tasks().length >= 2);

  /** Last outcome, announced via an `aria-live="polite"` region (A11y AC). */
  protected readonly announcement = signal<string | null>(null);

  // --- create form ------------------------------------------------------------------------------

  protected readonly newPredecessorId = signal<number | null>(null);
  protected readonly newSuccessorId = signal<number | null>(null);
  protected readonly newLinkType = signal<DependencyLinkType>('FS');
  protected readonly newLagMinutesInput = signal('0');
  protected readonly creating = signal(false);
  protected readonly createErrorKey = signal<string | null>(null);

  // --- inline edit (retype/relag) ---------------------------------------------------------------

  protected readonly editingId = signal<number | null>(null);
  protected readonly editLinkType = signal<DependencyLinkType>('FS');
  protected readonly editLagMinutesInput = signal('0');
  protected readonly updating = signal(false);
  protected readonly updateErrorKey = signal<string | null>(null);

  // --- inline delete confirmation ----------------------------------------------------------------

  protected readonly confirmingDeleteId = signal<number | null>(null);
  protected readonly deleteErrorKey = signal<string | null>(null);

  private readProjectRef(): DependencyProjectRef {
    const params = this.route.snapshot.paramMap;
    return {
      tenantId: Number(params.get('tenantId')),
      teamId: Number(params.get('teamId')),
      projectId: Number(params.get('projectId')),
    };
  }

  ngOnInit(): void {
    this.loadAll();
  }

  protected retryLoad(): void {
    this.loadAll();
  }

  private loadAll(): void {
    this.loading.set(true);
    this.loadErrorKey.set(null);

    forkJoin({
      tasks: this.dependencyApi.listTasks(this.projectRef),
      dependencies: this.dependencyApi.list(this.projectRef),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ tasks, dependencies }) => {
          this.tasks.set(tasks);
          this.dependencies.set(dependencies);
          this.loading.set(false);
        },
        error: (error: HttpErrorResponse) => {
          this.loading.set(false);
          this.loadErrorKey.set(
            error.status === 404
              ? 'gantt.dependencies.load.errors.NOT_FOUND'
              : 'gantt.dependencies.load.errors.GENERIC',
          );
        },
      });
  }

  /** Resolves a task's picker label (`"1.2 — Conception"`), falling back to its bare id if the task list is somehow stale (defensive — should not happen once `loadAll` has resolved). */
  protected taskLabel(taskId: number): string {
    const task = this.tasks().find(t => t.taskId === taskId);
    return task ? `${task.wbsCode} — ${task.name}` : `#${taskId}`;
  }

  /** Days-equivalent display hint for a worked-minute lag — see class TSDoc "Lag unit" note; never fed back into a request. */
  protected daysEquivalentLabel(lagMinutes: number): string {
    const days = lagMinutes / WORKED_MINUTES_PER_DAY;
    const rounded = Math.round(days * 100) / 100;
    return rounded > 0 ? `+${rounded}` : `${rounded}`;
  }

  // --- create -------------------------------------------------------------------------------------

  protected onPredecessorChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.newPredecessorId.set(value ? Number(value) : null);
  }

  protected onSuccessorChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.newSuccessorId.set(value ? Number(value) : null);
  }

  protected onLinkTypeChange(event: Event): void {
    this.newLinkType.set((event.target as HTMLSelectElement).value as DependencyLinkType);
  }

  protected onLagInput(event: Event): void {
    this.newLagMinutesInput.set((event.target as HTMLInputElement).value);
  }

  /**
   * AC1 (typed link + lag) + Error AC (self-link / duplicate rejected with an explicit message).
   * Task selection and self-link are checked client-side first (immediate feedback, no round
   * trip); duplicate and cycle rejection cannot be pre-validated client-side (the cycle check
   * needs the full temporal graph, owned by the scheduling engine) so those always come back from
   * the `409` response.
   */
  protected submitCreate(): void {
    this.createErrorKey.set(null);
    const predecessorTaskId = this.newPredecessorId();
    const successorTaskId = this.newSuccessorId();

    if (predecessorTaskId === null || successorTaskId === null) {
      this.createErrorKey.set('gantt.dependencies.create.errors.TASKS_REQUIRED');
      return;
    }
    if (predecessorTaskId === successorTaskId) {
      this.createErrorKey.set('gantt.dependencies.create.errors.INVALID_DEPENDENCY');
      return;
    }
    const lagMinutes = this.parseLagMinutes(this.newLagMinutesInput());
    if (lagMinutes === null) {
      this.createErrorKey.set('gantt.dependencies.create.errors.INVALID_LAG');
      return;
    }

    const linkType = this.newLinkType();
    this.creating.set(true);
    this.dependencyApi
      .create(this.projectRef, { predecessorTaskId, successorTaskId, linkType, lagMinutes })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: created => {
          this.dependencies.update(list => [...list, created]);
          this.creating.set(false);
          this.newPredecessorId.set(null);
          this.newSuccessorId.set(null);
          this.newLinkType.set('FS');
          this.newLagMinutesInput.set('0');
          this.announcement.set(
            this.transloco.translate('gantt.dependencies.create.announceCreated', {
              predecessor: this.taskLabel(created.predecessorTaskId),
              successor: this.taskLabel(created.successorTaskId),
              type: linkType,
            }),
          );
        },
        error: (error: HttpErrorResponse) => {
          this.creating.set(false);
          this.createErrorKey.set(this.resolveCreateErrorKey(error));
        },
      });
  }

  private resolveCreateErrorKey(error: HttpErrorResponse): string {
    const code = (error.error as DependencyApiError | undefined)?.code;
    if (error.status === 422 && code === 'INVALID_DEPENDENCY') {
      return 'gantt.dependencies.create.errors.INVALID_DEPENDENCY';
    }
    if (error.status === 409 && code === 'DUPLICATE_DEPENDENCY') {
      return 'gantt.dependencies.create.errors.DUPLICATE_DEPENDENCY';
    }
    if (error.status === 409 && code === 'SCHEDULE_CYCLE') {
      return 'gantt.dependencies.create.errors.SCHEDULE_CYCLE';
    }
    if (error.status === 403) {
      return 'gantt.dependencies.create.errors.FORBIDDEN';
    }
    if (error.status === 404) {
      return 'gantt.dependencies.create.errors.NOT_FOUND';
    }
    return 'gantt.dependencies.create.errors.GENERIC';
  }

  private parseLagMinutes(raw: string): number | null {
    const trimmed = raw.trim();
    if (trimmed === '') {
      return 0;
    }
    const parsed = Number(trimmed);
    return Number.isInteger(parsed) ? parsed : null;
  }

  // --- inline edit (retype/relag) -----------------------------------------------------------------

  protected startEdit(dependency: Dependency): void {
    this.updateErrorKey.set(null);
    this.editingId.set(dependency.dependencyId);
    this.editLinkType.set(dependency.linkType);
    this.editLagMinutesInput.set(String(dependency.lagMinutes));
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
    this.updateErrorKey.set(null);
  }

  protected onEditLinkTypeChange(event: Event): void {
    this.editLinkType.set((event.target as HTMLSelectElement).value as DependencyLinkType);
  }

  protected onEditLagInput(event: Event): void {
    this.editLagMinutesInput.set((event.target as HTMLInputElement).value);
  }

  /** AC "modifiable" (see class TSDoc): retype and/or relag an existing dependency. Same duplicate/cycle rejection posture as `submitCreate` — never pre-validated client-side. */
  protected confirmEdit(dependency: Dependency): void {
    this.updateErrorKey.set(null);
    const lagMinutes = this.parseLagMinutes(this.editLagMinutesInput());
    if (lagMinutes === null) {
      this.updateErrorKey.set('gantt.dependencies.edit.errors.INVALID_LAG');
      return;
    }

    const linkType = this.editLinkType();
    this.updating.set(true);
    this.dependencyApi
      .update(this.projectRef, dependency.dependencyId, { linkType, lagMinutes })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: updated => {
          this.dependencies.update(list =>
            list.map(d => (d.dependencyId === updated.dependencyId ? updated : d)),
          );
          this.updating.set(false);
          this.editingId.set(null);
          this.announcement.set(
            this.transloco.translate('gantt.dependencies.edit.announceUpdated', {
              predecessor: this.taskLabel(updated.predecessorTaskId),
              successor: this.taskLabel(updated.successorTaskId),
              type: updated.linkType,
            }),
          );
        },
        error: (error: HttpErrorResponse) => {
          this.updating.set(false);
          this.updateErrorKey.set(this.resolveUpdateErrorKey(error));
        },
      });
  }

  private resolveUpdateErrorKey(error: HttpErrorResponse): string {
    const code = (error.error as DependencyApiError | undefined)?.code;
    if (error.status === 409 && code === 'DUPLICATE_DEPENDENCY') {
      return 'gantt.dependencies.edit.errors.DUPLICATE_DEPENDENCY';
    }
    if (error.status === 409 && code === 'SCHEDULE_CYCLE') {
      return 'gantt.dependencies.edit.errors.SCHEDULE_CYCLE';
    }
    if (error.status === 403) {
      return 'gantt.dependencies.edit.errors.FORBIDDEN';
    }
    if (error.status === 404) {
      return 'gantt.dependencies.edit.errors.NOT_FOUND';
    }
    return 'gantt.dependencies.edit.errors.GENERIC';
  }

  // --- delete (Security AC — gated, no accidental removal) ----------------------------------------

  /** Two-step inline confirm — a native `confirm()` dialog is avoided (blocks the main thread, poor a11y/testability), mirroring `RoadmapSharePanelComponent`'s identical revoke pattern. */
  protected requestDelete(dependencyId: number): void {
    this.deleteErrorKey.set(null);
    this.confirmingDeleteId.set(dependencyId);
  }

  protected cancelDelete(): void {
    this.confirmingDeleteId.set(null);
  }

  protected confirmDelete(dependency: Dependency): void {
    this.deleteErrorKey.set(null);
    const predecessorLabel = this.taskLabel(dependency.predecessorTaskId);
    const successorLabel = this.taskLabel(dependency.successorTaskId);

    this.dependencyApi
      .delete(this.projectRef, dependency.dependencyId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.dependencies.update(list => list.filter(d => d.dependencyId !== dependency.dependencyId));
          this.confirmingDeleteId.set(null);
          this.announcement.set(
            this.transloco.translate('gantt.dependencies.delete.announceDeleted', {
              predecessor: predecessorLabel,
              successor: successorLabel,
            }),
          );
        },
        error: (error: HttpErrorResponse) => {
          this.confirmingDeleteId.set(null);
          this.deleteErrorKey.set(this.resolveDeleteErrorKey(error));
        },
      });
  }

  private resolveDeleteErrorKey(error: HttpErrorResponse): string {
    if (error.status === 403) {
      return 'gantt.dependencies.delete.errors.FORBIDDEN';
    }
    if (error.status === 404) {
      return 'gantt.dependencies.delete.errors.NOT_FOUND';
    }
    return 'gantt.dependencies.delete.errors.GENERIC';
  }
}
