"""K8s helpers for AI engineer mode (policy command synthesis)."""

from __future__ import annotations

from typing import Any


def synthesize_kubectl_policy_command(name: str, args: dict[str, Any]) -> str:
    """Map a k8s_* tool call to a kubectl argv string for PolicyEngine."""
    ns = str(args.get("namespace") or "default").strip() or "default"
    if name == "k8s_list":
        cat = str(args.get("category") or "pods")
        if args.get("all_namespaces"):
            return f"kubectl get {cat} -A"
        return f"kubectl get {cat} -n {ns}"
    if name in {"k8s_get", "k8s_describe"}:
        kind = str(args.get("kind") or "pod").lower()
        res = str(args.get("name") or "")
        verb = "describe" if name == "k8s_describe" else "get"
        return f"kubectl {verb} {kind} {res} -n {ns}"
    if name == "k8s_logs":
        pod = str(args.get("pod") or args.get("name") or "")
        return f"kubectl logs {pod} -n {ns}"
    if name == "k8s_apply":
        return "kubectl apply -f -"
    if name == "k8s_delete":
        kind = str(args.get("kind") or "pod").lower()
        res = str(args.get("name") or "")
        return f"kubectl delete {kind} {res} -n {ns}"
    if name == "k8s_scale":
        kind = str(args.get("kind") or "deployment").lower()
        res = str(args.get("name") or "")
        replicas = args.get("replicas", 1)
        return f"kubectl scale {kind}/{res} --replicas={replicas} -n {ns}"
    if name == "k8s_exec":
        pod = str(args.get("pod") or "")
        cmd = str(args.get("command") or "").strip()
        return f"kubectl exec {pod} -n {ns} -- {cmd}"
    return f"kubectl {name}"
