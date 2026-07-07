import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  PlanChangeResponse,
  SubscriptionResponse,
  SubscriptionUsageResponse,
  UpgradeSubscriptionRequest,
} from './billing.models';

/**
 * Thin HTTP client for the Billing endpoints. All routes are org-scoped and owner-only; the active
 * tenant is resolved by the backend from the JWT, so only the org id in the path is required.
 */
@Injectable({ providedIn: 'root' })
export class BillingApiService {
  private readonly http = inject(HttpClient);

  private base(orgId: string): string {
    return `/api/subscriptions/organization/${orgId}`;
  }

  getSubscription(orgId: string): Observable<SubscriptionResponse> {
    return this.http.get<SubscriptionResponse>(this.base(orgId));
  }

  getUsage(orgId: string): Observable<SubscriptionUsageResponse> {
    return this.http.get<SubscriptionUsageResponse>(`${this.base(orgId)}/usage`);
  }

  upgrade(orgId: string, request: UpgradeSubscriptionRequest): Observable<PlanChangeResponse> {
    return this.http.put<PlanChangeResponse>(`${this.base(orgId)}/upgrade`, request);
  }

  cancel(orgId: string): Observable<SubscriptionResponse> {
    return this.http.put<SubscriptionResponse>(`${this.base(orgId)}/cancel`, {});
  }

  reactivate(orgId: string): Observable<SubscriptionResponse> {
    return this.http.put<SubscriptionResponse>(`${this.base(orgId)}/reactivate`, {});
  }
}
