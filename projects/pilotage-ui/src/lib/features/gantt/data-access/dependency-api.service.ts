import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { PILOTAGE_API_URL } from '../../../core/config/tokens';
import {
  CreateDependencyRequest,
  Dependency,
  DependencyProjectRef,
  TaskOption,
  UpdateDependencyRequest,
} from './dependency.models';

/** Shape of `GET .../gantt/tree` this service actually reads — see `listTasks`'s TSDoc. */
interface WbsTreeNode {
  readonly taskId: number;
  readonly wbsCode: string;
  readonly name: string;
}

/** Shape of `GET .../gantt/tree` this service actually reads — see `listTasks`'s TSDoc. */
interface WbsTreeResponse {
  readonly nodes: readonly WbsTreeNode[];
}

/**
 * HTTP client for the typed-dependency management contract (US22.4.3) exposed by
 * `pivot-pilotage-core`'s `WbsTaskController`. Authoritative contract:
 * `pivot-docs/docs/backlog/EPIC-roadmap/FEATURES/gantt-detaille/us-dependances-typees.md`
 * (backend PR `pivot-pilotage-core#47`).
 *
 * `tenantId`/`teamId`/`projectId` travel as **path segments** (never body/query/header) — see
 * {@link DependencyProjectRef}'s TSDoc for why. This service never invents or caches an id of its
 * own: every method takes a fully-resolved `DependencyProjectRef` supplied by the caller.
 *
 * **No error handling here** — every method propagates the raw `HttpErrorResponse` to the caller,
 * same "propagate, don't swallow" philosophy already established by `RoadmapApiService`/
 * `RoadmapShareApiService`.
 *
 * **Known platform gap** — every write endpoint (`create`, `update`, `delete`) currently 403s
 * unconditionally server-side: `WbsEditPolicy` is wired fail-closed (`DenyAllWbsEditPolicy`)
 * pending `pivot-core-starter`'s project/team membership resolution — identical posture to
 * `RoadmapApiService`'s own documented gap. This service and its callers are fully functional and
 * tested against the *intended* contract; only the backend's role gate itself is temporarily
 * always-deny.
 */
@Injectable({ providedIn: 'root' })
export class DependencyApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(PILOTAGE_API_URL);

  private ganttBaseUrl(ref: DependencyProjectRef): string {
    return `${this.apiUrl}/tenants/${ref.tenantId}/teams/${ref.teamId}/projects/${ref.projectId}/gantt`;
  }

  /**
   * Lists the project's tasks (id + WBS code + name only) to populate the predecessor/successor
   * pickers — a minimal, read-only projection of `GET .../gantt/tree` (US22.4.1a). This feature
   * owns none of the WBS tree itself (indent/outdent/reorder — a parallel item,
   * `feat/us22-4-1abc-wbs-tree-ui`); reading the same tree endpoint here is purely additive and
   * side-effect-free — see class TSDoc.
   *
   * @throws HttpErrorResponse 404 if the tenant/team/project triplet resolves to no visible project
   */
  listTasks(ref: DependencyProjectRef): Observable<TaskOption[]> {
    return this.http
      .get<WbsTreeResponse>(`${this.ganttBaseUrl(ref)}/tree`)
      .pipe(map(tree => tree.nodes.map(node => ({ taskId: node.taskId, wbsCode: node.wbsCode, name: node.name }))));
  }

  /**
   * Lists the project's typed dependencies.
   *
   * @throws HttpErrorResponse 404 if the tenant/team/project triplet resolves to no visible project
   */
  list(ref: DependencyProjectRef): Observable<Dependency[]> {
    return this.http.get<Dependency[]>(`${this.ganttBaseUrl(ref)}/dependencies`);
  }

  /**
   * Creates a typed dependency between two tasks of the project.
   *
   * @throws HttpErrorResponse 403 (unauthorized — fail-closed today, see class TSDoc), 404
   *         (project or an endpoint task not visible), 422 (`INVALID_DEPENDENCY` — self-link),
   *         409 (`DUPLICATE_DEPENDENCY`, or `SCHEDULE_CYCLE` — a cycle, atomic on the backend:
   *         nothing is ever persisted when this fires)
   */
  create(ref: DependencyProjectRef, request: CreateDependencyRequest): Observable<Dependency> {
    return this.http.post<Dependency>(`${this.ganttBaseUrl(ref)}/dependencies`, request);
  }

  /**
   * Retypes and/or relags an existing dependency. The two endpoint tasks are fixed for the
   * lifetime of the edge (changing them is a delete + create) — only `linkType`/`lagMinutes` are
   * mutable, mirroring `UpdateDependencyRequest`'s TSDoc.
   *
   * @throws HttpErrorResponse 403 (unauthorized — fail-closed today, see class TSDoc), 404
   *         (project or dependency not visible), 409 (`DUPLICATE_DEPENDENCY`, or `SCHEDULE_CYCLE`)
   */
  update(ref: DependencyProjectRef, dependencyId: number, request: UpdateDependencyRequest): Observable<Dependency> {
    return this.http.put<Dependency>(`${this.ganttBaseUrl(ref)}/dependencies/${dependencyId}`, request);
  }

  /**
   * Deletes a dependency (removing an edge can never create a cycle — no cycle-rejection path
   * here, unlike `create`/`update`).
   *
   * @throws HttpErrorResponse 403 (unauthorized — fail-closed today, see class TSDoc), 404
   *         (project or dependency not visible)
   */
  delete(ref: DependencyProjectRef, dependencyId: number): Observable<void> {
    return this.http.delete<void>(`${this.ganttBaseUrl(ref)}/dependencies/${dependencyId}`);
  }
}
