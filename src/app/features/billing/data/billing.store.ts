import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { BillingApiService } from './billing-api.service';
import {
  PlanChangeResponse,
  PlanType,
  SubscriptionResponse,
  SubscriptionUsageResponse,
} from './billing.models';

type LoadState = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Signal store for the active organization's subscription and usage. Mutations (upgrade / cancel /
 * reactivate) return the observable so pages own navigation, checkout redirection and per-action
 * error handling, mirroring {@link WorkspaceStore}.
 */
@Injectable({ providedIn: 'root' })
export class BillingStore {
  private readonly api = inject(BillingApiService);

  private readonly _subscription = signal<SubscriptionResponse | null>(null);
  private readonly _usage = signal<SubscriptionUsageResponse | null>(null);
  private readonly _subState = signal<LoadState>('idle');
  private readonly _usageState = signal<LoadState>('idle');

  readonly subscription = this._subscription.asReadonly();
  readonly usage = this._usage.asReadonly();
  readonly subState = this._subState.asReadonly();
  readonly usageState = this._usageState.asReadonly();

  readonly plan = computed<PlanType | null>(() => this._subscription()?.planType ?? null);
  readonly isCancelled = computed(() => this._subscription()?.status === 'CANCELLED');
  readonly isPaid = computed(() => {
    const plan = this._subscription()?.planType;
    return plan === 'PRO' || plan === 'ENTERPRISE';
  });

  loadSubscription(orgId: string): void {
    this._subState.set('loading');
    this.api.getSubscription(orgId).subscribe({
      next: (sub) => {
        this._subscription.set(sub);
        this._subState.set('ready');
      },
      error: () => this._subState.set('error'),
    });
  }

  loadUsage(orgId: string): void {
    this._usageState.set('loading');
    this.api.getUsage(orgId).subscribe({
      next: (usage) => {
        this._usage.set(usage);
        this._usageState.set('ready');
      },
      error: () => this._usageState.set('error'),
    });
  }

  upgrade(orgId: string, planType: PlanType): Observable<PlanChangeResponse> {
    return this.api.upgrade(orgId, { planType }).pipe(
      tap((result) => {
        // Only reflect an immediate (fake-gateway) activation; a pending checkout leaves the plan
        // unchanged until the webhook confirms.
        if (result.status === 'ACTIVATED') {
          this._subscription.set(result.subscription);
        }
      }),
    );
  }

  cancel(orgId: string): Observable<SubscriptionResponse> {
    return this.api.cancel(orgId).pipe(tap((sub) => this._subscription.set(sub)));
  }

  reactivate(orgId: string): Observable<SubscriptionResponse> {
    return this.api.reactivate(orgId).pipe(tap((sub) => this._subscription.set(sub)));
  }

  reset(): void {
    this._subscription.set(null);
    this._usage.set(null);
    this._subState.set('idle');
    this._usageState.set('idle');
  }
}
