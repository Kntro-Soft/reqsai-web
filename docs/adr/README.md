# Architecture Decision Records

This directory records the significant architectural decisions for the Reqs-AI frontend using
[Michael Nygard's ADR format](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions).

Each ADR is immutable once accepted. To change a decision, add a new ADR that **supersedes** the old
one (and update the old one's status).

## Index

| ADR                                                | Title                                              | Status   |
|----------------------------------------------------|----------------------------------------------------|----------|
| [0001](0001-record-architecture-decisions.md)      | Record architecture decisions                      | Accepted |
| [0002](0002-angular-22-signals-zoneless.md)        | Angular 22 with signals and zoneless architecture  | Accepted |
| [0003](0003-feature-based-folder-structure.md)     | Feature-based folder structure mirroring backend   | Accepted |
| [0004](0004-spartan-ui-tailwind-v4.md)             | Spartan UI + Tailwind CSS v4 for UI components     | Accepted |
| [0005](0005-bun-package-manager.md)                | Bun as package manager and script runner           | Accepted |
| [0006](0006-testing-strategy-vitest-playwright.md) | Testing strategy: Vitest (unit) + Playwright (e2e) | Accepted |
| [0007](0007-websocket-stomp-realtime.md)           | Real-time via WebSocket/STOMP                      | Accepted |
| [0008](0008-ai-streaming-sse.md)                   | AI response streaming via Server-Sent Events       | Accepted |
| [0009](0009-deploy-s3-cloudfront.md)               | Deploy to AWS S3 + CloudFront                      | Accepted |
| [0010](0010-state-management-signals.md)           | State management with Angular signals (no NgRx)    | Accepted |
| [0011](0011-multitenancy-tenant-context.md)        | Multitenancy via tenant context service            | Accepted |
| [0012](0012-jwt-rs256-authentication.md)           | JWT RS256 authentication and token storage         | Accepted |
| [0013](0013-npm-audit-dependency-security.md)      | Dependency security scanning with audit-ci         | Accepted |
| [0014](0014-icon-library-ng-icons-lucide.md)       | Icon library: @ng-icons + Lucide via HlmIcon       | Accepted |

## Template

```markdown
# NNNN. Title

- Status: Proposed | Accepted | Deprecated | Superseded by ADR-XXXX
- Date: YYYY-MM-DD
- Deciders: <names>

## Context
<the forces at play, the problem>

## Decision
<what we decided>

## Consequences
<positive, negative, and neutral outcomes>
```
