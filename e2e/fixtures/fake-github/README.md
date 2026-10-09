# Fixture GitHub

A minimal stand-in for the GitHub REST API, used by `e2e/code-copilot.spec.ts` to test the code-aware
copilot without a network or a token.

```bash
python3 e2e/fixtures/fake-github/fake_github.py 4545
```

Start the API with `CODEBASE_GITHUB_API_URL=http://127.0.0.1:4545` so it reads repositories from here.
Every folder under `repos/<owner>/<name>` is served as a public repository on branch `main`; its zipball is
built from the folder on each request, and the commit sha is a hash of its files, so editing a file is a new
commit.

`repos/acme/reservas` is a restaurant bookings app (Express + Angular + PostgreSQL). Its business rules are
what the spec looks for: a booking can be cancelled up to 2 hours before (`cancellation.policy.ts`), takes
at most 8 people and 30 days ahead, and groups of 6 or more pay a deposit of 20 soles per person.
