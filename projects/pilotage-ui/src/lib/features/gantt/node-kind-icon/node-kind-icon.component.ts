import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { WbsNodeKind } from '../data-access/wbs.models';

/**
 * Small presentational marker distinguishing a `MILESTONE` (losange/diamond) or `RECURRING`
 * (series, repeat glyph) WBS node from a plain `SUMMARY`/`LEAF` one — US22.4.6 ("jalons & tâches
 * périodiques"). Renders nothing for the latter two kinds.
 *
 * **A11y (AC — "identifiable... pas uniquement par leur forme ou leur couleur").** The icon itself
 * is purely decorative (`aria-hidden="true"`, `focusable="false"`) — it is never the sole carrier
 * of meaning. Two independent textual channels always accompany it, both supplied by the caller
 * (never duplicated here): a hover tooltip (this component's own `title` attribute, fed from
 * {@link label} — `WbsTaskResponse.nodeKindLabel`, backend-derived) and the caller's own visible,
 * localized text label (`WbsTreeComponent`'s `gantt.wbsTree.nodeKind.*` /
 * `RecurringTaskFormComponent`'s equivalent) rendered alongside this component, never inside it —
 * this keeps the icon itself free of any literal string (i18n rule: no hardcoded copy in a
 * template) while still surfacing the backend's own stable label as a tooltip.
 *
 * Reused by both `WbsTreeComponent` (existing tree nodes) and `RecurringTaskFormComponent` (the
 * series + freshly generated occurrences) — a single diamond/repeat glyph definition, never
 * duplicated across the two.
 */
@Component({
  selector: 'app-node-kind-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './node-kind-icon.component.html',
  styleUrl: './node-kind-icon.component.scss',
})
export class NodeKindIconComponent {
  readonly nodeKind = input.required<WbsNodeKind>();
  /** Backend-authoritative label (`WbsTaskResponse.nodeKindLabel`) surfaced as a hover tooltip — never rendered as the accessible label itself, see class TSDoc. */
  readonly label = input.required<string>();
}
