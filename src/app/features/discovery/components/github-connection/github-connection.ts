import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { provideIcons } from '@ng-icons/core';
import {
  lucideArrowUpRight,
  lucideFolderGit2,
  lucideGitCommitHorizontal,
  lucideCirclePause,
  lucideShieldCheck,
  lucideWebhook,
} from '@ng-icons/lucide';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { messageForError } from '../../../../core/errors/error-message';
import { GitHubMark } from '../../../../shared/components/github-mark/github-mark';
import { Modal } from '../../../../shared/components/modal/modal';
import { ToastService } from '../../../../shared/toast/toast.service';
import { HlmButton, HlmIcon, HlmSkeleton, HlmSpinner } from '../../../../shared/ui';
import { CodebaseApiService } from '../../data/codebase-api.service';
import { GitHubConnectionResponse, GitHubInstallationResponse } from '../../data/codebase.models';
import { GITHUB_RETURN_KEY } from '../../data/codebase';

/**
 * The organization's GitHub connection, in Settings → Integrations: the GitHub accounts where the
 * ReqsAI GitHub App is installed (what they share, a link to change it on GitHub, unlink), and the
 * button that installs it on another account. Owners and admins only, like the page.
 */
@Component({
  selector: 'app-github-connection',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    TranslocoPipe,
    GitHubMark,
    Modal,
    HlmButton,
    HlmIcon,
    HlmSkeleton,
    HlmSpinner,
  ],
  viewProviders: [
    provideIcons({
      lucideArrowUpRight,
      lucideFolderGit2,
      lucideGitCommitHorizontal,
      lucideCirclePause,
      lucideShieldCheck,
      lucideWebhook,
    }),
  ],
  template: `
    <div class="grid gap-6 lg:grid-cols-2 lg:items-start">
      <section
        class="overflow-hidden rounded-2xl border border-border"
        data-testid="github-connection"
      >
        <div class="flex flex-col gap-4 p-5">
          <div class="flex items-start gap-3">
            <span
              class="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-foreground text-background"
            >
              <app-github-mark [size]="18" />
            </span>
            <div class="flex min-w-0 flex-col gap-1">
              <h2 class="text-base font-semibold">
                {{ 'integrations.github.title' | transloco }}
              </h2>
              <p class="text-sm text-muted-foreground">
                {{ 'integrations.github.description' | transloco }}
              </p>
            </div>
          </div>

          @switch (state()) {
            @case ('loading') {
              <div class="flex flex-col gap-2">
                <hlm-skeleton class="h-14 w-full rounded-lg" />
              </div>
            }
            @case ('error') {
              <p class="text-sm text-destructive" role="alert">
                {{ 'integrations.github.loadError' | transloco }}
              </p>
            }
            @default {
              @if (!connection()?.available) {
                <p class="text-sm text-muted-foreground" data-testid="github-unavailable">
                  {{ 'integrations.github.unavailable' | transloco }}
                </p>
              } @else if (installations().length > 0) {
                <ul class="flex flex-col gap-2" data-testid="github-installations">
                  @for (inst of installations(); track inst.installationId) {
                    <li
                      class="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border px-3 py-2.5"
                      data-testid="github-installation"
                      [attr.data-account]="inst.account"
                    >
                      <div class="flex min-w-0 flex-1 basis-48 flex-col gap-0.5">
                        <span class="flex flex-wrap items-center gap-2">
                          <span class="font-medium wrap-anywhere">{{ inst.account }}</span>
                          @if (inst.suspended) {
                            <span
                              class="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground"
                            >
                              <hlm-icon name="lucideCirclePause" size="12px" aria-hidden="true" />
                              {{ 'integrations.github.suspended' | transloco }}
                            </span>
                          }
                        </span>
                        <span class="text-xs text-muted-foreground">
                          {{ accountTypeKey(inst) | transloco }} ·
                          {{ selectionKey(inst) | transloco }} ·
                          <time [attr.datetime]="inst.connectedAt">{{
                            inst.connectedAt | date: 'd MMM y'
                          }}</time>
                        </span>
                      </div>
                      <div class="flex items-center gap-1">
                        @if (inst.manageUrl) {
                          <a
                            hlmBtn
                            size="sm"
                            variant="ghost"
                            [href]="inst.manageUrl"
                            target="_blank"
                            rel="noopener noreferrer"
                            data-testid="github-manage"
                          >
                            {{ 'integrations.github.manage' | transloco }}
                            <hlm-icon name="lucideArrowUpRight" size="13px" aria-hidden="true" />
                          </a>
                        }
                        <button
                          hlmBtn
                          size="sm"
                          variant="ghost"
                          type="button"
                          class="text-destructive hover:text-destructive"
                          (click)="askDisconnect(inst)"
                          data-testid="github-disconnect"
                        >
                          {{ 'integrations.github.disconnect' | transloco }}
                        </button>
                      </div>
                    </li>
                  }
                </ul>
              }
              @if (error()) {
                <p class="text-sm text-destructive" role="alert">{{ error() }}</p>
              }
            }
          }
        </div>
        @if (state() === 'ready' && connection()?.available) {
          <div class="flex justify-end border-t border-border bg-muted/30 px-5 py-3">
            <button
              hlmBtn
              size="sm"
              [variant]="installations().length > 0 ? 'outline' : 'default'"
              type="button"
              (click)="install()"
              [disabled]="redirecting()"
              data-testid="github-connect"
            >
              @if (redirecting()) {
                <hlm-spinner class="h-4 w-4" />
              } @else {
                <app-github-mark [size]="15" />
              }
              {{
                (installations().length > 0
                  ? 'integrations.github.connectAnother'
                  : 'integrations.github.connect'
                ) | transloco
              }}
            </button>
          </div>
        }
      </section>

      <aside class="rounded-2xl border border-border bg-muted/20 p-5" data-testid="github-info">
        <h2 class="text-base font-semibold">
          {{ 'integrations.github.howItWorks.title' | transloco }}
        </h2>
        <ol class="mt-4 flex flex-col gap-4">
          @for (step of steps; track step.key) {
            <li class="flex gap-3">
              <span
                class="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted-foreground"
              >
                <hlm-icon [name]="step.icon" size="14px" />
              </span>
              <p class="text-sm text-muted-foreground">
                {{ 'integrations.github.howItWorks.' + step.key | transloco }}
              </p>
            </li>
          }
        </ol>
        <p class="mt-5 flex items-start gap-2 text-xs text-muted-foreground">
          <hlm-icon name="lucideShieldCheck" size="13px" class="mt-0.5 shrink-0" />
          {{ 'integrations.github.howItWorks.privacy' | transloco }}
        </p>
      </aside>
    </div>

    <app-modal [(open)]="disconnectOpen">
      <span modalTitle>{{
        'integrations.github.disconnectTitle' | transloco: { account: target()?.account ?? '' }
      }}</span>
      <p>{{ 'integrations.github.disconnectBody' | transloco }}</p>
      <button
        modalFooter
        hlmBtn
        size="sm"
        variant="ghost"
        type="button"
        (click)="disconnectOpen.set(false)"
      >
        {{ 'common.cancel' | transloco }}
      </button>
      <button
        modalFooter
        hlmBtn
        size="sm"
        variant="destructive"
        type="button"
        (click)="confirmDisconnect()"
        [disabled]="disconnecting()"
        data-testid="github-disconnect-confirm"
      >
        @if (disconnecting()) {
          <hlm-spinner class="h-4 w-4" />
        }
        {{ 'integrations.github.disconnect' | transloco }}
      </button>
    </app-modal>
  `,
})
export class GitHubConnection implements OnInit {
  private readonly api = inject(CodebaseApiService);
  private readonly transloco = inject(TranslocoService);
  private readonly toast = inject(ToastService);

  readonly orgId = input.required<string>();

  protected readonly steps = [
    { key: 'step1', icon: 'lucideFolderGit2' },
    { key: 'step2', icon: 'lucideGitCommitHorizontal' },
    { key: 'step3', icon: 'lucideWebhook' },
  ] as const;

  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly connection = signal<GitHubConnectionResponse | null>(null);
  protected readonly installations = computed(() => this.connection()?.installations ?? []);
  protected readonly redirecting = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly disconnectOpen = signal(false);
  protected readonly disconnecting = signal(false);
  protected readonly target = signal<GitHubInstallationResponse | null>(null);

  ngOnInit(): void {
    this.api.organizationGitHub(this.orgId()).subscribe({
      next: (connection) => {
        this.connection.set(connection);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }

  protected accountTypeKey(inst: GitHubInstallationResponse): string {
    return inst.accountType === 'User'
      ? 'integrations.github.accountUser'
      : 'integrations.github.accountOrganization';
  }

  protected selectionKey(inst: GitHubInstallationResponse): string {
    return inst.repositorySelection === 'all'
      ? 'integrations.github.selectionAll'
      : 'integrations.github.selectionSelected';
  }

  /** Off to GitHub to install the App; the callback brings the user back to Integrations. */
  protected install(): void {
    if (this.redirecting()) return;
    this.redirecting.set(true);
    this.error.set(null);
    this.api.startGitHubInstall(this.orgId()).subscribe({
      next: ({ url }) => {
        try {
          sessionStorage.removeItem(GITHUB_RETURN_KEY);
        } catch {
          // The callback falls back to Integrations either way.
        }
        this.redirect(url);
      },
      error: (err: unknown) => {
        this.redirecting.set(false);
        this.error.set(messageForError(err, this.transloco));
      },
    });
  }

  /** Full navigation to GitHub (overridden in tests). */
  protected redirect(url: string): void {
    window.location.assign(url);
  }

  protected askDisconnect(inst: GitHubInstallationResponse): void {
    this.target.set(inst);
    this.disconnectOpen.set(true);
  }

  protected confirmDisconnect(): void {
    const target = this.target();
    if (!target || this.disconnecting()) return;
    this.disconnecting.set(true);
    this.api.disconnectGitHub(this.orgId(), target.installationId).subscribe({
      next: () => {
        this.disconnecting.set(false);
        this.disconnectOpen.set(false);
        this.connection.update((c) =>
          c
            ? {
                ...c,
                installations: c.installations.filter(
                  (i) => i.installationId !== target.installationId,
                ),
              }
            : c,
        );
        this.toast.success(
          this.transloco.translate('integrations.github.disconnected', {
            account: target.account,
          }),
        );
      },
      error: (err: unknown) => {
        this.disconnecting.set(false);
        this.disconnectOpen.set(false);
        this.toast.error(messageForError(err, this.transloco));
      },
    });
  }
}
