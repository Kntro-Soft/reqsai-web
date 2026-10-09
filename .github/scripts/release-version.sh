#!/usr/bin/env bash
# Prints the X.Y.Z version of a release or hotfix branch.
#
#   release/X.Y.Z, release/vX.Y.Z, hotfix/X.Y.Z, hotfix/vX.Y.Z -> X.Y.Z
#   hotfix/<slug>                                             -> latest vX.Y.Z tag with the patch bumped
#
# Usage: release-version.sh <branch>   (reads the tags from the origin remote)
set -euo pipefail

branch="${1:?usage: release-version.sh <branch>}"
kind="${branch%%/*}"
name="${branch#*/}"
semver='^v?([0-9]+)\.([0-9]+)\.([0-9]+)$'

if [[ "$kind" != release && "$kind" != hotfix ]] || [[ "$name" == "$branch" ]]; then
  echo "::error::$branch is not a release/X.Y.Z or hotfix/X.Y.Z branch" >&2
  exit 1
fi

if [[ "$name" =~ $semver ]]; then
  echo "${BASH_REMATCH[1]}.${BASH_REMATCH[2]}.${BASH_REMATCH[3]}"
  exit 0
fi

if [[ "$kind" == release ]]; then
  echo "::error::Name release branches release/X.Y.Z (got $branch)" >&2
  exit 1
fi

latest=$(git ls-remote --tags --refs origin 'v*' \
  | sed 's#.*refs/tags/v##' \
  | grep -E '^[0-9]+\.[0-9]+\.[0-9]+$' \
  | sort -t. -k1,1n -k2,2n -k3,3n \
  | tail -n 1 || true)
if [[ -z "$latest" ]]; then
  echo "::error::No vX.Y.Z tag to bump; name the branch hotfix/X.Y.Z" >&2
  exit 1
fi
IFS=. read -r major minor patch <<<"$latest"
echo "$major.$minor.$((patch + 1))"
