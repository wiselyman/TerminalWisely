import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Boxes,
  Box,
  CalendarClock,
  CircleDot,
  Container,
  Database,
  FileCog,
  FileKey2,
  Gauge,
  HardDrive,
  Hexagon,
  KeyRound,
  LayoutDashboard,
  Layers,
  Link2,
  Network,
  Package,
  Puzzle,
  Scale,
  Server,
  Shield,
  ShipWheel,
  Timer,
  Users,
  Workflow,
} from "lucide-react";
import type { K8sResourceCategory } from "../../lib/k8s/types";

/** Lens-like navigator icons — one distinct mark per resource kind. */
const CATEGORY_ICONS: Record<K8sResourceCategory, LucideIcon> = {
  cluster_overview: LayoutDashboard,
  nodes: Server,
  namespaces: Hexagon,
  events: Activity,
  pods: Box,
  deployments: Layers,
  statefulsets: Database,
  daemonsets: Workflow,
  replicasets: Boxes,
  jobs: Timer,
  cronjobs: CalendarClock,
  horizontalpodautoscalers: Gauge,
  services: Network,
  ingresses: Link2,
  networkpolicies: Shield,
  endpoints: CircleDot,
  configmaps: FileCog,
  secrets: FileKey2,
  resourcequotas: Scale,
  limitranges: Scale,
  persistentvolumeclaims: HardDrive,
  persistentvolumes: HardDrive,
  storageclasses: Package,
  serviceaccounts: Users,
  roles: KeyRound,
  rolebindings: KeyRound,
  clusterroles: KeyRound,
  clusterrolebindings: KeyRound,
  customresourcedefinitions: Puzzle,
  helm_releases: ShipWheel,
};

const GROUP_ICONS: Record<string, LucideIcon> = {
  cluster: Hexagon,
  workloads: Container,
  network: Network,
  config: FileCog,
  storage: HardDrive,
  access: Shield,
  helm: ShipWheel,
  custom: Puzzle,
};

export function K8sCategoryIcon({
  category,
  size = 14,
}: {
  category: K8sResourceCategory;
  size?: number;
}) {
  const Icon = CATEGORY_ICONS[category] ?? Box;
  return <Icon size={size} strokeWidth={1.75} aria-hidden className="k8s-tree-icon" />;
}

export function K8sNavGroupIcon({
  groupId,
  size = 12,
}: {
  groupId: string;
  size?: number;
}) {
  const Icon = GROUP_ICONS[groupId] ?? Hexagon;
  return <Icon size={size} strokeWidth={1.75} aria-hidden className="k8s-tree-group-icon" />;
}
