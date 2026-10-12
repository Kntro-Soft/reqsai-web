import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SharedSessionResponse } from '../../data/share.models';
import { SharedSession } from './shared-session';

const BASE = '/api/share/session/tok';

function session(access: 'VIEW' | 'REVIEW'): SharedSessionResponse {
  return {
    projectName: 'Reservas',
    access,
    expiresAt: '2026-12-01T00:00:00Z',
    session: { id: 's1', title: 'Reunión con el cliente', status: 'RECORDING' } as never,
    segments: [
      {
        sequence: 1,
        text: 'Necesitamos reservar mesas',
        speakerLabel: 'A',
        startMs: 65000,
        endMs: 66000,
      },
    ] as never,
    totalSegments: 1,
    speakers: {
      sessionId: 's1',
      speakers: [
        { label: 'A', index: 1, displayName: 'María', name: 'María', side: null, segmentCount: 1 },
      ],
      overlaps: { count: 0, totalMs: 0, ranges: [] },
    },
    suggestions: [
      {
        id: 'sg1',
        type: 'NEW_STORY',
        status: 'PENDING',
        draftTitle: 'Reservar mesa',
        draftRole: 'cliente',
        draftAction: 'reservar',
        draftBenefit: 'ahorrar tiempo',
      },
    ] as never,
    stories: [
      {
        id: 'st1',
        title: 'Recordatorio',
        role: 'cliente',
        action: 'recibir aviso',
        benefit: 'no olvidar',
        priority: 'HIGH',
        status: 'DRAFT',
      },
    ] as never,
  };
}

describe('SharedSession', () => {
  let fixture: ComponentFixture<SharedSession>;
  let http: HttpTestingController;

  function el(testid: string): HTMLElement | null {
    return fixture.nativeElement.querySelector(`[data-testid="${testid}"]`);
  }

  function open(access: 'VIEW' | 'REVIEW'): void {
    fixture.detectChanges();
    http.expectOne(BASE).flush(session(access));
    fixture.detectChanges();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [
        SharedSession,
        TranslocoTestingModule.forRoot({
          langs: { en: {} },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(SharedSession);
    fixture.componentRef.setInput('token', 'tok');
  });

  afterEach(() => http.verify());

  it('shows the session, who spoke and when, with no decisions for a spectator', () => {
    open('VIEW');

    expect(el('shared-session-title')?.textContent).toContain('Reunión con el cliente');
    expect(el('shared-session-status')?.getAttribute('data-status')).toBe('RECORDING');
    const segment = el('shared-segment')?.textContent ?? '';
    expect(segment).toContain('María');
    expect(segment).toContain('1:05');
    expect(segment).toContain('Necesitamos reservar mesas');
    expect(el('shared-suggestion')).not.toBeNull();
    expect(el('shared-session-story')).not.toBeNull();
    expect(el('shared-accept')).toBeNull();
    expect(el('shared-dismiss')).toBeNull();
    expect(el('shared-story-approve')).toBeNull();
  });

  it('lets a reviewer accept, dismiss and decide on stories', () => {
    open('REVIEW');

    el('shared-accept-approve')?.click();
    const accept = http.expectOne(`${BASE}/suggestions/sg1/accept`);
    expect(accept.request.body).toEqual({ approve: true });
    accept.flush({});
    http.expectOne(BASE).flush(session('REVIEW'));
    fixture.detectChanges();

    el('shared-dismiss')?.click();
    http.expectOne(`${BASE}/suggestions/sg1/dismiss`).flush({});
    http.expectOne(BASE).flush(session('REVIEW'));
    fixture.detectChanges();

    el('shared-story-approve')?.click();
    const status = http.expectOne(`${BASE}/stories/st1/status`);
    expect(status.request.body).toEqual({ status: 'APPROVED' });
    status.flush({});
    http.expectOne(BASE).flush(session('REVIEW'));
  });

  it('says so when a decision is refused because the link only watches', () => {
    open('REVIEW');

    el('shared-dismiss')?.click();
    http
      .expectOne(`${BASE}/suggestions/sg1/dismiss`)
      .flush({ code: 'SHARE_LINK_READ_ONLY' }, { status: 403, statusText: 'Forbidden' });
    http.expectOne(BASE).flush(session('REVIEW'));
    fixture.detectChanges();

    expect(el('shared-session-message')).not.toBeNull();
  });

  it('shows the same dead end for an unknown, revoked or expired link', () => {
    fixture.detectChanges();
    http
      .expectOne(BASE)
      .flush({ code: 'SHARE_LINK_UNAVAILABLE' }, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();

    expect(el('shared-session-unavailable')).not.toBeNull();
    expect(el('shared-session-title')).toBeNull();
  });
});
