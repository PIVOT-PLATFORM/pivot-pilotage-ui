import { Injectable } from '@angular/core';

export type ToastType = 'info' | 'success' | 'warning' | 'error';

/**
 * Stub toast service — console shim until `@pivot/design-system` (EN17.2) publishes a real
 * Toast component and/or this repo is lazy-loaded inside the `pivot-ui` shell. Mirrors the
 * identical precedent already established in `pivot-collaboratif-ui`
 * (`core/toast/toast.service.ts`, EN08.2).
 *
 * Call sites (`toast.show(message, type)`) are expected to stay source-compatible once
 * replaced by the real design-system component — only this file's body changes.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  show(message: string, type: ToastType = 'info'): void {
    console.info(`[toast:${type}] ${message}`);
  }
}
