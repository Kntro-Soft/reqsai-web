import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  inject,
  input,
  model,
  output,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthStore } from '../../../../core/auth/auth.store';
import { PermissionsStore } from '../../../../core/authz/permissions.store';
import { messageForError } from '../../../../core/errors/error-message';
import { GitHubMark } from '../../../../shared/components/github-mark/github-mark';
import { JiraMark } from '../../../../shared/components/jira-mark/jira-mark';
import { Select, SelectOption } from '../../../../shared/components/select/select';
import { HlmButton, HlmSkeleton, HlmSpinner } from '../../../../shared/ui';
import { CodebaseApiService } from '../../../discovery/data/codebase-api.service';
import {
  GitHubConnectionResponse,
  GitHubRepositoryResponse,
} from '../../../discovery/data/codebase.models';
import { MAX_REPOSITORIES } from '../../../discovery/data/codebase';
import { RepositoryPicker } from '../../../discovery/components/repository-picker/repository-picker';
import { IntegrationsApiService } from '../../data/integrations-api.service';
import {
  IntegrationConnectionResponse,
  JiraIssueTypeResponse,
  JiraProjectResponse,
} from '../../data/integrations.models';
import {
  JiraDraft,
  PickedRepository,
  SourceProfile,
  profileFromSources,
} from '../../data/project-setup';

type Load = 'loading' | 'ready' | 'error';

/**
 * Step 2 of the create-project wizard: the optional sources. Jira: the project and issue type from
 * the organization's connection, and whether to import its existing stories. GitHub: up to three
 * repositories from what the organization's GitHub App shares. An organization that has not connected
 * one of them is shown how (owners and admins get the connect action, which asks the parent to keep the
 * wizard draft before it leaves; anyone else is told to ask one). Nothing here is required.
 */
@Component({
  selector: 'app-project-sources-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    TranslocoPipe,
    Select,
    RepositoryPicker,
    GitHubMark,
    JiraMark,
    HlmButton,
    HlmSkeleton,
    HlmSpinner,
  ],
  host: { class: 'flex flex-col gap-8' },
  template: `
    <section class="flex flex-col gap-4" aria-labelledby="sources-jira-title">
      <div class="flex items-center gap-3">
        <span
          class="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#0052CC] text-white"
          aria-hidden="true"
        >
          <app-jira-mark [size]="16" />
        </span>
        <h2 id="sources-jira-title" class="text-base font-semibold">
          {{ 'projectCreate.sources.jira.title' | transloco }}
        </h2>
      </div>

      @switch (jiraLoad()) {
        @case ('loading') {
          <hlm-skeleton class="h-10 w-full max-w-sm rounded-md" />
        }
        @case ('error') {
          <p class="text-sm text-destructive" role="alert">
            {{ 'integrations.loadError' | transloco }}
          </p>
        }
        @default {
          @if (connections().length === 0) {
            <div class="flex flex-col gap-3" data-testid="sources-jira-connect">
              <p class="max-w-[65ch] text-sm text-muted-foreground">
                {{ 'projectCreate.sources.jira.notConnected' | transloco }}
              </p>
              @if (canManage()) {
                <div class="flex flex-wrap items-center gap-3">
                  @if (!oauthDisabled()) {
                    <button
                      hlmBtn
                      size="sm"
                      type="button"
                      (click)="connectJira()"
                      [disabled]="redirecting()"
                      data-testid="sources-jira-connect-button"
                    >
                      @if (redirecting() === 'jira') {
                        <hlm-spinner class="h-4 w-4" />
                      }
                      {{ 'integrations.jira.oauth.connect' | transloco }}
                    </button>
                  }
                  <a
                    class="text-sm font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground"
                    [routerLink]="['/settings', 'integrations']"
                    (click)="leaving.emit('settings')"
                    data-testid="sources-jira-settings"
                    >{{ 'integrations.project.goToOrg' | transloco }}</a
                  >
                </div>
              } @else {
                <p class="text-sm text-muted-foreground" data-testid="sources-jira-ask-admin">
                  {{ 'integrations.project.askAdmin' | transloco }}
                </p>
              }
              @if (connectError()) {
                <p class="text-sm text-destructive" role="alert">{{ connectError() }}</p>
              }
            </div>
          } @else {
            <label class="flex w-fit cursor-pointer items-center gap-2.5 text-sm font-medium">
              <input
                type="checkbox"
                class="size-4 accent-primary"
                [checked]="jira().enabled"
                (change)="toggleJira($any($event.target).checked)"
                data-testid="sources-jira-enable"
              />
              {{ 'projectCreate.sources.jira.enable' | transloco }}
            </label>

            @if (jira().enabled) {
              <div class="flex flex-col gap-4 pl-0 sm:pl-6" data-testid="sources-jira-fields">
                @if (connections().length > 1) {
                  <div class="flex flex-col gap-1.5">
                    <span class="text-sm font-medium leading-none">{{
                      'integrations.project.connection' | transloco
                    }}</span>
                    <app-select
                      class="max-w-sm"
                      [options]="connectionOptions()"
                      [value]="jira().connectionId"
                      (valueChange)="onConnection($event)"
                      [ariaLabel]="'integrations.project.connection' | transloco"
                    />
                  </div>
                }
                <div class="flex flex-col gap-1.5">
                  <span class="text-sm font-medium leading-none">{{
                    'integrations.jira.projectKey' | transloco
                  }}</span>
                  @if (loadingProjects()) {
                    <hlm-skeleton class="h-10 w-full max-w-sm rounded-md" />
                  } @else {
                    <app-select
                      class="max-w-sm"
                      [options]="projectOptions()"
                      [value]="jira().projectKey"
                      (valueChange)="onProject($event)"
                      [searchable]="true"
                      [ariaLabel]="'integrations.jira.projectKey' | transloco"
                      [emptyText]="'integrations.project.noProjects' | transloco"
                    />
                  }
                </div>
                <div class="flex flex-col gap-1.5">
                  <span class="text-sm font-medium leading-none">{{
                    'integrations.jira.issueType' | transloco
                  }}</span>
                  @if (loadingTypes()) {
                    <hlm-skeleton class="h-10 w-full max-w-sm rounded-md" />
                  } @else {
                    <app-select
                      class="max-w-sm"
                      [options]="typeOptions()"
                      [value]="jira().issueTypeName"
                      (valueChange)="patchJira({ issueTypeName: $event })"
                      [disabled]="!jira().projectKey"
                      [disabledLabel]="'integrations.project.selectProjectFirst' | transloco"
                      [ariaLabel]="'integrations.jira.issueType' | transloco"
                      [emptyText]="'integrations.project.noIssueTypes' | transloco"
                    />
                  }
                </div>
                <label class="flex w-fit max-w-[65ch] cursor-pointer items-start gap-2.5 text-sm">
                  <input
                    type="checkbox"
                    class="mt-0.5 size-4 shrink-0 accent-primary"
                    [checked]="jira().importStories"
                    (change)="patchJira({ importStories: $any($event.target).checked })"
                    data-testid="sources-jira-import"
                  />
                  <span class="flex flex-col gap-0.5">
                    <span class="font-medium">{{
                      'projectCreate.sources.jira.import' | transloco
                    }}</span>
                    <span class="text-xs text-muted-foreground">{{
                      'projectCreate.sources.jira.importHint' | transloco
                    }}</span>
                  </span>
                </label>
                @if (jiraError()) {
                  <p class="text-sm text-destructive" role="alert">{{ jiraError() }}</p>
                }
              </div>
            }
          }
        }
      }
    </section>

    <section class="flex flex-col gap-4" aria-labelledby="sources-github-title">
      <div class="flex items-center gap-3">
        <span
          class="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-foreground text-background"
          aria-hidden="true"
        >
          <app-github-mark [size]="16" />
        </span>
        <h2 id="sources-github-title" class="text-base font-semibold">
          {{ 'projectCreate.sources.github.title' | transloco }}
        </h2>
      </div>

      @switch (githubState()) {
        @case ('loading') {
          <hlm-skeleton class="h-10 w-full rounded-md" />
          <hlm-skeleton class="h-14 w-full rounded-lg" />
        }
        @case ('unavailable') {
          <p class="max-w-[65ch] text-sm text-muted-foreground">
            {{ 'integrations.project.github.unavailable' | transloco }}
          </p>
        }
        @case ('connect') {
          <div class="flex flex-col gap-3" data-testid="sources-github-connect">
            <p class="max-w-[65ch] text-sm text-muted-foreground">
              {{ 'code.github.ctaBody' | transloco }}
            </p>
            @if (canManage()) {
              <div>
                <button
                  hlmBtn
                  size="sm"
                  type="button"
                  (click)="installGitHub()"
                  [disabled]="redirecting() !== null"
                  data-testid="sources-github-connect-button"
                >
                  @if (redirecting() === 'github') {
                    <hlm-spinner class="h-4 w-4" />
                    {{ 'code.github.redirecting' | transloco }}
                  } @else {
                    <app-github-mark [size]="15" />
                    {{ 'code.github.ctaButton' | transloco }}
                  }
                </button>
              </div>
            } @else {
              <p class="text-sm text-muted-foreground" data-testid="sources-github-ask-admin">
                {{ 'code.github.ctaNoPermission' | transloco }}
              </p>
            }
            @if (installError()) {
              <p class="text-sm text-destructive" role="alert">{{ installError() }}</p>
            }
          </div>
        }
        @case ('error') {
          <p class="text-sm text-destructive" role="alert">
            {{ 'code.github.loadError' | transloco }}
          </p>
        }
        @default {
          @if (repositories().length === 0) {
            <p class="max-w-[65ch] text-sm text-muted-foreground" data-testid="sources-github-none">
              {{ 'code.github.none' | transloco }}
            </p>
          } @else {
            <app-repository-picker [repositories]="repositories()" [(picks)]="picks" [max]="max" />
          }
        }
      }
    </section>
  `,
})
export class ProjectSourcesStep implements OnInit {
  private readonly auth = inject(AuthStore);
  private readonly permissions = inject(PermissionsStore);
  private readonly integrations = inject(IntegrationsApiService);
  private readonly codebase = inject(CodebaseApiService);
  private readonly transloco = inject(TranslocoService);

  readonly jira = model.required<JiraDraft>();
  readonly picks = model<PickedRepository[]>([]);
  /** What the chosen Jira project and repositories say about the project (name, description, languages). */
  readonly profile = output<SourceProfile>();
  /** The Jira project picked (its name and description), or null. */
  readonly jiraProject = output<{ name: string; description: string | null } | null>();
  /** Fired right before the page is left for Atlassian, GitHub or the settings: keep the draft. */
  readonly leaving = output<'jira' | 'github' | 'settings'>();
  /** The full navigation to the third party (overridden in tests). */
  readonly redirectTo = input<(url: string) => void>((url) => window.location.assign(url));

  protected readonly max = MAX_REPOSITORIES;
  protected readonly canManage = computed(() => this.permissions.isOrgOwnerOrAdmin());
  protected readonly redirecting = signal<'jira' | 'github' | null>(null);

  // ---- Jira ----
  protected readonly jiraLoad = signal<Load>('loading');
  protected readonly connections = signal<IntegrationConnectionResponse[]>([]);
  protected readonly oauthDisabled = signal(false);
  protected readonly connectError = signal<string | null>(null);
  protected readonly jiraError = signal<string | null>(null);
  protected readonly projects = signal<JiraProjectResponse[]>([]);
  protected readonly issueTypes = signal<JiraIssueTypeResponse[]>([]);
  protected readonly loadingProjects = signal(false);
  protected readonly loadingTypes = signal(false);

  protected readonly connectionOptions = computed<SelectOption[]>(() =>
    this.connections().map((c) => ({ value: c.id, label: c.siteUrl })),
  );
  protected readonly projectOptions = computed<SelectOption[]>(() =>
    this.projects().map((p) => ({ value: p.key, label: `${p.name} (${p.key})` })),
  );
  protected readonly typeOptions = computed<SelectOption[]>(() =>
    this.issueTypes().map((t) => ({ value: t.name, label: t.name })),
  );

  // ---- GitHub ----
  private readonly github = signal<GitHubConnectionResponse | null>(null);
  protected readonly repositories = signal<GitHubRepositoryResponse[]>([]);
  protected readonly githubLoad = signal<Load>('loading');
  protected readonly installError = signal<string | null>(null);
  protected readonly githubState = computed<
    'loading' | 'unavailable' | 'connect' | 'error' | 'picker'
  >(() => {
    if (this.githubLoad() === 'loading') return 'loading';
    if (this.githubLoad() === 'error') return 'error';
    const github = this.github();
    if (!github?.available) return 'unavailable';
    return github.installations.some((i) => !i.suspended) ? 'picker' : 'connect';
  });

  constructor() {
    effect(() => {
      const jira = this.jira();
      const project = jira.enabled
        ? (this.projects().find((p) => p.key === jira.projectKey) ?? null)
        : null;
      const chosen = this.repositories().filter((repo) =>
        this.picks().some(
          (p) => p.installationId === repo.installationId && p.fullName === repo.fullName,
        ),
      );
      this.profile.emit(profileFromSources(project, chosen));
      this.jiraProject.emit(
        project ? { name: project.name, description: project.description?.trim() || null } : null,
      );
    });
  }

  ngOnInit(): void {
    const orgId = this.auth.organizationId();
    if (!orgId) {
      this.jiraLoad.set('error');
      this.githubLoad.set('error');
      return;
    }
    // This page sits outside the shell and its route guards: the role decides who may connect.
    this.permissions.loadOrgAuthorization(orgId).subscribe();
    this.loadJira(orgId);
    this.loadGitHub(orgId);
  }

  private loadJira(orgId: string): void {
    this.integrations.listConnections(orgId).subscribe({
      next: (all) => {
        const jira = all.filter((c) => c.provider === 'JIRA');
        this.connections.set(jira);
        this.jiraLoad.set('ready');
        if (jira.length === 0) {
          if (this.canManage()) this.probeOAuth(orgId);
          return;
        }
        if (!jira.some((c) => c.id === this.jira().connectionId)) {
          this.patchJira({ connectionId: jira[0].id });
        }
        if (this.jira().enabled) this.loadProjects(orgId, this.jira().connectionId);
      },
      error: () => this.jiraLoad.set('error'),
    });
  }

  private loadGitHub(orgId: string): void {
    this.codebase.organizationGitHub(orgId).subscribe({
      next: (github) => {
        this.github.set(github);
        if (!github.available || !github.installations.some((i) => !i.suspended)) {
          this.githubLoad.set('ready');
          return;
        }
        this.codebase.organizationGitHubRepositories(orgId).subscribe({
          next: (repos) => {
            this.repositories.set(repos);
            this.githubLoad.set('ready');
          },
          error: () => this.githubLoad.set('error'),
        });
      },
      // A member cannot read the connection; the step then explains who can connect it.
      error: (err: HttpErrorResponse) => {
        if (err.status === 403) {
          this.github.set({ available: true, installations: [] });
          this.githubLoad.set('ready');
        } else {
          this.githubLoad.set('error');
        }
      },
    });
  }

  protected patchJira(patch: Partial<JiraDraft>): void {
    this.jira.set({ ...this.jira(), ...patch });
  }

  protected toggleJira(enabled: boolean): void {
    this.patchJira({ enabled });
    const orgId = this.auth.organizationId();
    if (enabled && orgId && this.projects().length === 0 && this.jira().connectionId) {
      this.loadProjects(orgId, this.jira().connectionId);
    }
  }

  protected onConnection(connectionId: string): void {
    const orgId = this.auth.organizationId();
    if (!orgId || connectionId === this.jira().connectionId) return;
    this.patchJira({ connectionId, projectKey: '', issueTypeName: '' });
    this.projects.set([]);
    this.issueTypes.set([]);
    this.loadProjects(orgId, connectionId);
  }

  protected onProject(projectKey: string): void {
    const orgId = this.auth.organizationId();
    if (!orgId || projectKey === this.jira().projectKey) return;
    this.patchJira({ projectKey, issueTypeName: '' });
    this.issueTypes.set([]);
    this.loadTypes(orgId, this.jira().connectionId, projectKey);
  }

  private loadProjects(orgId: string, connectionId: string): void {
    this.loadingProjects.set(true);
    this.jiraError.set(null);
    this.integrations.listJiraProjects(orgId, connectionId).subscribe({
      next: (projects) => {
        this.projects.set(projects);
        this.loadingProjects.set(false);
        const key = this.jira().projectKey;
        if (key && projects.some((p) => p.key === key)) this.loadTypes(orgId, connectionId, key);
        else if (key) this.patchJira({ projectKey: '', issueTypeName: '' });
      },
      error: (err: unknown) => {
        this.loadingProjects.set(false);
        this.jiraError.set(messageForError(err, this.transloco));
      },
    });
  }

  private loadTypes(orgId: string, connectionId: string, projectKey: string): void {
    this.loadingTypes.set(true);
    this.integrations.listJiraIssueTypes(orgId, connectionId, projectKey).subscribe({
      next: (types) => {
        this.issueTypes.set(types);
        this.loadingTypes.set(false);
        const current = this.jira().issueTypeName;
        if (!types.some((t) => t.name === current)) {
          const story = types.find((t) => t.name.toLowerCase() === 'story') ?? types[0];
          this.patchJira({ issueTypeName: story?.name ?? '' });
        }
      },
      error: (err: unknown) => {
        this.loadingTypes.set(false);
        this.jiraError.set(messageForError(err, this.transloco));
      },
    });
  }

  private probeOAuth(orgId: string): void {
    this.integrations.getJiraAuthorizeUrl(orgId).subscribe({
      next: () => this.oauthDisabled.set(false),
      error: (err: HttpErrorResponse) => {
        if ((err.error as { code?: unknown } | null)?.code === 'JIRA_OAUTH_NOT_CONFIGURED') {
          this.oauthDisabled.set(true);
        }
      },
    });
  }

  /** Off to Atlassian's consent; the callback connects the organization and comes back to the wizard. */
  protected connectJira(): void {
    const orgId = this.auth.organizationId();
    if (!orgId || this.redirecting()) return;
    this.redirecting.set('jira');
    this.connectError.set(null);
    this.integrations.getJiraAuthorizeUrl(orgId).subscribe({
      next: ({ url }) => {
        this.leaving.emit('jira');
        this.redirectTo()(url);
      },
      error: (err: HttpErrorResponse) => {
        this.redirecting.set(null);
        if ((err.error as { code?: unknown } | null)?.code === 'JIRA_OAUTH_NOT_CONFIGURED') {
          this.oauthDisabled.set(true);
        }
        this.connectError.set(messageForError(err, this.transloco));
      },
    });
  }

  /** Off to GitHub to install the App; the callback brings the user back to the wizard. */
  protected installGitHub(): void {
    const orgId = this.auth.organizationId();
    if (!orgId || this.redirecting()) return;
    this.redirecting.set('github');
    this.installError.set(null);
    this.codebase.startGitHubInstall(orgId).subscribe({
      next: ({ url }) => {
        this.leaving.emit('github');
        this.redirectTo()(url);
      },
      error: (err: unknown) => {
        this.redirecting.set(null);
        this.installError.set(messageForError(err, this.transloco));
      },
    });
  }
}
