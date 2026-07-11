import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { describe, expect, it, vi } from 'vitest';
import { RoadmapCaptureService } from '../roadmap-capture.service';
import { RoadmapExportButtonComponent } from './roadmap-export-button.component';

interface CaptureMock {
  exportPng: ReturnType<typeof vi.fn>;
  exportPdf: ReturnType<typeof vi.fn>;
}

function makeCaptureMock(overrides: Partial<CaptureMock> = {}): CaptureMock {
  return {
    exportPng: vi.fn(() => Promise.resolve()),
    exportPdf: vi.fn(() => Promise.resolve()),
    ...overrides,
  };
}

function createFixture(capture: CaptureMock): ComponentFixture<RoadmapExportButtonComponent> {
  TestBed.configureTestingModule({
    imports: [RoadmapExportButtonComponent, TranslocoTestingModule.forRoot({ langs: { fr: {}, en: {} } })],
    providers: [{ provide: RoadmapCaptureService, useValue: capture }],
  });
  const fixture = TestBed.createComponent(RoadmapExportButtonComponent);
  fixture.detectChanges();
  return fixture;
}

function buttons(fixture: ComponentFixture<RoadmapExportButtonComponent>): {
  png: HTMLButtonElement;
  pdf: HTMLButtonElement;
} {
  const btns = (fixture.nativeElement as HTMLElement).querySelectorAll('button');
  return { png: btns[0] as HTMLButtonElement, pdf: btns[1] as HTMLButtonElement };
}

/** Flushes enough microtask ticks for the component's `async runExport` to settle. */
async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('RoadmapExportButtonComponent', () => {
  it('disables both buttons when no target is set', () => {
    const fixture = createFixture(makeCaptureMock());

    const { png, pdf } = buttons(fixture);

    expect(png.disabled).toBe(true);
    expect(pdf.disabled).toBe(true);
  });

  it('AC1 — exports PNG via RoadmapCaptureService, using the configured filenamePrefix', async () => {
    const capture = makeCaptureMock();
    const fixture = createFixture(capture);
    const target = document.createElement('div');
    fixture.componentRef.setInput('target', target);
    fixture.componentRef.setInput('filenamePrefix', 'my-roadmap');
    fixture.detectChanges();

    const { png } = buttons(fixture);
    expect(png.disabled).toBe(false);
    png.click();
    await flushMicrotasks();
    fixture.detectChanges();

    expect(capture.exportPng).toHaveBeenCalledWith(target, 'my-roadmap');
  });

  it('AC1 — exports PDF via RoadmapCaptureService, defaulting filenamePrefix to "roadmap"', async () => {
    const capture = makeCaptureMock();
    const fixture = createFixture(capture);
    const target = document.createElement('div');
    fixture.componentRef.setInput('target', target);
    fixture.detectChanges();

    const { pdf } = buttons(fixture);
    pdf.click();
    await flushMicrotasks();
    fixture.detectChanges();

    expect(capture.exportPdf).toHaveBeenCalledWith(target, 'roadmap');
  });

  it('shows a generic, translated error and re-enables the buttons when the capture rejects', async () => {
    const capture = makeCaptureMock({ exportPng: vi.fn(() => Promise.reject(new Error('boom'))) });
    const fixture = createFixture(capture);
    fixture.componentRef.setInput('target', document.createElement('div'));
    fixture.detectChanges();

    const { png } = buttons(fixture);
    png.click();
    await flushMicrotasks();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('roadmap.export.errors.GENERIC');
    expect(png.disabled).toBe(false);
  });

  it('ignores a second click fired while an export is already in progress', async () => {
    let resolveExport: () => void = () => undefined;
    const capture = makeCaptureMock({
      exportPng: vi.fn(() => new Promise<void>(resolve => (resolveExport = resolve))),
    });
    const fixture = createFixture(capture);
    fixture.componentRef.setInput('target', document.createElement('div'));
    fixture.detectChanges();

    const { png } = buttons(fixture);
    png.click();
    png.click(); // second click before the first export has resolved

    resolveExport();
    await flushMicrotasks();
    fixture.detectChanges();

    expect(capture.exportPng).toHaveBeenCalledTimes(1);
  });

  it('does nothing when clicked with no target (defensive — buttons are disabled, but the guard is state-based, not DOM-based)', async () => {
    const capture = makeCaptureMock();
    const fixture = createFixture(capture);

    const { png } = buttons(fixture);
    png.click();
    await flushMicrotasks();

    expect(capture.exportPng).not.toHaveBeenCalled();
  });
});
