#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IMAGE_NAME="${IMAGE_NAME:-baton-onboard-smoke}"
HOST_PORT="${HOST_PORT:-3131}"
BATONAI_VERSION="${BATONAI_VERSION:-latest}"
DATA_DIR="${DATA_DIR:-$REPO_ROOT/data/docker-onboard-smoke}"
HOST_UID="${HOST_UID:-$(id -u)}"
BATON_DEPLOYMENT_MODE="${BATON_DEPLOYMENT_MODE:-authenticated}"
BATON_DEPLOYMENT_EXPOSURE="${BATON_DEPLOYMENT_EXPOSURE:-private}"
DOCKER_TTY_ARGS=()

if [[ -t 0 && -t 1 ]]; then
  DOCKER_TTY_ARGS=(-it)
fi

mkdir -p "$DATA_DIR"

echo "==> Building onboard smoke image"
docker build \
  --build-arg BATONAI_VERSION="$BATONAI_VERSION" \
  --build-arg HOST_UID="$HOST_UID" \
  -f "$REPO_ROOT/Dockerfile.onboard-smoke" \
  -t "$IMAGE_NAME" \
  "$REPO_ROOT"

echo "==> Running onboard smoke container"
echo "    UI should be reachable at: http://localhost:$HOST_PORT"
echo "    Data dir: $DATA_DIR"
echo "    Deployment: $BATON_DEPLOYMENT_MODE/$BATON_DEPLOYMENT_EXPOSURE"
echo "    Live output: onboard banner and server logs stream in this terminal (Ctrl+C to stop)"
docker run --rm \
  "${DOCKER_TTY_ARGS[@]}" \
  --name "${IMAGE_NAME//[^a-zA-Z0-9_.-]/-}" \
  -p "$HOST_PORT:3100" \
  -e HOST=0.0.0.0 \
  -e PORT=3100 \
  -e BATON_DEPLOYMENT_MODE="$BATON_DEPLOYMENT_MODE" \
  -e BATON_DEPLOYMENT_EXPOSURE="$BATON_DEPLOYMENT_EXPOSURE" \
  -v "$DATA_DIR:/baton" \
  "$IMAGE_NAME"
