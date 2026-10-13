import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthStore } from '../../../../core/auth/auth.store';
import { PermissionsStore } from '../../../../core/authz/permissions.store';
import { GITHUB_RETURN_KEY } from '../../../discovery/data/codebase';
import { CodebaseApiService } from '../../../discovery/data/codebase-api.service';
import { IntegrationsApiService } from '../../data/integrations-api.service';
import { JIRA_RETURN_KEY } from '../../data/integrations.models';
import { PROJECT_DRAFT_KEY, emptyDraft } from '../../data/project-setup';
import { WorkspaceStore } from '../../data/workspace.store';
import { ProjectCreate } from './project-create';

describe('ProjectCreate wizard', () => {
  let createProject: ReturnType<typeof vi.fn>;
  let navigate: ReturnType<typeof vi.fn>;

  afterEach(() => sessionStorage.clear());

  function render(): { fixture: ComponentFixture<ProjectCreate>; el: HTMLElement } {
    createProject = vi.fn(() => of({ id: 'p9' }));
    TestBed.configureTestingModule({
      imports: [ProjectCreate, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
      providers: [
        provideRouter([]),
        { provide: WorkspaceStore, useValue: { createProject } },
        { provide: AuthStore, useValue: { organizationId: () => 'org-1' } },
        {
          provide: PermissionsStore,
          useValue: { isOrgOwnerOrAdmin: () => true, loadOrgAuthorization: () => of(void 0) },
        },
        {
          provide: IntegrationsApiService,
          useValue: {
            listConnections: () => of([]),
            getJiraAuthorizeUrl: () => of({ url: 'https://auth.atlassian.com/x', state: 's' }),
          },
        },
        {
          provide: CodebaseApiService,
          useValue: { organizationGitHub: () => of({ available: false, installations: [] }) },
        },
      ],
    });
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true) as never;
    const fixture = TestBed.createComponent(ProjectCreate);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  const byId = (el: HTMLElement, id: string) =>
    el.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

  function type(fixture: ComponentFixture<ProjectCreate>, name: string): void {
    const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('#name')!;
    input.value = name;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const internals = (fixture: ComponentFixture<ProjectCreate>) => fixture.componentInstance as any;

  it('creates the project at once from the first step, without sources, as before', () => {
    const { fixture, el } = render();
    type(fixture, 'Portal');

    byId(el, 'project-create-submit')!.click();

    expect(createProject).toHaveBeenCalledTimes(1);
    expect(createProject.mock.calls[0][1].name).toBe('Portal');
    expect(createProject.mock.calls[0][1].sources).toBeUndefined();
    expect(navigate).toHaveBeenCalledWith(['/projects', 'p9']);
  });

  it('needs a name before it moves on', () => {
    const { fixture, el } = render();

    expect((byId(el, 'project-create-next') as HTMLButtonElement).disabled).toBe(true);
    internals(fixture).goTo(2);
    expect(internals(fixture).step()).toBe(1);
  });

  it('walks through the sources and the confirmation, then creates with what was chosen', () => {
    const { fixture, el } = render();
    type(fixture, 'Portal');

    byId(el, 'project-create-next')!.click();
    fixture.detectChanges();
    expect(byId(el, 'project-create-sources')).not.toBeNull();

    internals(fixture).jira.set({
      enabled: true,
      connectionId: 'c1',
      projectKey: 'PAY',
      issueTypeName: 'Story',
      importStories: true,
    });
    internals(fixture).picks.set([{ installationId: 7, fullName: 'acme/reservas', branch: 'dev' }]);
    byId(el, 'project-create-review')!.click();
    fixture.detectChanges();

    expect(byId(el, 'project-create-summary-jira')!.textContent).toContain('PAY');
    expect(byId(el, 'project-create-summary-github')!.textContent).toContain('acme/reservas');

    byId(el, 'project-create-confirm-submit')!.click();

    expect(createProject.mock.calls[0][1].sources).toEqual({
      jira: { connectionId: 'c1', projectKey: 'PAY', issueTypeName: 'Story', importStories: true },
      github: [{ repository: 'acme/reservas', installationId: 7, branch: 'dev' }],
    });
    expect(navigate).toHaveBeenCalledWith(['/projects', 'p9']);
  });

  it('starts from the sources with no name typed and fills the basics from them', () => {
    const { fixture, el } = render();

    byId(el, 'project-create-from-sources')!.click();
    fixture.detectChanges();
    expect(byId(el, 'project-create-sources')).not.toBeNull();
    expect((byId(el, 'project-create-review') as HTMLButtonElement).disabled).toBe(true);

    internals(fixture).sourceProfile.set({
      name: 'Pagos',
      description: 'Cobros y conciliación',
      languages: ['Java'],
    });
    fixture.detectChanges();
    expect((byId(el, 'project-create-review') as HTMLButtonElement).disabled).toBe(false);
    expect(byId(el, 'project-create-autofill')).not.toBeNull();

    byId(el, 'project-create-review')!.click();
    fixture.detectChanges();
    byId(el, 'project-create-confirm-submit')!.click();

    const sent = createProject.mock.calls[0][1];
    expect(sent.name).toBe('Pagos');
    expect(sent.description).toBe('Cobros y conciliación');
    expect(sent.programmingLanguages).toEqual(['Java']);
  });

  it('keeps a name that was typed unless the person asks for the source one', () => {
    const { fixture, el } = render();
    type(fixture, 'Portal');
    internals(fixture).goTo(2);
    internals(fixture).sourceProfile.set({ name: 'Pagos', description: null, languages: [] });
    fixture.detectChanges();

    byId(el, 'project-create-review')!.click();
    fixture.detectChanges();
    expect(byId(el, 'project-create-summary-jira')).toBeNull();
    byId(el, 'project-create-confirm-submit')!.click();

    expect(createProject.mock.calls[0][1].name).toBe('Portal');
  });

  it('holds back a half-filled Jira link and says why', () => {
    const { fixture, el } = render();
    type(fixture, 'Portal');
    internals(fixture).goTo(2);
    internals(fixture).jira.set({ ...emptyDraft().jira, enabled: true, projectKey: 'PAY' });
    fixture.detectChanges();

    expect((byId(el, 'project-create-review') as HTMLButtonElement).disabled).toBe(true);
  });

  it('stays on the confirmation with the reason when a source is refused', () => {
    const { fixture, el } = render();
    createProject.mockReturnValue(throwError(() => ({ status: 404, error: { code: 'X' } })));
    type(fixture, 'Portal');
    internals(fixture).goTo(3);
    fixture.detectChanges();

    byId(el, 'project-create-confirm-submit')!.click();
    fixture.detectChanges();

    expect(navigate).not.toHaveBeenCalled();
    expect(byId(el, 'form-error')).not.toBeNull();
    expect(internals(fixture).step()).toBe(3);
  });

  it('keeps the wizard and the way back when leaving for GitHub or Atlassian', () => {
    const { fixture } = render();
    type(fixture, 'Portal');
    internals(fixture).picks.set([{ installationId: 7, fullName: 'acme/a', branch: '' }]);

    internals(fixture).leave('github');
    expect(sessionStorage.getItem(GITHUB_RETURN_KEY)).toBe('/projects/new');
    const saved = JSON.parse(sessionStorage.getItem(PROJECT_DRAFT_KEY)!);
    expect(saved.name).toBe('Portal');
    expect(saved.step).toBe(2);

    internals(fixture).leave('jira');
    expect(sessionStorage.getItem(JIRA_RETURN_KEY)).toBe('/projects/new');
    sessionStorage.removeItem(GITHUB_RETURN_KEY);
    sessionStorage.removeItem(JIRA_RETURN_KEY);
  });

  it('picks the wizard up where it was left after the trip', () => {
    const draft = { ...emptyDraft(), step: 2 as const, name: 'Portal' };
    draft.repositories = [{ installationId: 7, fullName: 'acme/a', branch: '' }];
    sessionStorage.setItem(PROJECT_DRAFT_KEY, JSON.stringify(draft));

    const { fixture, el } = render();

    expect(internals(fixture).step()).toBe(2);
    expect(internals(fixture).picks()).toHaveLength(1);
    expect(byId(el, 'project-create-sources')).not.toBeNull();
    expect(sessionStorage.getItem(PROJECT_DRAFT_KEY)).toBeNull();
  });
});
