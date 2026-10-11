#!/usr/bin/env bash
# Ships one release image, by digest, to the MVP host through Kntro-Soft/reqsai-infra (deploy-mvp.yml with
# image_source=registry) and waits for that run. Fails unless the run's deploy job succeeded, so a skipped or
# cancelled deploy never counts as deployed.
#
# The calling job runs in this repository's produccion environment; upstream_sha is its commit, so reqsai-infra
# sees that deployment in_progress (already approved) and does not ask for a second approval.
#
# Usage: deploy-via-infra.sh <api|web> <sha256:digest> <upstream-sha> <request-id>
#
# Environment:
#   DISPATCH_TOKEN  installation token of the GitHub App reqsai-release-bot on Kntro-Soft/reqsai-infra with
#                   Actions: write, minted for this job (actions/create-github-app-token); only used to dispatch
#                   deploy-mvp.yml                                                                      (required)
#   GH_TOKEN        the workflow's GITHUB_TOKEN: finds and watches the run of reqsai-infra (a public repository).
#                   An App token expires after one hour and the deploy may take longer                  (required)
#   WAIT_MINUTES    how long to wait for the run                                                  (default: 80)
set -euo pipefail

app="${1:?usage: deploy-via-infra.sh <api|web> <digest> <upstream-sha> <request-id>}"
digest="${2:?image digest}"
upstream="${3:?upstream commit sha}"
request_id="${4:?request id}"
repo=Kntro-Soft/reqsai-infra
workflow=deploy-mvp.yml
wait_minutes="${WAIT_MINUTES:-80}"
summary="${GITHUB_STEP_SUMMARY:-/dev/stdout}"

case "$app" in
  api) other=web ;;
  web) other=api ;;
  *) echo "::error::Unknown app: $app" >&2; exit 1 ;;
esac
if [[ ! "$digest" =~ ^sha256:[0-9a-f]{64}$ ]]; then
  echo "::error::Expected an image digest sha256:<64 hex>, got: $digest" >&2
  exit 1
fi
if [[ ! "$upstream" =~ ^[0-9a-f]{40}$ ]]; then
  echo "::error::Expected a full commit SHA, got: $upstream" >&2
  exit 1
fi
if [[ -z "${DISPATCH_TOKEN:-}" ]]; then
  echo "::error title=No release bot token::DISPATCH_TOKEN (a reqsai-release-bot token with Actions: write on $repo) is not set; mint it with actions/create-github-app-token." >&2
  exit 1
fi
: "${GH_TOKEN:?GH_TOKEN (the workflow token, to read the runs of $repo) is required}"

since=$(date -u +%Y-%m-%dT%H:%M:%SZ)
response=$(GH_TOKEN="$DISPATCH_TOKEN" gh api --method POST "repos/$repo/actions/workflows/$workflow/dispatches" \
  -f ref=main \
  -f "inputs[image_source]=registry" \
  -f "inputs[${app}_ref]=$digest" \
  -f "inputs[${other}_ref]=keep" \
  -f "inputs[upstream_sha]=$upstream" \
  -f "inputs[request_id]=$request_id")
run_id=$(printf '%s' "$response" | jq -r '.workflow_run_id // empty' 2>/dev/null || true)

if [[ -z "$run_id" ]]; then
  # The dispatch API used to answer 204 without the run; find it by the run name instead.
  for _ in $(seq 1 30); do
    run_id=$(gh api "repos/$repo/actions/workflows/$workflow/runs?event=workflow_dispatch&created=%3E%3D$since&per_page=30" \
      --jq "[.workflow_runs[] | select(.display_title | endswith(\"$request_id\"))][0].id // empty")
    [[ -n "$run_id" ]] && break
    sleep 5
  done
fi
if [[ -z "$run_id" ]]; then
  echo "::error::Could not find the $workflow run for $request_id" >&2
  exit 1
fi

run_url="https://github.com/$repo/actions/runs/$run_id"
echo "run_url=$run_url" >> "${GITHUB_OUTPUT:-/dev/null}"
echo "Deploying reqsai-$app \`$digest\` through [$repo run $run_id]($run_url)" >> "$summary"

deadline=$(( $(date +%s) + wait_minutes * 60 ))
while :; do
  status=$(gh run view "$run_id" --repo "$repo" --json status --jq .status)
  [[ "$status" == completed ]] && break
  if (( $(date +%s) > deadline )); then
    echo "::error::$run_url did not finish in $wait_minutes minutes (status: $status)" >&2
    exit 1
  fi
  sleep 30
done

conclusion=$(gh run view "$run_id" --repo "$repo" --json conclusion --jq .conclusion)
deploy_job=$(gh run view "$run_id" --repo "$repo" --json jobs \
  --jq '[.jobs[] | select(.name | startswith("Deploy to the MVP host"))][0].conclusion // "missing"')
echo "Run conclusion: \`$conclusion\`, deploy job: \`$deploy_job\`" >> "$summary"
if [[ "$conclusion" != success || "$deploy_job" != success ]]; then
  echo "::error::reqsai-$app $digest was not deployed: $run_url (run $conclusion, deploy job $deploy_job)" >&2
  exit 1
fi
echo "reqsai-$app \`$digest\` is live." >> "$summary"
