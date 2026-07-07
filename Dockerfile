# syntax=docker/dockerfile:1

# ---- Build stage ----
# Use node:24-alpine as base so Angular CLI 22 gets Node >=24.15.0.
# oven/bun:1.3-alpine ships Node 24.3.0 which is below that minimum.
FROM node:24-alpine AS build
WORKDIR /workspace

# Install Bun (used for dependency installation and running scripts)
RUN npm install -g bun --silent

# Install dependencies (layer cached until bun.lock changes)
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Build the production bundle (Angular outputs to dist/reqsai-web/browser/)
COPY . .
RUN bun run build

# ---- Runtime stage ----
FROM nginx:1.31-alpine AS runtime

# Remove default nginx static assets
RUN rm -rf /usr/share/nginx/html/*

# Copy Angular build output
COPY --from=build /workspace/dist/reqsai-web/browser /usr/share/nginx/html

# Custom nginx config (SPA routing, gzip, security headers, cache policies)
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://127.0.0.1/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
