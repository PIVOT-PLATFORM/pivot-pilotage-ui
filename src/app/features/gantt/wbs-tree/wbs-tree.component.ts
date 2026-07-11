import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Observable } from 'rxjs';
import { WbsApiService } from '../data-access/wbs-api.service';
import { GanttProjectRef, WbsApiError, WbsTaskResponse } from '../data-access/wbs.models';

/**
 * WBS (Work Breakdown Structure) tree of a project's detailed Gantt — first piece of Gantt UI in
 * this repo (F22.4). Implements:
 * - **US22.4.1a** ("modèle arborescent & numérotation") — renders the server-derived tree as a
 *   `role="tree"` widget, one WBS code (e.g. `1.2.3`) per node.
 * - **US22.4.1b** ("indent/outdent & réordonnancement") — indent/outdent/move-up/move-down
 *   controls, keyboard and mouse.
 * - **US22.4.1c** ("agrégation des tâches récapitulatives") — a `SUMMARY` node's aggregated
 *   dates/duration/progress, rendered read-only and visually distinct from an editable leaf.
 *
 * **Never recomputes the hierarchy client-side.** {@link WbsTaskResponse.ariaLevel}/
 * `ariaSetSize`/`ariaPosInSet`/`wbsCode` are read verbatim from the backend (US22.4.1a: "propriété
 * dérivée... jamais dérivée uniquement côté client") — this component only ever wires them onto
 * the DOM, it never derives level/rank/numbering from `parentTaskId`/`position` itself.
 *
 * **No optimistic update for indent/outdent/move — unlike `RoadmapBoardComponent`.** A single
 * structural change can renumber/relevel *every* task in the project (siblings shift position,
 * the whole WBS is re-derived server-side by the scheduling engine, EN22.1b) — computing that
 * client-side would violate the "never client-derived" rule above. Instead: the acting row's
 * controls are disabled ({@link actionPending}) for the duration of the request, and on success
 * the **whole tree is re-fetched** ({@link loadTree}) rather than patching one node in place. On
 * failure nothing was ever optimistically changed, so there is nothing to roll back — only an
 * error banner is surfaced (fail-closed 403 today, `WbsEditPolicy` — same platform gap as
 * `RoadmapApiService`, see its TSDoc).
 *
 * **Keyboard (WCAG 2.1 AA).** A single roving `tabindex` ({@link focusedTaskId}) keeps exactly one
 * `treeitem` in the page's Tab order at a time:
 * - `ArrowUp`/`ArrowDown` move focus to the previous/next visible node (the flattened pre-order
 *   list is already the correct visual order); `Home`/`End` jump to the first/last node.
 * - `Alt+ArrowRight`/`Alt+ArrowLeft` are the indent/outdent shortcuts; `Alt+ArrowUp`/
 *   `Alt+ArrowDown` reorder the focused node among its siblings — the AC's "un raccourci pour
 *   indent et un pour outdent, et le déplacement haut/bas parmi les frères" (US22.4.1b).
 * - Each row also exposes visible Indent/Outdent/Move up/Move down buttons — the AC's "opérables
 *   au clavier (raccourcis + commandes de menu)": the buttons are the "commandes de menu" (mouse
 *   **and** keyboard, via Tab + Enter/Space — never drag-and-drop, out of scope per US22.4.1b
 *   "Hors périmètre", covered later by US22.4.10).
 *
 * A control is disabled purely from the backend-authoritative ARIA fields — never from a
 * client-recomputed hierarchy: indent needs a preceding sibling (`ariaPosInSet !== 1`), outdent
 * needs a non-root level (`ariaLevel !== 1`), move-up/move-down need a neighbour in that direction
 * (`ariaPosInSet !== 1` / `ariaPosInSet !== ariaSetSize`). This is a UX affordance only — the
 * server still validates independently (422 `ILLEGAL_WBS_MOVE`) for any direct API caller.
 *
 * **Security.** No client-side role gating (CLAUDE.md — isolation/authorization is exclusively a
 * backend concern): every write is attempted regardless of the caller's role, and a `403` is
 * surfaced as an explicit, non-optimistic error — never silently hidden nor retried.
 *
 * **Route.** Expects `tenantId`/`teamId`/`projectId` as route params, mirroring
 * `RoadmapBoardComponent`'s own gap-era path-segment shape (see `GanttProjectRef`'s TSDoc).
 */
@Component({
  selector: 'app-wbs-tree',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe],
  templateUrl: './wbs-tree.component.html',
  styleUrl: './wbs-tree.component.scss',
})
export class WbsTreeComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly wbsApi = inject(WbsApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly transloco = inject(TranslocoService);
  private readonly elementRef: ElementRef<HTMLElement> = inject(ElementRef);

  protected readonly projectRef: GanttProjectRef = this.readProjectRef();

  protected readonly nodes = signal<WbsTaskResponse[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadErrorKey = signal<string | null>(null);

  /** Roving-tabindex target — the single `treeitem` currently in the page's Tab order. */
  protected readonly focusedTaskId = signal<number | null>(null);

  /** `true` while an indent/outdent/move request is in flight — disables every row's action controls (structural changes are serialized, never concurrent). */
  protected readonly actionPending = signal(false);
  protected readonly actionErrorKey = signal<string | null>(null);
  /** Last action outcome, announced via an `aria-live="polite"` region (A11y AC). */
  protected readonly announcement = signal<string | null>(null);

  private readProjectRef(): GanttProjectRef {
    const params = this.route.snapshot.paramMap;
    return {
      tenantId: Number(params.get('tenantId')),
      teamId: Number(params.get('teamId')),
      projectId: Number(params.get('projectId')),
    };
  }

  ngOnInit(): void {
    this.loadTree();
  }

  protected retryLoad(): void {
    this.loadTree();
  }

  /**
   * Loads (or re-loads, after a structural change) the whole WBS tree.
   *
   * `focusTaskId`, when supplied, names the row a structural action just acted upon — it is
   * **not** a fresh DOM insertion: `@for (… ; track node.taskId)` in the template preserves that
   * row's `<li>` element identity across this `nodes.set()` (indent/outdent/move never delete a
   * task, only re-parent/re-number it), so that element was already present in the DOM from the
   * *previous* render, and {@link focusRow} can safely `.focus()` it synchronously, with no
   * render-timing gap to bridge. Without `focusTaskId` (the initial load), the roving `tabindex`
   * is simply pointed at the first node — real DOM focus is deliberately never stolen on page load.
   */
  private loadTree(focusTaskId?: number): void {
    this.loadErrorKey.set(null);

    this.wbsApi
      .tree(this.projectRef)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: tree => {
          this.nodes.set(tree.nodes);
          this.loading.set(false);

          if (focusTaskId !== undefined && tree.nodes.some(n => n.taskId === focusTaskId)) {
            this.focusRow(focusTaskId);
            return;
          }
          const fallbackId = this.focusedTaskId();
          const stillPresent = fallbackId !== null && tree.nodes.some(n => n.taskId === fallbackId);
          this.focusedTaskId.set(stillPresent ? fallbackId : (tree.nodes[0]?.taskId ?? null));
        },
        error: (error: HttpErrorResponse) => {
          this.loading.set(false);
          this.loadErrorKey.set(
            error.status === 404 ? 'gantt.wbsTree.load.errors.NOT_FOUND' : 'gantt.wbsTree.load.errors.GENERIC',
          );
        },
      });
  }

  /** Formats a WBS date (ISO instant) as a plain `yyyy-MM-dd` — the time-of-day component carries no meaning for this altitude (day-grained WBS tasks, see `WbsTaskService`'s `DEFAULT_PRECISION`). */
  protected formatWbsDate(iso: string | null): string {
    return iso ? iso.slice(0, 10) : this.transloco.translate('gantt.wbsTree.noDate');
  }

  protected nodeKindLabelKey(node: WbsTaskResponse): string {
    return `gantt.wbsTree.nodeKind.${node.nodeKind}`;
  }

  // --- Focus / keyboard navigation (A11y AC) ---------------------------------------------------

  protected onRowFocus(node: WbsTaskResponse): void {
    this.focusedTaskId.set(node.taskId);
  }

  /** See class TSDoc — plain arrows move focus between visible nodes, `Alt+arrow` triggers a structural shortcut. */
  protected onRowKeyDown(event: KeyboardEvent, node: WbsTaskResponse): void {
    if (event.altKey) {
      this.handleStructuralShortcut(event, node);
      return;
    }

    const nodes = this.nodes();
    const currentIndex = nodes.findIndex(n => n.taskId === node.taskId);

    switch (event.key) {
      case 'ArrowDown': {
        event.preventDefault();
        const next = nodes[currentIndex + 1];
        if (next) {
          this.focusRow(next.taskId);
        }
        break;
      }
      case 'ArrowUp': {
        event.preventDefault();
        const previous = nodes[currentIndex - 1];
        if (previous) {
          this.focusRow(previous.taskId);
        }
        break;
      }
      case 'Home': {
        event.preventDefault();
        if (nodes[0]) {
          this.focusRow(nodes[0].taskId);
        }
        break;
      }
      case 'End': {
        event.preventDefault();
        const last = nodes[nodes.length - 1];
        if (last) {
          this.focusRow(last.taskId);
        }
        break;
      }
      default:
        break;
    }
  }

  private handleStructuralShortcut(event: KeyboardEvent, node: WbsTaskResponse): void {
    switch (event.key) {
      case 'ArrowRight':
        event.preventDefault();
        if (this.canIndent(node)) {
          this.onIndent(node);
        }
        break;
      case 'ArrowLeft':
        event.preventDefault();
        if (this.canOutdent(node)) {
          this.onOutdent(node);
        }
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (this.canMoveUp(node)) {
          this.onMoveUp(node);
        }
        break;
      case 'ArrowDown':
        event.preventDefault();
        if (this.canMoveDown(node)) {
          this.onMoveDown(node);
        }
        break;
      default:
        break;
    }
  }

  /**
   * Moves the roving `tabindex` to `taskId` and focuses its `<li>` synchronously. Always called
   * for a row that is already present in the DOM (a sibling reached via arrow-key navigation, or
   * the same row reused across a post-action `nodes.set()`, see {@link loadTree}'s TSDoc) — a
   * plain `tabindex="-1"` element remains programmatically focusable via `.focus()` regardless of
   * whether it is in the sequential Tab order, so no render-timing wrapper is needed here.
   */
  private focusRow(taskId: number): void {
    this.focusedTaskId.set(taskId);
    const el = this.elementRef.nativeElement.querySelector<HTMLElement>(`[data-task-id="${taskId}"]`);
    el?.focus();
  }

  // --- Affordances — derived purely from backend-authoritative ARIA fields, never a recomputed hierarchy ---

  protected canIndent(node: WbsTaskResponse): boolean {
    return !this.actionPending() && node.ariaPosInSet !== 1;
  }

  protected canOutdent(node: WbsTaskResponse): boolean {
    return !this.actionPending() && node.ariaLevel !== 1;
  }

  protected canMoveUp(node: WbsTaskResponse): boolean {
    return !this.actionPending() && node.ariaPosInSet !== 1;
  }

  protected canMoveDown(node: WbsTaskResponse): boolean {
    return !this.actionPending() && node.ariaPosInSet !== node.ariaSetSize;
  }

  // --- Structural actions (US22.4.1b) ----------------------------------------------------------

  protected onIndent(node: WbsTaskResponse): void {
    this.performAction(node, () => this.wbsApi.indent(this.projectRef, node.taskId));
  }

  protected onOutdent(node: WbsTaskResponse): void {
    this.performAction(node, () => this.wbsApi.outdent(this.projectRef, node.taskId));
  }

  protected onMoveUp(node: WbsTaskResponse): void {
    this.performAction(node, () => this.wbsApi.move(this.projectRef, node.taskId, { position: node.position - 1 }));
  }

  protected onMoveDown(node: WbsTaskResponse): void {
    this.performAction(node, () => this.wbsApi.move(this.projectRef, node.taskId, { position: node.position + 1 }));
  }

  /** See class TSDoc — no optimistic update, the whole tree is re-fetched on success; nothing to roll back on failure. */
  private performAction(node: WbsTaskResponse, call: () => Observable<WbsTaskResponse>): void {
    this.actionErrorKey.set(null);
    this.actionPending.set(true);

    call()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: updated => {
          this.actionPending.set(false);
          this.announcement.set(
            this.transloco.translate('gantt.wbsTree.actions.announceLevelChanged', {
              name: updated.name,
              level: updated.ariaLevel,
            }),
          );
          this.loadTree(updated.taskId);
        },
        error: (error: HttpErrorResponse) => {
          this.actionPending.set(false);
          this.actionErrorKey.set(this.resolveActionErrorKey(error));
          this.announcement.set(
            this.transloco.translate('gantt.wbsTree.actions.announceReverted', { name: node.name }),
          );
        },
      });
  }

  private resolveActionErrorKey(error: HttpErrorResponse): string {
    const apiError = error.error as WbsApiError | undefined;
    if (error.status === 422 && apiError?.code === 'ILLEGAL_WBS_MOVE') {
      return 'gantt.wbsTree.actions.errors.ILLEGAL_WBS_MOVE';
    }
    if (error.status === 409 && apiError?.code === 'WBS_HIERARCHY_CYCLE') {
      return 'gantt.wbsTree.actions.errors.WBS_HIERARCHY_CYCLE';
    }
    if (error.status === 403) {
      return 'gantt.wbsTree.actions.errors.FORBIDDEN';
    }
    if (error.status === 404) {
      return 'gantt.wbsTree.actions.errors.NOT_FOUND';
    }
    return 'gantt.wbsTree.actions.errors.GENERIC';
  }
}
