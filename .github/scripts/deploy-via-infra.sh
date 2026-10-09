#!/usr/bin/env bash
# Deploys the GHCR image of one app commit through Kntro-Soft/reqsai-infra (deploy-mvp.yml, image_source=registry)
# and waits for that run. Fails unless the run's deploy job succeeded, so a skipped or cancelled deploy never
# counts as deployed.
#
# Usage: GH_TOKEN=<INFRA_DEPLOY_TOKEN> deploy-via-infra.sh <api|web> <commit-sha> <request-id>
set -euo pipefail

app="${1:?usage: deploy-via-infra.sh <api|web> <sha> <request-id>}"
sha="${2:?commit sha}"
request_id="${3:?request id}"
repo=Kntro-Soft/reqsai-infra
workflow=deploy-mvp.yml
wait_minutes="${WAIT_MINUTES:-80}"
summary="${GITHUB_STEP_SUMMARY:-/dev/stdout}"

case "$app" in
  api) other=web ;;
  web) other=api ;;
  *) echo "::error::Unknown app: $app" >&2; exit 1 ;;
esac
if [[ ! "$sha" =~ ^[0-9a-f]{40}$ ]]; then
  echo "::error::Expected a full commit SHA, got: $sha" >&2
  exit 1
fi
if [[ -z "${GH_TOKEN:-}" ]]; then
  echo "::error title=INFRA_DEPLOY_TOKEN is not set::Add a fine-grained PAT with Actions read and write on $repo (see CONTRIBUTING.md)." >&2
  exit 1
fi

since=$(date -u +%Y-%m-%dT%H:%M:%SZ)
response=$(gh api --method POST "repos/$repo/actions/workflows/$workflow/dispatches" \
  -f ref=main \
  -f "inputs[image_source]=registry" \
  -f "inputs[${app}_ref]=$sha" \
  -f "inputs[${other}_ref]=keep" \
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
echo "Deploying reqsai-$app \`${sha:0:12}\` through [$repo run $run_id]($run_url)" >> "$summary"

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
  echo "::error::reqsai-$app ${sha:0:12} was not deployed: $run_url (run $conclusion, deploy job $deploy_job)" >&2
  exit 1
fi
echo "reqsai-$app \`${sha:0:12}\` is live." >> "$summary"
