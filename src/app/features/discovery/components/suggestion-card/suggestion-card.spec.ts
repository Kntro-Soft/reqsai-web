import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { beforeEach, describe, expect, it } from 'vitest';
import { AcceptSuggestionRequest, SuggestionResponse } from '../../data/discovery.models';
import { EvidenceSegment } from '../../data/evidence';
import { SuggestionCard } from './suggestion-card';

const EN = {
  discovery: {
    speaker: 'Speaker {{n}}',
    speakers: { side: { CLIENT: 'Client', TEAM: 'Team' } },
    suggestion: {
      code: {
        exists: 'Already exists in the code',
        conflicts: 'Contradicts what is built',
        notFound: 'Not found in the code',
        unsure: 'The code is not conclusive',
        verify: 'Verify in the code',
        verifyAgain: 'Verify again',
        verifying: 'Searching the code…',
        done: 'Verification finished:',
        failed: 'We could not verify this in the code.',
        retry: 'Retry',
        verifiedInCode: 'Verified in the source code',
        opensGitHub: '(opens on GitHub)',
        references: 'Related places in the code',
      },
      evidence: { show: 'Show in the transcript' },
    },
  },
};

function suggestion(overrides: Partial<SuggestionResponse> = {}): SuggestionResponse {
  return {
    id: 'sug-1',
    sessionId: 'sess-1',
    projectId: 'p1',
    type: 'NEW_STORY',
    status: 'PENDING',
    draftTitle: 'Cancelar reserva',
    draftRole: 'comensal',
    draftAction: 'cancelar mi reserva hasta 24 horas antes',
    draftBenefit: 'liberar la mesa',
    draftPriority: 'HIGH',
    draftStoryPoints: 3,
    relatedTopic: null,
    targetStoryId: null,
    question: null,
    resolvedStoryId: null,
    createdAt: '2026-10-09T10:05:00Z',
    updatedAt: '2026-10-09T10:05:00Z',
    ...overrides,
  };
}

const SEGMENT: EvidenceSegment = {
  sessionId: 'sess-1',
  sequence: 4,
  occurredAt: '2026-10-09T10:04:00',
  speaker: {
    label: 'A',
    index: 1,
    displayName: 'Ana',
    role: 'CLIENT',
    side: 'left',
    segmentCount: 2,
  },
};

describe('SuggestionCard code insight and evidence', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [
        SuggestionCard,
        TranslocoTestingModule.forRoot({
          langs: { en: EN },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
    });
  });

  function render(
    value: SuggestionResponse,
    segment: EvidenceSegment | null = null,
  ): { fixture: ComponentFixture<SuggestionCard>; el: HTMLElement } {
    const fixture = TestBed.createComponent(SuggestionCard);
    fixture.componentRef.setInput('suggestion', value);
    fixture.componentRef.setInput('evidenceSegment', segment);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  const byTestId = (el: HTMLElement, id: string) =>
    el.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

  it('warns when the request contradicts the code, with links to the modules', () => {
    const { el } = render(
      suggestion({
        code: {
          finding: 'CONFLICTS_WITH_CODE',
          note: 'El código permite cancelar hasta 2 h antes; el cliente pide 24 h.',
          references: [
            {
              repository: 'acme/reservas',
              path: 'src/reservas',
              name: 'Reservas',
              url: 'https://github.com/acme/reservas/tree/main/src/reservas',
            },
            { repository: 'acme/reservas', path: '', name: 'Raíz', url: null },
          ],
        },
      }),
    );

    const banner = byTestId(el, 'suggestion-code-conflict');
    expect(banner).not.toBeNull();
    expect(byTestId(el, 'suggestion-code-exists')).toBeNull();
    expect(banner!.textContent).toContain('Contradicts what is built');
    expect(byTestId(banner!, 'suggestion-code-note')!.textContent).toContain('2 h antes');
    const refs = banner!.querySelectorAll('[data-testid="suggestion-code-ref"]');
    expect(refs).toHaveLength(2);
    const link = refs[0] as HTMLAnchorElement;
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe(
      'https://github.com/acme/reservas/tree/main/src/reservas',
    );
    expect(link.target).toBe('_blank');
    expect(link.rel).toContain('noopener');
    expect(link.title).toBe('acme/reservas/src/reservas');
    expect(refs[1].tagName).toBe('SPAN');
    expect((refs[1] as HTMLElement).title).toBe('acme/reservas');
  });

  it('notes calmly when the capability already exists', () => {
    const { el } = render(
      suggestion({
        code: { finding: 'ALREADY_EXISTS', note: 'Ya se puede reservar.', references: [] },
      }),
    );
    expect(byTestId(el, 'suggestion-code-exists')!.textContent).toContain(
      'Already exists in the code',
    );
    expect(byTestId(el, 'suggestion-code-conflict')).toBeNull();
  });

  it('shows no banner when the code was checked without a finding, or not at all', () => {
    for (const code of [{ finding: null, note: null, references: [] }, null, undefined]) {
      const { el } = render(suggestion({ code }));
      expect(byTestId(el, 'suggestion-code-exists')).toBeNull();
      expect(byTestId(el, 'suggestion-code-conflict')).toBeNull();
    }
  });

  it('quotes the evidence with its speaker and time, and asks to reveal it', () => {
    const { fixture, el } = render(
      suggestion({ evidence: { sequence: 4, quote: 'hasta 24 horas antes' } }),
      SEGMENT,
    );
    const revealed: EvidenceSegment[] = [];
    fixture.componentInstance.showEvidence.subscribe((s) => revealed.push(s));

    const evidence = byTestId(el, 'suggestion-evidence')!;
    expect(evidence.tagName).toBe('BUTTON');
    expect(byTestId(evidence, 'suggestion-evidence-quote')!.textContent).toBe(
      'hasta 24 horas antes',
    );
    expect(byTestId(evidence, 'suggestion-evidence-speaker')!.textContent).toBe('Ana (Client)');
    expect(evidence.querySelector('time')!.textContent).toBe('10:04');

    evidence.click();
    expect(revealed).toEqual([SEGMENT]);
  });

  it('shows the quote alone when its segment is not loaded', () => {
    const { el } = render(suggestion({ evidence: { sequence: 4, quote: 'hasta 24 horas antes' } }));
    const evidence = byTestId(el, 'suggestion-evidence')!;
    expect(evidence.tagName).toBe('P');
    expect(evidence.textContent).toContain('hasta 24 horas antes');
    expect(byTestId(el, 'suggestion-evidence-speaker')).toBeNull();
  });

  it('shows no evidence for a suggestion raised from the assistant chat', () => {
    const { el } = render(
      suggestion({ sessionId: null, evidence: { sequence: 1, quote: 'x' } }),
      SEGMENT,
    );
    expect(byTestId(el, 'suggestion-evidence')).toBeNull();
  });
});

describe('SuggestionCard deep verification', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [
        SuggestionCard,
        TranslocoTestingModule.forRoot({
          langs: { en: EN },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
    });
  });

  function render(
    value: SuggestionResponse,
    canVerify = true,
  ): { fixture: ComponentFixture<SuggestionCard>; el: HTMLElement; asked: () => number } {
    const fixture = TestBed.createComponent(SuggestionCard);
    fixture.componentRef.setInput('suggestion', value);
    fixture.componentRef.setInput('canVerify', canVerify);
    let asked = 0;
    fixture.componentInstance.verify.subscribe(() => asked++);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement, asked: () => asked };
  }

  const byTestId = (el: HTMLElement, id: string) =>
    el.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

  const verified = (verdict: 'ALREADY_EXISTS' | 'CONFLICTS_WITH_CODE' | 'NOT_FOUND' | 'UNSURE') =>
    suggestion({
      code: {
        finding: verdict === 'ALREADY_EXISTS' || verdict === 'CONFLICTS_WITH_CODE' ? verdict : null,
        note: 'Lo que dice el código.',
        references: [],
        verdict,
        verifyState: 'VERIFIED',
        verifiedAt: '2026-10-11T10:05:00Z',
      },
    });

  it('offers the action only when the analyst can verify, and asks for it on click', () => {
    const allowed = render(suggestion());
    const button = byTestId(allowed.el, 'suggestion-verify') as HTMLButtonElement;
    expect(button.textContent).toContain('Verify in the code');
    button.click();
    expect(allowed.asked()).toBe(1);

    expect(byTestId(render(suggestion(), false).el, 'suggestion-verify')).toBeNull();
  });

  it('shows the work in progress on the button and announces it politely', () => {
    const { el, fixture } = render(
      suggestion({
        code: { finding: null, note: null, references: [], verifyState: 'VERIFYING' },
      }),
    );
    fixture.detectChanges();

    const button = byTestId(el, 'suggestion-verify') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.textContent).toContain('Searching the code…');
    const live = byTestId(el, 'suggestion-verify-status')!;
    expect(live.getAttribute('aria-live')).toBe('polite');
    expect(live.textContent).toContain('Searching the code…');
  });

  it('shows the failure with a retry that asks again', () => {
    const { el, asked } = render(
      suggestion({
        code: { finding: null, note: null, references: [], verifyState: 'FAILED' },
      }),
    );

    expect(byTestId(el, 'suggestion-verify-error')!.textContent).toContain('could not verify');
    expect(byTestId(el, 'suggestion-verify')).toBeNull();
    (byTestId(el, 'suggestion-verify-retry') as HTMLButtonElement).click();
    expect(asked()).toBe(1);
    expect(byTestId(el, 'suggestion-verify-status')!.textContent).toContain('could not verify');
  });

  it('reads a conflict verified in the code with the lines it cites as GitHub links', () => {
    const { el } = render(
      suggestion({
        code: {
          finding: 'CONFLICTS_WITH_CODE',
          note: 'El código permite cancelar hasta 2 h antes; el cliente pide 24 h.',
          references: [
            {
              repository: 'acme/reservas',
              path: 'src/reservations',
              name: 'cancellation.policy.ts',
              url: 'https://github.com/acme/reservas/blob/abc1234/src/reservations/cancellation.policy.ts#L2-L4',
              file: 'src/reservations/cancellation.policy.ts',
              lineStart: 2,
              lineEnd: 4,
              quote: 'CANCELLATION_LIMIT_HOURS = 2',
            },
            { repository: 'acme/reservas', path: 'src/old', name: 'Viejo', url: null },
          ],
          verdict: 'CONFLICTS_WITH_CODE',
          verifyState: 'VERIFIED',
          verifiedAt: '2026-10-11T10:05:00Z',
        },
      }),
    );

    const banner = byTestId(el, 'suggestion-code-conflict')!;
    const refs = banner.querySelectorAll('[data-testid="suggestion-code-ref"]');
    expect(refs).toHaveLength(2);
    const place = refs[0] as HTMLAnchorElement;
    expect(place.textContent).toContain('src/reservations/cancellation.policy.ts:2-4');
    expect(place.getAttribute('href')).toBe(
      'https://github.com/acme/reservas/blob/abc1234/src/reservations/cancellation.policy.ts#L2-L4',
    );
    expect(place.target).toBe('_blank');
    expect(place.rel).toContain('noopener');
    expect(place.title).toContain('CANCELLATION_LIMIT_HOURS = 2');
    expect(refs[1].textContent).toContain('Viejo');
    expect(byTestId(banner, 'suggestion-code-verified')!.textContent).toContain(
      'Verified in the source code',
    );
    expect(byTestId(el, 'suggestion-verify')!.textContent).toContain('Verify again');
  });

  it('shows what the code does not have, and what it cannot settle, without alarm', () => {
    const missing = render(verified('NOT_FOUND')).el;
    expect(byTestId(missing, 'suggestion-code-notfound')!.textContent).toContain(
      'Not found in the code',
    );
    expect(byTestId(missing, 'suggestion-code-conflict')).toBeNull();

    const unsure = render(verified('UNSURE')).el;
    expect(byTestId(unsure, 'suggestion-code-unsure')!.textContent).toContain(
      'The code is not conclusive',
    );
  });

  it('a deep verdict replaces the quick finding on the banner', () => {
    const { el } = render(
      suggestion({
        code: {
          finding: null,
          note: 'Nada.',
          references: [],
          verdict: 'NOT_FOUND',
          verifyState: 'VERIFIED',
        },
      }),
    );
    expect(byTestId(el, 'suggestion-code-exists')).toBeNull();
    expect(byTestId(el, 'suggestion-code-notfound')).not.toBeNull();
  });
});

describe('SuggestionCard decide actions', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [
        SuggestionCard,
        TranslocoTestingModule.forRoot({
          langs: { en: EN },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
    });
  });

  function render(value: SuggestionResponse, canApprove: boolean) {
    const fixture = TestBed.createComponent(SuggestionCard);
    fixture.componentRef.setInput('suggestion', value);
    fixture.componentRef.setInput('canApprove', canApprove);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const emitted: AcceptSuggestionRequest[] = [];
    fixture.componentInstance.accept.subscribe((body) => emitted.push(body));
    const byTestId = (id: string) =>
      el.querySelector(`[data-testid="${id}"]`) as HTMLButtonElement | null;
    return { fixture, emitted, byTestId };
  }

  it('offers Aprobar and Guardar como borrador to an approver, each sending its own flag', () => {
    const { emitted, byTestId } = render(suggestion(), true);
    byTestId('suggestion-accept')!.click();
    byTestId('suggestion-save-draft')!.click();
    expect(emitted).toEqual([{ approve: true }, {}]);
  });

  it('offers only the draft save, as the primary action, without STORY_APPROVE', () => {
    const { emitted, byTestId } = render(suggestion(), false);
    expect(byTestId('suggestion-save-draft')).toBeNull();
    byTestId('suggestion-accept')!.click();
    expect(emitted).toEqual([{}]);
  });

  it('keeps a single Resolver action for a clarifying question, never approving', () => {
    const { emitted, byTestId } = render(
      suggestion({ type: 'CLARIFYING_QUESTION', question: 'Which currencies?' }),
      true,
    );
    expect(byTestId('suggestion-save-draft')).toBeNull();
    byTestId('suggestion-accept')!.click();
    expect(emitted).toEqual([{}]);
  });

  it('sends the edits together with the approval', () => {
    const { fixture, emitted, byTestId } = render(suggestion(), true);
    byTestId('suggestion-edit')!.click();
    fixture.detectChanges();
    const title = byTestId('edit-title') as unknown as HTMLTextAreaElement;
    title.value = 'Cancelar reserva online';
    title.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    byTestId('suggestion-accept')!.click();
    expect(emitted).toEqual([{ editedTitle: 'Cancelar reserva online', approve: true }]);
  });
});
