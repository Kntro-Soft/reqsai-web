import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { Subject, of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthStore } from '../../../core/auth/auth.store';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import { SETUP_POLL_MS, dismissedKey } from './project-setup';
import { ProjectSetupResponse } from './project-setup.models';
import { ProjectSetupStore } from './project-setup.store';
import { WorkspaceApiService } from './workspace-api.service';
import { WorkspaceStore } from './workspace.store';
import { ProjectResponse } from './workspace.models';

class FakeRealtimeService {
  readonly topics = new Map<string, Subject<unknown>>();
  readonly connected = signal(true);
  watch<T>(topic: string): Subject<T> {
    let subject = this.topics.get(topic);
    if (!subject) {
      subject = new Subject<unknown>();
      this.topics.set(topic, subject);
    }
    return subject as Subject<T>;
  }
}

const URL = '/api/projects/p1/setup';

function setup(overrides: Partial<ProjectSetupResponse> = {}): ProjectSetupResponse {
  return {
    projectId: 'p1',
    active: true,
    steps: [{ key: 'GITHUB_REPOS', status: 'RUNNING', done: 1, total: 4, detail: null }],
    detectedStack: null,
    ...overrides,
  };
}

describe('ProjectSetupStore', () => {
  let store: ProjectSetupStore;
  let http: HttpTestingController;
  let realtime: FakeRealtimeService;
  let projects: ProjectResponse[];
  let updateProject: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    realtime = new FakeRealtimeService();
    projects = [
      {
        id: 'p1',
        name: 'Portal',
        description: null,
        programmingLanguages: ['Java'],
        frameworks: [],
        clientPlatforms: [],
        databases: [],
        architecture: '',
        domain: '',
      } as unknown as ProjectResponse,
    ];
    updateProject = vi.fn((_o: string, _p: string, body: object) =>
      of({ ...projects[0], ...body } as ProjectResponse),
    );
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: RealtimeService, useValue: realtime },
        { provide: AuthStore, useValue: { organizationId: () => 'org-1' } },
        { provide: WorkspaceApiService, useValue: { updateProject } },
        {
          provide: WorkspaceStore,
          useValue: { projects: () => projects, replaceProject: vi.fn() },
        },
      ],
    });
    store = TestBed.inject(ProjectSetupStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    store.setProject(null);
    http.verify();
    vi.useRealTimers();
    localStorage.clear();
  });

  it('recovers the setup when a project loads and shows the bar', () => {
    store.setProject('p1');
    http.expectOne(URL).flush(setup());

    expect(store.visible()).toBe(true);
    expect(store.active()).toBe(true);
  });

  it('stays hidden for a project that asked for nothing', () => {
    store.setProject('p1');
    http.expectOne(URL).flush(setup({ active: false, steps: [] }));

    expect(store.visible()).toBe(false);
  });

  it('follows pushes on the setup topic and ignores another project', () => {
    store.setProject('p1');
    http.expectOne(URL).flush(setup());

    realtime.topics
      .get('projects/p1/setup')!
      .next(
        setup({
          steps: [{ key: 'GITHUB_REPOS', status: 'RUNNING', done: 3, total: 4, detail: null }],
        }),
      );
    expect(store.setup()?.steps[0].done).toBe(3);

    realtime.topics.get('projects/p1/setup')!.next(setup({ projectId: 'other' }));
    expect(store.setup()?.projectId).toBe('p1');
  });

  it('polls while a step is open and stops once everything settled', () => {
    vi.useFakeTimers();
    store.setProject('p1');
    http.expectOne(URL).flush(setup());

    vi.advanceTimersByTime(SETUP_POLL_MS);
    http.expectOne(URL).flush(
      setup({
        active: false,
        steps: [{ key: 'GITHUB_REPOS', status: 'DONE', done: 4, total: 4, detail: null }],
      }),
    );
    expect(store.active()).toBe(false);

    vi.advanceTimersByTime(SETUP_POLL_MS * 3);
    http.expectNone(URL);
  });

  it('skips and retries a step with the server and shows its answer', () => {
    store.setProject('p1');
    http.expectOne(URL).flush(setup());

    store.skip('GITHUB_REPOS').subscribe();
    const skip = http.expectOne(`${URL}/steps/GITHUB_REPOS/skip`);
    expect(skip.request.method).toBe('POST');
    skip.flush(
      setup({
        active: false,
        steps: [{ key: 'GITHUB_REPOS', status: 'SKIPPED', done: 0, total: 0, detail: null }],
      }),
    );
    expect(store.setup()?.steps[0].status).toBe('SKIPPED');

    store.retry('GITHUB_REPOS').subscribe();
    http.expectOne(`${URL}/steps/GITHUB_REPOS/retry`).flush(setup());
    expect(store.active()).toBe(true);
  });

  it('remembers the dismissal per project, for good', () => {
    store.setProject('p1');
    http
      .expectOne(URL)
      .flush(
        setup({
          active: false,
          steps: [{ key: 'JIRA_LINK', status: 'DONE', done: 0, total: 0, detail: null }],
        }),
      );

    store.dismiss();
    expect(store.visible()).toBe(false);
    expect(localStorage.getItem(dismissedKey('p1'))).toBe('1');

    store.setProject(null);
    store.setProject('p1');
    http
      .expectOne(URL)
      .flush(
        setup({
          active: false,
          steps: [{ key: 'JIRA_LINK', status: 'DONE', done: 0, total: 0, detail: null }],
        }),
      );
    expect(store.visible()).toBe(false);
  });

  it('offers the detected stack only for what the project lacks, and applies it in one call', () => {
    store.setProject('p1');
    http.expectOne(URL).flush(
      setup({
        active: false,
        steps: [{ key: 'GITHUB_REPOS', status: 'DONE', done: 4, total: 4, detail: null }],
        detectedStack: {
          languages: ['java', 'TypeScript'],
          frameworks: ['Angular'],
          databases: [],
          platforms: [],
        },
      }),
    );

    expect(store.stackAdditions()).toEqual({
      languages: ['TypeScript'],
      frameworks: ['Angular'],
      databases: [],
      platforms: [],
    });

    store.applyStack().subscribe();
    expect(updateProject).toHaveBeenCalledTimes(1);
    const [, , body] = updateProject.mock.calls[0];
    expect(body.programmingLanguages).toEqual(['Java', 'TypeScript']);
    expect(body.frameworks).toEqual(['Angular']);
    expect(body.name).toBe('Portal');
  });

  it('offers nothing when the project already lists the detected stack', () => {
    store.setProject('p1');
    http.expectOne(URL).flush(
      setup({
        active: false,
        detectedStack: { languages: ['Java'], frameworks: [], databases: [], platforms: [] },
      }),
    );

    expect(store.stackAdditions()).toBeNull();
  });
});
