import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Observable, of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { QualityApiService } from '../../data/quality-api.service';
import { QualityMetricsResponse } from '../../data/quality.models';
import { lastDays } from '../../data/quality';
import { ProjectQuality } from './project-quality';

const data: QualityMetricsResponse = {
  from: '2026-10-20',
  to: '2026-11-18',
  hasData: true,
  sessions: 6,
  acceptance: {
    similarityThreshold: 0.8,
    decided: 10,
    accepted: 8,
    acceptedAsGenerated: 6,
    acceptedRewritten: 2,
    rejected: 2,
    withoutBaseline: 1,
    rate: 0.6,
  },
  postProcessing: {
    measured: 2,
    unmeasured: 4,
    averageSeconds: 5400,
    medianSeconds: 3600,
    sessions: [
      {
        sessionId: 's1',
        title: 'Kickoff',
        purpose: 'DISCOVERY',
        endedAt: '2026-11-10T15:00:00Z',
        seconds: 10_800,
      },
      {
        sessionId: 's2',
        title: 'Aclaración de pagos',
        purpose: 'CLARIFICATION',
        endedAt: '2026-11-12T15:00:00Z',
        seconds: 1800,
      },
    ],
  },
  clarification: { meetings: 2, sessions: 6, share: 1 / 3 },
};

const empty: QualityMetricsResponse = {
  from: '2026-10-20',
  to: '2026-11-18',
  hasData: false,
  sessions: 0,
  acceptance: {
    similarityThreshold: 0.8,
    decided: 0,
    accepted: 0,
    acceptedAsGenerated: 0,
    acceptedRewritten: 0,
    rejected: 0,
    withoutBaseline: 0,
    rate: null,
  },
  postProcessing: {
    measured: 0,
    unmeasured: 0,
    averageSeconds: null,
    medianSeconds: null,
    sessions: [],
  },
  clarification: { meetings: 0, sessions: 0, share: null },
};

describe('ProjectQuality', () => {
  function render(response: Observable<QualityMetricsResponse>): {
    fixture: ComponentFixture<ProjectQuality>;
    el: HTMLElement;
    get: ReturnType<typeof vi.fn>;
  } {
    const get = vi.fn(() => response);
    TestBed.configureTestingModule({
      imports: [ProjectQuality, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
      providers: [{ provide: QualityApiService, useValue: { getQualityMetrics: get } }],
    });
    const fixture = TestBed.createComponent(ProjectQuality);
    fixture.componentRef.setInput('projectId', 'p1');
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement, get };
  }

  const byTestId = (el: HTMLElement, id: string) =>
    el.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  const values = (el: HTMLElement) =>
    Array.from(el.querySelectorAll('[data-testid="stat-value"]')).map((v) => v.textContent?.trim());

  describe('Scenario: a project with accepted and rejected stories in the period', () => {
    it('shows the percentage accepted without major rewriting and the post-processing time per session', () => {
      const { el } = render(of(data));

      // Acceptance rate, average post-processing time (1 h 30 min) and clarification meetings.
      expect(values(el)).toEqual(['60%', '1 h 30 min', '2']);
      expect(byTestId(el, 'kpi-strip')).not.toBeNull();
      expect(byTestId(el, 'quality-empty')).toBeNull();

      // Stories by outcome.
      const bar = byTestId(el, 'acceptance-bar');
      expect(bar?.querySelectorAll('.chart-tip')).toHaveLength(3);
      expect(byTestId(el, 'acceptance-excluded')).not.toBeNull();

      // Time of each session, longest first, with the sessions left out of the average noted.
      const rows = Array.from(
        byTestId(el, 'post-processing-list')?.querySelectorAll('li') ?? [],
      ).map((li) => li.textContent ?? '');
      expect(rows).toHaveLength(2);
      expect(rows[0]).toContain('Kickoff');
      expect(rows[0]).toContain('3 h');
      expect(rows[1]).toContain('Aclaración de pagos');
      expect(rows[1]).toContain('30 min');
      expect(byTestId(el, 'post-processing-unmeasured')).not.toBeNull();
    });

    it('asks for the last 30 days by default and offers the other quick periods', () => {
      const { el, get } = render(of(data));
      const { from, to } = lastDays(30);

      expect(get).toHaveBeenCalledWith('p1', from, to);
      expect(byTestId(el, 'period-30')?.getAttribute('aria-pressed')).toBe('true');
      expect(byTestId(el, 'period-7')?.getAttribute('aria-pressed')).toBe('false');
      expect(byTestId(el, 'period-90')).not.toBeNull();
      expect(byTestId(el, 'period-custom')).not.toBeNull();
    });

    it('reloads the indicators when another period is picked', () => {
      const { fixture, el, get } = render(of(data));

      byTestId(el, 'period-7')?.click();
      fixture.detectChanges();
      fixture.detectChanges();

      const week = lastDays(7);
      expect(get).toHaveBeenLastCalledWith('p1', week.from, week.to);
      expect(byTestId(el, 'period-7')?.getAttribute('aria-pressed')).toBe('true');
      expect(byTestId(el, 'period-30')?.getAttribute('aria-pressed')).toBe('false');
    });
  });

  describe('Scenario: a period without sessions', () => {
    it('shows a no-data message for the period and no figure', () => {
      const { el } = render(of(empty));

      expect(byTestId(el, 'quality-empty')).not.toBeNull();
      expect(byTestId(el, 'kpi-strip')).toBeNull();
      expect(values(el)).toEqual([]);
    });
  });

  it('shows a dash with its reason, not a zero, for an indicator that cannot be computed', () => {
    const { el } = render(
      of({
        ...data,
        hasData: true,
        acceptance: { ...data.acceptance, decided: 0, acceptedAsGenerated: 0, rate: null },
        postProcessing: {
          ...data.postProcessing,
          measured: 0,
          averageSeconds: null,
          medianSeconds: null,
          sessions: [],
        },
      }),
    );

    expect(values(el)).toEqual(['—', '—', '2']);
    expect(byTestId(el, 'acceptance-empty')).not.toBeNull();
    expect(byTestId(el, 'post-processing-empty')).not.toBeNull();
  });

  it('applies a custom range only when it is valid', () => {
    const { fixture, el, get } = render(of(data));
    byTestId(el, 'period-custom')?.click();
    fixture.detectChanges();

    const from = byTestId(el, 'period-from') as HTMLInputElement;
    const to = byTestId(el, 'period-to') as HTMLInputElement;
    const apply = byTestId(el, 'period-apply') as HTMLButtonElement;

    from.value = '2026-11-10';
    from.dispatchEvent(new Event('input'));
    to.value = '2026-11-01';
    to.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(apply.disabled).toBe(true);
    expect(byTestId(el, 'period-invalid')).not.toBeNull();

    to.value = '2026-11-15';
    to.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(apply.disabled).toBe(false);
    apply.click();
    fixture.detectChanges();
    fixture.detectChanges();

    expect(get).toHaveBeenLastCalledWith('p1', '2026-11-10', '2026-11-15');
  });

  it('shows the skeleton while loading and an error with retry when the call fails', () => {
    const loading = render(new Observable<QualityMetricsResponse>(() => undefined));
    expect(byTestId(loading.el, 'overview-skeleton')).not.toBeNull();
    TestBed.resetTestingModule();

    const failed = render(throwError(() => new HttpErrorResponse({ status: 500 })));
    expect(byTestId(failed.el, 'overview-error')).not.toBeNull();
    TestBed.resetTestingModule();

    const forbidden = render(throwError(() => new HttpErrorResponse({ status: 403 })));
    expect(byTestId(forbidden.el, 'overview-error')).toBeNull();
    expect(forbidden.el.textContent).toContain('quality.forbidden');
  });
});
