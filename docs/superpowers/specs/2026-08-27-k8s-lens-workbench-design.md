# K8s Workbench — product spec (够用就好)

**Date:** 2026-08-27  
**Status:** draft  
**Stance:** 参考 Lens 的**交互习惯**，不对标 Lens，不追 Premium 功能。目标是把现有 kubectl 能力**好用、看得懂**，不是做第二个 Lens。

---

## 1. 我们要解决什么

用户在 TerminalWisely 里连接集群后，应能完成日常运维，**不必切到 Lens / 纯终端**：

| 必做 | 已有 / 待完善 |
|------|----------------|
| 浏览资源（Pod、Deployment、Service…） | 有列表，列信息太薄 |
| 看 YAML / 概览 | 有，概览可读性一般 |
| 日志、Shell、端口转发 | 有（详情页签） |
| 应用 / 删除 / 扩缩容 | 有 |
| Helm release 列表 | 有 |
| 导入 / 编辑 kubeconfig | 有 |
| 本机或 SSH 上跑 kubectl | 有 + 应用内安装 |
| AI 协助排查 | 有（sidecar） |

**不做：** Teamwork、EKS 自动发现、内置装 Prometheus、指标大盘、CSV 导出、列拖拽配置、Evict/Attach、Drill-into 导航、Applications 商城式视图。

---

## 2. 产品原则

1. **Terminal-first** — Pod Shell、远程命令走已有 SSH 会话；不另开一套终端体系。
2. **够用就好** — 列表列「说人话」即可，不追求和 Lens 列数一致。
3. **少层级** — 集群名只在顶栏页签出现一次；Workbench 里不再重复大标题。
4. **突变走策略** — Apply/Delete 仍走 PolicyEngine / 确认，不为了「快」绕过。
5. **不装监控栈** — 不帮用户在集群里装 Prometheus；若集群自带 metrics-server，可**只读**展示 `kubectl top`（可选，非阻塞）。

---

## 3. 当前缺口（用户反馈「寒碜」的根因）

这些是**真实体验问题**，不是「少做了 Lens Premium」：

1. **布局** — 列表很长时底部详情被挤没；树短时分隔线断（已在修）。
2. **列表** — 四列通用字段（Namespace / Name / Status / Extra），Pod 看不出 Restarts、Node、Age。
3. **详情** — Overview 是扁平键值；操作散在页签里，入口不直观。
4. **集群上下文** — 工作台内看不到版本号、连接是否正常。
5. **首次进入** — 没有简要集群摘要，直接空表。

---

## 4. 目标布局（简洁版）

保持：**侧栏集群列表** + **中间 Workbench**（不合并成 Lens 式单 Navigator）。

```
ConnectionPanel          K8s Workbench
├─ Hosts | K8s           ├─ 左：资源树（现有分组即可）
├─ 集群 firefly          ├─ 中：搜索 + 命名空间 + 列表（可滚动）
└─ kubectl/helm 状态     └─ 下或右：详情（YAML / 概览 / 日志 / Shell…）
                         └─ 底：版本号、端口转发 chip
```

**详情位置：** 优先 **列表下方可拖拽分割**（已实现），把滚动和分隔线修稳即可；**不强制**改成 Lens 式右侧栏，除非实现成本很低且明显更好。

---

## 5. 功能清单（按优先级）

### P0 — 能顺手可读（下一迭代）

- [ ] **列表按类型加列**（只改常用的，其余保持 4 列）  
  - Pods：`Name · Namespace · Status · Restarts · Node · Age`  
  - Deployments：`Name · Namespace · Ready · Age · Status`  
  - 其它：维持现状 + 用好 `extra`
- [ ] **工具栏** 显示 `{n} 项`（已有搜索、命名空间、刷新）
- [ ] **详情 Overview** 分组展示（Status / Meta / Conditions），别是一屏 `key: value`
- [ ] **工作台底栏** `firefly · v1.26.x`（`kubectl version` / cluster-info 一次拉取）
- [ ] **布局稳定** — 列表区独立滚动；详情区最小高度；树旁竖线通底（进行中）
- [ ] **集群摘要页**（导航第一项「概览」，非仪表盘）  
  - 版本、节点数、Pod 各 phase 数量  
  - 最近几条 Warning Event（有则显示，无则「无告警」）

### P1 — 操作顺手

- [ ] 行菜单补全：详情、日志、Shell、删除（与详情页签一致）
- [ ] 表头点击排序（Name / Age / Namespace）
- [ ] 详情顶栏快捷按钮（日志、Shell、删除）— 与页签并存
- [ ] 复制资源名
- [ ] 若检测到 metrics-server：`kubectl top pod` 填 CPU/内存列（**可选**，失败则隐藏列）

### P2 — 仅在有明确需求时做

- [ ] 从 K8s 视图一键开「带 context 的本地终端」
- [ ] AI：从详情「发给工程师」带 resource 上下文
- [ ] CRD 实例浏览体验打磨

### 明确不做

- Lens Premium / Spaces / 团队协作
- 内置安装 Prometheus / Grafana
- 指标时序图、环形仪表盘
- CSV 导出、列显示配置、预览/固定页签那套
- 为对标而改三栏 Lens 克隆 UI

---

## 6. 后端改动（最小）

**P0**

- `list_resources`：对 Pods / Deployments 解析 JSON 填 `extra` 或扩展 row 字段（Rust 侧一次做好）。
- `k8s_cluster_summary`：`version` + `node_count` + `pod_counts` + `recent_warnings[]`（Events API，limit 20）。

**P1 可选**

- `k8s_top_pods` / `k8s_top_nodes`：包装 `kubectl top`，metrics-server 不可用时返回空。

---

## 7. 文件 touch 列表（P0）

| 项 | 文件 |
|----|------|
| Pod/Deploy 列 | `resources.rs`, `types.ts`, `K8sWorkbench.tsx` |
| 概览页 | `K8sClusterSummary.tsx`（新）, `k8sStore` |
| 详情 Overview 排版 | `K8sWorkbench.tsx`, `App.css` |
| 底栏版本 | `K8sWorkbench.tsx`, `api.ts`, `commands/mod.rs` |
| 布局 | `WorkbenchShell.tsx`, `App.css`（滚动/分隔线） |

---

## 8. 验收标准（够用）

- 连上集群 → 概览能看到版本和 Pod 概况 → 打开 Pods → 能看懂谁在哪个 Node、重启几次 → 点一行 → 详情/YAML/日志/Shell 可用，**列表仍可滚动**。
- 全程不需要 Lens；AI 工程师、SSH Terminal、应用内 kubectl 行为不变。
- 无 Prometheus 也能完整使用；有 metrics-server 只是多两列数字。

---

## 9. 参考（仅供交互借鉴，非对标清单）

Lens 文档仅作「用户可能熟悉的模式」参考，Implement 时以 §5 为准：

- [Pods 列表常见列](https://docs.k8slens.dev/k8slens/using-lens/workloads/pods/)
- [Details 常见操作](https://docs.k8slens.dev/k8slens/using-lens/details-panel/)
