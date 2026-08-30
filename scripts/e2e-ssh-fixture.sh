#!/usr/bin/env bash
# Start/stop a local OpenSSH server in Docker for live SSH/SFTP integration tests.
# Usage: e2e-ssh-fixture.sh {start|stop|wait|status}
set -euo pipefail

CONTAINER_NAME="${TW_SSH_E2E_CONTAINER:-tw-e2e-sshd}"
HOST_BIND="${TW_SSH_E2E_HOST:-127.0.0.1}"
PORT="${TW_SSH_E2E_PORT:-2222}"
USER_NAME="${TW_SSH_E2E_USER:-e2e}"
USER_PASSWORD="${TW_SSH_E2E_PASSWORD:-e2etest}"
IMAGE="${TW_SSH_E2E_IMAGE:-lscr.io/linuxserver/openssh-server:latest}"

export TW_SSH_E2E_HOST="$HOST_BIND"
export TW_SSH_E2E_PORT="$PORT"
export TW_SSH_E2E_USER="$USER_NAME"
export TW_SSH_E2E_PASSWORD="$USER_PASSWORD"

have_docker() {
  command -v docker >/dev/null 2>&1
}

container_running() {
  docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$CONTAINER_NAME"
}

start_fixture() {
  if ! have_docker; then
    echo "SKIP: docker not installed" >&2
    exit 77
  fi

  if container_running; then
    echo "SSH fixture already running ($CONTAINER_NAME on ${HOST_BIND}:${PORT})"
    return 0
  fi

  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true

  echo "Pulling ${IMAGE} (if needed)..."
  docker pull "$IMAGE" >/dev/null

  echo "Starting SSH fixture ${CONTAINER_NAME} on ${HOST_BIND}:${PORT}..."
  docker run -d \
    --name "$CONTAINER_NAME" \
    -p "${HOST_BIND}:${PORT}:2222" \
    -e PUID=1000 \
    -e PGID=1000 \
    -e TZ=Etc/UTC \
    -e PASSWORD_ACCESS=true \
    -e USER_PASSWORD="$USER_PASSWORD" \
    -e USER_NAME="$USER_NAME" \
    -e SUDO_ACCESS=false \
    "$IMAGE" >/dev/null

  wait_ready
}

wait_ready() {
  if ! have_docker; then
    exit 77
  fi

  echo "Waiting for SSH on ${HOST_BIND}:${PORT}..."
  for _ in $(seq 1 60); do
    if (echo >/dev/tcp/"$HOST_BIND"/"$PORT") 2>/dev/null; then
      # Give sshd a moment to finish user setup.
      sleep 2
      echo "SSH fixture ready (${USER_NAME}@${HOST_BIND}:${PORT})"
      return 0
    fi
    sleep 1
  done

  echo "SSH fixture failed to become ready" >&2
  docker logs "$CONTAINER_NAME" 2>&1 | tail -40 >&2 || true
  exit 1
}

stop_fixture() {
  if ! have_docker; then
    return 0
  fi
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
  echo "SSH fixture stopped"
}

status_fixture() {
  if container_running; then
    echo "running"
    exit 0
  fi
  echo "stopped"
  exit 1
}

cmd="${1:-start}"
case "$cmd" in
  start) start_fixture ;;
  stop) stop_fixture ;;
  wait) wait_ready ;;
  status) status_fixture ;;
  *)
    echo "Usage: $0 {start|stop|wait|status}" >&2
    exit 2
    ;;
esac
