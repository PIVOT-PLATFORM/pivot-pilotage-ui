import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ToastService } from './toast.service';

describe('ToastService', () => {
  let service: ToastService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ToastService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs the message with its type as a console shim (EN17.2 replaces this with a real Toast component)', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    service.show('Module non disponible', 'warning');

    expect(infoSpy).toHaveBeenCalledWith('[toast:warning] Module non disponible');
  });

  it('defaults to the "info" type when none is provided', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    service.show('Hello');

    expect(infoSpy).toHaveBeenCalledWith('[toast:info] Hello');
  });
});
