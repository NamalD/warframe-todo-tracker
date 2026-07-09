#!/bin/bash
# docker-redeploy.sh — rebuild & restart the warframe-todo-tracker Docker
# Compose service when a commit on main closes a GitHub issue.
#
# Invoked by the post-commit / post-merge hooks with the commit range that
# was just added, e.g.:
#   docker-redeploy.sh --single        # post-commit: just the new commit
#   docker-redeploy.sh HEAD@{1}..HEAD  # post-merge: everything just merged
#
# Note: a bare ref like "HEAD" is NOT a valid single-commit range for
# `git log --pretty=%B` — it prints the ref's entire ancestor history. Use
# --single for "just the tip commit" instead.
set -euo pipefail

REPO_DIR="$(git rev-parse --show-toplevel)"
LOG_FILE="$HOME/warframe-deploy.log"
HEALTH_URL="https://warframe.namal.dev"
RANGE="${1:---single}"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] docker-redeploy: $*" | tee -a "$LOG_FILE"
}

cd "$REPO_DIR"

BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
if [ "$BRANCH" != "main" ]; then
    exit 0
fi

# GitHub issue-closing keywords: close(s|d), fix(es|ed), resolve(s|d) + #N
if [ "$RANGE" = "--single" ]; then
    COMMIT_LOG=$(git log -1 --pretty=%B HEAD 2>/dev/null || echo "")
else
    COMMIT_LOG=$(git log --pretty=%B "$RANGE" 2>/dev/null || echo "")
fi

CLOSED_ISSUES=$(echo "$COMMIT_LOG" \
    | grep -ioE '(close|closes|closed|fix|fixes|fixed|resolve|resolves|resolved)[[:space:]]*:?[[:space:]]*#[0-9]+' \
    | grep -oE '#[0-9]+' \
    | sort -u || true)

if [ -z "$CLOSED_ISSUES" ]; then
    exit 0
fi

log "=== Issue-closing commit(s) detected on main: $(echo "$CLOSED_ISSUES" | tr '\n' ' ') ==="
log "New HEAD: $(git rev-parse --short HEAD)"

log "Building Docker image..."
docker compose build app 2>&1 | tee -a "$LOG_FILE" || {
    log "FAIL: Docker build failed — deploy aborted"
    exit 1
}

log "Restarting container..."
docker compose up -d app 2>&1 | tee -a "$LOG_FILE" || {
    log "FAIL: Container restart failed"
    exit 1
}

log "Health check: waiting for HTTP 200..."
for i in $(seq 1 15); do
    sleep 1
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL" 2>/dev/null || echo "000")
    if [ "$HTTP_CODE" = "200" ]; then
        log "OK: $HEALTH_URL responds 200 — deploy complete"
        exit 0
    fi
done

log "WARN: $HEALTH_URL did not respond 200 within 15s — check manually"
exit 0
