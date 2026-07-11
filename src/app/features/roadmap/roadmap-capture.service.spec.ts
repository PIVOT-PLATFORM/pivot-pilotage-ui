import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HTML2CANVAS, JS_PDF_CTOR } from './roadmap-capture.tokens';
import { RoadmapCaptureService } from './roadmap-capture.service';

// Substituted via Angular DI (`HTML2CANVAS`/`JS_PDF_CTOR` tokens), never `vi.mock` — see
// `roadmap-capture.tokens.ts`'s TSDoc for why module-mocking these two libraries isn't reliable
// under this repo's Angular CLI + Vitest integration.

function makeCanvas(width: number, height: number, dataUrl = 'data:image/png;base64,FAKE'): HTMLCanvasElement {
  return { width, height, toDataURL: vi.fn(() => dataUrl) } as unknown as HTMLCanvasElement;
}

describe('RoadmapCaptureService', () => {
  let service: RoadmapCaptureService;
  let html2canvasMock: ReturnType<typeof vi.fn>;
  let jsPdfCtorMock: ReturnType<typeof vi.fn>;
  let jsPdfInstanceMock: { addImage: ReturnType<typeof vi.fn>; save: ReturnType<typeof vi.fn> };
  let capturedAnchors: HTMLAnchorElement[];
  let clickSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    html2canvasMock = vi.fn();
    jsPdfInstanceMock = { addImage: vi.fn(), save: vi.fn() };
    // `jsPDF` is normally a class instantiated with `new`. Returning an object from a constructor
    // function makes `new` yield that object instead of the implicit `this` — the standard trick
    // for stubbing a class with a plain function.
    jsPdfCtorMock = vi.fn(function jsPdfCtor() {
      return jsPdfInstanceMock;
    });

    TestBed.configureTestingModule({
      providers: [
        { provide: HTML2CANVAS, useValue: html2canvasMock },
        { provide: JS_PDF_CTOR, useValue: jsPdfCtorMock },
      ],
    });
    service = TestBed.inject(RoadmapCaptureService);

    capturedAnchors = [];
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      capturedAnchors.push(this);
    });
  });

  afterEach(() => {
    clickSpy.mockRestore();
  });

  describe('exportPng', () => {
    it('AC1 — captures the element with a white background and downloads a PNG named after filenameBase', async () => {
      const canvas = makeCanvas(800, 400);
      html2canvasMock.mockResolvedValue(canvas);
      const element = document.createElement('div');

      await service.exportPng(element, 'roadmap');

      expect(html2canvasMock).toHaveBeenCalledWith(element, { backgroundColor: '#ffffff' });
      expect(canvas.toDataURL).toHaveBeenCalledWith('image/png');
      expect(capturedAnchors).toHaveLength(1);
      expect(capturedAnchors[0].download).toBe('roadmap.png');
      expect(capturedAnchors[0].href).toContain('data:image/png');
      // The anchor must not be left dangling in the document after the download fires.
      expect(document.body.contains(capturedAnchors[0])).toBe(false);
    });

    it('propagates an html2canvas failure without swallowing it', async () => {
      html2canvasMock.mockRejectedValue(new Error('tainted canvas'));

      await expect(service.exportPng(document.createElement('div'), 'roadmap')).rejects.toThrow('tainted canvas');
    });
  });

  describe('exportPdf', () => {
    it('AC1 — captures the element, sizes a landscape jsPDF page to the canvas, and saves it', async () => {
      const canvas = makeCanvas(800, 400);
      html2canvasMock.mockResolvedValue(canvas);
      const element = document.createElement('div');

      await service.exportPdf(element, 'roadmap');

      expect(html2canvasMock).toHaveBeenCalledWith(element, { backgroundColor: '#ffffff' });
      expect(jsPdfCtorMock).toHaveBeenCalledWith({ orientation: 'landscape', unit: 'px', format: [800, 400] });
      expect(jsPdfInstanceMock.addImage).toHaveBeenCalledWith(
        expect.stringContaining('data:image/png'),
        'PNG',
        0,
        0,
        800,
        400,
      );
      expect(jsPdfInstanceMock.save).toHaveBeenCalledWith('roadmap.pdf');
    });

    it('picks a portrait page when the captured canvas is taller than it is wide', async () => {
      html2canvasMock.mockResolvedValue(makeCanvas(300, 900));

      await service.exportPdf(document.createElement('div'), 'tall');

      expect(jsPdfCtorMock).toHaveBeenCalledWith({ orientation: 'portrait', unit: 'px', format: [300, 900] });
    });

    it('propagates an html2canvas failure without swallowing it', async () => {
      html2canvasMock.mockRejectedValue(new Error('tainted canvas'));

      await expect(service.exportPdf(document.createElement('div'), 'roadmap')).rejects.toThrow('tainted canvas');
    });
  });
});
