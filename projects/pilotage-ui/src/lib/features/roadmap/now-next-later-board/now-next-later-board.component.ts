import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Horizon, HorizonViewResponse, Initiative, InitiativeHorizonChange } from '../data-access/roadmap.models';

/** Ordered left-to-right column sequence for the three real buckets — `UNBUCKETED` always renders last, see class TSDoc. */
const HORIZONS: readonly Horizon[] = ['NOW', 'NEXT', 'LATER'];

/** A card's current column, `null` meaning "not yet triaged" (the `unbucketed` column). */
type CardColumn = Horizon | null;

/** `data-nnl-column` attribute value identifying a column in the DOM, incl. the non-`Horizon` `'UNBUCKETED'` marker. */
type ColumnMarker = Horizon | 'UNBUCKETED';

/**
 * Now/Next/Later board (US22.3.3 — "Vue Now/Next/Later"): the same initiatives as
 * `RoadmapBoardComponent`'s temporal view, rendered as three columns (Now/Next/Later) instead of
 * bars on a time axis — "même jeu d'initiatives, changement de rendu uniquement" (this US's
 * backlog file, "Notes d'implémentation"). This component owns none of the data: `view` is
 * supplied by the parent (fetched via `RoadmapApiService.getHorizonView`), and every committed
 * move (mouse drop or keyboard) only emits a resolved {@link InitiativeHorizonChange} — exactly
 * the same "presentational child, parent owns the API call + optimistic update + rollback"
 * division of responsibility as `InitiativeBarComponent`/`MilestoneMarkerComponent` (see their
 * TSDoc) — this component never calls `RoadmapApiService` itself.
 *
 * **A 4th, trailing "not yet triaged" column.** `view.unbucketed` (initiatives with `horizon:
 * null`, see `HorizonViewResponse`'s TSDoc) is rendered as an extra column so AC1's "même jeu
 * d'initiatives que la vue temporelle" holds literally: an initiative is never invisible on this
 * board merely because nobody has triaged it into Now/Next/Later yet. It only ever renders when
 * non-empty, and — unlike the three real buckets — it is a drag/keyboard-move **source only**: the
 * backend's `PATCH .../horizon` requires a concrete `Horizon` (400 if null/absent, see
 * `UpdateInitiativeHorizonRequest`'s TSDoc), so there is no supported way from this UI to move a
 * card *back* into it. Every drop/keyboard-move target check below excludes it accordingly.
 *
 * **Mouse** — native Pointer Events (`setPointerCapture`), same family as
 * `InitiativeBarComponent`/`MilestoneMarkerComponent` (no Angular CDK DragDrop, per ADR-007 — see
 * those components' TSDoc). A dragged card visually follows the pointer via a CSS `transform`
 * (translate), independent of the other cards' normal document-flow layout — no column rect
 * measurement is needed. The drop target is resolved with `document.elementFromPoint` at
 * `pointerup`, walking up to the nearest `[data-nnl-column]` ancestor to read which column the
 * pointer is over.
 *
 * **Keyboard (WCAG 2.1 AA)** — each card is the single focusable, interactive unit (`tabindex="0"`,
 * `role="button"`): `ArrowLeft`/`ArrowRight` move it to the previous/next column in the fixed
 * `Now → Next → Later` order. From `Now`, `ArrowLeft` is a no-op (leftmost). From `Later`,
 * `ArrowRight` is a no-op (moving further would mean clearing the horizon, not supported — see
 * above). From the untriaged column, only `ArrowLeft` is meaningful (lands on `Later`, the
 * nearest real bucket) — `ArrowRight` is a no-op.
 *
 * **A11y — horizon read back to assistive tech.** Every card's `aria-label` states its current
 * bucket by name (never color alone) — this is the "l'horizon courant... restitué aux lecteurs
 * d'écran" A11y AC. Each column is `role="list"` with an `aria-label` naming the bucket, so
 * screen-reader users get the grouping both from the enclosing list and from each card's own label.
 *
 * **Security AC** — no client-side role gating here either: same fail-closed `RoadmapEditPolicy`
 * as every other roadmap write (see `RoadmapApiService`'s TSDoc) is the sole enforcement point;
 * `RoadmapBoardComponent` rolls back and surfaces an error on a 403, exactly like it already does
 * for `onPlacementChange`/`onMilestoneDateChange`.
 */
@Component({
  selector: 'app-now-next-later-board',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe],
  templateUrl: './now-next-later-board.component.html',
  styleUrl: './now-next-later-board.component.scss',
})
export class NowNextLaterBoardComponent {
  private readonly transloco = inject(TranslocoService);

  readonly view = input.required<HorizonViewResponse>();
  readonly horizonChange = output<InitiativeHorizonChange>();

  protected readonly horizons = HORIZONS;

  protected readonly draggingId = signal<number | null>(null);
  private readonly dragDelta = signal<{ x: number; y: number }>({ x: 0, y: 0 });

  private dragPointerId: number | null = null;
  private dragOriginClientX = 0;
  private dragOriginClientY = 0;
  private dragOriginColumn: CardColumn = null;
  private dragInitiative: Initiative | null = null;

  /** Initiatives currently sitting in a given real bucket — `[]` when absent from `view.buckets` (defensive, mirrors `laneNameFor`'s style in `RoadmapBoardComponent`). */
  protected bucketInitiatives(horizon: Horizon): readonly Initiative[] {
    return this.view().buckets.find(bucket => bucket.horizon === horizon)?.initiatives ?? [];
  }

  protected unbucketedInitiatives(): readonly Initiative[] {
    return this.view().unbucketed;
  }

  /** Localized display label for a column/card horizon — `null` maps to the "not yet triaged" label. */
  protected horizonLabel(horizon: CardColumn): string {
    return this.transloco.translate(`roadmap.board.nowNextLater.horizonLabel.${horizon ?? 'UNBUCKETED'}`);
  }

  /** Live `transform` for the currently dragged card only — every other card stays in normal flow. */
  protected cardTransform(initiativeId: number): string | null {
    if (this.draggingId() !== initiativeId) {
      return null;
    }
    const { x, y } = this.dragDelta();
    return `translate(${x}px, ${y}px)`;
  }

  protected onCardPointerDown(event: PointerEvent, initiative: Initiative, column: CardColumn): void {
    if (this.dragPointerId !== null) {
      // A gesture is already in progress — never hijack it, see `InitiativeBarComponent`'s identical guard.
      return;
    }

    this.dragPointerId = event.pointerId;
    this.dragOriginClientX = event.clientX;
    this.dragOriginClientY = event.clientY;
    this.dragOriginColumn = column;
    this.dragInitiative = initiative;
    this.draggingId.set(initiative.id);
    this.dragDelta.set({ x: 0, y: 0 });

    const target = event.currentTarget as Element | null;
    if (target && typeof target.setPointerCapture === 'function') {
      target.setPointerCapture(event.pointerId);
    }
    event.preventDefault();
  }

  protected onCardPointerMove(event: PointerEvent): void {
    if (this.dragPointerId === null || event.pointerId !== this.dragPointerId) {
      return;
    }
    this.dragDelta.set({
      x: event.clientX - this.dragOriginClientX,
      y: event.clientY - this.dragOriginClientY,
    });
  }

  protected onCardPointerUp(event: PointerEvent): void {
    if (this.dragPointerId === null || event.pointerId !== this.dragPointerId) {
      return;
    }
    const dropColumn = this.resolveDropColumn(event.clientX, event.clientY);
    this.commitDrag(dropColumn);
  }

  /** Shared abort path for `pointercancel`/`lostpointercapture` — see `InitiativeBarComponent`'s identical TSDoc. Never commits a cancelled gesture. */
  protected onCardPointerCancel(event: PointerEvent): void {
    if (this.dragPointerId === null || event.pointerId !== this.dragPointerId) {
      return;
    }
    this.resetDragState();
  }

  private resolveDropColumn(clientX: number, clientY: number): ColumnMarker | null {
    if (typeof document === 'undefined' || typeof document.elementFromPoint !== 'function') {
      return null;
    }
    const elementUnderPointer = document.elementFromPoint(clientX, clientY);
    const columnEl = elementUnderPointer?.closest<HTMLElement>('[data-nnl-column]') ?? null;
    return (columnEl?.getAttribute('data-nnl-column') as ColumnMarker | null) ?? null;
  }

  private commitDrag(dropColumn: ColumnMarker | null): void {
    const initiative = this.dragInitiative;
    const originColumn = this.dragOriginColumn;
    this.resetDragState();

    if (!initiative || dropColumn === null || dropColumn === 'UNBUCKETED') {
      // No valid drop target, or dropped on the untriaged column — never a supported move target
      // (see class TSDoc): silently revert, same as a cancelled gesture.
      return;
    }
    if (dropColumn === originColumn) {
      return; // dropped back in its own column — no-op, mirrors the bar/marker "changed" check.
    }
    this.horizonChange.emit({ initiative, horizon: dropColumn });
  }

  private resetDragState(): void {
    this.dragPointerId = null;
    this.dragInitiative = null;
    this.dragOriginColumn = null;
    this.draggingId.set(null);
    this.dragDelta.set({ x: 0, y: 0 });
  }

  /** Keyboard equivalent of the mouse drag above (A11y AC — WCAG 2.1 AA). See class TSDoc for the exact left/right mapping. */
  protected onCardKeyDown(event: KeyboardEvent, initiative: Initiative, column: CardColumn): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return;
    }
    event.preventDefault();

    const direction = event.key === 'ArrowRight' ? 1 : -1;
    const next = this.nextColumn(column, direction);
    if (next !== null) {
      this.horizonChange.emit({ initiative, horizon: next });
    }
  }

  /** Resolves the next real bucket in the fixed `Now → Next → Later` order, or `null` when the move is unsupported (clamped edge, or would require clearing the horizon). */
  private nextColumn(current: CardColumn, direction: 1 | -1): Horizon | null {
    if (current === null) {
      // Untriaged: only a leftward move is meaningful, landing on the nearest real bucket.
      return direction === -1 ? 'LATER' : null;
    }
    const index = HORIZONS.indexOf(current);
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= HORIZONS.length) {
      return null;
    }
    return HORIZONS[nextIndex];
  }
}
