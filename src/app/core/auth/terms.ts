/**
 * The terms-of-service version the app currently requires. The accepted version
 * travels in the JWT (`termsVersion` claim); when it differs from this value the
 * user is gated through the acceptance screen. Bump this to force re-acceptance.
 */
export const CURRENT_TERMS_VERSION = '2026-01';
