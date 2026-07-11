import { Injectable } from '@angular/core';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

/**
 * Client-side export of the roadmap's *currently rendered* DOM to PNG/PDF (US22.3.5 — "Partage &
 * export de la roadmap").
 *
 * **Architecture decision — capture côté client, pas de génération serveur.** Tranchée by
 * PO Agent + Architecte on `pivot-pilotage-core` (see this US's backlog file, "Décision
 * d'architecture" section): the roadmap's rendering (lanes, initiatives, periods — and, once
 * merged, milestones) already exists in this Angular app; duplicating that rendering logic
 * server-side (a headless browser, or manually reconstructing the layout as a PDF) would be
 * costly to maintain and risks drifting from what's actually on screen, which would violate the
 * AC "export fidèle au rendu réel". The backend has **no role** in export generation — its only
 * involvement in this US is exposing correct roadmap data (including to the public share link).
 *
 * **Library choice.** `html2canvas` (DOM → `<canvas>` raster) + `jsPDF` (embeds that raster into a
 * PDF page sized to match) — the exact pairing the backlog file's own architecture note names as
 * the reasonable default ("lib type `jsPDF`/`html2canvas`"). No other capture/export library
 * exists anywhere else in the `pivot-platform` monorepo at the time of writing (verified: no
 * `html2canvas`/`jspdf`/`dom-to-image`/`canvg` in any sibling repo's `package.json`) — this is a
 * fresh choice for this repo, not a reuse of an established one.
 *
 * Both methods capture exactly the `HTMLElement` passed by the caller — this service has no
 * opinion on *which* element that is (`RoadmapExportButtonComponent`'s callers decide, typically
 * the board's `.rm-board__timeline` container or the public share view's read-only equivalent) —
 * so export fidelity is inherently "whatever is currently on screen in that container", including
 * any milestone markers once US22.3.4 merges, with zero coupling required here.
 *
 * **No error handling here** — same "propagate, don't swallow" philosophy as this feature's API
 * services: `html2canvas`/`jsPDF` failures (e.g. a tainted canvas from a cross-origin image) are
 * rethrown as-is; `RoadmapExportButtonComponent` catches and surfaces a generic, translated error.
 */
@Injectable({ providedIn: 'root' })
export class RoadmapCaptureService {
  /**
   * Captures `element` and downloads it as a PNG named `${filenameBase}.png`.
   *
   * @throws unknown re-thrown `html2canvas` failure
   */
  async exportPng(element: HTMLElement, filenameBase: string): Promise<void> {
    const canvas = await this.captureCanvas(element);
    this.downloadDataUrl(canvas.toDataURL('image/png'), `${filenameBase}.png`);
  }

  /**
   * Captures `element` and downloads it as a single-page PDF named `${filenameBase}.pdf`, sized
   * (in CSS pixels) to exactly match the captured canvas — no cropping/scaling surprises, "fidèle
   * au rendu réel" (AC).
   *
   * @throws unknown re-thrown `html2canvas`/`jsPDF` failure
   */
  async exportPdf(element: HTMLElement, filenameBase: string): Promise<void> {
    const canvas = await this.captureCanvas(element);
    const orientation = canvas.width >= canvas.height ? 'landscape' : 'portrait';
    const pdf = new jsPDF({ orientation, unit: 'px', format: [canvas.width, canvas.height] });
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, canvas.width, canvas.height);
    pdf.save(`${filenameBase}.pdf`);
  }

  private captureCanvas(element: HTMLElement): Promise<HTMLCanvasElement> {
    // A plain white background avoids a transparent PNG rendering as black in viewers that don't
    // honour alpha (and gives the PDF page a real background instead of none).
    return html2canvas(element, { backgroundColor: '#ffffff' });
  }

  private downloadDataUrl(dataUrl: string, filename: string): void {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    // Some browsers only honour a synthetic click on an anchor that is actually in the document.
    document.body.appendChild(link);
    link.click();
    link.remove();
  }
}
