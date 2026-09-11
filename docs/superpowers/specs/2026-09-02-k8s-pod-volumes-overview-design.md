# Pod overview Volumes (Lens-style)

**Date:** 2026-09-02  
**Status:** approved (design dialogue)  
**Choice:** Approach A — Pod Volumes section on Overview (type counts + expand); no usage metrics

## Problem

Lens Pod detail Overview includes a **Pod Volumes** block (PVC / ConfigMap / EmptyDir / Projected / … with expandable rows). TerminalWisely Overview is flat KV from `overview_from_json` and never surfaces `spec.volumes`.

## Goals

1. On **Pod** Overview only, show a **Pod Volumes** section when the resource declares volumes.
2. Group by volume type; collapsed row shows type label + count; expand lists each volume (name; PVC → claimName; optional mount paths from `volumeMounts`).
3. Parse from existing `detail.yaml` / JSON — no extra kubectl.
4. Hide the whole section when there are no volumes.

## Non-goals

- Disk / ephemeral-storage usage metrics.
- Fetching PVC capacity or binding status via extra API calls.
- Volumes UI for non-Pod kinds.
- Changing Rust `overview_from_json` shape (v1 is frontend parse + Overview UI).

## Type mapping

| Spec field | Display (en) | Display (zh) |
|------------|--------------|--------------|
| `persistentVolumeClaim` | Persistent Volume Claim | PersistentVolumeClaim |
| `configMap` | Config Map | ConfigMap |
| `secret` | Secret | Secret |
| `emptyDir` | Empty Dir | EmptyDir |
| `projected` | Projected | Projected |
| `hostPath` | Host Path | HostPath |
| `downwardAPI` | Downward API | DownwardAPI |
| `csi` | CSI | CSI |
| other single source key | Title-cased key | same |
| unknown / empty | Other | 其他 |

## Data

- Input: `detail.yaml` when kind is Pod and detail matches selected resource.
- Helper: `parsePodVolumes(doc) → PodVolumeGroup[]` (dedupe by name within type; stable type order preferring common Lens order then alpha).
- Mount paths: collect `spec.containers[].volumeMounts` (+ initContainers) where `name` matches volume name; show joined unique paths on expand.

## UI

- Section title i18n `overviewVolumes` /「Pod Volumes」.
- Each group: disclosure row (chevron) + type label + `N` count; expanded `<ul>` of volume lines.
- `data-testid="k8s-overview-volumes"`; group `k8s-overview-volume-group-{typeKey}`.

## Tests

- Unit: multi-type Pod JSON/YAML; empty; malformed; mount path join.
- Smoke: workbench / helper wiring if checklist covers overview.
- E2E mock Pod yaml with ≥1 PVC + emptyDir → Overview shows volumes section (optional if mock already loads overview).

## Acceptance

- [ ] Pod with mixed volumes shows grouped counts matching Lens categories.
- [ ] Expand reveals names / claimName / mounts.
- [ ] Non-Pod overview unchanged; empty volumes → no section.
- [ ] No new Tauri commands.
