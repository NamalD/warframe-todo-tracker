#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="/home/namal/warframe-todo-tracker"
LOG_FILE="/home/namal/warframe-deploy.log"
CONTAINER_NAME="warframe-todo-tracker"
IMAGE_NAME="warframe-todo-tracker:latest"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

log "=== Deploy check started ==="

cd "$REPO_DIR" || { log "FAIL: cannot cd to $REPO_DIR"; exit 1; }

# Ensure we're on main and no local changes would block pull
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "main" ]; then
    log "SKIP: not on main branch (on $CURRENT_BRANCH)"
    exit 0
fi

# Fetch latest from origin
git fetch origin main 2>&1 | tee -a "$LOG_FILE"

LOCAL_HASH=$(git rev-parse HEAD)
REMOTE_HASH=$(git rev-parse origin/main)

if [ "$LOCAL_HASH" = "$REMOTE_HASH" ]; then
    log "OK: already at latest commit ($LOCAL_HASH)"
    exit 0
fi

log "NEW COMMITS DETECTED"
log "  local:  $LOCAL_HASH"
log "  remote: $REMOTE_HASH"

# Pull new changes
git pull origin main 2>&1 | tee -a "$LOG_FILE"
log "Pulled latest from origin/main"

# Rebuild the image
log "Building Docker image..."
docker build -t "$IMAGE_NAME" . 2>&1 | tee -a "$LOG_FILE"
log "Build complete"

# Stop and remove old container
if docker ps -q --filter "name=$CONTAINER_NAME" | grep -q .; then
    log "Stopping container $CONTAINER_NAME..."
    docker stop "$CONTAINER_NAME" 2>&1 | tee -a "$LOG_FILE"
fi
if docker ps -aq --filter "name=$CONTAINER_NAME" | grep -q .; then
    log "Removing container $CONTAINER_NAME..."
    docker rm "$CONTAINER_NAME" 2>&1 | tee -a "$LOG_FILE"
fi

# Start new container
log "Starting new container..."
docker run -d \
    --name "$CONTAINER_NAME" \
    -p 3000:3000 \
    --restart unless-stopped \
    "$IMAGE_NAME" 2>&1 | tee -a "$LOG_FILE"

log "Deploy complete. New commit: $REMOTE_HASH"
log "=== Deploy check finished ==="
