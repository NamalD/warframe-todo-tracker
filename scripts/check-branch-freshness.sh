#!/usr/bin/env bash
# Check if the current branch is behind main. Exits 1 if rebase is needed.
set -euo pipefail

BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$BRANCH" = "main" ]; then
  echo "On main branch — no check needed."
  exit 0
fi

git fetch origin main

BEHIND=$(git rev-list --count HEAD..origin/main 2>/dev/null || echo 0)
if [ "$BEHIND" -gt 0 ]; then
  echo "REBASE NEEDED: $BRANCH is $BEHIND commit(s) behind origin/main"
  echo "Run: git rebase origin/main"
  exit 1
fi

echo "OK: $BRANCH is up to date with origin/main"
exit 0