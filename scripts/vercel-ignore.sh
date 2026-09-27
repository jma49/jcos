#!/usr/bin/env bash
# Vercel's Ignored Build Step ("ignoreCommand" in vercel.json): exit 0
# skips the deployment, 1 builds it. The Hobby plan caps builds a day, and
# a change that only touches docs, tests, CI, the Supabase side or tooling
# looks the same once deployed, so it doesn't spend one. Whenever this
# can't tell what changed, it builds.
#
# Try it: scripts/vercel-ignore.sh <base commit> [<head commit>]

set -u

head="${2:-HEAD}"
base="${1:-${VERCEL_GIT_PREVIOUS_SHA:-}}"

# Only main deploys (git.deploymentEnabled in vercel.json), and each of
# its deployments knows the one before (VERCEL_GIT_PREVIOUS_SHA).

# Vercel clones shallowly; go deeper once if the base isn't there.
if [ -n "$base" ] && ! git cat-file -e "$base^{commit}" 2>/dev/null; then
  git fetch --quiet --deepen=200 2>/dev/null
fi

if [ -z "$base" ] || ! git cat-file -e "$base^{commit}" 2>/dev/null; then
  echo "No earlier commit to compare with: building."
  exit 1
fi

# Everything the site is built from, which is everything but these.
changed=$(git diff --name-only "$base" "$head" -- . \
  ':(exclude)docs' \
  ':(exclude)tests' \
  ':(exclude,glob)**/*.test.ts' \
  ':(exclude).github' \
  ':(exclude)supabase' \
  ':(exclude)scripts' \
  ':(exclude,glob)*.md' \
  ':(exclude)LICENSE' \
  ':(exclude)NOTICE' \
  ':(exclude).gitignore' \
  ':(exclude).env.example' \
  ':(exclude)eslint.config.js' \
  ':(exclude)vitest.config.ts') || {
  echo "Couldn't compare with $base: building."
  exit 1
}

if [ -z "$changed" ]; then
  echo "Only docs, tests, CI or tooling changed since ${base:0:7}: skipping the build."
  exit 0
fi

echo "The site changed since ${base:0:7}:"
echo "$changed" | head -20
exit 1
