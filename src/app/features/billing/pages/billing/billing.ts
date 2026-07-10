import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { provideIcons } from '@ng-icons/core';
import { lucideCheck, lucideCircleAlert } from '@ng-icons/lucide';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthStore } from '../../../../core/auth/auth.store';
import { messageForError } from '../../../../core/errors/error-message';
import { ToastService } from '../../../../shared/toast/toast.service';
import { Modal } from '../../../../shared/components/modal/modal';
import {
  HlmBadge,
  HlmButton,
  HlmIcon,
  HlmSkeleton,
  HlmSpinner,
  BadgeVariant,
} from '../../../../shared/ui';
import { BillingStore } from '../../data/billing.store';
import { PlanType, SubscriptionStatus } from '../../data/billing.models';
import { PLAN_CATALOG, PLAN_ORDER, PlanDefinition, isUpgrade } from '../../data/billing-plans';

const STATUS_VARIANT: Record<SubscriptionStatus, BadgeVariant> = {
  ACTIVE: 'success',
  CANCELLED: 'warning',
  PAST_DUE: 'destructive',
  TRIALING: 'secondary',
};

/**
 * Organization billing page (Settings → Billing). Owner-only (enforced by the backend). Shows the
 * current plan with its status and renewal, a grid of the available tiers for upgrade, and cancel /
 * reactivate actions. Upgrades activate immediately with the fake gateway, or redirect to Stripe
 * hosted checkout when the response asks for it.
 */
@Component({
  selector: 'app-billing',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    DecimalPipe,
    TranslocoPipe,
    Modal,
    HlmBadge,
    HlmButton,
    HlmIcon,
    HlmSkeleton,
    HlmSpinner,
  ],
  viewProviders: [provideIcons({ lucideCheck, lucideCircleAlert })],
  template: `
    <div class="flex flex-col gap-6">
      @if (subState() === 'loading') {
        <div class="flex flex-col gap-6" data-testid="billing-skeleton">
          <section class="overflow-hidden rounded-2xl border border-border">
            <div class="flex flex-col gap-3 p-5">
              <hlm-skeleton class="h-5 w-40" />
              <hlm-skeleton class="h-3 w-64 max-w-full" />
            </div>
          </section>
          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            @for (i of [0, 1, 2]; track i) {
              <hlm-skeleton class="h-72 w-full rounded-2xl" />
            }
          </div>
        </div>
      } @else if (subState() === 'error') {
        <div
          class="flex items-start gap-3 rounded-2xl border border-destructive/40 bg-destructive/5 p-5 text-sm"
          role="alert"
        >
          <hlm-icon name="lucideCircleAlert" size="18px" class="mt-0.5 shrink-0 text-destructive" />
          <p class="text-muted-foreground">{{ 'billing.loadError' | transloco }}</p>
        </div>
      } @else if (subscription(); as sub) {
        <!-- Current plan -->
        <section class="overflow-hidden rounded-2xl border border-border">
          <div class="flex flex-wrap items-start justify-between gap-4 p-5">
            <div class="flex flex-col gap-1.5">
              <div class="flex items-center gap-2">
                <h2 class="text-base font-semibold">
                  {{ 'billing.planName.' + sub.planType | transloco }}
                </h2>
                <span hlmBadge [variant]="statusVariant()">
                  {{ 'billing.status.' + sub.status | transloco }}
                </span>
              </div>
              <p class="text-sm text-muted-foreground">
                @if (sub.status === 'CANCELLED') {
                  {{
                    'billing.cancelsOn'
                      | transloco: { date: sub.currentPeriodEnd | date: 'mediumDate' }
                  }}
                } @else if (sub.planType === 'FREE') {
                  {{ 'billing.freeDesc' | transloco }}
                } @else {
                  {{
                    'billing.renewsOn'
                      | transloco: { date: sub.currentPeriodEnd | date: 'mediumDate' }
                  }}
                }
              </p>
            </div>
            <div class="flex items-center gap-2">
              @if (isCancelled()) {
                <button hlmBtn size="sm" type="button" (click)="reactivate()" [disabled]="acting()">
                  @if (acting()) {
                    <hlm-spinner class="h-4 w-4" />
                  }
                  {{ 'billing.reactivate' | transloco }}
                </button>
              } @else if (isPaid()) {
                <button
                  hlmBtn
                  size="sm"
                  variant="outline"
                  type="button"
                  (click)="cancelOpen.set(true)"
                  [disabled]="acting()"
                >
                  {{ 'billing.cancel' | transloco }}
                </button>
              }
            </div>
          </div>
        </section>

        <!-- Plan grid -->
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          @for (plan of plans; track plan.type) {
            <section
              class="flex flex-col overflow-hidden rounded-2xl border"
              [class.border-primary]="plan.type === sub.planType"
              [class.border-border]="plan.type !== sub.planType"
            >
              <div class="flex flex-1 flex-col gap-4 p-5">
                <div class="flex items-center justify-between">
                  <h3 class="text-base font-semibold">
                    {{ 'billing.planName.' + plan.type | transloco }}
                  </h3>
                  @if (plan.type === sub.planType) {
                    <span hlmBadge variant="secondary">{{ 'billing.current' | transloco }}</span>
                  }
                </div>
                <div class="flex items-baseline gap-1">
                  <span class="text-2xl font-bold">{{
                    formatPrice(plan.priceCents, plan.currency)
                  }}</span>
                  @if (plan.priceCents > 0) {
                    <span class="text-sm text-muted-foreground">{{
                      'billing.perMonth' | transloco
                    }}</span>
                  }
                </div>
                <ul class="flex flex-col gap-2 text-sm">
                  <li class="flex items-center gap-2">
                    <hlm-icon name="lucideCheck" size="15px" class="shrink-0 text-emerald-500" />
                    {{
                      'billing.feature.tokens'
                        | transloco: { count: (plan.limits.maxTokensPerMonth | number) }
                    }}
                  </li>
                  <li class="flex items-center gap-2">
                    <hlm-icon name="lucideCheck" size="15px" class="shrink-0 text-emerald-500" />
                    {{
                      'billing.feature.projects'
                        | transloco: { count: (plan.limits.maxProjects | number) }
                    }}
                  </li>
                  <li class="flex items-center gap-2">
                    <hlm-icon name="lucideCheck" size="15px" class="shrink-0 text-emerald-500" />
                    {{
                      'billing.feature.members'
                        | transloco: { count: (plan.limits.maxMembers | number) }
                    }}
                  </li>
                  <li class="flex items-center gap-2">
                    <hlm-icon name="lucideCheck" size="15px" class="shrink-0 text-emerald-500" />
                    {{
                      'billing.feature.documents'
                        | transloco: { count: (plan.limits.maxDocumentsPerProject | number) }
                    }}
                  </li>
                  <li class="flex items-center gap-2">
                    <hlm-icon name="lucideCheck" size="15px" class="shrink-0 text-emerald-500" />
                    {{
                      'billing.feature.glossary'
                        | transloco: { count: (plan.limits.maxGlossaryTermsPerProject | number) }
                    }}
                  </li>
                </ul>
              </div>
              <div class="border-t border-border bg-muted/30 px-5 py-3">
                @if (plan.type === sub.planType) {
                  <button hlmBtn size="sm" class="w-full" type="button" disabled>
                    {{ 'billing.current' | transloco }}
                  </button>
                } @else if (canUpgradeTo(plan.type)) {
                  <button
                    hlmBtn
                    size="sm"
                    class="w-full"
                    type="button"
                    (click)="openUpgrade(plan.type)"
                    [disabled]="acting()"
                  >
                    {{
                      'billing.upgradeTo'
                        | transloco: { plan: ('billing.planName.' + plan.type | transloco) }
                    }}
                  </button>
                } @else {
                  <button hlmBtn size="sm" variant="ghost" class="w-full" type="button" disabled>
                    {{ 'billing.included' | transloco }}
                  </button>
                }
              </div>
            </section>
          }
        </div>

        <!-- Upgrade confirmation modal -->
        <app-modal [(open)]="upgradeOpen">
          <span modalTitle>{{ 'billing.upgradeModalTitle' | transloco }}</span>
          @if (upgradeTarget(); as target) {
            <p>
              {{
                'billing.upgradeModalBody'
                  | transloco
                    : {
                        plan: ('billing.planName.' + target | transloco),
                        price: formatPrice(catalog(target).priceCents, catalog(target).currency),
                      }
              }}
            </p>
          }
          <div modalFooter class="flex w-full items-center justify-between gap-2">
            <button hlmBtn size="sm" variant="ghost" type="button" (click)="upgradeOpen.set(false)">
              {{ 'common.cancel' | transloco }}
            </button>
            <button hlmBtn size="sm" type="button" (click)="confirmUpgrade()" [disabled]="acting()">
              @if (acting()) {
                <hlm-spinner class="h-4 w-4" />
              }
              {{ 'billing.confirmUpgrade' | transloco }}
            </button>
          </div>
        </app-modal>

        <!-- Cancel confirmation modal -->
        <app-modal [(open)]="cancelOpen">
          <span modalTitle>{{ 'billing.cancelModalTitle' | transloco }}</span>
          <p>
            {{
              'billing.cancelModalBody'
                | transloco: { date: sub.currentPeriodEnd | date: 'mediumDate' }
            }}
          </p>
          <div modalFooter class="flex w-full items-center justify-between gap-2">
            <button hlmBtn size="sm" variant="ghost" type="button" (click)="cancelOpen.set(false)">
              {{ 'billing.keepPlan' | transloco }}
            </button>
            <button
              hlmBtn
              size="sm"
              variant="destructive"
              type="button"
              (click)="confirmCancel()"
              [disabled]="acting()"
            >
              @if (acting()) {
                <hlm-spinner class="h-4 w-4" />
              }
              {{ 'billing.cancel' | transloco }}
            </button>
          </div>
        </app-modal>
      }
    </div>
  `,
})
export class Billing {
  private readonly auth = inject(AuthStore);
  private readonly store = inject(BillingStore);
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);

  protected readonly plans: PlanDefinition[] = PLAN_ORDER.map((t) => PLAN_CATALOG[t]);

  protected readonly subscription = this.store.subscription;
  protected readonly subState = this.store.subState;
  protected readonly isCancelled = this.store.isCancelled;
  protected readonly isPaid = this.store.isPaid;

  protected readonly acting = signal(false);
  protected readonly upgradeOpen = signal(false);
  protected readonly cancelOpen = signal(false);
  protected readonly upgradeTarget = signal<PlanType | null>(null);

  protected readonly statusVariant = computed<BadgeVariant>(() => {
    const status = this.subscription()?.status;
    return status ? STATUS_VARIANT[status] : 'secondary';
  });

  constructor() {
    const orgId = this.auth.organizationId();
    if (orgId) this.store.loadSubscription(orgId);
  }

  protected catalog(type: PlanType): PlanDefinition {
    return PLAN_CATALOG[type];
  }

  protected canUpgradeTo(type: PlanType): boolean {
    const current = this.subscription()?.planType;
    return !!current && isUpgrade(current, type);
  }

  protected formatPrice(cents: number, currency: string): string {
    if (cents === 0) return this.transloco.translate('billing.free');
    return new Intl.NumberFormat(this.transloco.getActiveLang(), {
      style: 'currency',
      currency,
    }).format(cents / 100);
  }

  protected openUpgrade(type: PlanType): void {
    this.upgradeTarget.set(type);
    this.upgradeOpen.set(true);
  }

  protected confirmUpgrade(): void {
    const orgId = this.auth.organizationId();
    const target = this.upgradeTarget();
    if (!orgId || !target || this.acting()) return;
    this.acting.set(true);
    this.store.upgrade(orgId, target).subscribe({
      next: (result) => {
        this.acting.set(false);
        this.upgradeOpen.set(false);
        if (result.status === 'CHECKOUT_REQUIRED' && result.checkoutUrl) {
          // Hand off to the payment provider's hosted checkout.
          window.location.href = result.checkoutUrl;
          return;
        }
        this.toast.success(this.transloco.translate('billing.upgradeSuccess'));
      },
      error: (err: HttpErrorResponse) => {
        this.acting.set(false);
        this.toast.error(messageForError(err, this.transloco));
      },
    });
  }

  protected confirmCancel(): void {
    const orgId = this.auth.organizationId();
    if (!orgId || this.acting()) return;
    this.acting.set(true);
    this.store.cancel(orgId).subscribe({
      next: () => {
        this.acting.set(false);
        this.cancelOpen.set(false);
        this.toast.success(this.transloco.translate('billing.cancelSuccess'));
      },
      error: (err: HttpErrorResponse) => {
        this.acting.set(false);
        this.toast.error(messageForError(err, this.transloco));
      },
    });
  }

  protected reactivate(): void {
    const orgId = this.auth.organizationId();
    if (!orgId || this.acting()) return;
    this.acting.set(true);
    this.store.reactivate(orgId).subscribe({
      next: () => {
        this.acting.set(false);
        this.toast.success(this.transloco.translate('billing.reactivateSuccess'));
      },
      error: (err: HttpErrorResponse) => {
        this.acting.set(false);
        this.toast.error(messageForError(err, this.transloco));
      },
    });
  }
}
