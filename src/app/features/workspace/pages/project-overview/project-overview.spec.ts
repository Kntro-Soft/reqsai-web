import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Observable, of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { AuthStore } from '../../../../core/auth/auth.store';
import { PermissionsStore } from '../../../../core/authz/permissions.store';
import { OverviewApiService } from '../../data/overview-api.service';
import { ProjectOverviewResponse } from '../../data/overview.models';
import { WorkspaceApiService } from '../../data/workspace-api.service';
import { ProjectOverview } from './project-overview';

const weeks = (counts: number[]) =>
  counts.map((count, i) => ({ weekStart: `2026-08-${String(i + 3).padStart(2, '0')}`, count }));

const full: ProjectOverviewResponse = {
  generatedAt: '2026-10-11T12:00:00Z',
  weeks: 12,
  backlog: {
    total: 6,
    byStatus: { DRAFT: 2, APPROVED: 3, REJECTED: 1, MERGED: 0, EXPORTED: 0 },
    byPriority: { LOW: 1, MEDIUM: 3, HIGH: 1, CRITICAL: 1 },
    storyPoints: { total: 21, approved: 13, unestimated: 0 },
    coverage: { live: 5, withAcceptanceCriteria: 4, withOrigin: 2, linkedToCode: 0 },
    createdByWeek: weeks([0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 2, 2]),
    recent: [
      {
        id: 's1',
        projectId: 'p1',
        title: 'Reservar mesa',
        status: 'APPROVED',
        priority: 'HIGH',
        createdAt: '2026-10-10T10:00:00Z',
      },
    ],
  },
  discovery: {
    sessions: 3,
    byStatus: { COMPLETED: 3 },
    createdByWeek: weeks([0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1]),
    assistance: { accepted: 3, dismissed: 1, pending: 2, questions: 1, acceptanceRate: 0.75 },
    recent: [],
  },
  knowledge: { glossaryTerms: 4, constraints: 2, documents: 1, assignedMembers: 3 },
  code: { repositories: 1, ready: 1, failed: 0, modules: 7, files: 80, lastIndexedAt: null },
};

describe('ProjectOverview', () => {
  function render(response: Observable<ProjectOverviewResponse>): {
    fixture: ComponentFixture<ProjectOverview>;
    el: HTMLElement;
  } {
    TestBed.configureTestingModule({
      imports: [ProjectOverview, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
      providers: [
        provideRouter([]),
        { provide: OverviewApiService, useValue: { getProjectOverview: vi.fn(() => response) } },
        {
          provide: WorkspaceApiService,
          useValue: { getProject: vi.fn(() => of({ name: 'Reservas' })) },
        },
        { provide: AuthStore, useValue: { organizationId: () => 'org-1' } },
        {
          provide: PermissionsStore,
          useValue: { isOrgOwnerOrAdmin: () => true, has: () => true },
        },
      ],
    });
    const fixture = TestBed.createComponent(ProjectOverview);
    fixture.componentRef.setInput('projectId', 'p1');
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  const byTestId = (el: HTMLElement, id: string) =>
    el.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

  it('keeps the shortcuts and adds the KPIs, charts and context of the project', () => {
    const { el } = render(of(full));

    expect(el.querySelectorAll('nav a').length).toBeGreaterThan(0);
    const values = Array.from(el.querySelectorAll('[data-testid="stat-value"]')).map((v) =>
      v.textContent?.trim(),
    );
    expect(values).toEqual(['5', '21', '3', '75%']);
    expect(byTestId(el, 'stat-trend')).not.toBeNull();
    expect(el.querySelector('[data-testid="line-chart"]')).not.toBeNull();
    expect(byTestId(el, 'coverage')).not.toBeNull();
    expect(byTestId(el, 'context')?.querySelectorAll('li')).toHaveLength(4);
    expect(byTestId(el, 'recent')).not.toBeNull();
  });

  it('leaves out the sections the server did not send', () => {
    const { el } = render(of({ ...full, discovery: null, knowledge: null, code: null }));

    const values = Array.from(el.querySelectorAll('[data-testid="stat-value"]')).map((v) =>
      v.textContent?.trim(),
    );
    expect(values).toEqual(['5', '21']);
    expect(byTestId(el, 'context')).toBeNull();
    expect(el.querySelector('app-assistance-card')).toBeNull();
  });

  it('explains what to do instead of drawing zeros for a project without data', () => {
    const { el } = render(
      of({
        ...full,
        backlog: { ...full.backlog!, total: 0, createdByWeek: weeks([0, 0]), recent: [] },
        discovery: { ...full.discovery!, sessions: 0, createdByWeek: weeks([0, 0]) },
      }),
    );

    expect(byTestId(el, 'overview-empty')).not.toBeNull();
    expect(byTestId(el, 'kpi-strip')).toBeNull();
    expect(el.querySelector('[data-testid="line-chart"]')).toBeNull();
  });

  it('shows the skeleton while loading and an error with retry when the call fails', () => {
    const loading = render(new Observable<ProjectOverviewResponse>(() => undefined));
    expect(byTestId(loading.el, 'overview-skeleton')).not.toBeNull();
    TestBed.resetTestingModule();

    const failed = render(throwError(() => new HttpErrorResponse({ status: 500 })));
    expect(byTestId(failed.el, 'overview-error')).not.toBeNull();
  });
});
