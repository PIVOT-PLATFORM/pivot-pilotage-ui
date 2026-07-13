import { HttpErrorResponse } from '@angular/common/http';
import { ComponentRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DependencyApiService } from '../data-access/dependency-api.service';
import { WbsApiService } from '../data-access/wbs-api.service';
import { WbsTreeResponse } from '../data-access/wbs.models';
import { GanttChartComponent } from './gantt-chart.component';

const TREE: WbsTreeResponse = {
  projectId: 1,
  ariaRole: 'tree',
  nodes: [
    {
      taskId: 1, parentTaskId: null, wbsCode: '1', name: 'Phase', nodeKind: 'SUMMARY', nodeKindLabel: '',
      position: 0, startDate: null, finishDate: null, durationMinutes: null, percentComplete: null,
      progressLabel: null, expectedPercentComplete: null, late: false, progressVarianceLabel: null,
      readOnly: true, ariaRole: 'treeitem', ariaLevel: 1, ariaSetSize: 1, ariaPosInSet: 1,
      ariaReadOnly: true, revision: 0,
    },
    {
      taskId: 2, parentTaskId: 1, wbsCode: '1.1', name: 'Tâche', nodeKind: 'LEAF', nodeKindLabel: '',
      position: 0, startDate: '2026-01-05T00:00:00Z', finishDate: '2026-01-15T00:00:00Z', durationMinutes: 4800,
      percentComplete: 40, progressLabel: '40%', expectedPercentComplete: null, late: false, progressVarianceLabel: null,
      readOnly: false, ariaRole: 'treeitem', ariaLevel: 2,
      ariaSetSize: 1, ariaPosInSet: 1, ariaReadOnly: false, revision: 0,
    },
  ],
};

function setup(opts: { tree?: () => unknown; deps?: () => unknown } = {}): {
  fixture: ComponentFixture<GanttChartComponent>;
  ref: ComponentRef<GanttChartComponent>;
} {
  const wbsApi = { tree: vi.fn(opts.tree ?? (() => of(TREE))) };
  const depApi = { list: vi.fn(opts.deps ?? (() => of([]))) };
  const route = { snapshot: { paramMap: { get: (k: string) => ({ tenantId: '1', teamId: '2', projectId: '3' })[k] ?? null } } };

  TestBed.configureTestingModule({
    imports: [GanttChartComponent, TranslocoTestingModule.forRoot({ langs: { fr: {}, en: {} } })],
    providers: [
      { provide: WbsApiService, useValue: wbsApi },
      { provide: DependencyApiService, useValue: depApi },
      { provide: ActivatedRoute, useValue: route },
    ],
  });
  const fixture = TestBed.createComponent(GanttChartComponent);
  fixture.detectChanges();
  return { fixture, ref: fixture.componentRef };
}

describe('GanttChartComponent', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('loads the tree + dependencies and builds a non-empty layout', () => {
    const { fixture } = setup();
    const cmp = fixture.componentInstance as unknown as { loading(): boolean; layout(): { empty: boolean; rows: unknown[] } };
    expect(cmp.loading()).toBe(false);
    expect(cmp.layout().empty).toBe(false);
    expect(cmp.layout().rows.length).toBe(2);
  });

  it('renders the timeline (bar) once loaded', () => {
    const { fixture } = setup();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.gc__bar')).not.toBeNull();
    expect(el.querySelector('.gc__group')).not.toBeNull();
  });

  it('maps a 404 to the NOT_FOUND error key', () => {
    const { fixture } = setup({ tree: () => throwError(() => new HttpErrorResponse({ status: 404 })) });
    const cmp = fixture.componentInstance as unknown as { loading(): boolean; loadErrorKey(): string | null };
    expect(cmp.loading()).toBe(false);
    expect(cmp.loadErrorKey()).toBe('gantt.chart.errors.NOT_FOUND');
  });

  it('maps a generic error to the GENERIC error key and can retry', () => {
    const { fixture } = setup({ tree: () => throwError(() => new HttpErrorResponse({ status: 500 })) });
    const cmp = fixture.componentInstance as unknown as { loadErrorKey(): string | null; retryLoad(): void };
    expect(cmp.loadErrorKey()).toBe('gantt.chart.errors.GENERIC');
    cmp.retryLoad(); // ne jette pas
  });
});
