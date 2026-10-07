# Feature Flags — Reqs-AI Web (Frontend)

The deployed product ships only the **MVP** ("Podar el árbol"): capture a discovery session,
turn it into Gherkin user stories, and ground the AI with the project glossary and constraints.
Everything else stays in the codebase — and in the backend — but is switched off in the UI by a
build-time feature flag. Turning a flag on brings the feature back with **no other code change**.

## Flags

All flags default to `false` in **both** `src/environments/environment.ts` and
`src/environments/environment.prod.ts`.

| Flag            | Hides (routes → fall back to `/projects`)                                                                                                         | Hides (UI)                                                                                                                                                                                                          |
|-----------------|---------------------------------------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `billing`       | `/settings/billing`, `/billing/success`, `/billing/cancel`                                                                                        | Org settings nav entry · user-menu **Upgrade** CTA · Usage page **Manage plan** link                                                                                                                              |
| `usage`         | `/settings/usage`                                                                                                                                 | Org settings nav entry                                                                                                                                                                                              |
| `integrations`  | `/settings/integrations`, `/settings/integrations/jira/callback` (Atlassian OAuth), `/projects/:id/settings/integrations`                         | Org + project settings nav entries · global Jira job banner (and its job polling / STOMP topic) · backlog **Import from Jira**, **Push all to Jira**, **Push to Jira (n)** · story detail **Push to Jira** · the backlog's Jira-target lookup |
| `members`       | `/settings/members`, `/projects/:id/settings/members`, `/invitations/accept` (plus the legacy `/members` redirects)                                | Org + project settings nav entries · project overview **Members** card · command-palette **Members** action and member search hits · org General **Transfer ownership** card (and its member fetch)                |
| `customRoles`   | `/projects/:id/settings/roles`, `…/roles/new`, `…/roles/:roleId/edit`                                                                             | Project settings nav entry (and the settings landing / overview "Settings" card no longer count it)                                                                                                               |
| `notifications` | `/account/notifications`                                                                                                                          | Account nav "Soon" placeholder                                                                                                                                                                                      |
| `tokens`        | `/account/tokens`                                                                                                                                 | Account nav "Soon" placeholder                                                                                                                                                                                      |

A hidden route does not match at all (`canMatch` returns `false`), so it behaves exactly like an
unknown URL: the router falls through to the wildcard `**` → `/projects` (query params are kept by
that redirect, as for any unknown URL). No blank page, no "no access" toast, and the lazy chunk is
never downloaded.

The sidebar also hides a **Settings** entry when none of its sub-pages is reachable (e.g. an org
admin while `members` and `integrations` are off), and the org-level entry opens the first
reachable sub-page instead of the owner-only General.

### Decisions

- **Invitation links** (`/invitations/accept`) are behind `members`. While it is off nobody can
  send an invitation from the UI, and an owner has no screen to see or remove whoever joins, so a
  stale invite link must not add people to an org. Turning `members` on restores the flow.
- **Transfer ownership** (org General settings) is behind `members`: without members there is
  nobody to pick, and its empty state asks the owner to invite someone.
- The story status filter still lists `EXPORTED`: it is data a story may already carry, not a link.

## Turning a feature on

1. Set the flag to `true` in **both** environment files (the production build uses
   `environment.prod.ts` via `fileReplacements`).
2. Rebuild / redeploy. Nothing else changes: routes, nav entries and buttons come back as they were.

Tests override flags with `provideFeatureFlags({ members: true })` in the TestBed providers.

## Adding a flag

1. Add the key to the `FeatureKey` union in `src/app/core/features/feature-flags.ts`; both
   environment files then fail to compile until they define it (`satisfies FeatureFlagMap`).
2. Routes: `canMatch: [featureGuard('key')]`. When the route already has a `canMatch` guard, chain
   it — `featureGuard('key', requirePermissionMatch('X'))` — because Angular runs every guard of a
   `canMatch` array eagerly.
3. Sidebar: add `feature: 'key'` to the item in `src/app/layout/shell/shell-nav.ts`.
4. Anything else (buttons, cards, palette actions, data fetches):
   `inject(FeatureFlags).isEnabled('key')`.
5. Extend the URL lists in `src/app/app.routes.spec.ts` and update this table.

## Backend coupling

Flags are **UI-only**: they are not a security boundary, and every backend endpoint stays live
(role/permission checks still apply server-side).

- **Plan limits are enforced by the backend.** Each new organization gets a FREE subscription and
  the workspace module rejects work beyond its limits with `422`: 25 projects
  (`PROJECT_PLAN_LIMIT_EXCEEDED`), 50 glossary terms per project
  (`GLOSSARY_TERM_PLAN_LIMIT_EXCEEDED`), 10 documents per project
  (`PROJECT_DOCUMENT_PLAN_LIMIT_EXCEEDED`) and 3 members (`MEMBER_PLAN_LIMIT_EXCEEDED`). The UI shows
  the localized error toast; with `billing` off there is no upgrade path, so raise the FREE limits
  server-side if the MVP needs more.
- **AI token usage is metered, not enforced**: the backend records consumption against the plan
  quota but no MVP flow is blocked by it, and no frontend guard or banner depends on billing.
