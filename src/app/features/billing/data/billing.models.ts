/** Billing bounded-context response/request shapes, mirroring the backend Billing REST API. */

/** Plan tiers offered by ReqsAI. */
export type PlanType = 'FREE' | 'PRO' | 'ENTERPRISE';

/** Operational states of a subscription. */
export type SubscriptionStatus = 'ACTIVE' | 'CANCELLED' | 'PAST_DUE' | 'TRIALING';

/** Outcome of an upgrade attempt: activated now (fake gateway) or awaiting hosted checkout (Stripe). */
export type PlanChangeStatus = 'ACTIVATED' | 'CHECKOUT_REQUIRED';

/** Full subscription resource (GET /api/subscriptions/organization/{orgId}). */
export interface SubscriptionResponse {
  id: string;
  organizationId: string;
  planType: PlanType;
  status: SubscriptionStatus;
  provider: string | null;
  providerExternalId: string | null;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  tokenQuotaUsed: number;
  cancelledAt: string | null;
}

/** Usage/dashboard view (GET /api/subscriptions/organization/{orgId}/usage). */
export interface SubscriptionUsageResponse {
  organizationId: string;
  planType: PlanType;
  status: SubscriptionStatus;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  tokensUsed: number;
  tokensLimit: number;
  tokensRemaining: number;
  usagePercentage: number;
  priceCents: number;
  currency: string;
  stripePriceId: string | null;
}

/** Response of PUT .../upgrade. */
export interface PlanChangeResponse {
  status: PlanChangeStatus;
  checkoutUrl: string | null;
  subscription: SubscriptionResponse;
}

/** Request body of PUT .../upgrade. */
export interface UpgradeSubscriptionRequest {
  planType: PlanType;
}
