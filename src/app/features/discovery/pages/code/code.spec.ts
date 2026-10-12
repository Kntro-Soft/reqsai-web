import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectCode } from './code';
import { CodebaseApiService } from '../../data/codebase-api.service';
import {
  CodeModuleResponse,
  CodeProfile,
  CodeRepositoryResponse,
} from '../../data/codebase.models';
import { INDEXING_POLL_MS } from '../../data/codebase';
import { AuthStore } from '../../../../core/auth/auth.store';
import { PermissionsStore } from '../../../../core/authz/permissions.store';
import { ToastService } from '../../../../shared/toast/toast.service';
import { WorkspaceApiService } from '../../../workspace/data/workspace-api.service';
import { WorkspaceStore } from '../../../workspace/data/workspace.store';
import { ProjectResponse } from '../../../workspace/data/workspace.models';

const ALL = ['INTEGRATION_READ', 'INTEGRATION_WRITE', 'INTEGRATION_DELETE', 'PROJECT_UPDATE'];

function profile(overrides: Partial<CodeProfile> = {}): CodeProfile {
  return {
    languages: [],
    frameworks: [],
    databases: [],
    platforms: [],
    overview: null,
    ...overrides,
  };
}

function repo(overrides: Partial<CodeRepositoryResponse> = {}): CodeRepositoryResponse {
  return {
    id: 'repo-1',
    projectId: 'p1',
    provider: 'GITHUB',
    owner: 'acme',
    name: 'reservas',
    fullName: 'acme/reservas',
    branch: 'main',
    htmlUrl: 'https://github.com/acme/reservas',
    private: false,
    source: 'PUBLIC',
    autoUpdate: false,
    status: 'READY',
    error: null,
    commitSha: '0123456789abcdef',
    indexedAt: '2026-10-09T10:00:00Z',
    fileCount: 42,
    moduleCount: 2,
    modulesDone: 2,
    summarized: true,
    profile: profile({
      languages: ['TypeScript', 'Java'],
      frameworks: ['NestJS'],
      databases: ['PostgreSQL'],
      overview: 'API de reservas de un restaurante.',
    }),
    createdAt: '2026-10-09T09:00:00Z',
    ...overrides,
  };
}

const MODULES: CodeModuleResponse[] = [
  {
    id: 'm1',
    path: 'src/reservas',
    name: 'Reservas',
    summary: 'Crea y cancela reservas de mesa.',
    capabilities: ['Crear reserva', 'Cancelar reserva'],
    businessRules: ['Una reserva se puede cancelar hasta 2 horas antes.'],
    endpoints: ['DELETE /api/reservas/{id}'],
    entities: ['Reserva'],
    fileCount: 6,
    url: 'https://github.com/acme/reservas/tree/main/src/reservas',
  },
  {
    id: 'm2',
    path: 'src/pagos',
    name: 'Pagos',
    summary: 'Cobra con tarjeta.',
    capabilities: ['Cobrar'],
    businessRules: [],
    endpoints: [],
    entities: [],
    fileCount: 3,
    url: null,
  },
];

const PROJECT: ProjectResponse = {
  id: 'p1',
  organizationId: 'org-1',
  name: 'Restaurante',
  description: 'Reservas online',
  programmingLanguages: ['Java'],
  frameworks: ['Spring'],
  clientPlatforms: ['Web'],
  databases: ['PostgreSQL'],
  architecture: 'Hexagonal',
  domain: 'Restaurantes',
  status: 'ACTIVE',
  avatarUrl: null,
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
  demo: false,
};

describe('ProjectCode', () => {
  let api: {
    listRepositories: ReturnType<typeof vi.fn>;
    connectRepository: ReturnType<typeof vi.fn>;
    reindexRepository: ReturnType<typeof vi.fn>;
    removeRepository: ReturnType<typeof vi.fn>;
    listModules: ReturnType<typeof vi.fn>;
    projectGitHub: ReturnType<typeof vi.fn>;
    gitHubRepositories: ReturnType<typeof vi.fn>;
  };
  let workspaceApi: {
    getProject: ReturnType<typeof vi.fn>;
    updateProject: ReturnType<typeof vi.fn>;
  };
  let workspace: { replaceProject: ReturnType<typeof vi.fn> };
  let toast: {
    success: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
  };

  afterEach(() => {
    vi.useRealTimers();
  });

  function render(
    repositories: CodeRepositoryResponse[] = [],
    grants: readonly string[] = ALL,
  ): { fixture: ComponentFixture<ProjectCode>; el: HTMLElement } {
    api = {
      listRepositories: vi.fn(() => of(repositories)),
      connectRepository: vi.fn(() =>
        of(repo({ status: 'PENDING', moduleCount: 0, modulesDone: 0 })),
      ),
      reindexRepository: vi.fn(() => of(repo({ status: 'INDEXING' }))),
      removeRepository: vi.fn(() => of(undefined)),
      listModules: vi.fn(() => of(MODULES)),
      projectGitHub: vi.fn(() => of({ available: false, installations: [] })),
      gitHubRepositories: vi.fn(() => of([])),
    };
    workspaceApi = {
      getProject: vi.fn(() => of(PROJECT)),
      updateProject: vi.fn((_org: string, _id: string, body: Partial<ProjectResponse>) =>
        of({ ...PROJECT, ...body }),
      ),
    };
    workspace = { replaceProject: vi.fn() };
    toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
    const granted = new Set(grants);
    TestBed.configureTestingModule({
      imports: [ProjectCode, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
      providers: [
        { provide: CodebaseApiService, useValue: api },
        { provide: WorkspaceApiService, useValue: workspaceApi },
        { provide: WorkspaceStore, useValue: workspace },
        { provide: AuthStore, useValue: { organizationId: () => 'org-1' } },
        {
          provide: PermissionsStore,
          useValue: {
            has: (p: string) => granted.has(p),
            isOrgOwner: () => false,
            isOrgOwnerOrAdmin: () => false,
          },
        },
        { provide: ToastService, useValue: toast },
      ],
    });
    const fixture = TestBed.createComponent(ProjectCode);
    fixture.componentRef.setInput('projectId', 'p1');
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  const byTestId = (el: HTMLElement, id: string) =>
    el.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  const allByTestId = (el: HTMLElement, id: string) =>
    Array.from(el.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`));

  function type(fixture: ComponentFixture<ProjectCode>, id: string, value: string): void {
    const input = byTestId(fixture.nativeElement, id) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  it('teaches what connecting does and offers the form on an empty project', () => {
    const { el } = render();

    expect(api.listRepositories).toHaveBeenCalledWith('p1');
    expect(byTestId(el, 'code-empty')).not.toBeNull();
    expect(byTestId(el, 'code-connect-form')).not.toBeNull();
    // No token is ever asked for: private repositories come through the GitHub App.
    expect(byTestId(el, 'code-token-input')).toBeNull();
    expect(api.projectGitHub).toHaveBeenCalledWith('p1');
  });

  it('refuses a reference that is not a GitHub repository before calling the API', () => {
    const { fixture, el } = render();

    type(fixture, 'code-repo-input', 'https://gitlab.com/acme/reservas');
    byTestId(el, 'code-connect-submit')!.click();
    fixture.detectChanges();

    expect(byTestId(el, 'code-connect-invalid')).not.toBeNull();
    expect(byTestId(el, 'code-repo-input')!.getAttribute('aria-invalid')).toBe('true');
    expect(api.connectRepository).not.toHaveBeenCalled();
  });

  it('connects a repository URL and polls until it is ready, then loads its modules', () => {
    vi.useFakeTimers();
    const { fixture, el } = render();

    type(fixture, 'code-repo-input', 'https://github.com/acme/reservas/tree/develop');
    byTestId(el, 'code-connect-submit')!.click();
    fixture.detectChanges();

    expect(api.connectRepository).toHaveBeenCalledWith('p1', {
      repository: 'acme/reservas',
      branch: 'develop',
    });
    expect(toast.success).toHaveBeenCalled();
    let card = byTestId(el, 'code-repo')!;
    expect(card.dataset['status']).toBe('PENDING');
    expect(byTestId(card, 'code-repo-progress')!.dataset['indeterminate']).toBe('true');
    expect(byTestId(el, 'code-empty')).toBeNull();

    // Still indexing: the list keeps being polled, with a determinate bar now.
    api.listRepositories.mockReturnValue(
      of([repo({ status: 'INDEXING', moduleCount: 4, modulesDone: 1 })]),
    );
    vi.advanceTimersByTime(INDEXING_POLL_MS);
    fixture.detectChanges();
    expect(api.listRepositories).toHaveBeenCalledTimes(2);
    card = byTestId(el, 'code-repo')!;
    expect(card.dataset['status']).toBe('INDEXING');
    expect(byTestId(card, 'code-repo-progress')!.getAttribute('aria-valuenow')).toBe('25');
    expect(api.listModules).not.toHaveBeenCalled();

    // Ready: polling stops and the module map loads once.
    api.listRepositories.mockReturnValue(of([repo()]));
    vi.advanceTimersByTime(INDEXING_POLL_MS);
    fixture.detectChanges();
    expect(api.listRepositories).toHaveBeenCalledTimes(3);
    expect(byTestId(el, 'code-repo')!.dataset['status']).toBe('READY');
    expect(byTestId(el, 'code-repo-sha')!.textContent?.trim()).toBe('0123456');
    expect(api.listModules).toHaveBeenCalledTimes(1);
    expect(allByTestId(el, 'code-module')).toHaveLength(2);

    vi.advanceTimersByTime(INDEXING_POLL_MS * 3);
    expect(api.listRepositories).toHaveBeenCalledTimes(3);
  });

  it('stops polling when the page is left', () => {
    vi.useFakeTimers();
    const { fixture } = render([repo({ status: 'INDEXING' })]);
    expect(api.listRepositories).toHaveBeenCalledTimes(1);

    fixture.destroy();
    vi.advanceTimersByTime(INDEXING_POLL_MS * 2);
    expect(api.listRepositories).toHaveBeenCalledTimes(1);
  });

  it('shows a server error inline under the form', () => {
    const { fixture, el } = render();
    api.connectRepository.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 404,
            error: { code: 'CODE_REPOSITORY_NOT_FOUND' },
          }),
      ),
    );

    type(fixture, 'code-repo-input', 'acme/privado');
    byTestId(el, 'code-connect-submit')!.click();
    fixture.detectChanges();

    expect(byTestId(el, 'code-connect-error')).not.toBeNull();
    expect(byTestId(el, 'code-connect-form')).not.toBeNull();
  });

  it('says when a repository updates itself on every push', () => {
    const { el } = render([
      repo({ source: 'GITHUB_APP', autoUpdate: true, private: true }),
      repo({ id: 'repo-2', fullName: 'acme/web', name: 'web' }),
    ]);

    const cards = allByTestId(el, 'code-repo');
    expect(byTestId(cards[0], 'code-repo-auto-update')).not.toBeNull();
    expect(byTestId(cards[1], 'code-repo-auto-update')).toBeNull();
  });

  it('marks a failed indexing and retries it', () => {
    const { fixture, el } = render([repo({ status: 'FAILED', error: 'Repositorio vacío' })]);

    expect(byTestId(el, 'code-repo-error')!.textContent).toContain('Repositorio vacío');
    byTestId(el, 'code-repo-retry')!.click();
    fixture.detectChanges();

    expect(api.reindexRepository).toHaveBeenCalledWith('p1', 'repo-1');
    expect(byTestId(el, 'code-repo')!.dataset['status']).toBe('INDEXING');
  });

  it('flags basic summaries made without an AI model', () => {
    const { el } = render([repo({ summarized: false })]);
    expect(byTestId(el, 'code-repo-basic')).not.toBeNull();
  });

  it('removes a repository only after confirming', () => {
    const { fixture, el } = render([repo()]);

    byTestId(el, 'code-repo-remove')!.click();
    fixture.detectChanges();
    expect(api.removeRepository).not.toHaveBeenCalled();
    const confirm = document.querySelector('[data-testid="code-remove-confirm"]') as HTMLElement;
    expect(confirm).not.toBeNull();

    confirm.click();
    fixture.detectChanges();
    expect(api.removeRepository).toHaveBeenCalledWith('p1', 'repo-1');
    expect(byTestId(el, 'code-repo')).toBeNull();
    expect(byTestId(el, 'code-empty')).not.toBeNull();
  });

  it('applies only the new detected technology to the project profile', () => {
    const { fixture, el } = render([repo()]);

    const chips = allByTestId(el, 'code-profile-chip');
    const newOnes = chips.filter((c) => c.dataset['new'] === 'true').map((c) => c.dataset['value']);
    expect(newOnes).toEqual(['TypeScript', 'NestJS']);

    byTestId(el, 'code-profile-apply')!.click();
    fixture.detectChanges();

    expect(workspaceApi.updateProject).toHaveBeenCalledWith('org-1', 'p1', {
      name: 'Restaurante',
      description: 'Reservas online',
      programmingLanguages: ['Java', 'TypeScript'],
      frameworks: ['Spring', 'NestJS'],
      databases: ['PostgreSQL'],
      clientPlatforms: ['Web'],
      architecture: 'Hexagonal',
      domain: 'Restaurantes',
    });
    expect(workspace.replaceProject).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalled();
    expect((byTestId(el, 'code-profile-apply') as HTMLButtonElement).disabled).toBe(true);
  });

  it('filters the module map and opens a module to show its rules', () => {
    const { fixture, el } = render([repo()]);

    type(fixture, 'code-modules-filter', '2 horas');
    expect(
      allByTestId(el, 'code-module').map((m) => byTestId(m, 'code-module-name')!.textContent),
    ).toEqual(['Reservas']);
    expect(byTestId(el, 'code-module-rules')).toBeNull();

    byTestId(el, 'code-module-toggle')!.click();
    fixture.detectChanges();
    expect(byTestId(el, 'code-module-toggle')!.getAttribute('aria-expanded')).toBe('true');
    expect(byTestId(el, 'code-module-rule')!.textContent).toContain('2 horas');
    const link = byTestId(el, 'code-module-link') as HTMLAnchorElement;
    expect(link.target).toBe('_blank');
    expect(link.rel).toContain('noopener');

    type(fixture, 'code-modules-filter', 'facturación');
    expect(byTestId(el, 'code-modules-nomatch')).not.toBeNull();
  });

  it('hides connecting, reindexing, removing and applying without the permissions', () => {
    const { el } = render([repo()], ['INTEGRATION_READ']);

    expect(byTestId(el, 'code-connect-open')).toBeNull();
    expect(byTestId(el, 'code-repo-reindex')).toBeNull();
    expect(byTestId(el, 'code-repo-remove')).toBeNull();
    expect(byTestId(el, 'code-profile-apply')).toBeNull();
    expect(byTestId(el, 'code-profile')).not.toBeNull();
  });

  it('tells a reader who cannot connect whom to ask', () => {
    const { el } = render([], ['INTEGRATION_READ']);
    expect(byTestId(el, 'code-connect-form')).toBeNull();
    expect(byTestId(el, 'code-no-permission')).not.toBeNull();
  });
});
