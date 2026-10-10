# DB/K8s chrome UX: Home, live icons, no NULL spam, date pickers

## 要保住的旧行为

- Hosts chrome `+` still opens new SSH
- K8s sidebar `+` still adds cluster
- DB sidebar new-connection still works
- Cell edit (typed value) still mutates via approval when needed
- Full suite passes

## 架构

- [`sidebarViewStore.ts`](src/stores/sidebarViewStore.ts): switching to db/k8s does **not** force leaveHome
- [`App.tsx`](src/App.tsx): hide `chrome-new-session` on db (and k8s — add is in sidebar)
- [`K8sWorkbench.tsx`](src/components/k8s/K8sWorkbench.tsx): no redundant empty CTA when no cluster
- [`DbWorkbench.tsx`](src/components/db/DbWorkbench.tsx): liveDb/liveSchema icons; remove cell NULL button
- New [`DateTimeCellPicker.tsx`](src/components/db/DateTimeCellPicker.tsx): Navicat-style date/time/datetime popup (calendar + digital time + Cancel/OK)

## 设计

1. Enter DB/K8s → stay on Home until user opens a workspace/cluster
2. No chrome `+` tab on DB/K8s
3. After a successful connect/catalog load, DB/schema icons stay brand-colored when collapsed
4. No in-cell NULL shortcut (type empty / clear manually if needed later)
5. time/date/timestamp cells open a picker popup (not only native input)

## 任务

1. Home + hide chrome +
2. K8s empty trim
3. Live icons
4. Remove NULL button + e2e
5. DateTimeCellPicker + wire cell edit
6. Full suite
