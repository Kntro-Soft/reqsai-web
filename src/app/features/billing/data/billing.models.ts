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

/** How far into the monthly AI allowance an organization is; mirrors the backend's warning steps. */
export type QuotaLevel = 'NONE' | 'WARNING_80' | 'WARNING_90' | 'EXHAUSTED';

/** Tokens and calls of one AI feature in the period; `tokens` is the quota weight, the rest as the provider reported. */
export interface FeatureUsage {
  feature: string;
  tokens: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  calls: number;
}

/** Quota tokens one project used in the period. */
export interface ProjectUsage {
  projectId: string;
  tokens: number;
}

/** Where the period's tokens went (from the organization's usage ledger). */
export interface UsageBreakdown {
  byFeature: FeatureUsage[];
  topProjects: ProjectUsage[];
  transcriptionSeconds: number;
}

/** Minutes of live meeting the remaining allowance covers, at a measured or default rate. */
export interface MeetingEstimate {
  minutesLeft: number;
  tokensPerMinute: number;
  measured: boolean;
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
  warningLevel: QuotaLevel;
  breakdown: UsageBreakdown;
  meetingEstimate: MeetingEstimate;
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
