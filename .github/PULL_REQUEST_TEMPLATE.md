## Description

<!-- What does this PR change and why? -->

**Feature module / area:** <!-- iam | billing | workspace | discovery | core | shared | layout | build | ci -->

**Related issue / US:** <!-- e.g., Closes #12 / REQ-XX -->

---

## Type of Change

- [ ] `feat` — new feature or UI component
- [ ] `fix` — bug fix
- [ ] `refactor` — code change without behavior change
- [ ] `test` — tests only
- [ ] `docs` — documentation only
- [ ] `build` / `ci` — build, dependencies, or CI/CD
- [ ] `chore` — maintenance

---

## Checklist

- [ ] The PR targets `develop` (not `main`)
- [ ] Branch name follows `feature/*`, `bugfix/*`, or `hotfix/*`
- [ ] Commits follow Conventional Commits
- [ ] `bun run lint` passes locally (ESLint + angular-eslint)
- [ ] `bun run test` passes locally (Vitest)
- [ ] `bun run build` passes locally (no type errors, no budget exceeded)
- [ ] New components use `ChangeDetectionStrategy.OnPush` and Angular signals
- [ ] No `localStorage`/`sessionStorage` access for JWT tokens (use the auth store)
- [ ] No `bypassSecurityTrust*` calls without explicit review
- [ ] No secrets, credentials, or `.env` content committed
- [ ] `CHANGELOG.md` updated under `[Unreleased]`

---

## How to Test

<!-- Steps for a reviewer to verify the change -->

## Screenshots / recordings (if UI changes)

## Notes (optional)
