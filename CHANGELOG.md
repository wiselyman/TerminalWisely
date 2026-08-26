# Changelog

## [0.0.3] - 2026-08-26

Kubernetes workbench + AI K8S Engineer.

- Sidebar Hosts ↔ K8s; local kubeconfig + SSH kubectl bindings
- Resource browse, YAML apply/delete/scale (confirm), Pod logs/shell
- AI mode switches with sidebar; `k8s_*` tools + PolicyEngine; chat scoped by cluster

Kubernetes 工作台 + AI K8S Engineer。

- 侧栏主机 ↔ K8s；本机 kubeconfig + SSH kubectl
- 资源浏览、YAML 变更确认、Pod 日志/Shell
- AI 模式跟随侧栏；`k8s_*` + 策略审批；聊天按集群隔离

## [0.0.2] - 2026-08-26

In-app auto-update via GitHub Releases (confirm before install).

- Sidebar download badge when an update is available; menu **Check for Updates…**
- Signed updater artifacts and multi-format Linux `latest.json` (AppImage / deb / rpm targets)
- About dialog app icon; clear feedback when up to date or check fails

应用内在线升级（GitHub Releases，确认后安装）。

- 有更新时侧栏亮色下载图标；菜单「检查更新」
- 签名更新包与 Linux 多格式 `latest.json`（AppImage / deb / rpm）
- 关于对话框应用图标；已是最新 / 检查失败有明确提示

## [0.0.1] - 2026-08-26

Initial release.

- SSH terminal with multi-tab sessions, bookmarks, and SFTP file workspace
- AI Linux Engineer with OpenAI-compatible / Ollama / Anthropic-compatible / Gemini models
- Graded security policy, approval UI, and per-host chat
- Windows, macOS, and Linux installers (x86_64 and ARM64)
