import { InjectionToken } from '@angular/core';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

/**
 * DI tokens wrapping the `html2canvas`/`jsPDF` module-level imports for `RoadmapCaptureService`.
 *
 * **Why not `vi.mock`.** Mocking these two libraries at the module level (`vi.mock('html2canvas',
 * ...)`) is not reliably honoured by this repo's Angular CLI + Vitest integration
 * (`@angular/build:unit-test`) — it passed locally but the *real* `html2canvas` ran in CI,
 * attempting to clone a detached test `<div>` into an iframe and failing with "Unable to find
 * element in cloned iframe". Wrapping both libraries behind plain Angular DI tokens instead lets
 * `RoadmapCaptureService`'s spec substitute them via `TestBed` providers — ordinary,
 * bundler-independent dependency injection, not a runtime module-mocking mechanism.
 */
export const HTML2CANVAS = new InjectionToken<typeof html2canvas>('ROADMAP_HTML2CANVAS', {
  providedIn: 'root',
  factory: () => html2canvas,
});

export const JS_PDF_CTOR = new InjectionToken<typeof jsPDF>('ROADMAP_JSPDF_CTOR', {
  providedIn: 'root',
  factory: () => jsPDF,
});
