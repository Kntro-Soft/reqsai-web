#!/usr/bin/env bash
# Verifies a release candidate image of reqsai-web without deploying anything: it runs the nginx image as the
# MVP host does and smoke-tests the shell, the SPA fallback, the translations and the hashed bundles. There is no
# second EC2 for a staging environment; this ephemeral run replaces it. The container is removed at the end.
#
# Usage: verify-candidate.sh <image>   e.g. ghcr.io/kntro-soft/reqsai-web@sha256:<digest>
set -euo pipefail

image="${1:?usage: verify-candidate.sh <image reference>}"
port="${VERIFY_PORT:-18081}"
base="http://127.0.0.1:$port"
name="reqsai-verify-web-$$"
work=$(mktemp -d)
summary="${GITHUB_STEP_SUMMARY:-/dev/null}"
passed=false

cleanup() {
  if [[ "$passed" != true ]]; then
    echo "::group::nginx log"
    docker logs "$name" 2>&1 | tail -n 100 || true
    echo "::endgroup::"
  fi
  docker rm -f "$name" >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT

check() {
  echo "| $1 | $2 |" >>"$summary"
  echo "ok: $1 ($2)"
}

fail() {
  echo "| $1 | **failed**: $2 |" >>"$summary"
  echo "::error::$1: $2"
  exit 1
}

# get <path> <output file>: prints the HTTP status and keeps the headers in <output file>.headers
get() {
  curl -sS --max-time 10 -o "$2" -D "$2.headers" -w '%{http_code}' "$base$1"
}

{
  echo "### Verification of \`$image\`"
  echo
  echo "| Check | Result |"
  echo "| --- | --- |"
} >>"$summary"

docker run --detach --name "$name" --publish "127.0.0.1:$port:80" --memory 64m "$image" >/dev/null

code=""
for _ in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$base/health" || true)
  [[ "$code" == 200 ]] && break
  sleep 1
done
[[ "$code" == 200 ]] || fail "Health" "/health answered '${code:-nothing}'"
check "Health (/health, 64 MB like the MVP host)" "HTTP 200"

code=$(get / "$work/index.html")
[[ "$code" == 200 ]] || fail "App shell" "/ answered HTTP $code"
grep -q '<app-root' "$work/index.html" || fail "App shell" "/ is not the Angular shell"
grep -qi '^cache-control: .*no-cache' "$work/index.html.headers" || fail "App shell" "index.html is cacheable"
grep -qi '^x-frame-options: SAMEORIGIN' "$work/index.html.headers" || fail "App shell" "missing security headers"
check "App shell (no-cache, security headers)" "HTTP 200"

code=$(get /auth/login "$work/deep.html")
[[ "$code" == 200 ]] || fail "SPA fallback" "/auth/login answered HTTP $code"
grep -q '<app-root' "$work/deep.html" || fail "SPA fallback" "/auth/login is not the Angular shell"
check "SPA fallback (/auth/login)" "HTTP 200"

bundles=$(grep -oE '(src|href)="[^"]+\.(js|css)"' "$work/index.html" | cut -d'"' -f2 | sort -u)
[[ -n "$bundles" ]] || fail "Bundles" "index.html references no JS or CSS"
count=0
for bundle in $bundles; do
  code=$(get "/${bundle#/}" "$work/bundle")
  [[ "$code" == 200 ]] || fail "Bundles" "/${bundle#/} answered HTTP $code"
  grep -qi '^cache-control: .*immutable' "$work/bundle.headers" || fail "Bundles" "/${bundle#/} is not immutable"
  count=$((count + 1))
done
check "Hashed bundles referenced by index.html" "$count served, immutable"

for lang in en es; do
  code=$(get "/i18n/$lang.json" "$work/$lang.json")
  [[ "$code" == 200 ]] || fail "Translations" "/i18n/$lang.json answered HTTP $code"
  jq -e 'type == "object" and length > 0' "$work/$lang.json" >/dev/null \
    || fail "Translations" "/i18n/$lang.json is not a JSON object"
done
en_keys=$(jq '[paths(scalars)] | length' "$work/en.json")
es_keys=$(jq '[paths(scalars)] | length' "$work/es.json")
[[ "$en_keys" == "$es_keys" ]] || fail "Translations" "en has $en_keys keys, es has $es_keys"
check "Translations (/i18n/en.json, /i18n/es.json)" "$en_keys keys each"

passed=true
echo "Candidate verified: $image"
