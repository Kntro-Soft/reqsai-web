import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { provideIcons } from '@ng-icons/core';
import {
  lucideBuilding2,
  lucideCircleCheckBig,
  lucideLogOut,
  lucideMailX,
  lucideTriangleAlert,
} from '@ng-icons/lucide';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthStore } from '../../../../core/auth/auth.store';
import { AuthService } from '../../../../core/auth/auth.service';
import { InvitationApiService } from '../../../../shared/data/invitation-api.service';
import { InvitationView } from '../../data/workspace.models';
import { ThemeToggle } from '../../../../shared/components/theme-toggle/theme-toggle';
import { LanguageSwitcher } from '../../../../shared/components/language-switcher/language-switcher';
import { Logo } from '../../../../shared/components/logo/logo';
import { AnimatedBackdrop } from '../../../../shared/components/animated-backdrop/animated-backdrop';
import { ToastService } from '../../../../shared/toast/toast.service';
import {
  HlmButton,
  HlmCard,
  HlmCardContent,
  HlmIcon,
  HlmSpinner,
} from '../../../../shared/ui';

/** Where the accept page lives; used to build the post-auth return URL. */
const ACCEPT_PATH = '/invitations/accept';

/** The screen the page is currently showing. Drives the single-view @switch below. */
type View =
  | 'loading'
  | 'notFound'
  | 'expired'
  | 'invalid'
  | 'accepted'
  | 'valid'
  | 'wrongAccount';

/**
 * Chrome-less invitation landing page (no shell, no auth guard). Reads the `token`
 * query param, resolves the invitation, and — depending on its status and whether the
 * visitor is signed in — offers Accept, Sign in / Create account, or an explanatory
 * dead-end. Modeled on the create-organization composition (backdrop + centered card).
 */
@Component({
  selector: 'app-accept-invitation',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    HlmButton,
    HlmCard,
    HlmCardContent,
    HlmIcon,
    HlmSpinner,
    TranslocoPipe,
    ThemeToggle,
    LanguageSwitcher,
    Logo,
    AnimatedBackdrop,
  ],
  viewProviders: [
    provideIcons({
      lucideBuilding2,
      lucideCircleCheckBig,
      lucideLogOut,
      lucideMailX,
      lucideTriangleAlert,
    }),
  ],
  template: `
    <div
      class="relative isolate grid min-h-dvh place-items-center overflow-hidden bg-background px-4 py-20 text-foreground"
    >
      <app-animated-backdrop />
      <img
        src="/assets/img/reqsai-combination-mark-original.webp"
        alt=""
        aria-hidden="true"
        class="pointer-events-none absolute -bottom-10 -left-10 w-64 opacity-[0.05] select-none dark:opacity-[0.08]"
      />

      <header
        class="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-5 py-4 md:px-6"
      >
        <app-logo [size]="28" />
        <div class="flex items-center gap-1">
          <app-language-switcher />
          <app-theme-toggle />
        </div>
      </header>

      <div class="relative z-1 w-full max-w-md">
        @switch (view()) {
          @case ('loading') {
            <div class="grid place-items-center py-16" data-testid="invite-loading">
              <hlm-spinner class="h-7 w-7" />
            </div>
          }

          @case ('valid') {
            <div class="mb-6 flex flex-col items-center gap-3 text-center">
              <span
                class="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary"
              >
                <hlm-icon name="lucideBuilding2" size="24px" />
              </span>
              <div>
                <h1 class="text-2xl font-bold tracking-tight">
                  {{ 'invitations.valid.title' | transloco }}
                </h1>
                <p class="mt-1.5 text-sm text-muted-foreground">
                  {{ 'invitations.valid.subtitle' | transloco }}
                </p>
              </div>
            </div>

            <div hlmCard>
              <div hlmCardContent class="flex flex-col gap-5 pt-6">
                <div class="flex flex-col gap-1 text-center">
                  <p class="text-sm text-muted-foreground">
                    {{ 'invitations.valid.invitedTo' | transloco }}
                  </p>
                  <p class="text-lg font-semibold">{{ invitation()?.organizationName }}</p>
                  <p class="text-sm text-muted-foreground">
                    {{ 'invitations.valid.asRole' | transloco }}
                    <span class="font-medium text-foreground">{{ roleLabel() }}</span>
                    @if (invitation()?.invitedByName) {
                      · {{ 'invitations.valid.by' | transloco }}
                      <span class="font-medium text-foreground">
                        {{ invitation()?.invitedByName }}
                      </span>
                    }
                  </p>
                  <p class="mt-1 text-xs text-muted-foreground">
                    {{ 'invitations.valid.forEmail' | transloco }}
                    <span class="font-medium text-foreground">{{ invitation()?.email }}</span>
                  </p>
                </div>

                @if (errorMessage()) {
                  <p class="text-center text-sm text-destructive" data-testid="invite-error">
                    {{ errorMessage() }}
                  </p>
                }

                @if (store.isAuthenticated()) {
                  <button
                    hlmBtn
                    type="button"
                    class="w-full"
                    [disabled]="accepting()"
                    (click)="accept()"
                    data-testid="invite-accept"
                  >
                    @if (accepting()) {
                      <hlm-spinner class="h-4 w-4" />
                    }
                    {{ 'invitations.valid.accept' | transloco }}
                  </button>
                } @else {
                  <div class="flex flex-col gap-2.5">
                    <a hlmBtn class="w-full" [routerLink]="'/auth/sign-in'" [queryParams]="signInParams()">
                      {{ 'invitations.valid.signIn' | transloco }}
                    </a>
                    <a
                      hlmBtn
                      variant="outline"
                      class="w-full"
                      [routerLink]="'/auth/sign-up'"
                      [queryParams]="signUpParams()"
                    >
                      {{ 'invitations.valid.createAccount' | transloco }}
                    </a>
                  </div>
                  <p class="text-center text-xs text-muted-foreground">
                    {{ 'invitations.valid.signUpNote' | transloco }}
                  </p>
                }
              </div>
            </div>
          }

          @case ('wrongAccount') {
            <div hlmCard>
              <div hlmCardContent class="flex flex-col items-center gap-5 pt-8 pb-2 text-center">
                <span
                  class="grid h-12 w-12 place-items-center rounded-2xl bg-amber-500/15 text-amber-600"
                >
                  <hlm-icon name="lucideTriangleAlert" size="24px" />
                </span>
                <div>
                  <h1 class="text-xl font-bold tracking-tight">
                    {{ 'invitations.wrongAccount.title' | transloco }}
                  </h1>
                  <p class="mt-1.5 text-sm text-muted-foreground">
                    {{
                      'invitations.wrongAccount.body'
                        | transloco: { yourEmail: currentEmail(), inviteEmail: invitation()?.email }
                    }}
                  </p>
                </div>
                <button
                  hlmBtn
                  variant="outline"
                  type="button"
                  class="w-full"
                  (click)="signOut()"
                  data-testid="invite-signout"
                >
                  <hlm-icon name="lucideLogOut" size="15px" />
                  {{ 'invitations.wrongAccount.signOut' | transloco }}
                </button>
              </div>
            </div>
          }

          @case ('accepted') {
            <div hlmCard>
              <div hlmCardContent class="flex flex-col items-center gap-5 pt-8 pb-2 text-center">
                <span
                  class="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary"
                >
                  <hlm-icon name="lucideCircleCheckBig" size="24px" />
                </span>
                <div>
                  <h1 class="text-xl font-bold tracking-tight">
                    {{ 'invitations.accepted.title' | transloco }}
                  </h1>
                  <p class="mt-1.5 text-sm text-muted-foreground">
                    {{ 'invitations.accepted.body' | transloco }}
                  </p>
                </div>
                <a hlmBtn class="w-full" [routerLink]="'/projects'">
                  {{ 'invitations.accepted.goToApp' | transloco }}
                </a>
              </div>
            </div>
          }

          @default {
            <div hlmCard>
              <div hlmCardContent class="flex flex-col items-center gap-5 pt-8 pb-2 text-center">
                <span
                  class="grid h-12 w-12 place-items-center rounded-2xl bg-muted text-muted-foreground"
                >
                  <hlm-icon name="lucideMailX" size="24px" />
                </span>
                <div>
                  <h1 class="text-xl font-bold tracking-tight">
                    {{ 'invitations.' + view() + '.title' | transloco }}
                  </h1>
                  <p class="mt-1.5 text-sm text-muted-foreground">
                    {{ 'invitations.' + view() + '.body' | transloco }}
                  </p>
                </div>
              </div>
            </div>
          }
        }
      </div>
    </div>
  `,
})
export class AcceptInvitation {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(InvitationApiService);
  private readonly auth = inject(AuthService);
  private readonly transloco = inject(TranslocoService);
  private readonly toast = inject(ToastService);
  protected readonly store = inject(AuthStore);

  private readonly token = this.route.snapshot.queryParamMap.get('token') ?? '';

  protected readonly invitation = signal<InvitationView | null>(null);
  protected readonly view = signal<View>('loading');
  protected readonly accepting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  /** The invited role, localized when it is one we recognize (falls back to the raw value). */
  protected readonly roleLabel = computed(() => {
    const role = this.invitation()?.role;
    if (role === 'ADMIN' || role === 'MEMBER' || role === 'OWNER') {
      return this.transloco.translate(`members.role.${role}`);
    }
    return role ?? '';
  });

  protected readonly currentEmail = computed(() => this.store.user()?.email ?? '');

  /** Post-auth return URL back to this accept page (preserves the token). */
  private readonly returnUrl = computed(() => `${ACCEPT_PATH}?token=${this.token}`);
  protected readonly signInParams = computed(() => ({ redirect: this.returnUrl() }));
  protected readonly signUpParams = computed(() => ({
    email: this.invitation()?.email ?? null,
    redirect: this.returnUrl(),
  }));

  constructor() {
    this.load();
  }

  private load(): void {
    if (!this.token) {
      this.view.set('notFound');
      return;
    }
    this.view.set('loading');
    this.api.getInvitation(this.token).subscribe({
      next: (inv) => {
        this.invitation.set(inv);
        this.view.set(this.resolveView(inv));
      },
      error: (err: HttpErrorResponse) =>
        this.view.set(err.status === 404 ? 'notFound' : 'invalid'),
    });
  }

  /** Maps an invitation's status/expiry onto the screen to show. */
  private resolveView(inv: InvitationView): View {
    if (inv.expired || inv.status === 'EXPIRED') return 'expired';
    if (inv.status === 'REVOKED' || inv.status === 'SUPERSEDED') return 'invalid';
    if (inv.status === 'ACCEPTED') return 'accepted';
    return 'valid';
  }

  protected accept(): void {
    if (this.accepting()) return;
    this.accepting.set(true);
    this.errorMessage.set(null);
    this.api.acceptInvitation(this.token).subscribe({
      next: (res) => {
        // Activate the joined organization, then land in it.
        this.auth.switchOrganization(res.organizationId).subscribe({
          next: () => {
            this.toast.success(
              this.transloco.translate('toast.invitationAccepted', {
                org: res.organizationName,
              }),
            );
            void this.router.navigate(['/projects']);
          },
          error: () => {
            // Membership is set even if activation failed; send them into the app anyway.
            this.toast.success(
              this.transloco.translate('toast.invitationAccepted', {
                org: res.organizationName,
              }),
            );
            void this.router.navigate(['/projects']);
          },
        });
      },
      error: (err: HttpErrorResponse) => {
        this.accepting.set(false);
        if (err.status === 403) {
          this.view.set('wrongAccount');
        } else if (err.status === 410) {
          this.view.set('expired');
        } else if (err.status === 404) {
          this.view.set('notFound');
        } else {
          this.errorMessage.set(this.transloco.translate('invitations.valid.acceptError'));
        }
      },
    });
  }

  protected signOut(): void {
    // logout() clears the session and navigates to sign-in; from there they can
    // return to this invite via the sign-in link once re-authenticated.
    this.auth.logout();
  }
}
