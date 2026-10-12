import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PermissionsStore } from '../../../../core/authz/permissions.store';
import { ToastService } from '../../../../shared/toast/toast.service';
import { ProjectSetupResponse, SetupStepResponse } from '../../data/project-setup.models';
import { SETUP_AUTO_DISMISS_MS } from '../../data/project-setup';
import { ProjectSetupStore } from '../../data/project-setup.store';
import { ProjectSetupBar, failureText } from './project-setup-bar';
import { TranslocoService } from '@jsverse/transloco';
import { computed } from '@angular/core';

function step(key: SetupStepResponse['key'], status: SetupStepResponse['status'], extra = {}) {
  return { key, status, done: 0, total: 0, detail: null, ...extra } as SetupStepResponse;
}

function response(...steps: SetupStepResponse[]): ProjectSetupResponse {
  return { projectId: 'p1', active: false, steps, detectedStack: null };
}

describe('ProjectSetupBar', () => {
  const setup = signal<ProjectSetupResponse | null>(null);
  const dismissed = signal(false);
  const additions = signal<{
    languages: string[];
    frameworks: string[];
    databases: string[];
    platforms: string[];
  } | null>(null);
  let store: Record<string, unknown>;
  let toast: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };

  afterEach(() => {
    vi.useRealTimers();
    setup.set(null);
    dismissed.set(false);
    additions.set(null);
  });

  function render(admin = true): { fixture: ComponentFixture<ProjectSetupBar>; el: HTMLElement } {
    const visible = computed(() => {
      const s = setup();
      return !!s && s.steps.length > 0 && !dismissed();
    });
    store = {
      setup,
      dismissed,
      visible,
      stackAdditions: additions,
      setProject: vi.fn(),
      skip: vi.fn(() => of(response())),
      retry: vi.fn(() => of(response())),
      dismiss: vi.fn(() => dismissed.set(true)),
      applyStack: vi.fn(() => of({})),
    };
    toast = { success: vi.fn(), error: vi.fn() };
    TestBed.configureTestingModule({
      imports: [ProjectSetupBar, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
      providers: [
        { provide: ProjectSetupStore, useValue: store },
        { provide: ToastService, useValue: toast },
        {
          provide: PermissionsStore,
          useValue: { isOrgOwnerOrAdmin: () => admin, has: () => admin },
        },
      ],
    });
    const fixture = TestBed.createComponent(ProjectSetupBar);
    fixture.componentRef.setInput('projectId', 'p1');
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  const byId = (el: HTMLElement, id: string) =>
    el.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

  it('drives the store from the URL and stays out of the way when nothing was asked for', () => {
    const { el } = render();

    expect(store['setProject']).toHaveBeenCalledWith('p1');
    expect(byId(el, 'project-setup-bar')).toBeNull();
  });

  it('does not read the setup for someone who cannot read integrations', () => {
    render(false);

    expect(store['setProject']).toHaveBeenCalledWith(null);
  });

  it('shows each step with its state while the project is being set up', () => {
    setup.set(
      response(
        step('JIRA_LINK', 'DONE'),
        step('JIRA_IMPORT', 'RUNNING', { done: 12, total: 40 }),
        step('GITHUB_REPOS', 'PENDING'),
      ),
    );
    const { el } = render();

    expect(byId(el, 'project-setup-bar')).not.toBeNull();
    const statuses = Array.from(el.querySelectorAll<HTMLElement>('li[data-status]')).map(
      (li) => li.dataset['status'],
    );
    expect(statuses).toEqual(['DONE', 'RUNNING', 'PENDING']);
    expect(byId(el, 'project-setup-dismiss')).toBeNull();
  });

  it('skips an open step and retries a failed one', () => {
    setup.set(
      response(
        step('JIRA_IMPORT', 'RUNNING'),
        step('GITHUB_REPOS', 'FAILED', { detail: 'acme/a: CODE_REPOSITORY_NOT_FOUND' }),
      ),
    );
    const { el } = render();

    byId(el, 'setup-step-JIRA_IMPORT')!
      .querySelector<HTMLButtonElement>('[data-testid="setup-step-skip"]')!
      .click();
    expect(store['skip']).toHaveBeenCalledWith('JIRA_IMPORT');

    byId(el, 'setup-step-GITHUB_REPOS')!
      .querySelector<HTMLButtonElement>('[data-testid="setup-step-retry"]')!
      .click();
    expect(store['retry']).toHaveBeenCalledWith('GITHUB_REPOS');
    expect(byId(el, 'setup-step-GITHUB_REPOS')!.textContent).toContain('acme/a');
  });

  it('hides skip and retry from someone who cannot write integrations', () => {
    setup.set(response(step('GITHUB_REPOS', 'FAILED')));
    const { el } = render(false);
    // setProject(null) keeps the store from loading, but the fake already holds a setup
    expect(byId(el, 'setup-step-retry')).toBeNull();
    expect(byId(el, 'setup-step-skip')).toBeNull();
  });

  it('tells the user when a skip fails', () => {
    setup.set(response(step('JIRA_IMPORT', 'RUNNING')));
    const { el } = render();
    (store['skip'] as ReturnType<typeof vi.fn>).mockReturnValue(throwError(() => new Error('x')));

    el.querySelector<HTMLButtonElement>('[data-testid="setup-step-skip"]')!.click();

    expect(toast.error).toHaveBeenCalled();
  });

  it('offers the detected stack in one click once the code is indexed', () => {
    setup.set(response(step('GITHUB_REPOS', 'DONE', { done: 4, total: 4 })));
    additions.set({ languages: ['TypeScript'], frameworks: [], databases: [], platforms: [] });
    const { el, fixture } = render();

    byId(el, 'setup-stack-apply')!.click();
    fixture.detectChanges();

    expect(store['applyStack']).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalled();
  });

  it('does not offer the stack while a step is still running', () => {
    setup.set(response(step('JIRA_IMPORT', 'RUNNING'), step('GITHUB_REPOS', 'DONE')));
    additions.set({ languages: ['TypeScript'], frameworks: [], databases: [], platforms: [] });
    const { el } = render();

    expect(byId(el, 'setup-stack-offer')).toBeNull();
  });

  it('dismisses itself after a while when everything finished and nothing is left to offer', () => {
    vi.useFakeTimers();
    setup.set(response(step('JIRA_LINK', 'DONE')));
    const { fixture } = render();
    fixture.detectChanges();

    vi.advanceTimersByTime(SETUP_AUTO_DISMISS_MS + 10);

    expect(store['dismiss']).toHaveBeenCalledTimes(1);
  });

  it('stays after a failure or while the stack is waiting, until it is closed', () => {
    vi.useFakeTimers();
    setup.set(response(step('GITHUB_REPOS', 'FAILED')));
    const { fixture, el } = render();
    fixture.detectChanges();

    vi.advanceTimersByTime(SETUP_AUTO_DISMISS_MS * 2);

    expect(store['dismiss']).not.toHaveBeenCalled();
    byId(el, 'project-setup-dismiss')!.click();
    expect(store['dismiss']).toHaveBeenCalledTimes(1);
  });

  it('collapses the steps without dropping the bar', () => {
    setup.set(response(step('JIRA_IMPORT', 'RUNNING')));
    const { fixture, el } = render();

    byId(el, 'project-setup-toggle')!.click();
    fixture.detectChanges();

    expect(el.querySelectorAll('li[data-status]').length).toBe(0);
    expect(byId(el, 'project-setup-bar')).not.toBeNull();
    expect(byId(el, 'project-setup-toggle')!.getAttribute('aria-expanded')).toBe('false');
  });

  it('translates failure codes, naming the repository, and shows unknown text as it is', () => {
    const transloco = {
      translate: (key: string) => (key === 'errors.CODE_REPOSITORY_NOT_FOUND' ? 'Not found' : key),
    } as unknown as TranslocoService;

    expect(failureText('acme/a: CODE_REPOSITORY_NOT_FOUND; acme/b: MYSTERY', transloco)).toBe(
      'acme/a: Not found · acme/b: MYSTERY',
    );
    expect(failureText(null, transloco)).toBe('');
  });
});
