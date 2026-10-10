import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { provideIcons } from '@ng-icons/core';
import {
  lucideArrowUpRight,
  lucideCircleCheck,
  lucideFolderGit2,
  lucideGlobe,
  lucideLockKeyhole,
  lucideRefreshCw,
  lucideSearch,
} from '@ng-icons/lucide';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthStore } from '../../../../core/auth/auth.store';
import { PermissionsStore } from '../../../../core/authz/permissions.store';
import { messageForError } from '../../../../core/errors/error-message';
import { translateFn } from '../../../../core/i18n/translate-fn';
import { GitHubMark } from '../../../../shared/components/github-mark/github-mark';
import {
  HlmButton,
  HlmIcon,
  HlmInput,
  HlmLabel,
  HlmSkeleton,
  HlmSpinner,
} from '../../../../shared/ui';
import { CodebaseApiService } from '../../data/codebase-api.service';
import {
  CodeRepositoryResponse,
  GitHubConnectionResponse,
  GitHubRepositoryResponse,
} from '../../data/codebase.models';
import {
  GITHUB_RETURN_KEY,
  filterGitHubRepositories,
  parseRepositoryInput,
} from '../../data/codebase';

/**
 * Connects a repository to the project. With the organization's GitHub connected, the analyst picks
 * from the repositories the ReqsAI GitHub App shares (private ones included; they update on every
 * push). Without it, an org admin can connect GitHub from here, and anyone who can connect code can
 * still type a public repository (`owner/name` or its URL), read anonymously.
 */
@Component({
  selector: 'app-code-connect',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    TranslocoPipe,
    GitHubMark,
    HlmButton,
    HlmIcon,
    HlmInput,
    HlmLabel,
    HlmSkeleton,
    HlmSpinner,
  ],
  viewProviders: [
    provideIcons({
      lucideArrowUpRight,
      lucideCircleCheck,
      lucideFolderGit2,
      lucideGlobe,
      lucideLockKeyhole,
      lucideRefreshCw,
      lucideSearch,
    }),
  ],
  host: { class: 'flex flex-col gap-5' },
  template: `
    @switch (githubState()) {
      @case ('loading') {
        <div class="flex flex-col gap-2" data-testid="code-github-skeleton">
          <hlm-skeleton class="h-9 w-full rounded-md" />
          <hlm-skeleton class="h-14 w-full rounded-lg" />
          <hlm-skeleton class="h-14 w-full rounded-lg" />
        </div>
      }
      @case ('picker') {
        <form
          class="flex flex-col gap-3"
          novalidate
          (submit)="connectSelected($event)"
          data-testid="code-github-picker"
        >
          <h3 class="flex items-center gap-2 text-sm font-semibold">
            <app-github-mark [size]="15" />
            {{ 'code.github.pickerTitle' | transloco }}
          </h3>

          @switch (reposState()) {
            @case ('loading') {
              <div class="flex flex-col gap-2">
                <hlm-skeleton class="h-9 w-full rounded-md" />
                <hlm-skeleton class="h-14 w-full rounded-lg" />
                <hlm-skeleton class="h-14 w-full rounded-lg" />
              </div>
            }
            @case ('error') {
              <div class="flex flex-wrap items-center gap-3" role="alert">
                <p class="text-sm text-destructive">{{ 'code.github.loadError' | transloco }}</p>
                <button
                  hlmBtn
                  size="sm"
                  variant="outline"
                  type="button"
                  (click)="loadRepositories()"
                >
                  <hlm-icon name="lucideRefreshCw" size="14px" />
                  {{ 'discovery.retry' | transloco }}
                </button>
              </div>
            }
            @default {
              @if (repositories().length === 0) {
                <p class="text-sm text-muted-foreground" data-testid="code-github-none">
                  {{ 'code.github.none' | transloco }}
                </p>
              } @else {
                <label
                  class="flex h-10 w-full min-w-0 cursor-text items-center gap-2 rounded-md border border-input bg-background px-3 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background"
                >
                  <span class="sr-only">{{ 'code.github.filter' | transloco }}</span>
                  <hlm-icon
                    name="lucideSearch"
                    size="15px"
                    class="shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    autocomplete="off"
                    spellcheck="false"
                    class="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                    [value]="filter()"
                    (input)="filter.set($any($event.target).value)"
                    [placeholder]="'code.github.filter' | transloco"
                    data-testid="code-github-filter"
                  />
                </label>
                <fieldset class="min-w-0">
                  <legend class="sr-only">{{ 'code.github.pickerTitle' | transloco }}</legend>
                  @if (visible().length === 0) {
                    <p class="py-3 text-sm text-muted-foreground">
                      {{ 'code.github.noMatch' | transloco: { query: filter().trim() } }}
                    </p>
                  } @else {
                    <ul
                      class="flex max-h-72 flex-col gap-1.5 overflow-y-auto overscroll-contain pr-1"
                    >
                      @for (repo of visible(); track repo.installationId + ':' + repo.fullName) {
                        <li>
                          <label
                            [class]="rowClass(repo)"
                            [attr.data-selected]="isSelected(repo)"
                            data-testid="code-github-repo"
                            [attr.data-full-name]="repo.fullName"
                          >
                            <input
                              type="radio"
                              name="github-repository"
                              class="sr-only"
                              [checked]="isSelected(repo)"
                              [disabled]="repo.connected || connecting()"
                              (change)="select(repo)"
                            />
                            <hlm-icon
                              [name]="repo.private ? 'lucideLockKeyhole' : 'lucideGlobe'"
                              size="15px"
                              class="mt-0.5 shrink-0 text-muted-foreground"
                              aria-hidden="true"
                            />
                            <span class="flex min-w-0 flex-1 flex-col gap-0.5">
                              <span class="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                <span class="font-medium wrap-anywhere">{{ repo.fullName }}</span>
                                <span class="sr-only">
                                  ·
                                  {{
                                    (repo.private ? 'code.repo.private' : 'code.repo.public')
                                      | transloco
                                  }}
                                </span>
                                @if (repo.connected) {
                                  <span
                                    class="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground"
                                  >
                                    <hlm-icon
                                      name="lucideCircleCheck"
                                      size="12px"
                                      aria-hidden="true"
                                    />
                                    {{ 'code.github.connectedBadge' | transloco }}
                                  </span>
                                }
                              </span>
                              @if (repo.description) {
                                <span class="line-clamp-1 text-xs text-muted-foreground">{{
                                  repo.description
                                }}</span>
                              }
                            </span>
                          </label>
                        </li>
                      }
                    </ul>
                  }
                </fieldset>

                <div class="flex flex-wrap items-end gap-3">
                  <div class="flex min-w-0 basis-full flex-col gap-1.5 sm:flex-1 sm:basis-48">
                    <label hlmLabel for="code-github-branch">
                      {{ 'code.connect.branch' | transloco }}
                      <span class="font-normal text-muted-foreground"
                        >· {{ 'common.optional' | transloco }}</span
                      >
                    </label>
                    <input
                      hlmInput
                      id="code-github-branch"
                      autocomplete="off"
                      autocapitalize="off"
                      spellcheck="false"
                      maxlength="255"
                      [value]="pickedBranch()"
                      (input)="pickedBranch.set($any($event.target).value)"
                      [placeholder]="selected()?.defaultBranch ?? ''"
                      [disabled]="connecting() || !selected()"
                      data-testid="code-github-branch"
                    />
                  </div>
                  <div class="ml-auto flex items-center gap-2">
                    @if (showCancel()) {
                      <button
                        hlmBtn
                        size="sm"
                        variant="ghost"
                        type="button"
                        class="h-9"
                        (click)="cancelled.emit()"
                        [disabled]="connecting()"
                        data-testid="code-connect-cancel"
                      >
                        {{ 'common.cancel' | transloco }}
                      </button>
                    }
                    <button
                      hlmBtn
                      size="sm"
                      type="submit"
                      class="h-9"
                      [disabled]="connecting() || !selected()"
                      data-testid="code-github-submit"
                    >
                      @if (connecting() && selected()) {
                        <hlm-spinner class="h-4 w-4" />
                      } @else {
                        <hlm-icon name="lucideFolderGit2" size="15px" />
                      }
                      {{ 'code.github.submit' | transloco }}
                    </button>
                  </div>
                </div>
              }
              @if (manageUrl(); as url) {
                <p class="text-xs text-muted-foreground">
                  <a
                    [href]="url"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="underline underline-offset-2 hover:text-foreground"
                    data-testid="code-github-manage"
                    >{{ 'code.github.missingHint' | transloco }}</a
                  >
                </p>
              }
            }
          }
          @if (pickError()) {
            <p class="text-sm text-destructive" role="alert" data-testid="code-github-error">
              {{ pickError() }}
            </p>
          }
          @if (showCancel() && (reposState() !== 'ready' || repositories().length === 0)) {
            <div class="flex justify-end">
              <button
                hlmBtn
                size="sm"
                variant="ghost"
                type="button"
                class="h-9"
                (click)="cancelled.emit()"
                [disabled]="connecting()"
                data-testid="code-connect-cancel"
              >
                {{ 'common.cancel' | transloco }}
              </button>
            </div>
          }
        </form>
      }
      @case ('connect') {
        <div
          class="flex flex-wrap items-start gap-4 rounded-xl border border-border bg-background p-4"
          data-testid="code-github-cta"
        >
          <span
            class="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-foreground text-background"
          >
            <app-github-mark [size]="20" />
          </span>
          <div class="flex min-w-0 flex-1 basis-60 flex-col gap-1">
            <h3 class="text-sm font-semibold">{{ 'code.github.ctaTitle' | transloco }}</h3>
            <p class="max-w-[65ch] text-sm text-muted-foreground">
              {{ 'code.github.ctaBody' | transloco }}
            </p>
            @if (!canManageGitHub()) {
              <p class="mt-1 text-xs text-muted-foreground" data-testid="code-github-ask-admin">
                {{ 'code.github.ctaNoPermission' | transloco }}
              </p>
            }
          </div>
          @if (canManageGitHub()) {
            <button
              hlmBtn
              size="sm"
              type="button"
              class="self-center"
              (click)="installGitHub()"
              [disabled]="redirecting()"
              data-testid="code-github-connect"
            >
              @if (redirecting()) {
                <hlm-spinner class="h-4 w-4" />
                {{ 'code.github.redirecting' | transloco }}
              } @else {
                <app-github-mark [size]="15" />
                {{ 'code.github.ctaButton' | transloco }}
              }
            </button>
          }
          @if (installError()) {
            <p class="basis-full text-sm text-destructive" role="alert">{{ installError() }}</p>
          }
        </div>
      }
    }

    @if (githubState() !== 'loading') {
      @if (githubState() === 'picker' && !typedOpen()) {
        <button
          type="button"
          class="w-fit text-left text-xs font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground"
          (click)="openTyped()"
          data-testid="code-typed-toggle"
        >
          {{ 'code.github.typedToggle' | transloco }}
        </button>
      } @else {
        <form
          class="flex flex-col gap-4"
          novalidate
          (submit)="connectTyped($event)"
          data-testid="code-connect-form"
        >
          @if (githubState() !== 'public') {
            <h3 class="text-sm font-semibold">{{ 'code.github.typedTitle' | transloco }}</h3>
          }
          <div class="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <div class="flex min-w-0 flex-col gap-1.5">
              <label hlmLabel for="code-repository">{{
                'code.connect.repository' | transloco
              }}</label>
              <input
                hlmInput
                id="code-repository"
                name="repository"
                autocomplete="off"
                autocapitalize="off"
                spellcheck="false"
                inputmode="url"
                [value]="repositoryInput()"
                (input)="setRepository($any($event.target).value)"
                (blur)="touchRepository()"
                [placeholder]="'code.connect.repositoryPlaceholder' | transloco"
                [disabled]="connecting()"
                [attr.aria-invalid]="repositoryInvalid()"
                [attr.aria-describedby]="repositoryInvalid() ? 'code-repository-error' : null"
                data-testid="code-repo-input"
              />
              @if (repositoryInvalid()) {
                <p
                  id="code-repository-error"
                  class="text-xs text-destructive"
                  data-testid="code-connect-invalid"
                >
                  {{ 'code.connect.invalid' | transloco }}
                </p>
              }
            </div>
            <div class="flex min-w-0 flex-col gap-1.5">
              <label hlmLabel for="code-branch">
                {{ 'code.connect.branch' | transloco }}
                <span class="font-normal text-muted-foreground"
                  >· {{ 'common.optional' | transloco }}</span
                >
              </label>
              <input
                hlmInput
                id="code-branch"
                name="branch"
                autocomplete="off"
                autocapitalize="off"
                spellcheck="false"
                maxlength="255"
                [value]="branchInput()"
                (input)="branchInput.set($any($event.target).value)"
                [placeholder]="branchPlaceholder()"
                [disabled]="connecting()"
                data-testid="code-branch-input"
              />
            </div>
          </div>
          @if (githubState() === 'public') {
            <p class="-mt-2 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
              <hlm-icon name="lucideGlobe" size="13px" class="mt-0.5 shrink-0" aria-hidden="true" />
              {{ 'code.github.publicOnly' | transloco }}
            </p>
          }

          @if (connectError()) {
            <p class="text-sm text-destructive" role="alert" data-testid="code-connect-error">
              {{ connectError() }}
            </p>
          }

          <div class="flex flex-wrap items-center justify-end gap-2">
            @if (showCancel() && githubState() !== 'picker') {
              <button
                hlmBtn
                size="sm"
                variant="ghost"
                type="button"
                (click)="cancelled.emit()"
                [disabled]="connecting()"
                data-testid="code-connect-cancel"
              >
                {{ 'common.cancel' | transloco }}
              </button>
            }
            <button
              hlmBtn
              size="sm"
              [variant]="githubState() === 'public' ? 'default' : 'outline'"
              type="submit"
              [disabled]="connecting() || !repositoryInput().trim()"
              data-testid="code-connect-submit"
            >
              @if (connecting() && !selected()) {
                <hlm-spinner class="h-4 w-4" />
              } @else {
                <hlm-icon name="lucideFolderGit2" size="15px" />
              }
              {{ 'code.connect.submit' | transloco }}
            </button>
          </div>
        </form>
      }
    }
  `,
})
export class CodeConnect implements OnInit {
  private readonly api = inject(CodebaseApiService);
  private readonly auth = inject(AuthStore);
  private readonly permissions = inject(PermissionsStore);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);
  private readonly translate = translateFn(this.transloco);

  readonly projectId = input.required<string>();
  /** Whether a "Cancel" closes the panel (the page has repositories already). */
  readonly showCancel = input(false);
  /** Focus the first field once rendered (the panel was opened on purpose). */
  readonly autofocus = input(false);

  readonly connected = output<CodeRepositoryResponse>();
  readonly cancelled = output<void>();

  // ---- GitHub connection ----
  private readonly github = signal<GitHubConnectionResponse | null>(null);
  private readonly githubLoaded = signal(false);
  /** loading → `picker` (GitHub connected), `connect` (App available, not installed) or `public`. */
  protected readonly githubState = computed<'loading' | 'picker' | 'connect' | 'public'>(() => {
    if (!this.githubLoaded()) return 'loading';
    const github = this.github();
    if (!github?.available) return 'public';
    return github.installations.some((i) => !i.suspended) ? 'picker' : 'connect';
  });
  protected readonly canManageGitHub = computed(() => this.permissions.isOrgOwnerOrAdmin());
  /** Where to share more repositories with ReqsAI (the first installation's settings on GitHub). */
  protected readonly manageUrl = computed(
    () => this.github()?.installations.find((i) => i.manageUrl)?.manageUrl ?? null,
  );
  protected readonly redirecting = signal(false);
  protected readonly installError = signal<string | null>(null);

  // ---- Picker ----
  protected readonly repositories = signal<GitHubRepositoryResponse[]>([]);
  protected readonly reposState = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly filter = signal('');
  protected readonly visible = computed(() =>
    filterGitHubRepositories(this.repositories(), this.filter()),
  );
  protected readonly selected = signal<GitHubRepositoryResponse | null>(null);
  protected readonly pickedBranch = signal('');
  protected readonly pickError = signal<string | null>(null);

  // ---- Typed (public) repository ----
  protected readonly typedOpen = signal(false);
  protected readonly repositoryInput = signal('');
  protected readonly branchInput = signal('');
  private readonly repositoryTouched = signal(false);
  protected readonly connectError = signal<string | null>(null);
  protected readonly parsed = computed(() => parseRepositoryInput(this.repositoryInput()));
  protected readonly repositoryInvalid = computed(
    () => this.repositoryTouched() && this.repositoryInput().trim().length > 0 && !this.parsed(),
  );
  /** A `/tree/<branch>` URL names its branch; otherwise the repository's default one is used. */
  protected readonly branchPlaceholder = computed(() => {
    const t = this.translate();
    return this.parsed()?.branch ?? (t ? t('code.connect.branchPlaceholder') : '');
  });

  protected readonly connecting = signal(false);

  constructor() {
    afterNextRender(() => {
      if (this.autofocus()) this.focusFirstField();
    });
  }

  ngOnInit(): void {
    this.api.projectGitHub(this.projectId()).subscribe({
      next: (github) => {
        this.github.set(github);
        this.githubLoaded.set(true);
        if (this.githubState() === 'picker') this.loadRepositories();
        if (this.autofocus()) setTimeout(() => this.focusFirstField());
      },
      // Without the connection the page still works with public repositories.
      error: () => {
        this.github.set(null);
        this.githubLoaded.set(true);
      },
    });
  }

  protected loadRepositories(): void {
    this.reposState.set('loading');
    this.api.gitHubRepositories(this.projectId()).subscribe({
      next: (repositories) => {
        this.repositories.set(repositories);
        this.reposState.set('ready');
      },
      error: () => this.reposState.set('error'),
    });
  }

  protected isSelected(repo: GitHubRepositoryResponse): boolean {
    const selected = this.selected();
    return (
      !!selected &&
      selected.installationId === repo.installationId &&
      selected.fullName === repo.fullName
    );
  }

  /** A picker row: highlighted when chosen, muted when the project already reads it. */
  protected rowClass(repo: GitHubRepositoryResponse): string {
    const base =
      'flex items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors ' +
      'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring ';
    if (repo.connected) return base + 'cursor-default border-border opacity-60';
    return this.isSelected(repo)
      ? base + 'cursor-pointer border-primary bg-primary/5'
      : base + 'cursor-pointer border-border hover:bg-accent';
  }

  protected select(repo: GitHubRepositoryResponse): void {
    if (repo.connected) return;
    this.selected.set(repo);
    this.pickedBranch.set('');
    this.pickError.set(null);
  }

  protected connectSelected(event?: Event): void {
    event?.preventDefault();
    const repo = this.selected();
    if (!repo || this.connecting()) return;
    this.connecting.set(true);
    this.pickError.set(null);
    this.api
      .connectRepository(this.projectId(), {
        repository: repo.fullName,
        branch: this.pickedBranch().trim() || null,
        installationId: repo.installationId,
      })
      .subscribe({
        next: (connected) => {
          this.connecting.set(false);
          this.selected.set(null);
          this.pickedBranch.set('');
          this.repositories.update((list) =>
            list.map((r) => (r === repo ? { ...r, connected: true } : r)),
          );
          this.connected.emit(connected);
        },
        error: (err: unknown) => {
          this.connecting.set(false);
          this.pickError.set(messageForError(err, this.transloco));
        },
      });
  }

  protected openTyped(): void {
    this.typedOpen.set(true);
    setTimeout(() => document.getElementById('code-repository')?.focus());
  }

  protected setRepository(value: string): void {
    this.repositoryInput.set(value);
    this.connectError.set(null);
  }

  protected touchRepository(): void {
    if (this.repositoryInput().trim()) this.repositoryTouched.set(true);
  }

  protected connectTyped(event?: Event): void {
    event?.preventDefault();
    this.repositoryTouched.set(true);
    const ref = this.parsed();
    if (!ref || this.connecting()) return;
    this.selected.set(null);
    this.connecting.set(true);
    this.connectError.set(null);
    this.api
      .connectRepository(this.projectId(), {
        repository: `${ref.owner}/${ref.name}`,
        branch: this.branchInput().trim() || ref.branch || null,
      })
      .subscribe({
        next: (connected) => {
          this.connecting.set(false);
          this.repositoryInput.set('');
          this.branchInput.set('');
          this.repositoryTouched.set(false);
          this.connected.emit(connected);
        },
        error: (err: unknown) => {
          this.connecting.set(false);
          this.connectError.set(messageForError(err, this.transloco));
        },
      });
  }

  /** Off to GitHub to install the App; the callback brings the user back to this page. */
  protected installGitHub(): void {
    const orgId = this.auth.organizationId();
    if (!orgId || this.redirecting()) return;
    this.redirecting.set(true);
    this.installError.set(null);
    this.api.startGitHubInstall(orgId).subscribe({
      next: ({ url }) => {
        try {
          sessionStorage.setItem(GITHUB_RETURN_KEY, this.router.url);
        } catch {
          // Without storage the callback returns to Settings → Integrations instead.
        }
        this.redirect(url);
      },
      error: (err: unknown) => {
        this.redirecting.set(false);
        this.installError.set(messageForError(err, this.transloco));
      },
    });
  }

  /** Full navigation to GitHub (overridden in tests). */
  protected redirect(url: string): void {
    window.location.assign(url);
  }

  private focusFirstField(): void {
    const id =
      this.githubState() === 'picker' ? '[data-testid="code-github-filter"]' : '#code-repository';
    document.querySelector<HTMLElement>(id)?.focus();
  }
}
