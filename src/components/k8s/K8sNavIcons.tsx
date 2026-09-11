import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AppWindow,
  Boxes,
  Box,
  CalendarClock,
  CircleDot,
  Container,
  Database,
  FileCog,
  FileKey2,
  Gauge,
  GitBranch,
  HardDrive,
  Hexagon,
  KeyRound,
  LayoutDashboard,
  Layers,
  Link2,
  Network,
  Package,
  Puzzle,
  Route,
  Scale,
  Server,
  Shield,
  ShipWheel,
  Timer,
  Users,
  Workflow,
  Zap,
} from "lucide-react";
import type { K8sResourceCategory } from "../../lib/k8s/types";

/** Lens-like navigator icons — one distinct mark per resource kind. */
const CATEGORY_ICONS: Record<K8sResourceCategory, LucideIcon> = {
  cluster_overview: LayoutDashboard,
  applications: AppWindow,
  workloads_overview: LayoutDashboard,
  nodes: Server,
  namespaces: Hexagon,
  events: Activity,
  pods: Box,
  deployments: Layers,
  statefulsets: Database,
  daemonsets: Workflow,
  replicasets: Boxes,
  replicationcontrollers: Boxes,
  jobs: Timer,
  cronjobs: CalendarClock,
  horizontalpodautoscalers: Gauge,
  services: Network,
  endpointslices: CircleDot,
  endpoints: CircleDot,
  ingresses: Link2,
  ingressclasses: Link2,
  networkpolicies: Shield,
  gatewayclasses: Route,
  gateways: Route,
  httproutes: Route,
  grpcroutes: Route,
  referencegrants: GitBranch,
  port_forwards: Zap,
  configmaps: FileCog,
  secrets: FileKey2,
  resourcequotas: Scale,
  limitranges: Scale,
  poddisruptionbudgets: Shield,
  priorityclasses: Gauge,
  runtimeclasses: Container,
  leases: Timer,
  mutatingwebhookconfigurations: FileCog,
  validatingwebhookconfigurations: FileCog,
  validatingadmissionpolicies: Shield,
  validatingadmissionpolicybindings: Shield,
  persistentvolumeclaims: HardDrive,
  persistentvolumes: HardDrive,
  storageclasses: Package,
  serviceaccounts: Users,
  roles: KeyRound,
  rolebindings: KeyRound,
  clusterroles: KeyRound,
  clusterrolebindings: KeyRound,
  customresourcedefinitions: Puzzle,
  helm_charts: ShipWheel,
  helm_releases: ShipWheel,
};

const GROUP_ICONS: Record<string, LucideIcon> = {
  overview: LayoutDashboard,
  cluster: Hexagon,
  workloads: Container,
  network: Network,
  config: FileCog,
  storage: HardDrive,
  security: Shield,
  gateway: Route,
  helm: ShipWheel,
  custom: Puzzle,
  access: Shield,
};

export function K8sCategoryIcon({
  category,
  size = 14,
}: {
  category: K8sResourceCategory;
  size?: number;
}) {
  const Icon = CATEGORY_ICONS[category];
  return <Icon size={size} strokeWidth={2} aria-hidden />;
}

export function K8sNavGroupIcon({
  groupId,
  size = 14,
}: {
  groupId: string;
  size?: number;
}) {
  const Icon = GROUP_ICONS[groupId] ?? Hexagon;
  return <Icon size={size} strokeWidth={2} aria-hidden />;
}
