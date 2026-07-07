import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthStore } from '../../../../core/auth/auth.store';
import { IntegrationsApiService } from '../../data/integrations-api.service';
import {
  isSitesResult,
  JiraSiteResponse,
  OAuthCallbackResult,
} from '../../data/integrations.models';
import { ToastService } from '../../../../shared/toast/toast.service';
import { messageForError } from '../../../../core/errors/error-message';
import { HlmButton, HlmSpinner } from '../../../../shared/ui';

/** Where the callback returns the user once the exchange completes (or aborts). */
const INTEGRATIONS_PATH = '/settings/integrations';

/** The parts of the Atlassian redirect we read off the URL. */
export interface JiraOAuthParams {
  code: string | null;
  state: string | null;
  error: string | null;
}

/**
 * Parses the Atlassian OAuth redirect query params from a {@link ParamMap}. Pure and
 * exported so the (load-bearing) presence/emptiness rules are unit-tested without a
 * router: a param that is present but blank is normalized to `null`.
 */
export function parseJiraOAuthParams(params: ParamMap): JiraOAuthParams {
  const read = (key: string): string | null => {
    const value = params.get(key)?.trim();
    return value ? value : null;
  };
  return { code: read('code'), state: read('state'), error: read('error') };
}

/** The screen the callback is currently showing. */
type View = 'exchanging' | 'sitePicker' | 'error';

/**
 * Chrome-less landing page for the Atlassian OAuth 2.0 redirect
 * (`settings/integrations/jira/callback`). The SPA is fully reloaded when Atlassian
 * redirects back here, so auth is restored by the silent-refresh APP_INITIALIZER
 * before this component runs.
 *
 * Flow: read `?code`/`?state`/`?error`. On `error` → toast + back to integrations.
 * Otherwise POST the code/state; a saved connection → success toast + back, while a
 * `{ sites }` result renders a site picker and re-POSTs with the chosen `cloudId`.
 * A 401 during the exchange (lost session) routes to sign-in.
 *
 * SECURITY: no OAuth token is ever read or held here — only the opaque authorization
 * `code` and signed `state` transit to the backend, which stores credentials server-side.
 */
@Component({
  selector: 'app-jira-oauth-callback',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmButton, HlmSpinner, TranslocoPipe],
  template: `
    <div class="grid min-h-dvh place-items-center p-6">
      <div class="flex w-full max-w-md flex-col items-center gap-6 text-center">
        @switch (view()) {
          @case ('exchanging') {
            <div class="flex flex-col items-center gap-4" data-testid="oauth-exchanging">
              <hlm-spinner class="h-8 w-8" />
              <p class="text-sm text-muted-foreground">
                {{ 'integrations.jira.oauth.exchanging' | transloco }}
              </p>
            </div>
          }

          @case ('sitePicker') {
            <div class="flex w-full flex-col gap-4" data-testid="oauth-site-picker">
              <div class="flex flex-col gap-1">
                <h1 class="text-lg font-semibold">
                  {{ 'integrations.jira.oauth.pickSiteTitle' | transloco }}
                </h1>
                <p class="text-sm text-muted-foreground">
                  {{ 'integrations.jira.oauth.pickSiteBody' | transloco }}
                </p>
              </div>
              <ul class="flex flex-col gap-2 text-left">
                @for (site of sites(); track site.cloudId) {
                  <li>
                    <button
                      hlmBtn
                      variant="outline"
                      type="button"
                      class="w-full justify-start"
                      [disabled]="exchanging()"
                      (click)="chooseSite(site)"
                      [attr.data-testid]="'oauth-site-' + site.cloudId"
                    >
                      <span class="flex flex-col items-start">
                        <span class="font-medium">{{ site.name }}</span>
                        <span class="text-xs text-muted-foreground break-all">{{ site.url }}</span>
                      </span>
                    </button>
                  </li>
                }
              </ul>
              @if (exchanging()) {
                <div class="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <hlm-spinner class="h-4 w-4" />
                  {{ 'integrations.jira.oauth.exchanging' | transloco }}
                </div>
              }
            </div>
          }

          @case ('error') {
            <div class="flex flex-col items-center gap-4" data-testid="oauth-error">
              <p class="text-sm text-destructive">{{ errorMessage() }}</p>
              <button hlmBtn variant="outline" type="button" (click)="back()">
                {{ 'integrations.jira.oauth.backToIntegrations' | transloco }}
              </button>
            </div>
          }
        }
      </div>
    </div>
  `,
})
export class JiraOAuthCallback {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(IntegrationsApiService);
  private readonly store = inject(AuthStore);
  private readonly transloco = inject(TranslocoService);
  private readonly toast = inject(ToastService);

  protected readonly view = signal<View>('exchanging');
  protected readonly exchanging = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly sites = signal<JiraSiteResponse[]>([]);

  /** The verified `state` from the redirect, replayed on a site-picker re-POST. */
  private state = '';
  /** The one-time authorization code, replayed on a site-picker re-POST. */
  private code = '';

  constructor() {
    const params = parseJiraOAuthParams(this.route.snapshot.queryParamMap);

    // Atlassian denied consent (or another provider error) — nothing to exchange.
    if (params.error) {
      this.toast.error(this.transloco.translate('integrations.jira.oauth.denied'));
      void this.router.navigateByUrl(INTEGRATIONS_PATH);
      return;
    }

    // Malformed return (missing code/state) — treat as a failed exchange.
    if (!params.code || !params.state) {
      this.fail(this.transloco.translate('errors.JIRA_OAUTH_STATE_INVALID'));
      return;
    }

    const orgId = this.store.organizationId();
    if (!orgId) {
      // Session/org lost across the reload — send them to sign in again.
      void this.router.navigate(['/auth/sign-in']);
      return;
    }

    this.code = params.code;
    this.state = params.state;
    this.exchange(orgId);
  }

  /** POST the current code/state (+ optional cloudId) and route on the result. */
  private exchange(orgId: string, cloudId?: string): void {
    this.exchanging.set(true);
    this.api.completeJiraOAuth(orgId, { code: this.code, state: this.state, cloudId }).subscribe({
      next: (result) => {
        this.exchanging.set(false);
        this.handleResult(result);
      },
      error: (err: HttpErrorResponse) => {
        this.exchanging.set(false);
        // A dropped session during the exchange → sign in, not an inline error.
        if (err.status === 401) {
          void this.router.navigate(['/auth/sign-in']);
          return;
        }
        this.fail(messageForError(err, this.transloco));
      },
    });
  }

  /** A saved connection → success + back; a `{ sites }` result → render the picker. */
  private handleResult(result: OAuthCallbackResult): void {
    if (isSitesResult(result)) {
      this.sites.set(result.sites);
      this.view.set('sitePicker');
      return;
    }
    this.toast.success(this.transloco.translate('integrations.jira.oauth.connected'));
    void this.router.navigateByUrl(INTEGRATIONS_PATH);
  }

  /** Re-POST the exchange bound to a chosen Atlassian site. */
  protected chooseSite(site: JiraSiteResponse): void {
    const orgId = this.store.organizationId();
    if (!orgId || this.exchanging()) return;
    this.exchange(orgId, site.cloudId);
  }

  protected back(): void {
    void this.router.navigateByUrl(INTEGRATIONS_PATH);
  }

  /** Show the error view with a translated message. */
  private fail(message: string): void {
    this.errorMessage.set(message);
    this.view.set('error');
  }
}
