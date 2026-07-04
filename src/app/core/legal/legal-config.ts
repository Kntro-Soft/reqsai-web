/**
 * Single source of truth for the company identity rendered in the Terms of Service and the
 * Privacy Policy (see backend ADR-0020). Edit these values here — the legal pages and their i18n
 * params read from this object, so nothing is hard-coded inside the prose.
 *
 * Changing the *substance* of either document should also bump `CURRENT_TERMS_VERSION`
 * (see core/auth/terms.ts) so users are required to re-accept. Editing only these identity
 * values (address, contact, …) does NOT require a version bump.
 */
export interface LegalConfig {
  /** Registered company name. */
  legalName: string;
  /** Product / brand name. */
  tradeName: string;
  /** Governing law + courts. */
  jurisdiction: string;
  /** Registered address. */
  address: string;
  /** Privacy / legal contact (DPO if appointed). */
  contactEmail: string;
  websiteUrl: string;
  /** ISO date shown as "Last updated". */
  effectiveDate: string;
}

// Placeholder values — replace with the final registered details before launch.
export const LEGAL_CONFIG: LegalConfig = {
  legalName: 'Kntro-Soft S.A.C.',
  tradeName: 'ReqsAI',
  jurisdiction: 'Perú',
  address: 'Lima, Perú',
  contactEmail: 'legal@kntro.dev',
  websiteUrl: 'https://reqsai.app',
  effectiveDate: '2026-06-29',
};

/** Third-party AI sub-processors disclosed in the Terms / Privacy Policy (ADR-0020). */
export interface AiSubprocessor {
  name: string;
  purpose: string;
}

export const AI_SUBPROCESSORS: readonly AiSubprocessor[] = [
  { name: 'Deepgram', purpose: 'speech-to-text' },
  { name: 'Google Gemini', purpose: 'user-story generation' },
  { name: 'OpenAI', purpose: 'embeddings for duplicate detection' },
];
