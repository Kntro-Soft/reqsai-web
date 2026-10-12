import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { provideIcons } from '@ng-icons/core';
import {
  lucideArrowUpRight,
  lucideCircleAlert,
  lucideCircleCheck,
  lucideGitBranch,
  lucideGlobe,
  lucideLoaderCircle,
  lucideLockKeyhole,
  lucideWebhook,
} from '@ng-icons/lucide';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthStore } from '../../../../core/auth/auth.store';
import { rememberReturnPath } from '../../../../core/navigation/return-path';
import { PermissionsStore } from '../../../../core/authz/permissions.store';
import { messageForError } from '../../../../core/errors/error-message';
import { GitHubMark } from '../../../../shared/components/github-mark/github-mark';
import { HlmButton, HlmIcon, HlmSkeleton, HlmSpinner } from '../../../../shared/ui';
import { CodebaseApiService } from '../../data/codebase-api.service';
import { CodeRepositoryResponse, GitHubConnectionResponse } from '../../data/codebase.models';
import { GITHUB_RETURN_KEY, statusKey } from '../../data/codebase';

/**
 * The project's GitHub, in its Settings → Integrations next to Jira: whether the organization
 * connected GitHub (and on which accounts), the repositories this project reads with their state,
 * and the way to manage them on the Code page. An org owner or admin can connect GitHub from here.
 */
@Component({
  selector: 'app-project-github',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslocoPipe, GitHubMark, HlmButton, HlmIcon, HlmSkeleton, HlmSpinner],
  viewProviders: [
    provideIcons({
      lucideArrowUpRight,
      lucideCircleAlert,
      lucideCircleCheck,
      lucideGitBranch,
      lucideGlobe,
      lucideLoaderCircle,
      lucideLockKeyhole,
      lucideWebhook,
    }),
  ],
  template: `
    <section class="overflow-hidden rounded-2xl border border-border" data-testid="project-github">
      <div class="flex flex-col gap-4 p-5">
        <div class="flex items-start gap-3">
          <span
            class="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-foreground text-background"
          >
            <app-github-mark [size]="18" />
          </span>
          <div class="flex min-w-0 flex-col gap-1">
            <h2 class="text-base font-semibold">
              {{ 'integrations.project.github.title' | transloco }}
            </h2>
            <p class="text-sm text-muted-foreground">
              {{ 'integrations.project.github.description' | transloco }}
            </p>
          </div>
        </div>

        @switch (state()) {
          @case ('loading') {
            <div class="flex flex-col gap-2">
              <hlm-skeleton class="h-4 w-56" />
              <hlm-skeleton class="h-12 w-full rounded-lg" />
            </div>
          }
          @case ('error') {
            <p class="text-sm text-destructive" role="alert">
              {{ 'integrations.project.github.loadError' | transloco }}
            </p>
          }
          @default {
            <!-- The organization's GitHub connection -->
            @if (!connection()?.available) {
              <p class="text-sm text-muted-foreground" data-testid="project-github-unavailable">
                {{ 'integrations.project.github.unavailable' | transloco }}
              </p>
            } @else if (accounts().length > 0) {
              <p
                class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm"
                data-testid="project-github-connected"
              >
                <hlm-icon
                  name="lucideCircleCheck"
                  size="15px"
                  class="text-verified"
                  aria-hidden="true"
                />
                {{
                  'integrations.project.github.connectedTo' | transloco: { accounts: accounts() }
                }}
              </p>
            } @else {
              <div
                class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-border p-3"
                data-testid="project-github-not-connected"
              >
                <p class="min-w-0 flex-1 basis-56 text-sm text-muted-foreground">
                  {{ 'integrations.project.github.notConnected' | transloco }}
                  @if (!canManageGitHub()) {
                    {{ 'code.github.ctaNoPermission' | transloco }}
                  }
                </p>
                @if (canManageGitHub()) {
                  <button
                    hlmBtn
                    size="sm"
                    type="button"
                    (click)="installGitHub()"
                    [disabled]="redirecting()"
                    data-testid="project-github-connect"
                  >
                    @if (redirecting()) {
                      <hlm-spinner class="h-4 w-4" />
                    } @else {
                      <app-github-mark [size]="15" />
                    }
                    {{ 'code.github.ctaButton' | transloco }}
                  </button>
                }
              </div>
              @if (installError()) {
                <p class="text-sm text-destructive" role="alert">{{ installError() }}</p>
              }
            }

            <!-- What this project reads -->
            @if (repositories().length === 0) {
              <p class="text-sm text-muted-foreground" data-testid="project-github-no-repos">
                {{ 'integrations.project.github.noRepos' | transloco }}
              </p>
            } @else {
              <ul class="flex flex-col gap-2" data-testid="project-github-repos">
                @for (repo of repositories(); track repo.id) {
                  <li
                    class="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-border px-3 py-2.5"
                    data-testid="project-github-repo"
                    [attr.data-status]="repo.status"
                  >
                    <a
                      [href]="repo.htmlUrl"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="inline-flex min-w-0 items-center gap-1.5 font-medium wrap-anywhere hover:underline"
                    >
                      <hlm-icon
                        [name]="repo.private ? 'lucideLockKeyhole' : 'lucideGlobe'"
                        size="14px"
                        class="shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                      {{ repo.fullName }}
                      <span class="sr-only">
                        ({{
                          (repo.private ? 'code.repo.private' : 'code.repo.public') | transloco
                        }})
                      </span>
                    </a>
                    <span class="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <hlm-icon name="lucideGitBranch" size="12px" aria-hidden="true" />
                      <span class="font-mono">{{ repo.branch }}</span>
                    </span>
                    <span class="ml-auto inline-flex flex-wrap items-center gap-2 text-xs">
                      @if (repo.autoUpdate) {
                        <span class="inline-flex items-center gap-1 text-muted-foreground">
                          <hlm-icon name="lucideWebhook" size="12px" aria-hidden="true" />
                          {{ 'code.github.autoUpdate' | transloco }}
                        </span>
                      }
                      <span
                        class="inline-flex items-center gap-1 font-medium"
                        [class.text-verified]="repo.status === 'READY'"
                        [class.text-destructive]="repo.status === 'FAILED'"
                        [class.text-muted-foreground]="
                          repo.status === 'PENDING' || repo.status === 'INDEXING'
                        "
                      >
                        <hlm-icon [name]="statusIcon(repo)" size="13px" aria-hidden="true" />
                        {{ statusLabel(repo) | transloco }}
                      </span>
                    </span>
                  </li>
                }
              </ul>
            }
          }
        }
      </div>
      @if (state() === 'ready') {
        <div
          class="flex flex-wrap items-center justify-end gap-2 border-t border-border bg-muted/30 px-5 py-3"
        >
          @if (canManageGitHub() && accounts().length > 0) {
            <a
              hlmBtn
              size="sm"
              variant="ghost"
              [routerLink]="['/settings', 'integrations']"
              data-testid="project-github-org-settings"
            >
              {{ 'integrations.project.github.orgSettings' | transloco }}
            </a>
          }
          <a
            hlmBtn
            size="sm"
            variant="outline"
            [routerLink]="['/projects', projectId(), 'code']"
            data-testid="project-github-manage"
          >
            {{ 'integrations.project.github.manage' | transloco }}
            <hlm-icon name="lucideArrowUpRight" size="13px" aria-hidden="true" />
          </a>
        </div>
      }
    </section>
  `,
})
export class ProjectGitHub implements OnInit {
  private readonly api = inject(CodebaseApiService);
  private readonly auth = inject(AuthStore);
  private readonly permissions = inject(PermissionsStore);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);

  readonly projectId = input.required<string>();

  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly connection = signal<GitHubConnectionResponse | null>(null);
  protected readonly repositories = signal<CodeRepositoryResponse[]>([]);
  protected readonly accounts = computed(() =>
    (this.connection()?.installations ?? [])
      .filter((i) => !i.suspended)
      .map((i) => i.account)
      .join(', '),
  );
  protected readonly canManageGitHub = computed(() => this.permissions.isOrgOwnerOrAdmin());
  protected readonly redirecting = signal(false);
  protected readonly installError = signal<string | null>(null);

  ngOnInit(): void {
    forkJoin({
      connection: this.api.projectGitHub(this.projectId()),
      repositories: this.api.listRepositories(this.projectId()),
    }).subscribe({
      next: ({ connection, repositories }) => {
        this.connection.set(connection);
        this.repositories.set(repositories);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }

  protected statusLabel(repo: CodeRepositoryResponse): string {
    return statusKey(repo.status);
  }

  protected statusIcon(repo: CodeRepositoryResponse): string {
    if (repo.status === 'READY') return 'lucideCircleCheck';
    if (repo.status === 'FAILED') return 'lucideCircleAlert';
    return 'lucideLoaderCircle';
  }

  /** Off to GitHub to install the App; the callback brings the user back to this page. */
  protected installGitHub(): void {
    const orgId = this.auth.organizationId();
    if (!orgId || this.redirecting()) return;
    this.redirecting.set(true);
    this.installError.set(null);
    this.api.startGitHubInstall(orgId).subscribe({
      next: ({ url }) => {
        rememberReturnPath(GITHUB_RETURN_KEY, this.router.url);
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
}
