# Deployment Guide — Reqs-AI Web (Frontend)

## Overview

The frontend is a static Angular SPA. In production, it is deployed to **AWS S3 + CloudFront**
(see [ADR-0009](adr/0009-deploy-s3-cloudfront.md)). For local integration testing, a Docker
image with nginx is available.

---

## 1. Production build

```bash
bun install --frozen-lockfile
bun run build
# → dist/reqsai-web/browser/
```

The output is a set of hashed static files (`main.XXXXXXXX.js`, etc.) plus `index.html`. The hash
in asset filenames enables long-lived caching while `index.html` is always served without cache.

---

## 2. Docker (local integration testing)

Build and run the nginx container:

```bash
# Build image
docker build -t reqsai-web:local .

# Run (port 4200 → nginx :80)
docker compose --profile app up
# → http://localhost:4200
```

The `Dockerfile` uses a two-stage build:

1. **Build stage** (`oven/bun:1.3-alpine`): `bun install` + `bun run build`.
2. **Runtime stage** (`nginx:1.27-alpine`): copies `dist/reqsai-web/browser/` into nginx's
   document root and applies `nginx.conf` (SPA routing, gzip, security headers, cache policy).

> **Note:** In Docker the frontend calls the real backend. Update `nginx.conf` to proxy `/api/`
> if you want nginx to forward API requests to the backend container.

---

## 3. AWS S3 + CloudFront

### Prerequisites

| GitHub Variable              | Description                                         |
|------------------------------|-----------------------------------------------------|
| `AWS_REGION`                 | e.g., `us-east-1`                                   |
| `S3_BUCKET`                  | Name of the S3 bucket (private, OAC-protected)      |
| `CLOUDFRONT_DISTRIBUTION_ID` | CloudFront distribution ID (e.g., `E1ABCDEF2GHIJ3`) |
| `AWS_DEPLOY_ROLE_ARN`        | IAM role ARN for OIDC deployment                    |

### Manual deployment

```bash
# Build
bun run build

# Sync hashed assets (long cache)
aws s3 sync dist/reqsai-web/browser/ s3://<BUCKET>/ \
  --delete \
  --exclude "index.html" \
  --cache-control "public,max-age=31536000,immutable"

# Upload index.html (no cache)
aws s3 cp dist/reqsai-web/browser/index.html s3://<BUCKET>/index.html \
  --cache-control "no-cache,no-store,must-revalidate"

# Invalidate CloudFront cache
aws cloudfront create-invalidation \
  --distribution-id <DISTRIBUTION_ID> \
  --paths "/*"
```

### Automated deployment (CI/CD)

The `deploy.yml` GitHub Actions workflow runs on every push to `main` and executes the steps
above automatically using OIDC authentication (no long-lived AWS keys stored in GitHub secrets).

### CloudFront configuration

The CloudFront distribution must be configured to:

1. **Origin**: S3 bucket with OAC (Origin Access Control) — the bucket itself is private.
2. **Default root object**: `index.html`.
3. **Error pages**: both `403` and `404` → `/index.html` with HTTP `200` status response (required
   for Angular HTML5 routing — all routes are served by the SPA shell).
4. **HTTPS**: redirect HTTP to HTTPS; use ACM certificate for the custom domain.
5. **Cache behaviors**:
   - Default (`/*`): forward to S3, respect `Cache-Control` from S3 object metadata.
   - No query string or cookie forwarding needed for static assets.

---

## 4. Environment variables

Angular is a compile-time framework — there are no runtime environment variables injected into the
JavaScript bundle by default. Environment-specific configuration is handled by:

- `proxy.conf.json` — dev-server proxy (`/api`, `/ws` → backend at `:8080`).
- Angular environments (`src/environments/`) — `environment.ts` (dev) vs `environment.production.ts`.
- `compose.yaml` / `.env` — Docker Compose variable interpolation (see `.env.example`).

For production, the API base URL must be known at build time or injected as a `window.__env`
object via `index.html` (runtime injection approach, not currently implemented — add it if the
API URL varies by environment without a rebuild).
