import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PermissionsStore } from '../../../../core/authz/permissions.store';
import { ToastService } from '../../../../shared/toast/toast.service';
import { StoryQualityResponse } from '../../data/story-quality.models';
import { StoryQuality } from './story-quality';

const EN = {
  discovery: { retry: 'Retry' },
  storyQuality: {
    title: 'Story quality',
    hint: 'Hint',
    reevaluate: 'Re-evaluate',
    reevaluated: 'Quality re-evaluated.',
    scoreLabel: 'Quality score: {{score}} out of 100',
    evaluatedAt: 'Evaluated on {{when}}',
    fix: 'How to fix it',
    empty: 'No quality assessment yet.',
    loadError: 'The quality assessment could not be loaded.',
    level: { GOOD: 'Good quality', FAIR: 'Needs improvement', POOR: 'Needs work' },
    summary: {
      allMet: 'Meets every evaluated characteristic.',
      unmet: '{{count}} of {{total}} characteristics to fix.',
    },
    characteristic: {
      AMBIGUITY: 'No ambiguity',
      ATOMICITY: 'Atomicity',
      VERIFIABILITY: 'Verifiability',
      COMPLETENESS: 'Completeness',
    },
  },
};

const URL = '/api/projects/p1/stories/s1/quality';

function quality(overrides: Partial<StoryQualityResponse> = {}): StoryQualityResponse {
  return {
    storyId: 's1',
    score: 63,
    evaluatedAt: '2026-11-18T12:00:00Z',
    characteristics: [
      {
        characteristic: 'AMBIGUITY',
        score: 75,
        met: false,
        observation: 'Se detectaron términos ambiguos: «rápido».',
        suggestion: 'Reemplaza cada término por un valor medible.',
      },
      {
        characteristic: 'ATOMICITY',
        score: 100,
        met: true,
        observation: 'La historia describe una única acción.',
        suggestion: null,
      },
      {
        characteristic: 'VERIFIABILITY',
        score: 0,
        met: false,
        observation: 'La historia no tiene criterios de aceptación.',
        suggestion: 'Agrega al menos un criterio Dado/Cuando/Entonces.',
      },
      {
        characteristic: 'COMPLETENESS',
        score: 75,
        met: false,
        observation: 'No tiene criterios de aceptación.',
        suggestion: 'Agrega los criterios que la enmarcan.',
      },
    ],
    ...overrides,
  };
}

const PERFECT = quality({
  score: 100,
  characteristics: quality().characteristics.map((c) => ({
    ...c,
    score: 100,
    met: true,
    suggestion: null,
  })),
});

describe('StoryQuality', () => {
  let fixture: ComponentFixture<StoryQuality>;
  let http: HttpTestingController;
  const toast = { success: vi.fn(), error: vi.fn() };
  let canWrite: boolean;

  beforeEach(() => {
    toast.success.mockReset();
    toast.error.mockReset();
    canWrite = true;
    TestBed.configureTestingModule({
      imports: [
        StoryQuality,
        TranslocoTestingModule.forRoot({
          langs: { en: EN },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ToastService, useValue: toast },
        { provide: PermissionsStore, useValue: { has: () => canWrite } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function open(refreshKey = 0): HTMLElement {
    fixture = TestBed.createComponent(StoryQuality);
    fixture.componentRef.setInput('projectId', 'p1');
    fixture.componentRef.setInput('storyId', 's1');
    fixture.componentRef.setInput('refreshKey', refreshKey);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const query = (el: HTMLElement, id: string) => el.querySelector(`[data-testid="${id}"]`);
  const queryAll = (el: HTMLElement, id: string) =>
    Array.from(el.querySelectorAll(`[data-testid="${id}"]`));

  describe('Given a generated story with acceptance criteria', () => {
    it('When the analyst opens the story detail, Then it shows a score from 0 to 100 and each characteristic with its observation', async () => {
      const el = open();
      expect(query(el, 'story-quality-loading')).toBeTruthy();

      http.expectOne(URL).flush(PERFECT);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(query(el, 'story-quality-value')?.textContent?.trim()).toBe('100');
      expect(query(el, 'story-quality-score')?.getAttribute('data-level')).toBe('GOOD');
      expect(query(el, 'story-quality-score')?.getAttribute('aria-label')).toBe(
        'Quality score: 100 out of 100',
      );
      const findings = queryAll(el, 'story-quality-finding');
      expect(findings.map((f) => f.getAttribute('data-characteristic'))).toEqual([
        'AMBIGUITY',
        'ATOMICITY',
        'VERIFIABILITY',
        'COMPLETENESS',
      ]);
      expect(findings.every((f) => f.getAttribute('data-met') === 'true')).toBe(true);
      expect(findings[0].textContent).toContain('No ambiguity');
      expect(findings[0].textContent).toContain('Se detectaron términos ambiguos');
      expect(query(el, 'story-quality-summary')?.textContent).toContain(
        'Meets every evaluated characteristic.',
      );
      expect(queryAll(el, 'story-quality-suggestion')).toHaveLength(0);
    });
  });

  describe('Given a story with ambiguous terms or without acceptance criteria', () => {
    it('When the system evaluates it, Then it flags the unmet characteristics and suggests how to fix them', async () => {
      const el = open();
      http.expectOne(URL).flush(quality());
      await fixture.whenStable();
      fixture.detectChanges();

      expect(query(el, 'story-quality-value')?.textContent?.trim()).toBe('63');
      expect(query(el, 'story-quality-score')?.getAttribute('data-level')).toBe('FAIR');
      expect(query(el, 'story-quality-summary')?.textContent).toContain(
        '3 of 4 characteristics to fix.',
      );
      const findings = queryAll(el, 'story-quality-finding');
      expect(findings.map((f) => f.getAttribute('data-met'))).toEqual([
        'false',
        'true',
        'false',
        'false',
      ]);
      const suggestions = queryAll(el, 'story-quality-suggestion').map((s) => s.textContent);
      expect(suggestions).toHaveLength(3);
      expect(suggestions[0]).toContain('How to fix it');
      expect(suggestions[0]).toContain('Reemplaza cada término por un valor medible.');
      expect(suggestions[1]).toContain('Agrega al menos un criterio');
    });

    it('a low score reads as needing work', async () => {
      const el = open();
      http.expectOne(URL).flush(quality({ score: 20 }));
      await fixture.whenStable();
      fixture.detectChanges();

      expect(query(el, 'story-quality-score')?.getAttribute('data-level')).toBe('POOR');
      expect(el.textContent).toContain('Needs work');
    });
  });

  describe('a story that was never evaluated', () => {
    it('is evaluated on opening so the score shows without a click', async () => {
      const el = open();
      http
        .expectOne(URL)
        .flush(
          { code: 'STORY_QUALITY_NOT_EVALUATED', status: 404 },
          { status: 404, statusText: 'Not Found' },
        );
      const post = http.expectOne((r) => r.url === URL && r.method === 'POST');
      post.flush(quality());
      await fixture.whenStable();
      fixture.detectChanges();

      expect(query(el, 'story-quality-value')?.textContent?.trim()).toBe('63');
    });

    it('shows an empty state when the member cannot evaluate it', async () => {
      const el = open();
      http
        .expectOne(URL)
        .flush(
          { code: 'STORY_QUALITY_NOT_EVALUATED', status: 404 },
          { status: 404, statusText: 'Not Found' },
        );
      http
        .expectOne((r) => r.method === 'POST')
        .flush({ status: 403 }, { status: 403, statusText: 'Forbidden' });
      await fixture.whenStable();
      fixture.detectChanges();

      expect(query(el, 'story-quality-empty')?.textContent).toContain('No quality assessment yet.');
      expect(query(el, 'story-quality-score')).toBeNull();
    });
  });

  describe('errors', () => {
    it('shows a retry when the assessment cannot be loaded and reads it again on retry', async () => {
      const el = open();
      http.expectOne(URL).flush({}, { status: 500, statusText: 'Server Error' });
      await fixture.whenStable();
      fixture.detectChanges();

      expect(query(el, 'story-quality-error')?.textContent).toContain(
        'The quality assessment could not be loaded.',
      );
      (el.querySelector('[role="alert"] button') as HTMLButtonElement).click();
      http.expectOne(URL).flush(quality());
      await fixture.whenStable();
      fixture.detectChanges();

      expect(query(el, 'story-quality-value')?.textContent?.trim()).toBe('63');
    });
  });

  describe('re-evaluating', () => {
    it('POSTs, replaces the shown score and confirms with a toast', async () => {
      const el = open();
      http.expectOne(URL).flush(quality());
      await fixture.whenStable();
      fixture.detectChanges();

      (query(el, 'story-quality-reevaluate') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect((query(el, 'story-quality-reevaluate') as HTMLButtonElement).disabled).toBe(true);
      http.expectOne((r) => r.method === 'POST').flush(PERFECT);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(query(el, 'story-quality-value')?.textContent?.trim()).toBe('100');
      expect((query(el, 'story-quality-reevaluate') as HTMLButtonElement).disabled).toBe(false);
      expect(toast.success).toHaveBeenCalledWith('Quality re-evaluated.');
    });

    it('keeps the previous score and toasts the error when it fails', async () => {
      const el = open();
      http.expectOne(URL).flush(quality());
      await fixture.whenStable();
      fixture.detectChanges();

      (query(el, 'story-quality-reevaluate') as HTMLButtonElement).click();
      http
        .expectOne((r) => r.method === 'POST')
        .flush({}, { status: 500, statusText: 'Server Error' });
      await fixture.whenStable();
      fixture.detectChanges();

      expect(toast.error).toHaveBeenCalled();
      expect(query(el, 'story-quality-value')?.textContent?.trim()).toBe('63');
      expect((query(el, 'story-quality-reevaluate') as HTMLButtonElement).disabled).toBe(false);
    });

    it('is hidden from members without STORY_WRITE', async () => {
      canWrite = false;
      const el = open();
      http.expectOne(URL).flush(quality());
      await fixture.whenStable();
      fixture.detectChanges();

      expect(query(el, 'story-quality-reevaluate')).toBeNull();
      expect(query(el, 'story-quality-value')).toBeTruthy();
    });
  });

  describe('refresh after an edit', () => {
    it('reads the assessment again when the page reports a save, keeping the old score meanwhile', async () => {
      const el = open();
      http.expectOne(URL).flush(quality());
      await fixture.whenStable();
      fixture.detectChanges();

      fixture.componentRef.setInput('refreshKey', 1);
      fixture.detectChanges();
      await fixture.whenStable();
      expect(query(el, 'story-quality-value')?.textContent?.trim()).toBe('63');
      http.expectOne(URL).flush(PERFECT);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(query(el, 'story-quality-value')?.textContent?.trim()).toBe('100');
    });

    it('ignores a slower answer that a newer read has superseded', async () => {
      const el = open();
      const first = http.expectOne(URL);

      fixture.componentRef.setInput('refreshKey', 1);
      fixture.detectChanges();
      await fixture.whenStable();
      const second = http.expectOne(URL);
      second.flush(PERFECT);
      first.flush(quality({ score: 10 }));
      await fixture.whenStable();
      fixture.detectChanges();

      expect(query(el, 'story-quality-value')?.textContent?.trim()).toBe('100');
    });
  });
});
