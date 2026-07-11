import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslocoPipe } from '@jsverse/transloco';
import { RoadmapShareApiService } from '../data-access/roadmap-share-api.service';
import { CreateShareLinkResponse, ShareLinkApiError, ShareLinkResponse } from '../data-access/roadmap-share.models';
import { RoadmapProjectRef } from '../data-access/roadmap.models';

/**
 * Share-link management panel (US22.3.5 — "Partage & export de la roadmap", AC "lien de partage
 * lecture seule... révocable à tout moment"): create a link (with an optional expiry), list
 * active/revoked/expired links, revoke one.
 *
 * **Who can use this.** Every method here hits an endpoint gated server-side by
 * `RoadmapEditPolicy` (same "who can edit this roadmap" population as `RoadmapApiService`'s own
 * write endpoints). This component does **not** hide itself behind any client-side permission
 * check — this repo has no role/permission information available client-side yet (no
 * `@pivot/ui-core` role claims consumed here, see this repo's CLAUDE.md "Auth OIDC" section) — it
 * follows the exact same established pattern as `RoadmapBoardComponent`'s own
 * `createLane`/`createInitiative` forms: shown unconditionally, and a `403` from the backend
 * (fail-closed today, see `RoadmapShareApiService`'s TSDoc) is surfaced as an explicit error
 * rather than pre-emptively hidden. Once `pivot-ui`'s role claims are consumable, hiding this
 * panel for non-editors becomes a pure UX nicety layered on top — the backend gate remains the
 * actual security boundary either way (never trust a client-side hide as the enforcement).
 *
 * **One-time token reveal (AC).** `justCreated` holds the raw `CreateShareLinkResponse` returned
 * by a successful create — the **only** place in this whole app the raw token ever exists. It is
 * never written back into `links` (which only ever holds token-less `ShareLinkResponse` rows from
 * a subsequent list refresh) and is cleared the moment the user dismisses the reveal banner or
 * navigates away (component destruction) — there is no way to recover it afterwards, matching the
 * backend's own "never persisted, only its hash is" design.
 *
 * **Revoke confirmation.** A native `confirm()` dialog is avoided (blocks the main thread, poor
 * a11y/testability) in favour of an inline two-step affordance (`confirmingRevokeId`) — click
 * "Revoke" reveals "Confirm"/"Cancel" for that row only, matching this US's Security AC that
 * revocation must be an available, but not accidental, action.
 */
@Component({
  selector: 'app-roadmap-share-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe],
  templateUrl: './roadmap-share-panel.component.html',
  styleUrl: './roadmap-share-panel.component.scss',
})
export class RoadmapSharePanelComponent implements OnInit {
  readonly projectRef = input.required<RoadmapProjectRef>();

  private readonly shareApi = inject(RoadmapShareApiService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly links = signal<ShareLinkResponse[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadErrorKey = signal<string | null>(null);

  protected readonly expiresAtInput = signal('');
  protected readonly creating = signal(false);
  protected readonly createErrorKey = signal<string | null>(null);

  protected readonly justCreated = signal<CreateShareLinkResponse | null>(null);
  protected readonly copyStatus = signal<'idle' | 'copied' | 'error'>('idle');

  protected readonly confirmingRevokeId = signal<number | null>(null);
  protected readonly revokeErrorKey = signal<string | null>(null);

  ngOnInit(): void {
    this.loadLinks();
  }

  protected retryLoad(): void {
    this.loadLinks();
  }

  private loadLinks(): void {
    this.loading.set(true);
    this.loadErrorKey.set(null);
    this.shareApi
      .listShareLinks(this.projectRef())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: links => {
          this.links.set(links);
          this.loading.set(false);
        },
        error: (error: HttpErrorResponse) => {
          this.loading.set(false);
          this.loadErrorKey.set(this.resolveScopedErrorKey('list', error));
        },
      });
  }

  protected onExpiresAtInput(event: Event): void {
    this.expiresAtInput.set((event.target as HTMLInputElement).value);
  }

  /**
   * AC — expiry is optional; when supplied it must resolve to a strictly-future instant (checked
   * client-side first for immediate feedback, the identical `SHARE_LINK_EXPIRY_INVALID` server
   * error is handled the same way if it still occurs, e.g. clock drift between client/server).
   * `<input type="datetime-local">` yields a local-time string with no offset — `new Date(...)`
   * interprets that as the browser's local time, then `toISOString()` serialises the correct
   * absolute instant for the API.
   */
  protected submitCreate(): void {
    this.createErrorKey.set(null);
    const raw = this.expiresAtInput().trim();
    let expiresAt: string | undefined;

    if (raw) {
      const parsed = new Date(raw);
      if (Number.isNaN(parsed.getTime()) || parsed.getTime() <= Date.now()) {
        this.createErrorKey.set('roadmap.share.create.errors.EXPIRY_INVALID');
        return;
      }
      expiresAt = parsed.toISOString();
    }

    this.creating.set(true);
    this.shareApi
      .createShareLink(this.projectRef(), expiresAt ? { expiresAt } : {})
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: created => {
          this.creating.set(false);
          this.expiresAtInput.set('');
          this.justCreated.set(created);
          this.copyStatus.set('idle');
          this.loadLinks();
        },
        error: (error: HttpErrorResponse) => {
          this.creating.set(false);
          this.createErrorKey.set(this.resolveCreateErrorKey(error));
        },
      });
  }

  private resolveCreateErrorKey(error: HttpErrorResponse): string {
    const code = (error.error as ShareLinkApiError | undefined)?.code;
    if (error.status === 400 && code === 'SHARE_LINK_EXPIRY_INVALID') {
      return 'roadmap.share.create.errors.EXPIRY_INVALID';
    }
    if (error.status === 403) {
      return 'roadmap.share.create.errors.FORBIDDEN';
    }
    if (error.status === 404) {
      return 'roadmap.share.create.errors.NOT_FOUND';
    }
    return 'roadmap.share.create.errors.GENERIC';
  }

  /** Builds the absolute, shareable URL embedding the token — copied in preference to the bare token, since it is what a recipient actually needs to open (AC "afficher le token clairement"). */
  protected shareUrl(token: string): string {
    return `${location.origin}/roadmap-shares/${token}`;
  }

  protected async copyShareUrl(token: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.shareUrl(token));
      this.copyStatus.set('copied');
    } catch {
      this.copyStatus.set('error');
    }
  }

  /** Dismisses the one-time reveal — see class TSDoc, this is the point of no return for this token. */
  protected dismissJustCreated(): void {
    this.justCreated.set(null);
    this.copyStatus.set('idle');
  }

  protected requestRevoke(linkId: number): void {
    this.revokeErrorKey.set(null);
    this.confirmingRevokeId.set(linkId);
  }

  protected cancelRevoke(): void {
    this.confirmingRevokeId.set(null);
  }

  protected confirmRevoke(linkId: number): void {
    this.revokeErrorKey.set(null);
    this.shareApi
      .revokeShareLink(this.projectRef(), linkId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.confirmingRevokeId.set(null);
          this.loadLinks();
        },
        error: (error: HttpErrorResponse) => {
          this.confirmingRevokeId.set(null);
          this.revokeErrorKey.set(this.resolveScopedErrorKey('revoke', error));
        },
      });
  }

  private resolveScopedErrorKey(scope: 'list' | 'revoke', error: HttpErrorResponse): string {
    if (error.status === 403) {
      return `roadmap.share.${scope}.errors.FORBIDDEN`;
    }
    if (error.status === 404) {
      return `roadmap.share.${scope}.errors.NOT_FOUND`;
    }
    return `roadmap.share.${scope}.errors.GENERIC`;
  }
}
