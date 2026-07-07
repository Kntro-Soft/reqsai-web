import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { provideIcons } from '@ng-icons/core';
import { lucideCircleCheck, lucideCircleX } from '@ng-icons/lucide';
import { TranslocoPipe } from '@jsverse/transloco';
import { RouterLink } from '@angular/router';
import { AuthStore } from '../../../../core/auth/auth.store';
import { BillingStore } from '../../data/billing.store';
import { HlmButton, HlmIcon } from '../../../../shared/ui';

/**
 * Landing page shown after returning from the payment provider's hosted checkout. The route supplies
 * an `outcome` input via route data ('success' | 'cancel'). On success the subscription is refreshed —
 * the plan may already be active if the webhook has been processed, or arrive momentarily.
 */
@Component({
  selector: 'app-checkout-result',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe, RouterLink, HlmButton, HlmIcon],
  viewProviders: [provideIcons({ lucideCircleCheck, lucideCircleX })],
  template: `
    <div
      class="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-5 px-4 text-center"
    >
      @if (outcome() === 'success') {
        <hlm-icon name="lucideCircleCheck" size="48px" class="text-emerald-500" />
        <div class="flex flex-col gap-2">
          <h1 class="text-xl font-semibold">{{ 'billing.checkout.successTitle' | transloco }}</h1>
          <p class="text-sm text-muted-foreground">
            {{ 'billing.checkout.successBody' | transloco }}
          </p>
        </div>
      } @else {
        <hlm-icon name="lucideCircleX" size="48px" class="text-muted-foreground" />
        <div class="flex flex-col gap-2">
          <h1 class="text-xl font-semibold">{{ 'billing.checkout.cancelTitle' | transloco }}</h1>
          <p class="text-sm text-muted-foreground">
            {{ 'billing.checkout.cancelBody' | transloco }}
          </p>
        </div>
      }
      <a hlmBtn size="sm" routerLink="/settings/billing">
        {{ 'billing.checkout.backToBilling' | transloco }}
      </a>
    </div>
  `,
})
export class CheckoutResult {
  private readonly auth = inject(AuthStore);
  private readonly store = inject(BillingStore);

  /** 'success' or 'cancel', supplied by the route data. */
  readonly outcome = input<'success' | 'cancel'>('success');

  constructor() {
    const orgId = this.auth.organizationId();
    if (orgId) this.store.loadSubscription(orgId);
  }
}
