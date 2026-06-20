# Security Policy — Kntro-Soft / reqsai-web

## Supported Versions

| Version             | Supported |
|---------------------|-----------|
| `main` / `develop`  | Yes       |
| Older tags          | No        |

## Reporting a Vulnerability

If you discover a security vulnerability or find a secret accidentally committed (credentials, API
keys, tokens), **do not open a public Issue or Pull Request**.

### How to Report

Email **Jhosepmyr Gutiérrez Soto** — `jhosepmyrgutierrezsoto@gmail.com` with:

- A description of the issue and its impact
- Steps to reproduce (or the file/commit where the secret is exposed)
- Any relevant logs or evidence

We commit to acknowledging within **72 hours** and addressing the issue within **7 business days**.
If a secret was exposed, it must be **rotated immediately** and purged from history.

## Security Practices in This Repository

- **No secrets in the repo.** API keys, tokens, and credentials are provided via environment
  variables and never committed. Copy `.env.example` → `.env` for local overrides (git-ignored).
- **JWT tokens are never stored in `localStorage`** — the access token lives in a memory signal
  (cleared on page unload); the refresh token is issued as an `HttpOnly` cookie (inaccessible to JS).
  See [ADR-0007](../docs/adr/0007-jwt-rs256-authentication.md).
- **Content Security Policy (CSP)** is enforced via nginx headers in production
  (see `nginx.conf`).
- **Dependencies** are monitored via Dependabot ([`dependabot.yml`](./dependabot.yml)) and the
  CodeQL workflow for JavaScript/TypeScript.
- **Sanitization:** Angular's built-in DomSanitizer is used for any dynamic HTML binding; raw
  `innerHTML` with untrusted content is forbidden.
- **XSS prevention:** All user-provided content is rendered through Angular's template binding
  (`{{ }}` / `[property]`), never through `bypassSecurityTrust*` unless explicitly reviewed.
