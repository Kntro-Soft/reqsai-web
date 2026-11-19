import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastService } from '../../../../shared/toast/toast.service';
import { UserStoryResponse } from '../../data/discovery.models';
import {
  ApplyStoryImprovementResponse,
  StoryImprovementResponse,
} from '../../data/story-improvement.models';
import { StoryQualityResponse } from '../../data/story-quality.models';
import { StoryImprovement } from './story-improvement';

const EN = {
  common: { cancel: 'Cancel' },
  errors: {
    generic: 'Something went wrong.',
    IMPROVEMENT_PENDING_VALUES: 'Pending values remain.',
    AI_QUOTA_EXCEEDED: 'AI allowance used up.',
    http: { 503: 'Service unavailable.' },
  },
  storyImprovement: {
    action: 'Improve with AI',
    requesting: 'Improving…',
    title: 'Improvement proposal',
    applied: 'Improvement applied.',
    apply: 'Apply',
    discard: 'Discard',
    noChange: 'Nothing to change.',
    blockedPending: 'Replace the {{count}} pending values.',
    blockedBlank: 'Fill in the empty fields.',
    scoreAria: 'From {{from}} to {{to}}',
    criterion: 'Criterion {{n}}',
    removedCriteria: 'Removed: {{count}}',
    field: { title: 'Title', role: 'Role', action: 'Action', benefit: 'Benefit' },
  },
};

const BASE = '/api/projects/p1/stories/s1/quality/improvement';

const STORY = {
  id: 's1',
  projectId: 'p1',
  title: 'Ver el menú',
  role: 'comensal',
  action: 'ver el menú rápido',
  benefit: 'decidir qué pedir',
  priority: 'MEDIUM',
  storyPoints: null,
  status: 'DRAFT',
  sessionId: null,
  acceptanceCriteria: [
    { id: 'c1', storyId: 's1', scenario: null, given: 'hay menú', when: 'abre', then: 'lo ve' },
  ],
} as unknown as UserStoryResponse;

const quality = (score: number): StoryQualityResponse => ({
  storyId: 's1',
  score,
  evaluatedAt: '2026-11-18T12:00:00Z',
  characteristics: [],
});

const RESPONSE: StoryImprovementResponse = {
  storyId: 's1',
  proposal: {
    title: 'Ver el menú',
    role: 'comensal',
    action: 'ver el menú en [[tiempo máximo de respuesta]]',
    benefit: 'decidir qué pedir',
    acceptanceCriteria: [
      { scenario: null, given: 'hay menú', when: 'abre', then: 'lo ve en [[segundos]] segundos' },
    ],
  },
  pendingValues: [
    { token: '[[tiempo máximo de respuesta]]', hint: '¿En cuántos segundos debe responder?' },
    { token: '[[segundos]]', hint: 'Cantidad de segundos' },
  ],
  fixes: ['Se reemplazó «rápido» por un valor pendiente'],
  expectedQuality: quality(90),
};

describe('StoryImprovement', () => {
  let fixture: ComponentFixture<StoryImprovement>;
  let http: HttpTestingController;
  let el: HTMLElement;
  const toast = { success: vi.fn(), error: vi.fn() };
  let applied: ApplyStoryImprovementResponse[];

  beforeEach(() => {
    toast.success.mockReset();
    toast.error.mockReset();
    applied = [];
    TestBed.configureTestingModule({
      imports: [
        StoryImprovement,
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
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(StoryImprovement);
    fixture.componentRef.setInput('projectId', 'p1');
    fixture.componentRef.setInput('storyId', 's1');
    fixture.componentRef.setInput('story', STORY);
    fixture.componentRef.setInput('quality', quality(60));
    fixture.componentInstance.applied.subscribe((r) => applied.push(r));
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => http.verify());

  const byId = <T extends HTMLElement = HTMLElement>(id: string) =>
    el.querySelector<T>(`[data-testid="${id}"]`);
  const all = (id: string) => Array.from(el.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`));
  const field = (id: string) => el.querySelector<HTMLElement>(`[data-field="${id}"]`)!;
  const afterOf = (id: string) =>
    field(id).querySelector<HTMLTextAreaElement>('[data-testid="story-improve-after"]')!;

  async function settle(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function openReview(response: StoryImprovementResponse = RESPONSE): Promise<void> {
    byId('story-improve-open')!.click();
    http.expectOne(BASE).flush(response);
    await settle();
  }

  async function type(id: string, value: string): Promise<void> {
    const textarea = afterOf(id);
    textarea.value = value;
    textarea.dispatchEvent(new Event('input'));
    await settle();
  }

  async function fillAll(): Promise<void> {
    await type('action', 'ver el menú en 2 segundos');
    await type('criterion-0-then', 'lo ve en 2 segundos');
  }

  describe('asking for a proposal', () => {
    it('POSTs, holds the button with a spinner while it runs and does not open anything yet', () => {
      byId('story-improve-open')!.click();
      fixture.detectChanges();

      const button = byId<HTMLButtonElement>('story-improve-open')!;
      expect(button.disabled).toBe(true);
      expect(button.textContent).toContain('Improving…');
      expect(button.querySelector('hlm-spinner')).toBeTruthy();
      expect(byId('modal')).toBeNull();
      http.expectOne(BASE);
    });

    it('opens the review with the score, the fixes and the pending values once it arrives', async () => {
      await openReview();

      expect(byId('modal')).toBeTruthy();
      expect(byId('story-improve-before-score')?.textContent?.trim()).toBe('60');
      expect(byId('story-improve-after-score')?.textContent?.trim()).toBe('90');
      expect(byId('story-improve-score')?.getAttribute('aria-label')).toBe('From 60 to 90');
      expect(byId('story-improve-score')?.getAttribute('data-level')).toBe('GOOD');
      expect(byId('story-improve-fixes')?.textContent).toContain('Se reemplazó «rápido»');
      expect(all('story-improve-pending-item')).toHaveLength(2);
      expect(byId<HTMLButtonElement>('story-improve-open')!.disabled).toBe(false);
    });

    it('toasts the error and opens nothing when the AI is unavailable or the allowance is used up', async () => {
      byId('story-improve-open')!.click();
      http
        .expectOne(BASE)
        .flush(
          { code: 'AI_QUOTA_EXCEEDED', status: 429 },
          { status: 429, statusText: 'Too Many Requests' },
        );
      await settle();

      expect(toast.error).toHaveBeenCalledWith('AI allowance used up.');
      expect(byId('modal')).toBeNull();
      expect(byId<HTMLButtonElement>('story-improve-open')!.disabled).toBe(false);

      byId('story-improve-open')!.click();
      http.expectOne(BASE).flush({}, { status: 503, statusText: 'Unavailable' });
      await settle();
      expect(toast.error).toHaveBeenLastCalledWith('Service unavailable.');
    });

    it('can be held by the parent', async () => {
      fixture.componentRef.setInput('disabled', true);
      fixture.detectChanges();
      expect(byId<HTMLButtonElement>('story-improve-open')!.disabled).toBe(true);
    });
  });

  describe('the before/after review', () => {
    it('shows the saved text before and the proposal after, highlighting only what changed', async () => {
      await openReview();

      const beforeOf = (id: string) =>
        field(id).querySelector('[data-testid="story-improve-before"]')?.textContent?.trim();
      expect(beforeOf('action')).toBe('ver el menú rápido');
      expect(afterOf('action').value).toBe('ver el menú en [[tiempo máximo de respuesta]]');
      expect(field('action').getAttribute('data-changed')).toBe('true');
      expect(field('title').getAttribute('data-changed')).toBe('false');
      expect(beforeOf('criterion-0-then')).toBe('lo ve');
      expect(field('criterion-0-then').getAttribute('data-changed')).toBe('true');
      expect(field('criterion-0-given').getAttribute('data-changed')).toBe('false');
      expect(all('story-improve-criterion')).toHaveLength(1);
    });

    it('marks each placeholder with its hint, and focuses the first one', async () => {
      await openReview();

      const tokens = field('action').querySelectorAll('[data-testid="story-improve-token"]');
      expect(tokens).toHaveLength(1);
      expect(tokens[0].textContent).toContain('[[tiempo máximo de respuesta]]');
      expect(tokens[0].textContent).toContain('¿En cuántos segundos debe responder?');
      expect(afterOf('action').getAttribute('aria-invalid')).toBe('true');
      expect(afterOf('action').hasAttribute('data-autofocus')).toBe(true);
      expect(afterOf('title').hasAttribute('data-autofocus')).toBe(false);
    });

    it('says there is nothing to change when the proposal equals the story', async () => {
      await openReview({
        ...RESPONSE,
        proposal: {
          title: STORY.title,
          role: STORY.role,
          action: STORY.action,
          benefit: STORY.benefit,
          acceptanceCriteria: [{ scenario: null, given: 'hay menú', when: 'abre', then: 'lo ve' }],
        },
        pendingValues: [],
        fixes: [],
      });

      expect(byId('story-improve-empty')?.textContent).toContain('Nothing to change.');
      expect(byId<HTMLButtonElement>('story-improve-apply')!.disabled).toBe(true);
      expect(all('story-improve-field')).toHaveLength(0);
    });

    it('warns when the proposal drops criteria the story has today', async () => {
      await openReview({
        ...RESPONSE,
        proposal: { ...RESPONSE.proposal, acceptanceCriteria: [] },
      });

      expect(byId('story-improve-removed')?.textContent).toContain('Removed: 1');
    });
  });

  describe('applying', () => {
    it('keeps Apply disabled while a placeholder remains, and says why', async () => {
      await openReview();

      const apply = byId<HTMLButtonElement>('story-improve-apply')!;
      expect(apply.disabled).toBe(true);
      expect(byId('story-improve-blocked')?.textContent).toContain('Replace the 2 pending values.');
      expect(apply.getAttribute('aria-describedby')).toBe('story-improve-blocked');

      await type('action', 'ver el menú en 2 segundos');
      expect(apply.disabled).toBe(true);
      expect(byId('story-improve-blocked')?.textContent).toContain('Replace the 1 pending values.');
      expect(all('story-improve-pending-item').map((li) => li.getAttribute('data-filled'))).toEqual(
        ['true', 'false'],
      );
    });

    it('enables Apply once every placeholder is replaced', async () => {
      await openReview();
      await fillAll();

      expect(byId<HTMLButtonElement>('story-improve-apply')!.disabled).toBe(false);
      expect(byId('story-improve-blocked')).toBeNull();
    });

    it('keeps Apply disabled when a required field is left empty', async () => {
      await openReview();
      await fillAll();
      await type('role', '  ');

      expect(byId<HTMLButtonElement>('story-improve-apply')!.disabled).toBe(true);
      expect(byId('story-improve-blocked')?.textContent).toContain('Fill in the empty fields.');
    });

    it('POSTs the edited proposal, closes, toasts and tells the page the saved story and quality', async () => {
      await openReview();
      await fillAll();
      await type('title', '  Consultar el menú ');

      byId('story-improve-apply')!.click();
      fixture.detectChanges();
      const req = http.expectOne(`${BASE}/apply`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        title: 'Consultar el menú',
        role: 'comensal',
        action: 'ver el menú en 2 segundos',
        benefit: 'decidir qué pedir',
        acceptanceCriteria: [
          { scenario: null, given: 'hay menú', when: 'abre', then: 'lo ve en 2 segundos' },
        ],
      });
      expect(byId<HTMLButtonElement>('story-improve-apply')!.disabled).toBe(true);
      const saved = { story: { ...STORY, title: 'Consultar el menú' }, quality: quality(92) };
      req.flush(saved);
      await settle();

      expect(byId('modal')).toBeNull();
      expect(toast.success).toHaveBeenCalledWith('Improvement applied.');
      expect(applied).toEqual([saved]);
    });

    it('stays open with the edits and the message when the backend refuses it', async () => {
      await openReview();
      await fillAll();

      byId('story-improve-apply')!.click();
      http
        .expectOne(`${BASE}/apply`)
        .flush(
          { code: 'IMPROVEMENT_PENDING_VALUES', status: 422 },
          { status: 422, statusText: 'Unprocessable Entity' },
        );
      await settle();

      expect(byId('modal')).toBeTruthy();
      expect(byId('story-improve-error')?.textContent).toContain('Pending values remain.');
      expect(afterOf('action').value).toBe('ver el menú en 2 segundos');
      expect(byId<HTMLButtonElement>('story-improve-apply')!.disabled).toBe(false);
      expect(applied).toHaveLength(0);
      expect(toast.success).not.toHaveBeenCalled();
    });
  });

  describe('discarding', () => {
    it('closes the review without calling the backend or changing anything', async () => {
      await openReview();
      await fillAll();

      byId('story-improve-discard')!.click();
      await settle();

      expect(byId('modal')).toBeNull();
      http.expectNone(`${BASE}/apply`);
      expect(applied).toHaveLength(0);
      expect(toast.success).not.toHaveBeenCalled();
    });

    it('starts from a fresh proposal the next time', async () => {
      await openReview();
      await fillAll();
      byId('story-improve-discard')!.click();
      await settle();

      await openReview();
      expect(afterOf('action').value).toBe('ver el menú en [[tiempo máximo de respuesta]]');
    });
  });
});
