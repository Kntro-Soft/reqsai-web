# 0013. Dependency security scanning with audit-ci

- Status: Accepted
- Date: 2026-06-17
- Deciders: Kntro-Soft team

## Context

The project depends on ~60 npm packages (Angular 22, Spartan UI, Tailwind, Vitest, Playwright,
STOMP.js, etc.). Any of these can have publicly disclosed CVEs. GitHub Dependabot (configured in
`dependabot.yml`) raises PRs for version updates but does not block the pipeline on unpatched CVEs
between update cycles. CodeQL (configured in `codeql.yml`) analyses our own code, not third-party
dependencies.

## Decision

Add **audit-ci** (run via `npx` — no extra dev dependency) in a **separate weekly workflow**
(`audit.yml`) rather than in the PR pipeline.

Rationale for a separate workflow (same reasoning as ADR-0015 in reqsai-api):
- The npm advisory database is queried on every run; a network failure must not block PRs.
- CVE reports are informational for development; only Critical severity warrants a build block.
- The weekly cadence matches how frequently new CVEs for stable packages are disclosed.

Configuration (`audit-ci.json`):
- `"critical": true` — fails the workflow on Critical advisories (equivalent to CVSS ≥ 9).
- `"high": false` — High advisories are reported in the artifact but do not block.
- `"allowlist": []` — advisory IDs confirmed as false positives go here with a comment.

## Consequences

- The team gets a weekly report on known CVEs in production npm dependencies.
- Critical CVEs create an actionable workflow failure without disrupting the daily PR flow.
- `audit-ci` is invoked via `npx` — no entry in `package.json` required, always uses the latest stable.
- False positives are managed in `audit-ci.json`; each entry should have an associated issue
  tracking the upstream fix or version upgrade.
- Dependabot will usually open an upgrade PR before a Critical advisory is flagged here — the audit
  is a safety net for the window between disclosure and merge.
