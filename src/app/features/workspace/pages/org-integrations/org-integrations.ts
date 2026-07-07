import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { provideIcons } from '@ng-icons/core';
import { lucideCircleCheck, lucideTriangleAlert } from '@ng-icons/lucide';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthStore } from '../../../../core/auth/auth.store';
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
 * muted footer): when no connection exists it shows a connect form (site URL,
 * email, API token); once connected it shows the connection summary with a
 * "Test connection" and a "Disconnect" action (confirm modal → DELETE).
 *
 * SECURITY: the API token is only ever sent to the backend on submit and is
 * cleared from the form immediately after — it is never persisted or held in any
 * signal/component state.
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
  ],
  viewProviders: [provideIcons({ lucideCircleCheck, lucideTriangleAlert })],
  template: `
    <div class="flex flex-col gap-6">
      <div>
        <h1 class="text-2xl font-bold tracking-tight">{{ 'integrations.title' | transloco }}</h1>
        <p class="mt-1 text-sm text-muted-foreground">{{ 'integrations.subtitle' | transloco }}</p>
      </div>

      @if (state() === 'loading') {
        <section class="overflow-hidden rounded-2xl border border-border" data-testid="integrations-skeleton">
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
        <section class="overflow-hidden rounded-2xl border border-border">
          <div class="flex flex-col gap-4 p-5">
            <div class="flex flex-col gap-1">
              <h2 class="text-base font-semibold">{{ 'integrations.jira.title' | transloco }}</h2>
              <p class="text-sm text-muted-foreground">
                {{ 'integrations.jira.description' | transloco }}
              </p>
            </div>

            @if (connection(); as conn) {
              <!-- Connected state -->
              <dl class="flex flex-col gap-2 text-sm" data-testid="jira-connected">
                <div class="flex items-center gap-2">
                  @if (conn.status === 'CONNECTED') {
                    <hlm-icon name="lucideCircleCheck" size="16px" class="text-emerald-500" />
                    <span class="font-medium text-emerald-500">
                      {{ 'integrations.jira.statusConnected' | transloco }}
                    </span>
                  } @else {
                    <hlm-icon name="lucideTriangleAlert" size="16px" class="text-destructive" />
                    <span class="font-medium text-destructive">
                      {{ 'integrations.jira.statusError' | transloco }}
                    </span>
                  }
                </div>
                <div class="flex flex-wrap gap-x-6 gap-y-1">
                  <div class="flex flex-col">
                    <dt class="text-xs text-muted-foreground">
                      {{ 'integrations.jira.siteUrl' | transloco }}
                    </dt>
                    <dd class="font-medium break-all">{{ conn.siteUrl }}</dd>
                  </div>
                  <div class="flex flex-col">
                    <dt class="text-xs text-muted-foreground">
                      {{ 'integrations.jira.email' | transloco }}
                    </dt>
                    <dd class="font-medium break-all">{{ conn.email }}</dd>
                  </div>
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
            } @else {
              <!-- Connect form -->
              <form
                [formGroup]="form"
                (ngSubmit)="connect()"
                class="flex flex-col gap-4"
                data-testid="jira-connect-form"
              >
                <div class="flex flex-col gap-1.5">
                  <label hlmLabel for="siteUrl">{{ 'integrations.jira.siteUrl' | transloco }}</label>
                  <input
                    hlmInput
                    id="siteUrl"
                    formControlName="siteUrl"
                    class="max-w-md"
                    placeholder="https://your-domain.atlassian.net"
                    autocomplete="off"
                    data-testid="jira-site-url"
                  />
                </div>
                <div class="flex flex-col gap-1.5">
                  <label hlmLabel for="email">{{ 'integrations.jira.email' | transloco }}</label>
                  <input
                    hlmInput
                    id="email"
                    type="email"
                    formControlName="email"
                    class="max-w-md"
                    autocomplete="off"
                    data-testid="jira-email"
                  />
                </div>
                <div class="flex flex-col gap-1.5">
                  <label hlmLabel for="apiToken">
                    {{ 'integrations.jira.apiToken' | transloco }}
                  </label>
                  <input
                    hlmInput
                    id="apiToken"
                    type="password"
                    formControlName="apiToken"
                    class="max-w-md"
                    autocomplete="off"
                    data-testid="jira-api-token"
                  />
                  <p class="text-xs text-muted-foreground">
                    {{ 'integrations.jira.apiTokenHint' | transloco }}
                  </p>
                </div>
              </form>
            }

            @if (errorMessage()) {
              <p class="text-sm text-destructive" data-testid="integrations-error">
                {{ errorMessage() }}
              </p>
            }
          </div>

          <div class="flex items-center justify-end gap-2 border-t border-border bg-muted/30 px-5 py-3">
            @if (connection()) {
              <button
                hlmBtn
                size="sm"
                variant="outline"
                type="button"
                (click)="test()"
                [disabled]="testing()"
                data-testid="jira-test"
              >
                @if (testing()) {
                  <hlm-spinner class="h-4 w-4" />
                }
                {{ 'integrations.jira.test' | transloco }}
              </button>
              <button
                hlmBtn
                size="sm"
                variant="destructive"
                type="button"
                (click)="disconnectOpen.set(true)"
                data-testid="jira-disconnect"
              >
                {{ 'integrations.jira.disconnect' | transloco }}
              </button>
            } @else {
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
          </div>
        </section>

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
  protected readonly testing = signal(false);
  protected readonly disconnecting = signal(false);
  protected readonly disconnectOpen = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  /** The current Jira connection, or null when none is configured. */
  protected readonly connection = signal<IntegrationConnectionResponse | null>(null);

  protected readonly orgId = computed(() => this.store.organizationId());

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
        this.connection.set(connections.find((c) => c.provider === 'JIRA') ?? null);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
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
          this.connection.set(conn);
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

  protected test(): void {
    const orgId = this.store.organizationId();
    const conn = this.connection();
    if (!orgId || !conn || this.testing()) return;
    this.testing.set(true);
    this.errorMessage.set(null);
    this.api.testConnection(orgId, conn.id).subscribe({
      next: (result) => {
        this.testing.set(false);
        const message = result.accountName
          ? this.transloco.translate('integrations.jira.testOkNamed', { name: result.accountName })
          : this.transloco.translate('integrations.jira.testOk');
        this.toast.success(message);
      },
      error: (err: HttpErrorResponse) => {
        this.testing.set(false);
        const message = messageForError(err, this.transloco);
        this.errorMessage.set(message);
        this.toast.error(message);
      },
    });
  }

  protected disconnect(): void {
    const orgId = this.store.organizationId();
    const conn = this.connection();
    if (!orgId || !conn || this.disconnecting()) return;
    this.disconnecting.set(true);
    this.errorMessage.set(null);
    this.api.deleteConnection(orgId, conn.id).subscribe({
      next: () => {
        this.disconnecting.set(false);
        this.disconnectOpen.set(false);
        this.connection.set(null);
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
