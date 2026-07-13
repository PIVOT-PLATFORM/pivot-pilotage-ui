import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { forkJoin } from 'rxjs';
import { DependencyApiService } from '../data-access/dependency-api.service';
import { Dependency } from '../data-access/dependency.models';
import { WbsApiService } from '../data-access/wbs-api.service';
import { GanttProjectRef, WbsTaskResponse } from '../data-access/wbs.models';
import { GANTT_BAR_H, GANTT_HEAD_H, GANTT_ROW_H, GanttLayout, buildGanttLayout } from './gantt-layout';

/**
 * Visual Gantt chart of a project's detailed WBS (F22.4) — the two-pane timeline view: a left
 * task list grouped by `SUMMARY` phase bands, and a right time-scaled timeline of bars, milestone
 * diamonds and typed dependency connectors.
 *
 * **Read-only, backend-authoritative.** Consumes `GET .../gantt/tree` (hierarchy, dates, progress —
 * read verbatim, never recomputed, see {@link WbsTaskResponse}) and `GET .../gantt/dependencies`;
 * all pixel geometry is delegated to the pure, unit-tested {@link buildGanttLayout}. Structural
 * editing lives in the sibling WBS-tree view ({@link WbsTreeComponent}, linked from the header).
 *
 * **Assignee avatars are deferred.** The `assignment` projection is not yet exposed by the tree
 * contract, so the avatar slot renders a neutral placeholder — real initials arrive with the
 * backend addition, no template change needed ({@link GanttTaskRow.initials}).
 *
 * **Route.** `tenantId`/`teamId`/`projectId` as path params, same gap-era shape as the rest of this
 * feature (see {@link GanttProjectRef}).
 */
@Component({
  selector: 'app-gantt-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe, RouterLink],
  templateUrl: './gantt-chart.component.html',
  styleUrl: './gantt-chart.component.scss',
})
export class GanttChartComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly wbsApi = inject(WbsApiService);
  private readonly depApi = inject(DependencyApiService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly projectRef: GanttProjectRef = this.readProjectRef();

  protected readonly rowH = GANTT_ROW_H;
  protected readonly barH = GANTT_BAR_H;
  protected readonly headH = GANTT_HEAD_H;

  private readonly nodes = signal<readonly WbsTaskResponse[]>([]);
  private readonly deps = signal<readonly Dependency[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadErrorKey = signal<string | null>(null);

  /** Full pixel layout — recomputed whenever the tree or its dependencies change. */
  protected readonly layout = computed<GanttLayout>(() => buildGanttLayout(this.nodes(), this.deps()));

  private readProjectRef(): GanttProjectRef {
    const params = this.route.snapshot.paramMap;
    return {
      tenantId: Number(params.get('tenantId')),
      teamId: Number(params.get('teamId')),
      projectId: Number(params.get('projectId')),
    };
  }

  ngOnInit(): void {
    this.load();
  }

  protected retryLoad(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.loadErrorKey.set(null);

    forkJoin({
      tree: this.wbsApi.tree(this.projectRef),
      deps: this.depApi.list(this.projectRef),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ tree, deps }) => {
          this.nodes.set(tree.nodes);
          this.deps.set(deps);
          this.loading.set(false);
        },
        error: (error: HttpErrorResponse) => {
          this.loading.set(false);
          this.loadErrorKey.set(
            error.status === 404 ? 'gantt.chart.errors.NOT_FOUND' : 'gantt.chart.errors.GENERIC',
          );
        },
      });
  }
}
