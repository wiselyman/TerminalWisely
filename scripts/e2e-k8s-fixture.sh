#!/usr/bin/env bash
# Start/stop a local k3d cluster for live K8s integration tests.
# Usage: e2e-k8s-fixture.sh {start|stop|wait|status}
set -euo pipefail

CLUSTER_NAME="${TW_K8S_E2E_CLUSTER:-tw-e2e-k3s}"
KUBECONFIG_FILE="${TW_K8S_E2E_KUBECONFIG:-${TMPDIR:-/tmp}/tw-e2e-k3s.kubeconfig}"
TEST_POD="${TW_K8S_E2E_POD:-tw-e2e-nginx}"
TEST_NAMESPACE="${TW_K8S_E2E_NAMESPACE:-default}"

export TW_K8S_E2E_KUBECONFIG="$KUBECONFIG_FILE"
export KUBECONFIG="$KUBECONFIG_FILE"

have_docker() {
  command -v docker >/dev/null 2>&1
}

have_k3d() {
  command -v k3d >/dev/null 2>&1
}

cluster_running() {
  k3d cluster list 2>/dev/null | awk '{print $1}' | grep -qx "$CLUSTER_NAME"
}

start_fixture() {
  if ! have_docker; then
    echo "SKIP: docker not installed" >&2
    exit 77
  fi
  if ! have_k3d; then
    echo "SKIP: k3d not installed" >&2
    exit 77
  fi

  if cluster_running; then
    echo "K8s fixture already running ($CLUSTER_NAME)"
    k3d kubeconfig write "$CLUSTER_NAME" >"$KUBECONFIG_FILE"
    wait_ready
    return 0
  fi

  echo "Creating k3d cluster ${CLUSTER_NAME}..."
  k3d cluster create "$CLUSTER_NAME" \
    --api-port 6550 \
    --servers 1 \
    --agents 0 \
    --k3s-arg "--disable=traefik@server:0" \
    --wait \
    --kubeconfig-switch-context=false \
    --kubeconfig-update-default=false >/dev/null

  k3d kubeconfig write "$CLUSTER_NAME" >"$KUBECONFIG_FILE"
  wait_ready
}

wait_ready() {
  if ! have_k3d; then
    exit 77
  fi

  echo "Waiting for Kubernetes API..."
  for _ in $(seq 1 90); do
    if kubectl --kubeconfig "$KUBECONFIG_FILE" get nodes >/dev/null 2>&1; then
      break
    fi
    sleep 2
  done
  kubectl --kubeconfig "$KUBECONFIG_FILE" get nodes >/dev/null 2>&1 || {
    echo "Kubernetes API not ready" >&2
    exit 1
  }

  if ! kubectl --kubeconfig "$KUBECONFIG_FILE" -n "$TEST_NAMESPACE" get pod "$TEST_POD" >/dev/null 2>&1; then
    kubectl --kubeconfig "$KUBECONFIG_FILE" -n "$TEST_NAMESPACE" run "$TEST_POD" \
      --image=nginx:alpine \
      --restart=Never \
      --command -- sleep 3600 >/dev/null
  fi

  kubectl --kubeconfig "$KUBECONFIG_FILE" -n "$TEST_NAMESPACE" wait \
    --for=condition=Ready "pod/${TEST_POD}" --timeout=180s >/dev/null

  echo "K8s fixture ready (cluster=${CLUSTER_NAME}, pod=${TEST_NAMESPACE}/${TEST_POD})"
}

stop_fixture() {
  if have_k3d && cluster_running; then
    k3d cluster delete "$CLUSTER_NAME" >/dev/null 2>&1 || true
  fi
  rm -f "$KUBECONFIG_FILE" 2>/dev/null || true
  echo "K8s fixture stopped"
}

status_fixture() {
  if cluster_running; then
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
