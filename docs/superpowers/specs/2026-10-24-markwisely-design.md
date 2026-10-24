# MarkWisely 独立 Markdown 编辑器设计

## 意图

在现有 Desktop Dock 加入名为 **MarkWisely** 的 Markdown 编辑器。点击 Dock 图标后打开一个正常的桌面应用窗口，提供新建、打开和最近打开；让 Markdown 编辑不必先从文件管理器打开预览。

同时修复 Hosts 空间标题栏的聊天与 Desktop 入口偶尔需要点击两次才切换的问题；每次有效点击都应让目标模式成为当前可见工作区。

## 目标

- MarkWisely 作为 Desktop 应用出现在 Dock，并可从桌面应用入口启动。
- 首次打开显示新建、打开、最近打开入口。
- 新建 Markdown 文件、选择并打开现有 Markdown 文件、切换到最近打开文件。
- 复用现有 Vditor 所见即所得编辑器、主题、远程图片和预览文件保存能力。
- 文件与最近列表属于当前 Desktop 的 SSH 主机；不同主机会话不可混用最近文件。
- Hosts 空间聊天模式与 Desktop 模式可在单击后互相切换，不要求重复点击。
- 编辑内容能保存回对应 SSH 主机的原路径；保存失败显示在编辑器窗口内，文档仍留在当前编辑状态。

## 非目标

- 不创建新的本机 Markdown 文件库或同步服务。
- 不改变现有文件预览中的 Markdown 编辑路径与保存行为。
- 不新增富文本格式或改变 Markdown 文件格式。

## 保留的旧行为

- Dock 现有应用继续由同一桌面 store 启动、聚焦、最小化、恢复和关闭。
- Desktop 文件管理器依当前 SSH session 操作远程文件。
- 文件预览中的 Markdown 编辑仍可打开远程 Markdown 并保存至原路径。
- 主机间切换时桌面窗口状态恢复，但文件操作始终以当前 app 的 sessionId 为准。
- 聊天与 Desktop 标题栏按钮仍保留原来的可点击区域和单击语义。

## 方案

1. **独立 Desktop 应用（采用）**：扩展 Desktop 应用 ID、Dock、窗口路由；MarkWisely 提供开始页与编辑页，使用当前 Desktop SSH 主机的文件操作，并复用 Vditor。完整满足“正常 app + 新建/打开/最近打开”。
2. **Dock 快捷方式跳转文件管理器**：成本较低，但没有独立应用窗口和开始页，不符合需求。
3. **独立本机编辑器**：需要绕过现有远程 Desktop 文件语义，并新增本机读写和跨平台文件授权；对当前 Desktop 的使用路径不一致，因此不采用。

## 架构

- `src/stores/desktopStore.ts`：增加 `markwisely` 应用窗口状态，纳入既有启动/恢复/关闭生命周期与 host workspace snapshot。
- `src/components/desktop/desktopApps.ts`、`DesktopDock.tsx`、`DesktopIcons.tsx`：注册 Dock/桌面图标；`src/App.tsx` 按应用 open 状态挂载 MarkWisely 窗口。
- 新建聚焦组件 `src/components/desktop/MarkWiselyWindow.tsx`：开始页、远程 Markdown 选择器、编辑器与保存状态。
- 新建 `src/stores/markWiselyStore.ts`：按 SSH session 管理当前文档、脏状态、保存状态和近期路径；不与通用 Preview Store 状态耦合。
- `src/components/preview/MarkdownWysiwygEditor.tsx`：复用编辑器核心；通过可选的保存回调/编辑器实例出口，让 MarkWisely 执行远程保存，并在关闭/切换文件前刷新编辑器内容。预览原有调用保持原样。
- 远程文件枚举与创建通过现有 `list_remote_directory`、`create_path` SFTP 命令；文件内容打开/保存通过现有 `preview_open`、`preview_save` 与 `preview_close` 接口，不引入本机文件权限。
- 最近打开列表使用按 session/host key 分区的本地 UI 元数据存储，仅保存远程路径和显示名；不存文件内容。
- i18n：`src/i18n/locales/{zh,en}/tools.json` 增加名称、入口、空状态、保存与错误反馈文案。

## 设计与交互

### 开始页

- 标题：`MarkWisely`。
- 主操作：`新建 Markdown`、`打开 Markdown`。
- 最近打开列表：显示文件名和父目录；点击后打开对应文件。无记录时显示“暂无最近打开的文件”。
- 初次加载时显示窗口内进度状态；加载失败时在列表区域显示错误和重试入口。

### 新建

1. 用户点击“新建 Markdown”。
2. 显示保存位置/文件名表单，默认目录来自当前远程文件管理器目录（若无则使用远程 home），文件名默认为 `未命名.md`。
3. 确认后在远程主机创建文件并打开编辑器。
4. 成功后出现在最近列表；失败时在表单内显示错误，用户输入保留。

### 打开

1. 用户点击“打开 Markdown”。
2. 在 MarkWisely 窗口内展示当前远程主机文件树/文件列表，筛选 Markdown 文件；用户可导航目录并选择文件。
3. 加载期间禁用重复打开；失败在选择器内显示错误并保留当前位置。
4. 成功后切到编辑器并更新最近列表。

### 编辑与保存

- 编辑区复用现有 Vditor 所见即所得编辑体验和主题。
- 工具栏提供保存、返回最近列表；保存快捷键沿用应用级约定（若已有 Ctrl/Cmd+S 则注册到此窗口）。
- 编辑中显示未保存状态；保存时显示进行中；成功显示已保存；失败显示错误并保留编辑内容与未保存状态。
- 切换文档/返回开始页前若有未保存修改，显示确认弹窗；取消时保持原文档和内容。

## 验收

- Dock 中可见可访问的 `MarkWisely`；点击打开其独立窗口。
- 可创建 Markdown 并编辑、保存回当前 SSH 主机；重新打开内容一致。
- 可通过远程文件选择器打开 Markdown；最近列表恢复同主机文档且切换主机不串数据。
- 空列表、加载中、读取失败、保存失败、未保存离开确认都有可见状态。
- 现有 Markdown Preview 与 Dock 其他应用路径保持可用。
- 重复交替点击标题栏聊天和 Desktop 入口，每次点击后目标工作区都可见、另一个不可见。
- UI 流程用 Playwright 覆盖；新增 store/纯逻辑测试。
