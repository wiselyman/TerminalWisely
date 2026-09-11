/** Lens-style grouped Kubernetes create-resource templates. */
export type K8sCreateTemplateGroupId =
  | "workloads"
  | "network"
  | "config"
  | "storage"
  | "access"
  | "cluster"
  | "admission"
  | "api";

export type K8sCreateTemplateId =
  | "CertificateSigningRequest"
  | "ClusterRole"
  | "ClusterRoleBinding"
  | "ConfigMap"
  | "CronJob"
  | "CSIDriver"
  | "CustomResourceDefinition"
  | "DaemonSet"
  | "Deployment"
  | "Endpoint"
  | "EndpointSlice"
  | "FlowSchema"
  | "HorizontalPodAutoscaler"
  | "Ingress"
  | "IngressClass"
  | "Job"
  | "Lease"
  | "LimitRange"
  | "MutatingWebhookConfiguration"
  | "Namespace"
  | "NetworkPolicy"
  | "PersistentVolume"
  | "PersistentVolumeClaim"
  | "Pod"
  | "PodDisruptionBudget"
  | "PriorityClass"
  | "PriorityLevelConfiguration"
  | "ReplicaSet"
  | "ReplicationController"
  | "ResourceQuota"
  | "Role"
  | "RoleBinding"
  | "RuntimeClass"
  | "Secret"
  | "Service"
  | "ServiceAccount"
  | "StatefulSet"
  | "StorageClass"
  | "ValidatingWebhookConfiguration"
  | "VolumeAttachment";

export type K8sCreateTemplateGroup = {
  id: K8sCreateTemplateGroupId;
  templates: readonly K8sCreateTemplateId[];
};

export const CREATE_RESOURCE_TEMPLATE_GROUPS: readonly K8sCreateTemplateGroup[] =
  [
    {
      id: "workloads",
      templates: [
        "Pod",
        "Deployment",
        "StatefulSet",
        "DaemonSet",
        "ReplicaSet",
        "ReplicationController",
        "Job",
        "CronJob",
        "HorizontalPodAutoscaler",
        "PodDisruptionBudget",
      ],
    },
    {
      id: "network",
      templates: [
        "Service",
        "Endpoint",
        "EndpointSlice",
        "Ingress",
        "IngressClass",
        "NetworkPolicy",
      ],
    },
    {
      id: "config",
      templates: ["ConfigMap", "Secret", "LimitRange", "ResourceQuota"],
    },
    {
      id: "storage",
      templates: [
        "PersistentVolumeClaim",
        "PersistentVolume",
        "StorageClass",
        "VolumeAttachment",
      ],
    },
    {
      id: "access",
      templates: [
        "ServiceAccount",
        "Role",
        "RoleBinding",
        "ClusterRole",
        "ClusterRoleBinding",
      ],
    },
    {
      id: "cluster",
      templates: [
        "Namespace",
        "PriorityClass",
        "RuntimeClass",
        "Lease",
        "CustomResourceDefinition",
        "CertificateSigningRequest",
        "CSIDriver",
      ],
    },
    {
      id: "admission",
      templates: [
        "ValidatingWebhookConfiguration",
        "MutatingWebhookConfiguration",
      ],
    },
    {
      id: "api",
      templates: ["FlowSchema", "PriorityLevelConfiguration"],
    },
  ] as const;

export const CREATE_RESOURCE_TEMPLATES: readonly K8sCreateTemplateId[] =
  CREATE_RESOURCE_TEMPLATE_GROUPS.flatMap((group) => group.templates);

function ns(namespace: string): string {
  return namespace.trim() || "default";
}

function meta(name: string, namespace: string, clusterScoped = false): string {
  const lines = [`  name: ${name}`];
  if (!clusterScoped) lines.push(`  namespace: ${ns(namespace)}`);
  return lines.join("\n");
}

const BUILDERS: Record<K8sCreateTemplateId, (namespace: string) => string> = {
  CertificateSigningRequest: () => `apiVersion: certificates.k8s.io/v1
kind: CertificateSigningRequest
metadata:
  name: my-csr
spec:
  request: BASE64_CSR_HERE
  signerName: kubernetes.io/kube-apiserver-client
  usages:
    - client auth
`,
  ClusterRole: () => `apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: my-cluster-role
rules:
  - apiGroups: [""]
    resources: ["pods"]
    verbs: ["get", "list", "watch"]
`,
  ClusterRoleBinding: (namespace) => `apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: my-cluster-role-binding
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: my-cluster-role
subjects:
  - kind: ServiceAccount
    name: default
    namespace: ${ns(namespace)}
`,
  ConfigMap: (namespace) => `apiVersion: v1
kind: ConfigMap
metadata:
${meta("my-configmap", namespace)}
data:
  key: value
`,
  CronJob: (namespace) => `apiVersion: batch/v1
kind: CronJob
metadata:
${meta("my-cronjob", namespace)}
spec:
  schedule: "0 * * * *"
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          containers:
            - name: main
              image: busybox:latest
              command: ["sh", "-c", "date"]
`,
  CSIDriver: () => `apiVersion: storage.k8s.io/v1
kind: CSIDriver
metadata:
  name: my-csi-driver
spec:
  attachRequired: false
  podInfoOnMount: false
`,
  CustomResourceDefinition: () => `apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: myresources.example.com
spec:
  group: example.com
  names:
    kind: MyResource
    plural: myresources
    singular: myresource
  scope: Namespaced
  versions:
    - name: v1
      served: true
      storage: true
      schema:
        openAPIV3Schema:
          type: object
          properties:
            spec:
              type: object
              x-kubernetes-preserve-unknown-fields: true
`,
  DaemonSet: (namespace) => `apiVersion: apps/v1
kind: DaemonSet
metadata:
${meta("my-daemonset", namespace)}
spec:
  selector:
    matchLabels:
      app: my-daemonset
  template:
    metadata:
      labels:
        app: my-daemonset
    spec:
      containers:
        - name: main
          image: nginx:latest
`,
  Deployment: (namespace) => `apiVersion: apps/v1
kind: Deployment
metadata:
${meta("my-deployment", namespace)}
spec:
  replicas: 1
  selector:
    matchLabels:
      app: my-app
  template:
    metadata:
      labels:
        app: my-app
    spec:
      containers:
        - name: main
          image: nginx:latest
`,
  Endpoint: (namespace) => `apiVersion: v1
kind: Endpoints
metadata:
${meta("my-endpoints", namespace)}
subsets:
  - addresses:
      - ip: 10.0.0.1
    ports:
      - port: 80
`,
  EndpointSlice: (namespace) => `apiVersion: discovery.k8s.io/v1
kind: EndpointSlice
metadata:
${meta("my-endpointslice", namespace)}
addressType: IPv4
ports:
  - port: 80
    protocol: TCP
endpoints:
  - addresses:
      - 10.0.0.1
`,
  FlowSchema: () => `apiVersion: flowcontrol.apiserver.k8s.io/v1
kind: FlowSchema
metadata:
  name: my-flowschema
spec:
  priorityLevelConfiguration:
    name: my-priority-level
  matchingPrecedence: 1000
  rules:
    - subjects:
        - kind: User
          user:
            name: admin
`,
  HorizontalPodAutoscaler: (namespace) => `apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
${meta("my-hpa", namespace)}
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: my-deployment
  minReplicas: 1
  maxReplicas: 5
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 80
`,
  Ingress: (namespace) => `apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
${meta("my-ingress", namespace)}
spec:
  rules:
    - host: example.local
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: my-service
                port:
                  number: 80
`,
  IngressClass: () => `apiVersion: networking.k8s.io/v1
kind: IngressClass
metadata:
  name: my-ingress-class
spec:
  controller: example.com/ingress-controller
`,
  Job: (namespace) => `apiVersion: batch/v1
kind: Job
metadata:
${meta("my-job", namespace)}
spec:
  template:
    spec:
      restartPolicy: Never
      containers:
        - name: main
          image: busybox:latest
          command: ["sh", "-c", "echo hello"]
`,
  Lease: (namespace) => `apiVersion: coordination.k8s.io/v1
kind: Lease
metadata:
${meta("my-lease", namespace)}
spec:
  holderIdentity: node-1
  leaseDurationSeconds: 30
`,
  LimitRange: (namespace) => `apiVersion: v1
kind: LimitRange
metadata:
${meta("my-limitrange", namespace)}
spec:
  limits:
    - type: Container
      default:
        cpu: 500m
        memory: 512Mi
      defaultRequest:
        cpu: 100m
        memory: 128Mi
`,
  MutatingWebhookConfiguration: () => `apiVersion: admissionregistration.k8s.io/v1
kind: MutatingWebhookConfiguration
metadata:
  name: my-mutating-webhook
webhooks:
  - name: example.mutating.webhook
    clientConfig:
      service:
        name: webhook
        namespace: default
        path: /mutate
    rules:
      - operations: ["CREATE"]
        apiGroups: [""]
        apiVersions: ["v1"]
        resources: ["pods"]
    admissionReviewVersions: ["v1"]
    sideEffects: None
`,
  Namespace: () => `apiVersion: v1
kind: Namespace
metadata:
  name: my-namespace
`,
  NetworkPolicy: (namespace) => `apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
${meta("my-networkpolicy", namespace)}
spec:
  podSelector:
    matchLabels:
      app: my-app
  policyTypes:
    - Ingress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              role: frontend
`,
  PersistentVolume: () => `apiVersion: v1
kind: PersistentVolume
metadata:
  name: my-pv
spec:
  capacity:
    storage: 1Gi
  accessModes:
    - ReadWriteOnce
  hostPath:
    path: /data/my-pv
`,
  PersistentVolumeClaim: (namespace) => `apiVersion: v1
kind: PersistentVolumeClaim
metadata:
${meta("my-pvc", namespace)}
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 1Gi
`,
  Pod: (namespace) => `apiVersion: v1
kind: Pod
metadata:
${meta("my-pod", namespace)}
spec:
  containers:
    - name: main
      image: nginx:latest
`,
  PodDisruptionBudget: (namespace) => `apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
${meta("my-pdb", namespace)}
spec:
  minAvailable: 1
  selector:
    matchLabels:
      app: my-app
`,
  PriorityClass: () => `apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: my-priority
value: 1000
globalDefault: false
description: Example priority class
`,
  PriorityLevelConfiguration: () => `apiVersion: flowcontrol.apiserver.k8s.io/v1
kind: PriorityLevelConfiguration
metadata:
  name: my-priority-level
spec:
  type: Limited
  limited:
    nominalConcurrencyShares: 10
    limitResponse:
      type: Queue
      queuing:
        queues: 16
        handSize: 4
        queueLengthLimit: 50
`,
  ReplicaSet: (namespace) => `apiVersion: apps/v1
kind: ReplicaSet
metadata:
${meta("my-replicaset", namespace)}
spec:
  replicas: 1
  selector:
    matchLabels:
      app: my-app
  template:
    metadata:
      labels:
        app: my-app
    spec:
      containers:
        - name: main
          image: nginx:latest
`,
  ReplicationController: (namespace) => `apiVersion: v1
kind: ReplicationController
metadata:
${meta("my-rc", namespace)}
spec:
  replicas: 1
  selector:
    app: my-app
  template:
    metadata:
      labels:
        app: my-app
    spec:
      containers:
        - name: main
          image: nginx:latest
`,
  ResourceQuota: (namespace) => `apiVersion: v1
kind: ResourceQuota
metadata:
${meta("my-resourcequota", namespace)}
spec:
  hard:
    pods: "10"
    requests.cpu: "4"
    requests.memory: 8Gi
`,
  Role: (namespace) => `apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
${meta("my-role", namespace)}
rules:
  - apiGroups: [""]
    resources: ["pods"]
    verbs: ["get", "list"]
`,
  RoleBinding: (namespace) => `apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
${meta("my-role-binding", namespace)}
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: my-role
subjects:
  - kind: ServiceAccount
    name: default
    namespace: ${ns(namespace)}
`,
  RuntimeClass: () => `apiVersion: node.k8s.io/v1
kind: RuntimeClass
metadata:
  name: my-runtime
handler: runc
`,
  Secret: (namespace) => `apiVersion: v1
kind: Secret
metadata:
${meta("my-secret", namespace)}
type: Opaque
stringData:
  key: value
`,
  Service: (namespace) => `apiVersion: v1
kind: Service
metadata:
${meta("my-service", namespace)}
spec:
  selector:
    app: my-app
  ports:
    - port: 80
      targetPort: 8080
`,
  ServiceAccount: (namespace) => `apiVersion: v1
kind: ServiceAccount
metadata:
${meta("my-service-account", namespace)}
`,
  StatefulSet: (namespace) => `apiVersion: apps/v1
kind: StatefulSet
metadata:
${meta("my-statefulset", namespace)}
spec:
  serviceName: my-service
  replicas: 1
  selector:
    matchLabels:
      app: my-statefulset
  template:
    metadata:
      labels:
        app: my-statefulset
    spec:
      containers:
        - name: main
          image: nginx:latest
`,
  StorageClass: () => `apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: my-storage-class
provisioner: kubernetes.io/no-provisioner
volumeBindingMode: WaitForFirstConsumer
`,
  ValidatingWebhookConfiguration: () => `apiVersion: admissionregistration.k8s.io/v1
kind: ValidatingWebhookConfiguration
metadata:
  name: my-validating-webhook
webhooks:
  - name: example.validating.webhook
    clientConfig:
      service:
        name: webhook
        namespace: default
        path: /validate
    rules:
      - operations: ["CREATE"]
        apiGroups: [""]
        apiVersions: ["v1"]
        resources: ["pods"]
    admissionReviewVersions: ["v1"]
    sideEffects: None
`,
  VolumeAttachment: () => `apiVersion: storage.k8s.io/v1
kind: VolumeAttachment
metadata:
  name: my-volumeattachment
spec:
  attacher: my-csi-driver
  nodeName: node-1
  source:
    persistentVolumeName: my-pv
`,
};

/** Build YAML for the selected template kind. */
export function createResourceYamlFromTemplate(
  templateId: K8sCreateTemplateId,
  namespace: string,
): string {
  const build = BUILDERS[templateId];
  return build ? build(namespace) : BUILDERS.ConfigMap(namespace);
}

/** Default YAML template for the K8s workbench “Create resource” action. */
export function defaultCreateResourceYaml(namespace: string): string {
  return createResourceYamlFromTemplate("ConfigMap", namespace);
}

export function isCreateTemplateId(value: string): value is K8sCreateTemplateId {
  return (CREATE_RESOURCE_TEMPLATES as readonly string[]).includes(value);
}

export function groupForTemplate(
  templateId: K8sCreateTemplateId,
): K8sCreateTemplateGroupId {
  for (const group of CREATE_RESOURCE_TEMPLATE_GROUPS) {
    if (group.templates.includes(templateId)) return group.id;
  }
  return "config";
}
