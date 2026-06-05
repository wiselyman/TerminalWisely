export const productIntro = {
  name: "TerminalWisely",
  tagline: "为日常运维准备的桌面终端",
  summary:
    "在同一窗口里管理本地 Shell 与 SSH 会话，用拖拽和点击完成上传、下载与目录浏览，减少在终端与文件管理器之间来回切换。",
  features: [
    {
      title: "拖拽上传",
      description: "将文件拖入 SSH 终端窗口，自动通过 SFTP 上传到当前远程目录。",
    },
    {
      title: "点击进目录",
      description: "在 ls 输出中点击目录名，自动执行 cd 并列出内容。",
    },
    {
      title: "快捷下载",
      description: "Ctrl / Cmd + 点击终端里的文件路径，下载到本机 Downloads 文件夹。",
    },
    {
      title: "跨服发送",
      description:
        "在 A 的 ls 输出里：按住 Ctrl/Cmd，在文件名上按下鼠标拖到顶部 B 的 SSH 标签再松开。",
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
      text: "将常用连接保存为书签，方便下次快速打开。",
    },
  ],
} as const;
