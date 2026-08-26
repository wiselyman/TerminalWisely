import { invoke } from "@tauri-apps/api/core";
import type {
  HelmReleaseRow,
  K8sClusterSummary,
  K8sClusterTarget,
  K8sContextInfo,
  K8sPodShellInfo,
  K8sResourceCategory,
  K8sResourceDetail,
  K8sResourceRow,
  K8sTopPodRow,
  PortForwardInfo,
} from "./types";

export interface KubectlJsonResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  exit_code: number;
  parsed?: unknown;
  error?: string | null;
}

export async function k8sDiscoverContexts(): Promise<K8sContextInfo[]> {
  return invoke<K8sContextInfo[]>("k8s_discover_contexts");
}

export async function k8sImportKubeconfig(
  path: string,
  displayName?: string | null,
): Promise<K8sContextInfo[]> {
  const name = displayName?.trim() || null;
  return invoke<K8sContextInfo[]>("k8s_import_kubeconfig", {
    path,
    display_name: name,
    displayName: name,
  });
}

export async function k8sImportKubeconfigYaml(
  yaml: string,
  displayName?: string | null,
): Promise<K8sContextInfo[]> {
  const name = displayName?.trim() || null;
  return invoke<K8sContextInfo[]>("k8s_import_kubeconfig_yaml", {
    yaml,
    display_name: name,
    displayName: name,
  });
}

export async function k8sRenameImportedKubeconfig(
  path: string,
  displayName: string,
): Promise<K8sContextInfo[]> {
  const name = displayName.trim();
  return invoke<K8sContextInfo[]>("k8s_rename_imported_kubeconfig", {
    path,
    display_name: name,
    displayName: name,
  });
}

export async function k8sReadKubeconfig(path: string): Promise<string> {
  return invoke<string>("k8s_read_kubeconfig", { path });
}

export async function k8sUpdateKubeconfig(
  path: string,
  opts: { displayName?: string; yaml?: string },
): Promise<K8sContextInfo[]> {
  const name = opts.displayName?.trim() || null;
  return invoke<K8sContextInfo[]>("k8s_update_kubeconfig", {
    path,
    display_name: name,
    displayName: name,
    yaml: opts.yaml ?? null,
  });
}

export async function k8sRemoveImportedKubeconfig(path: string): Promise<void> {
  await invoke("k8s_remove_imported_kubeconfig", { path });
}

export async function k8sListNamespaces(
  target: K8sClusterTarget,
): Promise<string[]> {
  return invoke<string[]>("k8s_list_namespaces", { target });
}

export async function k8sListSshBindings(): Promise<K8sClusterTarget[]> {
  return invoke<K8sClusterTarget[]>("k8s_list_ssh_bindings");
}

export interface SshKubectlProbe {
  ok: boolean;
  version?: string | null;
  error?: string | null;
}

export async function k8sProbeSshKubectl(
  sessionId: string,
): Promise<SshKubectlProbe> {
  return invoke<SshKubectlProbe>("k8s_probe_ssh_kubectl", {
    sessionId,
    session_id: sessionId,
  });
}

export async function k8sSaveSshBinding(binding: {
  display_name: string;
  session_id: string;
  server_id?: string | null;
  namespace?: string;
}): Promise<K8sClusterTarget> {
  return invoke<K8sClusterTarget>("k8s_save_ssh_binding", { binding });
}

export async function k8sDeleteSshBinding(id: string): Promise<void> {
  await invoke("k8s_delete_ssh_binding", { id });
}

export async function k8sKubectl(
  target: K8sClusterTarget,
  args: string[],
): Promise<KubectlJsonResult> {
  return invoke<KubectlJsonResult>("k8s_kubectl", { target, args });
}

export async function k8sListResources(
  target: K8sClusterTarget,
  category: K8sResourceCategory,
  namespace?: string | null,
): Promise<K8sResourceRow[]> {
  return invoke<K8sResourceRow[]>("k8s_list_resources", {
    target,
    category,
    namespace: namespace ?? null,
  });
}

export async function k8sGetResource(
  target: K8sClusterTarget,
  kind: string,
  namespace: string,
  name: string,
): Promise<K8sResourceDetail> {
  return invoke<K8sResourceDetail>("k8s_get_resource", {
    target,
    kind,
    namespace,
    name,
  });
}

export async function k8sApplyYaml(
  target: K8sClusterTarget,
  yaml: string,
): Promise<KubectlJsonResult> {
  return invoke<KubectlJsonResult>("k8s_apply_yaml", { target, yaml });
}

export async function k8sDeleteResource(
  target: K8sClusterTarget,
  kind: string,
  namespace: string,
  name: string,
): Promise<KubectlJsonResult> {
  return invoke<KubectlJsonResult>("k8s_delete_resource", {
    target,
    kind,
    namespace,
    name,
  });
}

export async function k8sScaleResource(
  target: K8sClusterTarget,
  kind: string,
  namespace: string,
  name: string,
  replicas: number,
): Promise<KubectlJsonResult> {
  return invoke<KubectlJsonResult>("k8s_scale_resource", {
    target,
    kind,
    namespace,
    name,
    replicas,
  });
}

export async function k8sPodLogs(
  target: K8sClusterTarget,
  namespace: string,
  pod: string,
  container?: string | null,
  tailLines?: number,
): Promise<string> {
  return invoke<string>("k8s_pod_logs", {
    target,
    namespace,
    pod,
    container: container ?? null,
    tail_lines: tailLines ?? 200,
  });
}

export async function k8sPodShellCommand(
  target: K8sClusterTarget,
  namespace: string,
  pod: string,
  container?: string | null,
): Promise<string> {
  return invoke<string>("k8s_pod_shell_command", {
    target,
    namespace,
    pod,
    container: container ?? null,
  });
}

export async function k8sOpenPodShellLocal(
  target: K8sClusterTarget,
  namespace: string,
  pod: string,
  container?: string | null,
): Promise<void> {
  await invoke("k8s_open_pod_shell_local", {
    target,
    namespace,
    pod,
    container: container ?? null,
  });
}

export async function k8sPodContainers(
  target: K8sClusterTarget,
  namespace: string,
  pod: string,
): Promise<string[]> {
  return invoke<string[]>("k8s_pod_containers", { target, namespace, pod });
}

export async function k8sPortForwardStart(
  target: K8sClusterTarget,
  resourceKind: string,
  namespace: string,
  name: string,
  localPort: number,
  remotePort: number,
): Promise<PortForwardInfo> {
  return invoke<PortForwardInfo>("k8s_port_forward_start", {
    target,
    resource_kind: resourceKind,
    namespace,
    name,
    local_port: localPort,
    remote_port: remotePort,
  });
}

export async function k8sPortForwardStop(id: string): Promise<void> {
  await invoke("k8s_port_forward_stop", { id });
}

export async function k8sPortForwardList(): Promise<PortForwardInfo[]> {
  return invoke<PortForwardInfo[]>("k8s_port_forward_list");
}

export async function k8sHelmListReleases(
  target: K8sClusterTarget,
  namespace?: string | null,
): Promise<HelmReleaseRow[]> {
  return invoke<HelmReleaseRow[]>("k8s_helm_list_releases", {
    target,
    namespace: namespace ?? null,
  });
}

export async function k8sHelmGetValues(
  target: K8sClusterTarget,
  namespace: string,
  name: string,
): Promise<string> {
  return invoke<string>("k8s_helm_get_values", { target, namespace, name });
}

export async function k8sListCrdInstances(
  target: K8sClusterTarget,
  plural: string,
  namespace?: string | null,
): Promise<K8sResourceRow[]> {
  return invoke<K8sResourceRow[]>("k8s_list_crd_instances", {
    target,
    plural,
    namespace: namespace ?? null,
  });
}

export type K8sToolKind = "kubectl" | "helm" | "all";

export interface K8sToolInfo {
  name: string;
  installed: boolean;
  app_managed: boolean;
  path?: string | null;
  version?: string | null;
  latest_version?: string | null;
  update_available?: boolean;
}

export interface K8sToolsStatus {
  bin_dir: string;
  kubectl: K8sToolInfo;
  helm: K8sToolInfo;
}

export async function k8sToolsStatus(): Promise<K8sToolsStatus> {
  return invoke<K8sToolsStatus>("k8s_tools_status");
}

export async function k8sToolsInstall(
  tool: K8sToolKind,
): Promise<K8sToolsStatus> {
  return invoke<K8sToolsStatus>("k8s_tools_install", { tool });
}

export async function k8sClusterSummary(
  target: K8sClusterTarget,
): Promise<K8sClusterSummary> {
  return invoke<K8sClusterSummary>("k8s_cluster_summary", { target });
}

export async function k8sTopPods(
  target: K8sClusterTarget,
  namespace?: string | null,
): Promise<K8sTopPodRow[]> {
  return invoke<K8sTopPodRow[]>("k8s_top_pods", {
    target,
    namespace: namespace ?? null,
  });
}

export async function k8sOpenKubectlTerminal(
  target: K8sClusterTarget,
): Promise<void> {
  await invoke("k8s_open_kubectl_terminal", { target });
}

export async function k8sPodShellStart(
  target: K8sClusterTarget,
  namespace: string,
  pod: string,
  container?: string | null,
  cols?: number,
  rows?: number,
): Promise<K8sPodShellInfo> {
  return invoke<K8sPodShellInfo>("k8s_pod_shell_start", {
    target,
    namespace,
    pod,
    container: container ?? null,
    cols: cols ?? null,
    rows: rows ?? null,
  });
}

export async function k8sPodShellInput(
  id: string,
  data: string,
): Promise<void> {
  await invoke("k8s_pod_shell_input", { id, data });
}

export async function k8sPodShellResize(
  id: string,
  cols: number,
  rows: number,
): Promise<void> {
  await invoke("k8s_pod_shell_resize", { id, cols, rows });
}

export async function k8sPodShellStop(id: string): Promise<void> {
  await invoke("k8s_pod_shell_stop", { id });
}
