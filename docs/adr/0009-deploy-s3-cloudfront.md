# 0009. Deploy to AWS S3 + CloudFront

- Status: Accepted
- Date: 2026-06-16
- Deciders: Kntro-Soft team

## Context

The backend deploys to AWS ECS Fargate (see [reqsai-api ADR-0006](../../reqsai-api/docs/adr/0006-deploy-on-aws-ecs-fargate.md)).
The frontend is a static SPA (Angular `ng build` produces `dist/reqsai-web/browser/`). Options
for hosting a static SPA on AWS: EC2 + nginx, ECS + nginx, S3 + CloudFront, Amplify Hosting.

For a static SPA, S3 + CloudFront is the canonical AWS pattern: zero server management, global
CDN, HTTPS with ACM, and per-file cache invalidation. Amplify Hosting adds complexity for marginal
gain at the MVP stage.

## Decision

Deploy to **AWS S3 + CloudFront**:

- **S3 bucket**: private; CloudFront OAC (Origin Access Control) is the only allowed reader.
- **CloudFront distribution**: HTTPS only, HTTP → HTTPS redirect; custom domain via Route 53 + ACM.
- **Cache strategy**:
  - Hashed assets (`*.js`, `*.css`, fonts): `Cache-Control: public, max-age=31536000, immutable`
    (1 year; Angular appends content hash to filenames).
  - `index.html`: `Cache-Control: no-cache, no-store, must-revalidate` (always fetch fresh shell).
- **SPA routing**: CloudFront error page for `403`/`404` → `/index.html` with `200` status
  (required for Angular HTML5 routing without `#` hash strategy).
- **CI/CD**: the `deploy.yml` workflow builds, syncs to S3, and creates a CloudFront invalidation
  on every push to `main`. Authentication uses OIDC (`id-token: write`) — no long-lived AWS keys.

**Docker alternative**: the `Dockerfile` + `compose.yaml` build a local nginx container (`reqsai-web:local`)
for integration testing the full stack. Docker is not used in production.

## Consequences

- No server to manage for the frontend; costs scale to zero when idle.
- Global CDN edge nodes serve cached assets with low latency worldwide.
- `index.html` must never be cached (CDN or browser) — the `no-cache` policy ensures users always
  get the latest Angular router shell.
- S3 key prefix structure mirrors the Angular output: flat files at the bucket root.
- CloudFront invalidations (`/*`) take up to 1 minute; during that window, users may receive stale
  cached assets. This is acceptable for an MVP.
- GitHub Actions variables required: `AWS_REGION`, `S3_BUCKET`, `CLOUDFRONT_DISTRIBUTION_ID`, `AWS_DEPLOY_ROLE_ARN`.
