import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { provideIcons } from '@ng-icons/core';
import { lucideHourglass } from '@ng-icons/lucide';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthStore } from '../../../../core/auth/auth.store';
import { messageForError } from '../../../../core/errors/error-message';
import { ToastService } from '../../../../shared/toast/toast.service';
import { HlmButton, HlmIcon, HlmSpinner } from '../../../../shared/ui';
import { CodebaseApiService } from '../../data/codebase-api.service';
import { GITHUB_RETURN_KEY, safeReturnPath } from '../../data/codebase';

/** Where the user lands when no page asked to be returned to. */
const INTEGRATIONS_PATH = '/settings/integrations';

/** What GitHub puts in the redirect after installing (or updating) the ReqsAI GitHub App. */
export interface GitHubInstallParams {
  installationId: number | null;
  setupAction: string | null;
  state: string | null;
  code: string | null;
}

/**
 * Parses GitHub's install redirect. Pure and exported so the presence rules are unit-tested without
 * a router: blank values read as null, and an installation id must be a positive integer.
 */
export function parseGitHubInstallParams(params: ParamMap): GitHubInstallParams {
  const read = (key: string): string | null => params.get(key)?.trim() || null;
  const id = read('installation_id');
  const installationId = id && /^\d{1,18}$/.test(id) ? Number(id) : null;
  return {
    installationId: installationId && installationId > 0 ? installationId : null,
    setupAction: read('setup_action'),
    state: read('state'),
    code: read('code'),
  };
}

type View = 'linking' | 'requested' | 'error';

/**
 * Chrome-less landing page for GitHub's redirect after the ReqsAI GitHub App is installed
 * (`settings/integrations/github/callback`, the App's callback URL). The SPA is fully reloaded, so
 * the session is restored by the silent refresh before this runs. It posts what GitHub sent (the
 * API verifies the signed state and that the GitHub user can access the installation) and returns
 * to the page that started the install, or to Settings → Integrations.
 *
 * SECURITY: no GitHub token transits here — only the installation id, the signed state and the
 * one-time OAuth code, which the backend exchanges and drops.
 */
@Component({
  selector: 'app-github-install-callback',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmButton, HlmIcon, HlmSpinner, TranslocoPipe],
  viewProviders: [provideIcons({ lucideHourglass })],
  template: `
    <div class="grid min-h-dvh place-items-center p-6">
      <div class="flex w-full max-w-md flex-col items-center gap-6 text-center">
        @switch (view()) {
          @case ('linking') {
            <div class="flex flex-col items-center gap-4" data-testid="github-linking">
              <hlm-spinner class="h-8 w-8" />
              <p class="text-sm text-muted-foreground">
                {{ 'integrations.github.callback.connecting' | transloco }}
              </p>
            </div>
          }
          @case ('requested') {
            <div class="flex flex-col items-center gap-3" data-testid="github-requested">
              <span
                class="grid h-10 w-10 place-items-center rounded-full bg-secondary text-foreground"
              >
                <hlm-icon name="lucideHourglass" size="18px" aria-hidden="true" />
              </span>
              <h1 class="text-lg font-semibold">
                {{ 'integrations.github.callback.requestedTitle' | transloco }}
              </h1>
              <p class="text-sm text-muted-foreground">
                {{ 'integrations.github.callback.requestedBody' | transloco }}
              </p>
              <button hlmBtn variant="outline" type="button" class="mt-2" (click)="back()">
                {{ 'integrations.github.callback.back' | transloco }}
              </button>
            </div>
          }
          @case ('error') {
            <div class="flex flex-col items-center gap-4" data-testid="github-error">
              <p class="text-sm text-destructive">{{ errorMessage() }}</p>
              <button hlmBtn variant="outline" type="button" (click)="back()">
                {{ 'integrations.github.callback.back' | transloco }}
              </button>
            </div>
          }
        }
      </div>
    </div>
  `,
})
export class GitHubInstallCallback {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(CodebaseApiService);
  private readonly auth = inject(AuthStore);
  private readonly transloco = inject(TranslocoService);
  private readonly toast = inject(ToastService);

  protected readonly view = signal<View>('linking');
  protected readonly errorMessage = signal<string | null>(null);
  private readonly returnTo = takeReturnPath();

  constructor() {
    const params = parseGitHubInstallParams(this.route.snapshot.queryParamMap);
    if (!params.installationId && params.setupAction !== 'request') {
      this.fail(this.transloco.translate('integrations.github.callback.cancelled'));
      return;
    }
    const orgId = this.auth.organizationId();
    if (!orgId) {
      void this.router.navigate(['/auth/sign-in']);
      return;
    }
    this.api
      .completeGitHubInstall(orgId, {
        installationId: params.installationId,
        setupAction: params.setupAction,
        state: params.state,
        code: params.code,
      })
      .subscribe({
        next: (result) => {
          if (result.status === 'REQUESTED') {
            this.view.set('requested');
            return;
          }
          this.toast.success(
            this.transloco.translate('integrations.github.callback.connected', {
              account: result.installation?.account ?? 'GitHub',
            }),
          );
          // The page that started the install opens its picker right away.
          void this.router.navigateByUrl(this.returnTo, { state: { githubConnected: true } });
        },
        error: (err: HttpErrorResponse) => {
          if (err.status === 401) {
            void this.router.navigate(['/auth/sign-in']);
            return;
          }
          this.fail(messageForError(err, this.transloco));
        },
      });
  }

  protected back(): void {
    void this.router.navigateByUrl(this.returnTo);
  }

  private fail(message: string): void {
    this.errorMessage.set(message);
    this.view.set('error');
  }
}

/** The page that started the install, once (it is cleared), or Settings → Integrations. */
function takeReturnPath(): string {
  try {
    const saved = safeReturnPath(sessionStorage.getItem(GITHUB_RETURN_KEY));
    sessionStorage.removeItem(GITHUB_RETURN_KEY);
    return saved ?? INTEGRATIONS_PATH;
  } catch {
    return INTEGRATIONS_PATH;
  }
}
