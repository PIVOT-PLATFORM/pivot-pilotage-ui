/**
 * Persists the user's chosen roadmap time-scale (US22.3.2 — "Échelle de temps floue").
 *
 * **Why `localStorage`, not a backend field.** The backlog file's "Notes d'implémentation" is
 * explicit: the fuzzy scale is "un réglage de vue par roadmap" (a view setting), not project data
 * — nothing about *what a roadmap contains* changes when the scale changes, only how it's drawn.
 * `RoadmapApiService`/`Initiative`/`Lane` stay entirely untouched by this service.
 *
 * **Security AC** ("le changement d'échelle... ne modifie pas les données du projet consultées
 * par d'autres utilisateurs sans droit d'édition"): this value never leaves the browser — no HTTP
 * call reads or writes it, so it cannot affect what any other user/tab sees. The storage key is
 * namespaced by the full {@link RoadmapProjectRef} (`tenantId`/`teamId`/`projectId`) purely to
 * avoid one project's remembered scale leaking into another project's view in the *same* browser
 * profile — this is a display-preference cache key, not an authorization/filtering mechanism (the
 * absolute rule against passing `tenantId`/`teamId` to the backend as a query param/header is
 * unaffected: this key is never sent over the network).
 */
import { Injectable } from '@angular/core';
import { RoadmapProjectRef } from './data-access/roadmap.models';
import { RoadmapTimeScale } from './roadmap-timeline';

const VALID_SCALES: readonly RoadmapTimeScale[] = ['MONTH', 'QUARTER', 'SEMESTER'];

/** Default grain when nothing has been chosen yet for this roadmap — matches EN18.10's default altitude. */
export const DEFAULT_TIME_SCALE: RoadmapTimeScale = 'QUARTER';

@Injectable({ providedIn: 'root' })
export class RoadmapTimeScaleService {
  /** Reads the persisted scale for this roadmap, falling back to {@link DEFAULT_TIME_SCALE} when absent or invalid. */
  read(ref: RoadmapProjectRef): RoadmapTimeScale {
    const stored = localStorage.getItem(this.storageKey(ref));
    return this.isValidScale(stored) ? stored : DEFAULT_TIME_SCALE;
  }

  /** Persists the chosen scale for this roadmap — local to this browser/user, see class TSDoc. */
  write(ref: RoadmapProjectRef, scale: RoadmapTimeScale): void {
    localStorage.setItem(this.storageKey(ref), scale);
  }

  private storageKey(ref: RoadmapProjectRef): string {
    return `pivot.roadmap.timeScale.${ref.tenantId}.${ref.teamId}.${ref.projectId}`;
  }

  private isValidScale(value: string | null): value is RoadmapTimeScale {
    return value !== null && (VALID_SCALES as readonly string[]).includes(value);
  }
}
