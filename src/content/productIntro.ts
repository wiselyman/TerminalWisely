export const productIntro = {
  name: "TerminalWisely",
  tagline: "为日常运维准备的桌面终端",
  summary:
    "在同一窗口里管理本地 Git Bash 与 SSH 会话。拖拽上传、点击浏览与预览、右键下载与跨服发送、Find 文件搜索、服务器资源监控、任务管理器，以及页签快捷目录，减少在终端与文件管理器之间来回切换。",
  features: [
    {
      title: "拖拽上传",
      description:
        "将文件拖入 SSH 终端窗口，或拖到 SSH 标签上，自动通过 SFTP 上传到当前远程目录。",
    },
    {
      title: "点击浏览与预览",
      description:
        "单击 ls 中的目录进入；单击文件在右侧预览面板打开（文本、Markdown、CSV、图片、PDF 等），文本类支持全文搜索。",
    },
    {
      title: "右键下载与跨服发送",
      description:
        "SSH 会话中右键 ls 列出的文件或文件夹：下载到本机、发送到其他 SSH 服务器；也可沿用 Ctrl/Cmd+点击或拖拽到目标标签。",
    },
    {
      title: "页签快捷目录",
      description:
        "页签上 ~ 回到用户目录；彩色文件夹一键 cd 到常用路径。右键可编辑路径，删除需确认。",
    },
    {
      title: "书签与传输",
      description:
        "保存常用 SSH 连接并显示系统图标；多任务传输面板可查看进度并单独取消。",
    },
    {
      title: "服务器资源",
      description:
        "贴边工具栏打开，查看当前页签机器的 CPU、内存、磁盘、网络与系统信息，图形化展示并自动刷新。",
    },
    {
      title: "Find 文件搜索",
      description:
        "右侧贴边工具栏打开，在当前页签对应环境执行 find；Windows 本地需 Git Bash。点击结果进入目录或预览。",
    },
    {
      title: "任务管理器",
      description:
        "右侧贴边工具栏打开，查看当前页签对应机器（本地或 SSH）的进程、端口、内存与 CPU，支持搜索排序与确认后结束进程。",
    },
    {
      title: "命令导航",
      description:
        "贴边工具栏打开系统运维命令库：按服务、日志、磁盘、网络等分类浏览；点击后填参数，一键插入当前终端（不自动执行）。",
    },
  ],
  steps: [
    {
      icon: "local" as const,
      iconLabel: "Git Bash 本地终端",
      text: "侧栏书签第一项，点击打开 Git Bash 本地终端（Windows 需先安装 Git for Windows）。",
    },
    {
      icon: "ssh" as const,
      iconLabel: "Remote 远程 SSH",
      text: "页签栏右侧 + 或侧栏书签连接远程 Linux 服务器。",
    },
    {
      icon: "bookmark" as const,
      iconLabel: "书签",
      text: "常用 SSH 保存为书签；在 SSH 终端右键 ls 中的路径可下载、预览或发送到其他服务器。",
    },
  ],
} as const;
