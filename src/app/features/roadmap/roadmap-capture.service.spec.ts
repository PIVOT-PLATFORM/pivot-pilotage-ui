import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// `vi.hoisted` — the mock factories below (`vi.mock`) are hoisted above these imports by
// Vitest, so any variable they reference must itself be created inside a `vi.hoisted` block.
const { html2canvasMock, jsPdfCtorMock, jsPdfInstanceMock } = vi.hoisted(() => {
  const html2canvasMock = vi.fn();
  const jsPdfInstanceMock = { addImage: vi.fn(), save: vi.fn() };
  // `jsPDF` is normally a class instantiated with `new`. Returning an object from a constructor
  // function makes `new` yield that object instead of the implicit `this` — the standard trick
  // for mocking a class with a plain function.
  const jsPdfCtorMock = vi.fn(function jsPdfCtor() {
    return jsPdfInstanceMock;
  });
  return { html2canvasMock, jsPdfCtorMock, jsPdfInstanceMock };
});

vi.mock('html2canvas', () => ({ default: html2canvasMock }));
vi.mock('jspdf', () => ({ jsPDF: jsPdfCtorMock }));

import { RoadmapCaptureService } from './roadmap-capture.service';

function makeCanvas(width: number, height: number, dataUrl = 'data:image/png;base64,FAKE'): HTMLCanvasElement {
  return { width, height, toDataURL: vi.fn(() => dataUrl) } as unknown as HTMLCanvasElement;
}

describe('RoadmapCaptureService', () => {
  let service: RoadmapCaptureService;
  let capturedAnchors: HTMLAnchorElement[];
  let clickSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new RoadmapCaptureService();
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
      expect(jsPdfInstanceMock.addImage).toHaveBeenCalledWith(expect.stringContaining('data:image/png'), 'PNG', 0, 0, 800, 400);
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
