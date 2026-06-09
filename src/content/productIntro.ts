export const productIntro = {
  name: "TerminalWisely",
  tagline: "为日常运维准备的桌面终端",
  summary:
    "在同一窗口里管理本地 Shell 与 SSH 会话。拖拽上传、点击浏览与预览、任务管理器、快捷下载、跨服发送，以及页签快捷目录，减少在终端与文件管理器之间来回切换。",
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
      title: "快捷下载",
      description:
        "Ctrl / Cmd + 单击终端里的文件路径，下载到本机 Downloads/TerminalWisely 文件夹。",
    },
    {
      title: "跨服发送",
      description:
        "在 A 的 ls 输出里按住 Ctrl/Cmd，将文件名拖到顶部 B 的 SSH 标签再松开；也可用 Shift + 点击选择目标。",
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
      title: "任务管理器",
      description:
        "右侧贴边工具栏打开，查看当前页签对应机器（本地或 SSH）的进程、端口、内存与 CPU，支持搜索排序与确认后结束进程。",
    },
  ],
  steps: [
    {
      icon: "local" as const,
      iconLabel: "Local 本地终端",
      text: "点击侧栏按钮，创建本地终端。",
    },
    {
      icon: "ssh" as const,
      iconLabel: "Remote 远程 SSH",
      text: "点击侧栏按钮，填写 SSH 信息并连接远程主机。",
    },
    {
      icon: "bookmark" as const,
      iconLabel: "书签",
      text: "将常用连接保存为书签；在 SSH 页签用 + 添加快捷目录，单击 ls 中的文件体验预览。",
    },
  ],
} as const;
