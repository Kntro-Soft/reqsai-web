# Fixture GitHub

A minimal stand-in for GitHub, used by `e2e/code-copilot*.spec.ts` to test the code-aware copilot without a
network, a token or a real GitHub App.

```bash
python3 e2e/fixtures/fake-github/fake_github.py 4545
```

Start the API pointing at it, with the GitHub App settings the fixture expects (the private key is a fresh
one: the fixture checks the JWT's shape and issuer, not its signature):

```bash
CODEBASE_GITHUB_API_URL=http://127.0.0.1:4545 \
CODEBASE_GITHUB_WEB_URL=http://127.0.0.1:4545 \
CODEBASE_GITHUB_APP_SLUG=reqsai-e2e \
CODEBASE_GITHUB_APP_CLIENT_ID=Iv1.reqsai-e2e \
CODEBASE_GITHUB_APP_CLIENT_SECRET=e2e-client-secret \
CODEBASE_GITHUB_APP_WEBHOOK_SECRET=e2e-webhook-secret \
CODEBASE_GITHUB_APP_PRIVATE_KEY="$(openssl genrsa 2048 2>/dev/null | base64 | tr -d '\n')" \
./gradlew bootRun
```

Every folder under `repos/<owner>/<name>` is served as a repository on branch `main`; its zipball is built
from the folder on each request, and the commit sha is a hash of its files. A folder with a `.fake-private`
file is private: only the token of installation 1001 (account `acme`, which shares every `acme` repository)
reads it.

Installing the App (`/apps/reqsai-e2e/installations/new`) redirects straight to the web callback with
installation 1001 and an OAuth code, as GitHub does after the user approves. `POST /_fake/push/{owner}/{name}`
with `{"files": {"path": "content"}}` simulates a push: it overlays the files in memory and sends the signed
`push` webhook to the API (`FAKE_GITHUB_WEBHOOK_URL`, by default `http://127.0.0.1:8080/api/code/webhooks/github`).

- `repos/acme/reservas` (public) is a restaurant bookings app (Express + Angular + PostgreSQL). Its business
  rules are what the specs look for: a booking can be cancelled up to 2 hours before (`cancellation.policy.ts`),
  takes at most 8 people and 30 days ahead, and groups of 6 or more pay a deposit of 20 soles per person.
- `repos/acme/facturacion` (private) is the restaurant's billing service: IGV of 18%, a waiter's discount of at
  most 10%, and invoices that need an 11-digit RUC.
