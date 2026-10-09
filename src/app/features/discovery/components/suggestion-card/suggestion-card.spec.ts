import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { beforeEach, describe, expect, it } from 'vitest';
import { SuggestionResponse } from '../../data/discovery.models';
import { EvidenceSegment } from '../../data/evidence';
import { SuggestionCard } from './suggestion-card';

const EN = {
  discovery: {
    speaker: 'Speaker {{n}}',
    speakers: { side: { CLIENT: 'Client', TEAM: 'Team' } },
    suggestion: {
      code: { exists: 'Already exists in the code', conflicts: 'Contradicts what is built' },
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
