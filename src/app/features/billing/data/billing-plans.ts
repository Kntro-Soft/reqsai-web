import { PlanType } from './billing.models';

/**
 * Front-end display catalog for the plan tiers, mirroring the backend PlanCatalog limits and the
 * default reqsai.billing pricing. The backend is the source of truth for the CURRENT plan's price
 * (returned by the usage endpoint), but the plan-selection cards need the limits and display price of
 * ALL tiers, which the API does not expose — so they live here and must be kept in sync with the
 * backend PlanCatalog / application.yml defaults.
 */
export interface PlanDefinition {
  readonly type: PlanType;
  /** Monthly display price in minor currency units (cents). FREE is 0. */
  readonly priceCents: number;
  readonly currency: string;
  readonly limits: {
    readonly maxMembers: number;
    readonly maxProjects: number;
    readonly maxDocumentsPerProject: number;
    readonly maxTokensPerMonth: number;
    readonly maxGlossaryTermsPerProject: number;
  };
}

export const PLAN_CATALOG: Record<PlanType, PlanDefinition> = {
  FREE: {
    type: 'FREE',
    priceCents: 0,
    currency: 'USD',
    limits: {
      maxMembers: 3,
      maxProjects: 25,
      maxDocumentsPerProject: 10,
      maxTokensPerMonth: 100_000,
      maxGlossaryTermsPerProject: 50,
    },
  },
  PRO: {
    type: 'PRO',
    priceCents: 2_900,
    currency: 'USD',
    limits: {
      maxMembers: 15,
      maxProjects: 200,
      maxDocumentsPerProject: 50,
      maxTokensPerMonth: 2_000_000,
      maxGlossaryTermsPerProject: 300,
    },
  },
  ENTERPRISE: {
    type: 'ENTERPRISE',
    priceCents: 9_900,
    currency: 'USD',
    limits: {
      maxMembers: 200,
      maxProjects: 2_000,
      maxDocumentsPerProject: 500,
      maxTokensPerMonth: 50_000_000,
      maxGlossaryTermsPerProject: 3_000,
    },
  },
};

/** Tiers shown in the plan grid, in upgrade order. */
export const PLAN_ORDER: readonly PlanType[] = ['FREE', 'PRO', 'ENTERPRISE'];

/** True when `target` is a strictly higher tier than `current`. */
export function isUpgrade(current: PlanType, target: PlanType): boolean {
  return PLAN_ORDER.indexOf(target) > PLAN_ORDER.indexOf(current);
}
