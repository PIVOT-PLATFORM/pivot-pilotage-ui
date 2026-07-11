import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Subject, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RoadmapShareApiService } from '../data-access/roadmap-share-api.service';
import { CreateShareLinkResponse, ShareLinkResponse } from '../data-access/roadmap-share.models';
import { RoadmapProjectRef } from '../data-access/roadmap.models';
import { RoadmapSharePanelComponent } from './roadmap-share-panel.component';

const REF: RoadmapProjectRef = { tenantId: 1, teamId: 2, projectId: 3 };

const ACTIVE_LINK: ShareLinkResponse = {
  id: 10,
  createdAt: '2026-07-01T00:00:00Z',
  expiresAt: null,
  revokedAt: null,
  active: true,
};

const REVOKED_LINK: ShareLinkResponse = {
  id: 11,
  createdAt: '2026-06-01T00:00:00Z',
  expiresAt: null,
  revokedAt: '2026-06-15T00:00:00Z',
  active: false,
};

const EXPIRED_LINK: ShareLinkResponse = {
  id: 12,
  createdAt: '2026-01-01T00:00:00Z',
  expiresAt: '2026-02-01T00:00:00Z',
  revokedAt: null,
  active: false,
};

const CREATE_RESPONSE: CreateShareLinkResponse = {
  id: 20,
  token: 'c'.repeat(64),
  createdAt: '2026-07-11T00:00:00Z',
  expiresAt: null,
};

interface ApiMock {
  listShareLinks: ReturnType<typeof vi.fn>;
  createShareLink: ReturnType<typeof vi.fn>;
  revokeShareLink: ReturnType<typeof vi.fn>;
}

function makeApiMock(overrides: Partial<ApiMock> = {}): ApiMock {
  return {
    listShareLinks: vi.fn(() => of([ACTIVE_LINK])),
    createShareLink: vi.fn(() => of(CREATE_RESPONSE)),
    revokeShareLink: vi.fn(() => of(undefined)),
    ...overrides,
  };
}

function createFixture(api: ApiMock): ComponentFixture<RoadmapSharePanelComponent> {
  TestBed.configureTestingModule({
    imports: [RoadmapSharePanelComponent, TranslocoTestingModule.forRoot({ langs: { fr: {}, en: {} } })],
    providers: [{ provide: RoadmapShareApiService, useValue: api }],
  });
  const fixture = TestBed.createComponent(RoadmapSharePanelComponent);
  fixture.componentRef.setInput('projectRef', REF);
  fixture.detectChanges();
  return fixture;
}

function text(fixture: ComponentFixture<RoadmapSharePanelComponent>): string {
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
}

function setInputValue(fixture: ComponentFixture<RoadmapSharePanelComponent>, selector: string, value: string): void {
  const el = (fixture.nativeElement as HTMLElement).querySelector(selector) as HTMLInputElement;
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  fixture.detectChanges();
}

function submitCreateForm(fixture: ComponentFixture<RoadmapSharePanelComponent>): void {
  const form = (fixture.nativeElement as HTMLElement).querySelector('form') as HTMLFormElement;
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  fixture.detectChanges();
}

/**
 * `TranslocoTestingModule`'s stub renders a missing key as `${activeLang}.${key}` (e.g.
 * `"en.roadmap.share.revoke.button"`), not the bare key — matching this repo's own established
 * convention (see `roadmap-board.component.spec.ts`) of asserting with `.toContain(key)` rather
 * than an exact match. Substring match here for the same reason.
 */
function findButton(fixture: ComponentFixture<RoadmapSharePanelComponent>, label: string): HTMLButtonElement {
  const btn = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).find(b =>
    b.textContent?.trim().includes(label),
  );
  if (!btn) {
    throw new Error(`No button found with label "${label}"`);
  }
  return btn as HTMLButtonElement;
}

describe('RoadmapSharePanelComponent', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn(() => Promise.resolve()) },
      configurable: true,
    });
  });

  it('loads and renders the project share links on init', () => {
    const api = makeApiMock({ listShareLinks: vi.fn(() => of([ACTIVE_LINK, REVOKED_LINK, EXPIRED_LINK])) });
    const fixture = createFixture(api);

    expect(api.listShareLinks).toHaveBeenCalledWith(REF);
    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr');
    expect(rows).toHaveLength(3);
  });

  it('AC — active/revoked/expired links show distinct statuses (authenticated view, unlike the public non-disclosure)', () => {
    const api = makeApiMock({ listShareLinks: vi.fn(() => of([ACTIVE_LINK, REVOKED_LINK, EXPIRED_LINK])) });
    const fixture = createFixture(api);

    const body = text(fixture);
    expect(body).toContain('roadmap.share.list.status.active');
    expect(body).toContain('roadmap.share.list.status.revoked');
    expect(body).toContain('roadmap.share.list.status.expired');
  });

  it('shows the empty-state message when there are no share links yet', () => {
    const api = makeApiMock({ listShareLinks: vi.fn(() => of([])) });
    const fixture = createFixture(api);

    expect(text(fixture)).toContain('roadmap.share.list.empty');
  });

  it('shows a loading indicator while the list request is pending', () => {
    const pending = new Subject<ShareLinkResponse[]>();
    const api = makeApiMock({ listShareLinks: vi.fn(() => pending.asObservable()) });
    const fixture = createFixture(api);

    expect(text(fixture)).toContain('roadmap.share.list.loading');

    pending.next([ACTIVE_LINK]);
    fixture.detectChanges();
    expect(text(fixture)).not.toContain('roadmap.share.list.loading');
  });

  it.each([
    [403, 'roadmap.share.list.errors.FORBIDDEN'],
    [404, 'roadmap.share.list.errors.NOT_FOUND'],
    [500, 'roadmap.share.list.errors.GENERIC'],
  ])('maps a %d list error to %s, and retry re-fetches', (status, expectedKey) => {
    const api = makeApiMock({
      listShareLinks: vi.fn(() => throwError(() => new HttpErrorResponse({ status }))),
    });
    const fixture = createFixture(api);

    expect(text(fixture)).toContain(expectedKey);

    api.listShareLinks.mockReturnValue(of([ACTIVE_LINK]));
    findButton(fixture, 'roadmap.share.list.retry').click();
    fixture.detectChanges();

    expect(text(fixture)).not.toContain(expectedKey);
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr')).toHaveLength(1);
  });

  describe('create', () => {
    it('AC1 — creates a link with no expiry (POSTs an empty request) and reveals the one-time token', () => {
      const api = makeApiMock();
      const fixture = createFixture(api);

      submitCreateForm(fixture);

      expect(api.createShareLink).toHaveBeenCalledWith(REF, {});
      expect(text(fixture)).toContain('roadmap.share.tokenReveal.title');
      expect(text(fixture)).toContain(CREATE_RESPONSE.token);
      // The list is refreshed after a successful create.
      expect(api.listShareLinks).toHaveBeenCalledTimes(2);
    });

    it('AC1 — creates a link with a future expiry, converted to an absolute ISO instant', () => {
      const api = makeApiMock();
      const fixture = createFixture(api);

      setInputValue(fixture, '#rm-share-expires-at', '2099-06-01T10:00');
      submitCreateForm(fixture);

      expect(api.createShareLink).toHaveBeenCalledWith(REF, { expiresAt: new Date('2099-06-01T10:00').toISOString() });
    });

    it('Error AC — rejects a past expiry client-side, without calling the API', () => {
      const api = makeApiMock();
      const fixture = createFixture(api);

      setInputValue(fixture, '#rm-share-expires-at', '2000-01-01T00:00');
      submitCreateForm(fixture);

      expect(api.createShareLink).not.toHaveBeenCalled();
      expect(text(fixture)).toContain('roadmap.share.create.errors.EXPIRY_INVALID');
    });

    it.each([
      [400, 'SHARE_LINK_EXPIRY_INVALID', 'roadmap.share.create.errors.EXPIRY_INVALID'],
      [403, undefined, 'roadmap.share.create.errors.FORBIDDEN'],
      [404, undefined, 'roadmap.share.create.errors.NOT_FOUND'],
      [500, undefined, 'roadmap.share.create.errors.GENERIC'],
    ])('Security/Error AC — maps a %d error (code=%s) to %s', (status, code, expectedKey) => {
      const api = makeApiMock({
        createShareLink: vi.fn(() =>
          throwError(() => new HttpErrorResponse({ status, error: code ? { code } : null })),
        ),
      });
      const fixture = createFixture(api);

      submitCreateForm(fixture);

      expect(text(fixture)).toContain(expectedKey);
      // A failed create must never reveal a (nonexistent) token.
      expect(text(fixture)).not.toContain('roadmap.share.tokenReveal.title');
    });
  });

  describe('token reveal (AC — shown once, copy-to-clipboard)', () => {
    it('copies the full shareable URL (embedding the token), not just the bare token', async () => {
      const api = makeApiMock();
      const fixture = createFixture(api);
      submitCreateForm(fixture);

      findButton(fixture, 'roadmap.share.tokenReveal.copyButton').click();
      await Promise.resolve();
      fixture.detectChanges();

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        `${location.origin}/roadmap-shares/${CREATE_RESPONSE.token}`,
      );
      expect(text(fixture)).toContain('roadmap.share.tokenReveal.copied');
    });

    it('shows a copy error if the Clipboard API rejects', async () => {
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: vi.fn(() => Promise.reject(new Error('denied'))) },
        configurable: true,
      });
      const api = makeApiMock();
      const fixture = createFixture(api);
      submitCreateForm(fixture);

      findButton(fixture, 'roadmap.share.tokenReveal.copyButton').click();
      await Promise.resolve();
      fixture.detectChanges();

      expect(text(fixture)).toContain('roadmap.share.tokenReveal.copyError');
    });

    it('dismissing the reveal clears it — the token is never retrievable again from this component', () => {
      const api = makeApiMock();
      const fixture = createFixture(api);
      submitCreateForm(fixture);
      expect(text(fixture)).toContain(CREATE_RESPONSE.token);

      findButton(fixture, 'roadmap.share.tokenReveal.dismiss').click();
      fixture.detectChanges();

      expect(text(fixture)).not.toContain(CREATE_RESPONSE.token);
      expect(text(fixture)).not.toContain('roadmap.share.tokenReveal.title');
    });
  });

  describe('revoke (Security AC — revocable at any time by an authorised user)', () => {
    it('only offers a Revoke action on active links', () => {
      const api = makeApiMock({ listShareLinks: vi.fn(() => of([ACTIVE_LINK, REVOKED_LINK])) });
      const fixture = createFixture(api);

      const revokeButtons = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).filter(
        b => b.textContent?.trim().includes('roadmap.share.revoke.button'),
      );
      expect(revokeButtons).toHaveLength(1);
    });

    it('requires an inline confirmation before actually revoking (no native confirm() dialog)', () => {
      const api = makeApiMock();
      const fixture = createFixture(api);

      findButton(fixture, 'roadmap.share.revoke.button').click();
      fixture.detectChanges();

      expect(text(fixture)).toContain('roadmap.share.revoke.confirmPrompt');
      expect(api.revokeShareLink).not.toHaveBeenCalled();

      findButton(fixture, 'roadmap.share.revoke.cancelButton').click();
      fixture.detectChanges();

      expect(text(fixture)).not.toContain('roadmap.share.revoke.confirmPrompt');
      expect(api.revokeShareLink).not.toHaveBeenCalled();
    });

    it('confirming revokes the link and refreshes the list', () => {
      const api = makeApiMock({
        listShareLinks: vi
          .fn()
          .mockReturnValueOnce(of([ACTIVE_LINK]))
          .mockReturnValueOnce(of([{ ...ACTIVE_LINK, active: false, revokedAt: '2026-07-11T12:00:00Z' }])),
      });
      const fixture = createFixture(api);

      findButton(fixture, 'roadmap.share.revoke.button').click();
      fixture.detectChanges();
      findButton(fixture, 'roadmap.share.revoke.confirmButton').click();
      fixture.detectChanges();

      expect(api.revokeShareLink).toHaveBeenCalledWith(REF, ACTIVE_LINK.id);
      expect(api.listShareLinks).toHaveBeenCalledTimes(2);
      expect(text(fixture)).toContain('roadmap.share.list.status.revoked');
    });

    it.each([
      [403, 'roadmap.share.revoke.errors.FORBIDDEN'],
      [404, 'roadmap.share.revoke.errors.NOT_FOUND'],
      [500, 'roadmap.share.revoke.errors.GENERIC'],
    ])('maps a %d revoke error to %s', (status, expectedKey) => {
      const api = makeApiMock({
        revokeShareLink: vi.fn(() => throwError(() => new HttpErrorResponse({ status }))),
      });
      const fixture = createFixture(api);

      findButton(fixture, 'roadmap.share.revoke.button').click();
      fixture.detectChanges();
      findButton(fixture, 'roadmap.share.revoke.confirmButton').click();
      fixture.detectChanges();

      expect(text(fixture)).toContain(expectedKey);
    });
  });
});
