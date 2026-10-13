import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { provideIcons } from '@ng-icons/core';
import {
  lucideCircleCheck,
  lucideExternalLink,
  lucidePlug,
  lucideSend,
  lucideSettings2,
  lucideTriangleAlert,
} from '@ng-icons/lucide';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthStore } from '../../../../core/auth/auth.store';
import { rememberReturnPath } from '../../../../core/navigation/return-path';
import { JIRA_RETURN_KEY } from '../../data/integrations.models';
import { JiraMark } from '../../../../shared/components/jira-mark/jira-mark';
import { GitHubConnection } from '../../../discovery/components/github-connection/github-connection';
import { IntegrationsApiService } from '../../data/integrations-api.service';
import { IntegrationConnectionResponse } from '../../data/integrations.models';
import { Modal } from '../../../../shared/components/modal/modal';
import { ToastService } from '../../../../shared/toast/toast.service';
import { messageForError } from '../../../../core/errors/error-message';
import {
  HlmButton,
  HlmIcon,
  HlmInput,
  HlmLabel,
  HlmSkeleton,
  HlmSpinner,
} from '../../../../shared/ui';

/**
 * Organization Integrations page — the real replacement for the "coming soon"
 * placeholder. One Jira card in the settings-card style (rounded-2xl border +
 * muted footer). When no connection exists it offers TWO connection methods: a
 * primary "Connect with Atlassian" OAuth 2.0 button (full-page redirect to
 * consent) and a collapsible API-token fallback form (site URL, email, API token)
 * with a token-creation link + field tooltips. Once connected it shows the
 * connection summary — labelled OAuth vs API token, email only when present — with
 * "Test connection" and "Disconnect" (confirm modal → DELETE).
 *
 * The OAuth button is disabled with a tooltip when the server reports
 * `JIRA_OAUTH_NOT_CONFIGURED` (probed once on load) so the page never hard-errors.
 *
 * SECURITY: the API token / OAuth tokens are never persisted client-side. The token
 * is only sent to the backend on submit and cleared from the form immediately after;
 * the OAuth flow only carries the opaque `code` + signed `state` (state is not a
 * secret) — no tokens transit the browser.
 */
@Component({
  selector: 'app-org-integrations',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    Modal,
    HlmButton,
    HlmIcon,
    HlmInput,
    HlmLabel,
    HlmSkeleton,
    HlmSpinner,
    TranslocoPipe,
    GitHubConnection,
    JiraMark,
  ],
  viewProviders: [
    provideIcons({
      lucideCircleCheck,
      lucideExternalLink,
      lucidePlug,
      lucideSend,
      lucideSettings2,
      lucideTriangleAlert,
    }),
  ],
  template: `
    <div class="flex flex-col gap-6">
      <div>
        <h1 class="text-2xl font-bold tracking-tight">{{ 'integrations.title' | transloco }}</h1>
        <p class="mt-1 text-sm text-muted-foreground">{{ 'integrations.subtitle' | transloco }}</p>
      </div>

      @if (state() === 'loading') {
        <section
          class="overflow-hidden rounded-2xl border border-border"
          data-testid="integrations-skeleton"
        >
          <div class="flex flex-col gap-3 p-5">
            <hlm-skeleton class="h-5 w-32" />
            <hlm-skeleton class="h-3 w-72 max-w-full" />
            <hlm-skeleton class="h-10 w-full max-w-md rounded-md" />
            <hlm-skeleton class="h-10 w-full max-w-md rounded-md" />
          </div>
          <div class="flex justify-end border-t border-border bg-muted/30 px-5 py-3">
            <hlm-skeleton class="h-8 w-28 rounded-md" />
          </div>
        </section>
      } @else if (state() === 'error') {
        <p class="text-sm text-destructive">{{ 'integrations.loadError' | transloco }}</p>
      } @else {
        <div class="grid gap-6 lg:grid-cols-2 lg:items-start">
          <section class="overflow-hidden rounded-2xl border border-border">
            <div class="flex flex-col gap-4 p-5">
              <div class="flex items-start gap-3">
                <span
                  class="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#0052CC] text-white"
                >
                  <app-jira-mark [size]="18" />
                </span>
                <div class="flex min-w-0 flex-col gap-1">
                  <h2 class="text-base font-semibold">
                    {{ 'integrations.jira.title' | transloco }}
                  </h2>
                  <p class="text-sm text-muted-foreground">
                    {{ 'integrations.jira.description' | transloco }}
                  </p>
                </div>
              </div>

              @if (connections().length > 0) {
                <ul class="flex flex-col gap-2" data-testid="jira-sites">
                  @for (conn of connections(); track conn.id) {
                    <li
                      class="flex flex-col gap-3 rounded-lg border border-border p-3"
                      data-testid="jira-connected"
                    >
                      <dl class="flex min-w-0 flex-1 flex-col gap-2 text-sm">
                        <div class="flex items-center gap-2">
                          @if (conn.status === 'CONNECTED') {
                            <hlm-icon
                              name="lucideCircleCheck"
                              size="16px"
                              class="text-emerald-500"
                            />
                            <span class="font-medium text-emerald-500">
                              {{ 'integrations.jira.statusConnected' | transloco }}
                            </span>
                          } @else {
                            <hlm-icon
                              name="lucideTriangleAlert"
                              size="16px"
                              class="text-destructive"
                            />
                            <span class="font-medium text-destructive">
                              {{ 'integrations.jira.statusError' | transloco }}
                            </span>
                          }
                        </div>
                        <div class="flex flex-wrap gap-x-6 gap-y-1">
                          <div class="flex flex-col">
                            <dt class="text-xs text-muted-foreground">
                              {{ 'integrations.jira.method' | transloco }}
                            </dt>
                            <dd class="font-medium">
                              @if (conn.credentialType === 'OAUTH2') {
                                {{ 'integrations.jira.methodOauth' | transloco }}
                              } @else {
                                {{ 'integrations.jira.methodApiToken' | transloco }}
                              }
                            </dd>
                          </div>
                          <div class="flex flex-col">
                            <dt class="text-xs text-muted-foreground">
                              {{ 'integrations.jira.siteUrl' | transloco }}
                            </dt>
                            <dd class="font-medium break-all">{{ conn.siteUrl }}</dd>
                          </div>
                          @if (conn.email) {
                            <div class="flex flex-col">
                              <dt class="text-xs text-muted-foreground">
                                {{ 'integrations.jira.email' | transloco }}
                              </dt>
                              <dd class="font-medium break-all">{{ conn.email }}</dd>
                            </div>
                          }
                          @if (conn.lastVerifiedAt) {
                            <div class="flex flex-col">
                              <dt class="text-xs text-muted-foreground">
                                {{ 'integrations.jira.lastVerified' | transloco }}
                              </dt>
                              <dd class="font-medium">{{ formatDate(conn.lastVerifiedAt) }}</dd>
                            </div>
                          }
                        </div>
                      </dl>
                      <div class="flex flex-wrap items-center gap-2">
                        <button
                          hlmBtn
                          size="sm"
                          variant="outline"
                          type="button"
                          (click)="test(conn)"
                          [disabled]="testing() === conn.id"
                          data-testid="jira-test"
                        >
                          @if (testing() === conn.id) {
                            <hlm-spinner class="h-4 w-4" />
                          }
                          {{ 'integrations.jira.test' | transloco }}
                        </button>
                        <button
                          hlmBtn
                          size="sm"
                          variant="ghost"
                          type="button"
                          class="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          (click)="askDisconnect(conn)"
                          data-testid="jira-disconnect"
                        >
                          {{ 'integrations.jira.disconnect' | transloco }}
                        </button>
                      </div>
                    </li>
                  }
                </ul>
              }

              @if (connections().length === 0 || addOpen()) {
                <!-- Primary: connect with Atlassian (OAuth 2.0) -->
                <div class="flex flex-col gap-2">
                  <button
                    hlmBtn
                    type="button"
                    class="w-full max-w-md"
                    (click)="connectOAuth()"
                    [disabled]="oauthDisabled() || redirecting()"
                    [attr.title]="
                      oauthDisabled()
                        ? ('integrations.jira.oauth.notConfiguredHint' | transloco)
                        : null
                    "
                    data-testid="jira-oauth-connect"
                  >
                    @if (redirecting()) {
                      <hlm-spinner class="h-4 w-4" />
                    }
                    {{ 'integrations.jira.oauth.connect' | transloco }}
                  </button>
                  @if (oauthDisabled()) {
                    <p
                      class="max-w-md text-xs text-muted-foreground"
                      data-testid="jira-oauth-disabled-hint"
                    >
                      {{ 'integrations.jira.oauth.notConfiguredHint' | transloco }}
                    </p>
                  }
                  <p class="max-w-md text-xs text-muted-foreground" data-testid="jira-site-hint">
                    {{ 'integrations.jira.needsSite' | transloco }}
                    <a
                      [href]="freeSiteUrl"
                      target="_blank"
                      rel="noopener"
                      class="font-medium text-primary hover:underline"
                    >
                      {{ 'integrations.jira.createSite' | transloco }}
                    </a>
                  </p>
                </div>

                <!-- Divider + collapsible API-token fallback -->
                <div class="flex items-center gap-3 max-w-md">
                  <span class="h-px flex-1 bg-border"></span>
                  <button
                    type="button"
                    class="text-xs font-medium text-muted-foreground hover:text-foreground"
                    (click)="tokenOpen.set(!tokenOpen())"
                    [attr.aria-expanded]="tokenOpen()"
                    data-testid="jira-token-toggle"
                  >
                    {{ 'integrations.jira.oauth.orUseToken' | transloco }}
                  </button>
                  <span class="h-px flex-1 bg-border"></span>
                </div>

                @if (tokenOpen()) {
                  <!-- Connect form (API-token fallback) -->
                  <form
                    [formGroup]="form"
                    (ngSubmit)="connect()"
                    class="flex flex-col gap-4"
                    data-testid="jira-connect-form"
                  >
                    <div class="flex flex-col gap-1.5">
                      <label hlmLabel for="siteUrl" class="flex items-center gap-1">
                        {{ 'integrations.jira.siteUrl' | transloco }}
                        <span
                          class="cursor-help text-muted-foreground"
                          [attr.title]="'integrations.jira.tooltips.siteUrl' | transloco"
                          aria-hidden="true"
                          >&#9432;</span
                        >
                      </label>
                      <input
                        hlmInput
                        id="siteUrl"
                        formControlName="siteUrl"
                        class="max-w-md"
                        placeholder="https://your-domain.atlassian.net"
                        autocomplete="off"
                        [attr.title]="'integrations.jira.tooltips.siteUrl' | transloco"
                        data-testid="jira-site-url"
                      />
                    </div>
                    <div class="flex flex-col gap-1.5">
                      <label hlmLabel for="email" class="flex items-center gap-1">
                        {{ 'integrations.jira.email' | transloco }}
                        <span
                          class="cursor-help text-muted-foreground"
                          [attr.title]="'integrations.jira.tooltips.email' | transloco"
                          aria-hidden="true"
                          >&#9432;</span
                        >
                      </label>
                      <input
                        hlmInput
                        id="email"
                        type="email"
                        formControlName="email"
                        class="max-w-md"
                        autocomplete="off"
                        [attr.title]="'integrations.jira.tooltips.email' | transloco"
                        data-testid="jira-email"
                      />
                    </div>
                    <div class="flex flex-col gap-1.5">
                      <label hlmLabel for="apiToken" class="flex items-center gap-1">
                        {{ 'integrations.jira.apiToken' | transloco }}
                        <span
                          class="cursor-help text-muted-foreground"
                          [attr.title]="'integrations.jira.tooltips.apiToken' | transloco"
                          aria-hidden="true"
                          >&#9432;</span
                        >
                      </label>
                      <input
                        hlmInput
                        id="apiToken"
                        type="password"
                        formControlName="apiToken"
                        class="max-w-md"
                        autocomplete="off"
                        [attr.title]="'integrations.jira.tooltips.apiToken' | transloco"
                        data-testid="jira-api-token"
                      />
                      <p class="text-xs text-muted-foreground">
                        {{ 'integrations.jira.apiTokenHint' | transloco }}
                      </p>
                      <a
                        [href]="apiTokenUrl"
                        target="_blank"
                        rel="noopener"
                        class="inline-flex w-fit items-center gap-1 text-xs font-medium text-primary hover:underline"
                        data-testid="jira-create-token-link"
                      >
                        <hlm-icon name="lucideExternalLink" size="12px" />
                        {{ 'integrations.jira.oauth.createToken' | transloco }}
                      </a>
                    </div>
                  </form>
                }
              }

              @if (errorMessage()) {
                <p class="text-sm text-destructive" data-testid="integrations-error">
                  {{ errorMessage() }}
                </p>
              }
            </div>

            @if (connections().length > 0 || tokenOpen()) {
              <div
                class="flex items-center justify-end gap-2 border-t border-border bg-muted/30 px-5 py-3"
              >
                @if (connections().length > 0 && !addOpen()) {
                  <button
                    hlmBtn
                    size="sm"
                    variant="outline"
                    type="button"
                    (click)="addOpen.set(true)"
                    data-testid="jira-add-site"
                  >
                    <app-jira-mark [size]="15" />
                    {{ 'integrations.jira.addSite' | transloco }}
                  </button>
                } @else {
                  @if (connections().length > 0) {
                    <button
                      hlmBtn
                      size="sm"
                      variant="ghost"
                      type="button"
                      (click)="addOpen.set(false); tokenOpen.set(false)"
                    >
                      {{ 'common.cancel' | transloco }}
                    </button>
                  }
                  @if (tokenOpen()) {
                    <button
                      hlmBtn
                      size="sm"
                      type="button"
                      (click)="connect()"
                      [disabled]="form.invalid || connecting()"
                      data-testid="jira-connect"
                    >
                      @if (connecting()) {
                        <hlm-spinner class="h-4 w-4" />
                      }
                      {{ 'integrations.jira.connect' | transloco }}
                    </button>
                  }
                }
              </div>
            }
          </section>

          <!-- Informational side panel: how the Jira integration works -->
          <aside
            class="rounded-2xl border border-border bg-muted/20 p-5"
            data-testid="jira-info-panel"
          >
            <h2 class="text-base font-semibold">
              {{ 'integrations.jira.howItWorks.title' | transloco }}
            </h2>

            <ol class="mt-4 flex flex-col gap-4">
              <li class="flex gap-3">
                <span
                  class="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted-foreground"
                >
                  <hlm-icon name="lucidePlug" size="14px" />
                </span>
                <p class="text-sm text-muted-foreground">
                  {{ 'integrations.jira.howItWorks.step1' | transloco }}
                </p>
              </li>
              <li class="flex gap-3">
                <span
                  class="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted-foreground"
                >
                  <hlm-icon name="lucideSettings2" size="14px" />
                </span>
                <p class="text-sm text-muted-foreground">
                  {{ 'integrations.jira.howItWorks.step2' | transloco }}
                </p>
              </li>
              <li class="flex gap-3">
                <span
                  class="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted-foreground"
                >
                  <hlm-icon name="lucideSend" size="14px" />
                </span>
                <p class="text-sm text-muted-foreground">
                  {{ 'integrations.jira.howItWorks.step3' | transloco }}
                </p>
              </li>
            </ol>

            <div class="mt-5 rounded-lg border border-border bg-background p-3">
              <p class="text-xs font-medium">
                {{ 'integrations.jira.howItWorks.whatSyncsTitle' | transloco }}
              </p>
              <p class="mt-1 text-xs text-muted-foreground">
                {{ 'integrations.jira.howItWorks.whatSyncs' | transloco }}
              </p>
            </div>

            <p class="mt-4 text-xs text-muted-foreground">
              {{ 'integrations.jira.howItWorks.oauthHint' | transloco }}
            </p>
            <a
              [href]="apiTokenDocsUrl"
              target="_blank"
              rel="noopener"
              class="mt-2 inline-flex w-fit items-center gap-1 text-xs font-medium text-primary hover:underline"
              data-testid="jira-learn-more-link"
            >
              <hlm-icon name="lucideExternalLink" size="12px" />
              {{ 'integrations.jira.howItWorks.learnMore' | transloco }}
            </a>
          </aside>
        </div>

        @if (orgId(); as id) {
          <app-github-connection [orgId]="id" />
        }

        <!-- Disconnect confirm modal -->
        <app-modal [(open)]="disconnectOpen">
          <span modalTitle>{{ 'integrations.jira.disconnectTitle' | transloco }}</span>
          <p>{{ 'integrations.jira.disconnectBody' | transloco }}</p>
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
            (click)="disconnect()"
            [disabled]="disconnecting()"
            data-testid="jira-disconnect-confirm"
          >
            @if (disconnecting()) {
              <hlm-spinner class="h-4 w-4" />
            }
            {{ 'integrations.jira.disconnect' | transloco }}
          </button>
        </app-modal>
      }
    </div>
  `,
})
export class OrgIntegrations {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(IntegrationsApiService);
  private readonly store = inject(AuthStore);
  private readonly transloco = inject(TranslocoService);
  private readonly toast = inject(ToastService);

  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly connecting = signal(false);
  /** The connection being tested, if any. */
  protected readonly testing = signal<string | null>(null);
  protected readonly disconnecting = signal(false);
  protected readonly disconnectOpen = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  /** The organization's Jira sites, newest first. */
  protected readonly connections = signal<IntegrationConnectionResponse[]>([]);
  /** The site the disconnect dialog is about. */
  private readonly disconnectTarget = signal<IntegrationConnectionResponse | null>(null);
  /** Whether the connect options are open next to sites that already exist. */
  protected readonly addOpen = signal(false);

  /** Whether the browser is mid-redirect to Atlassian's consent screen. */
  protected readonly redirecting = signal(false);
  /** True when the server has no Atlassian OAuth app configured — the button is disabled. */
  protected readonly oauthDisabled = signal(false);
  /** Whether the API-token fallback form is expanded. */
  protected readonly tokenOpen = signal(false);

  /** Where to create a free Jira Cloud site (opens in a new tab). */
  protected readonly freeSiteUrl = 'https://www.atlassian.com/software/jira/free';

  /** Where users mint an Atlassian API token (opens in a new tab). */
  protected readonly apiTokenUrl = 'https://id.atlassian.com/manage-profile/security/api-tokens';

  protected readonly orgId = computed(() => this.store.organizationId());
  /** Atlassian's own docs on managing API tokens (opens in a new tab). */
  protected readonly apiTokenDocsUrl =
    'https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account/';

  protected readonly form = this.fb.nonNullable.group({
    siteUrl: ['', [Validators.required, Validators.maxLength(500)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(255)]],
    apiToken: ['', [Validators.required, Validators.maxLength(500)]],
  });

  constructor() {
    const orgId = this.store.organizationId();
    if (!orgId) {
      this.state.set('error');
      return;
    }
    this.api.listConnections(orgId).subscribe({
      next: (connections) => {
        this.connections.set(connections.filter((c) => c.provider === 'JIRA'));
        this.state.set('ready');
        this.probeOAuthAvailability(orgId);
      },
      error: () => this.state.set('error'),
    });
  }

  /**
   * Probe the authorize-url endpoint once to learn whether the server has an
   * Atlassian OAuth app configured. `JIRA_OAUTH_NOT_CONFIGURED` disables the button
   * with an explanatory tooltip rather than hard-erroring the page. The probed
   * `state`/`url` are discarded — a fresh one is minted on the actual click.
   */
  private probeOAuthAvailability(orgId: string): void {
    this.api.getJiraAuthorizeUrl(orgId).subscribe({
      next: () => this.oauthDisabled.set(false),
      error: (err: HttpErrorResponse) => {
        const code = (err.error as { code?: unknown } | null)?.code;
        if (code === 'JIRA_OAUTH_NOT_CONFIGURED') this.oauthDisabled.set(true);
        // Any other error: leave the button enabled — the click will surface it.
      },
    });
  }

  /**
   * Fetch a fresh Atlassian consent URL and full-page-redirect to it. The signed
   * `state` round-trips through the URL; we stash it in sessionStorage purely to
   * double-check on return (it is NOT a secret). No token is involved here.
   */
  protected connectOAuth(): void {
    const orgId = this.store.organizationId();
    if (!orgId || this.oauthDisabled() || this.redirecting()) return;
    this.redirecting.set(true);
    this.errorMessage.set(null);
    this.api.getJiraAuthorizeUrl(orgId).subscribe({
      next: (res) => {
        try {
          sessionStorage.setItem('jira_oauth_state', res.state);
        } catch {
          // Private mode / storage disabled — the backend still verifies state.
        }
        rememberReturnPath(JIRA_RETURN_KEY, '/settings/integrations');
        window.location.href = res.url;
      },
      error: (err: HttpErrorResponse) => {
        this.redirecting.set(false);
        const code = (err.error as { code?: unknown } | null)?.code;
        if (code === 'JIRA_OAUTH_NOT_CONFIGURED') this.oauthDisabled.set(true);
        const message = messageForError(err, this.transloco);
        this.errorMessage.set(message);
        this.toast.error(message);
      },
    });
  }

  protected connect(): void {
    const orgId = this.store.organizationId();
    if (!orgId || this.form.invalid || this.connecting()) return;
    this.connecting.set(true);
    this.errorMessage.set(null);
    const { siteUrl, email, apiToken } = this.form.getRawValue();
    this.api
      .createJiraConnection(orgId, { siteUrl: siteUrl.trim(), email: email.trim(), apiToken })
      .subscribe({
        next: (conn) => {
          this.connecting.set(false);
          // Never keep the token around — clear the whole form once submitted.
          this.form.reset();
          this.connections.update((list) => [conn, ...list]);
          this.addOpen.set(false);
          this.tokenOpen.set(false);
          this.toast.success(this.transloco.translate('integrations.jira.connected'));
        },
        error: (err: HttpErrorResponse) => {
          this.connecting.set(false);
          // Drop the token even on failure so it never lingers in the field.
          this.form.controls.apiToken.reset();
          const message = messageForError(err, this.transloco);
          this.errorMessage.set(message);
          this.toast.error(message);
        },
      });
  }

  protected test(conn: IntegrationConnectionResponse): void {
    const orgId = this.store.organizationId();
    if (!orgId || this.testing()) return;
    this.testing.set(conn.id);
    this.errorMessage.set(null);
    this.api.testConnection(orgId, conn.id).subscribe({
      next: (result) => {
        this.testing.set(null);
        const message = result.accountName
          ? this.transloco.translate('integrations.jira.testOkNamed', { name: result.accountName })
          : this.transloco.translate('integrations.jira.testOk');
        this.toast.success(message);
      },
      error: (err: HttpErrorResponse) => {
        this.testing.set(null);
        const message = messageForError(err, this.transloco);
        this.errorMessage.set(message);
        this.toast.error(message);
      },
    });
  }

  protected askDisconnect(conn: IntegrationConnectionResponse): void {
    this.disconnectTarget.set(conn);
    this.disconnectOpen.set(true);
  }

  protected disconnect(): void {
    const orgId = this.store.organizationId();
    const conn = this.disconnectTarget();
    if (!orgId || !conn || this.disconnecting()) return;
    this.disconnecting.set(true);
    this.errorMessage.set(null);
    this.api.deleteConnection(orgId, conn.id).subscribe({
      next: () => {
        this.disconnecting.set(false);
        this.disconnectOpen.set(false);
        this.connections.update((list) => list.filter((c) => c.id !== conn.id));
        this.disconnectTarget.set(null);
        this.toast.success(this.transloco.translate('integrations.jira.disconnected'));
      },
      error: (err: HttpErrorResponse) => {
        this.disconnecting.set(false);
        const message = messageForError(err, this.transloco);
        this.errorMessage.set(message);
        this.toast.error(message);
      },
    });
  }

  protected formatDate(iso: string): string {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
  }
}
