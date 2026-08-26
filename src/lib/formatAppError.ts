import i18n from "../i18n";

const CODE_PREFIX = /^(ERR_[A-Z0-9_]+|PREVIEW_SUDO_REQUIRED)\b/;

/** Map known Chinese backend messages / error codes to i18n keys. */
const MESSAGE_TO_KEY: Array<{ match: RegExp | string; key: string }> = [
  { match: /^ERR_SSH_AUTH\b/, key: "errors:ERR_SSH_AUTH" },
  { match: /^ERR_SSH_TIMEOUT\b/, key: "errors:ERR_SSH_TIMEOUT" },
  { match: /^ERR_SSH_REFUSED\b/, key: "errors:ERR_SSH_REFUSED" },
  { match: /^ERR_TRANSFER_CANCELLED\b/, key: "errors:ERR_TRANSFER_CANCELLED" },
  { match: /^ERR_SAME_SESSION\b/, key: "errors:ERR_SAME_SESSION" },
  { match: /NotAllowedError/i, key: "errors:clipboardDenied" },
  { match: /密码错误或认证失败/, key: "errors:authFailed" },
  { match: /请输入密码/, key: "errors:passwordRequired" },
  { match: /无法连接到服务器/, key: "errors:connectionRefused" },
  { match: /连接超时/, key: "errors:connectionTimeout" },
  { match: /网络不可达/, key: "errors:networkUnreachable" },
  { match: /传输已取消/, key: "errors:transferCancelled" },
  { match: /源和目标不能是同一个会话/, key: "errors:sameSessionTransfer" },
  { match: /请选择文件，不能发送目录/, key: "errors:cannotSendDirectory" },
  { match: /源会话不存在/, key: "errors:sourceSessionMissing" },
  { match: /目标会话不存在/, key: "errors:targetSessionMissing" },
  { match: /目标会话必须是 SSH/, key: "errors:targetMustBeSsh" },
  { match: /无效的文件名/, key: "errors:invalidFilename" },
  { match: /无效的路径/, key: "errors:invalidPath" },
  { match: /路径为空/, key: "errors:pathEmpty" },
  { match: /目标必须是目录/, key: "errors:destMustBeDirectory" },
  { match: /无法操作根目录/, key: "errors:cannotOperateRoot" },
  { match: /名称不能为空/, key: "errors:nameEmpty" },
  { match: /名称不能包含路径分隔符/, key: "errors:nameHasSeparator" },
  { match: /无效的名称/, key: "errors:nameInvalid" },
  { match: /文件过大，暂不支持预览/, key: "errors:previewTooLarge" },
  { match: /这是目录，请单击进入目录/, key: "errors:previewIsDirectory" },
  { match: /预览已关闭/, key: "errors:previewClosed" },
  { match: /此文件类型不支持编辑/, key: "errors:previewNotEditable" },
  { match: /搜索路径不能为空/, key: "errors:findPathEmpty" },
  { match: /文件名模式不能为空/, key: "errors:findPatternEmpty" },
  { match: /当前没有可取消的传输任务/, key: "errors:noTransferToCancel" },
  { match: /无效的进程 ID/, key: "errors:invalidPid" },
];

export function formatAppError(err: unknown): string {
  const message = String(err ?? "").trim();
  if (!message) return i18n.t("common:operationFailed");

  if (message.includes("PREVIEW_SUDO_REQUIRED")) {
    const actionMatch = message.match(/PREVIEW_SUDO_REQUIRED:\s*(\S+)/);
    const pathMatch = message.match(/`([^`]+)`/);
    return i18n.t("errors:sudoRequired", {
      action: actionMatch?.[1] ?? "",
      path: pathMatch?.[1] ?? "",
    });
  }

  const codeMatch = message.match(CODE_PREFIX);
  if (codeMatch) {
    const key = `errors:${codeMatch[1]}`;
    if (i18n.exists(key)) return i18n.t(key);
  }

  for (const { match, key } of MESSAGE_TO_KEY) {
    if (typeof match === "string" ? message.includes(match) : match.test(message)) {
      return i18n.t(key);
    }
  }

  const pathNotFound = message.match(/路径不存在:\s*(.+)$/);
  if (pathNotFound) {
    return i18n.t("errors:pathNotFound", { path: pathNotFound[1] });
  }

  const remoteDirMissing = message.match(/Remote directory not found:\s*(.+)$/i);
  if (remoteDirMissing) {
    return i18n.t("errors:remoteDirNotFound", { path: remoteDirMissing[1] });
  }

  const remoteNotDir = message.match(/Remote path is not a directory:\s*(.+)$/i);
  if (remoteNotDir) {
    return i18n.t("errors:remoteNotDirectory", { path: remoteNotDir[1] });
  }

  const localMissing = message.match(/Local file not found:\s*(.+)$/i);
  if (localMissing) {
    return i18n.t("errors:localFileNotFound", { path: localMissing[1] });
  }

  const noSuchFile = message.match(/^No such file(?::\s*No such file)?(?:\s+or directory)?$/i);
  if (noSuchFile) {
    return i18n.t("errors:noSuchFile");
  }

  const killDenied = message.match(/权限不足，无法结束进程\s+(\d+):\s*(.*)$/);
  if (killDenied) {
    return i18n.t("errors:killPermissionDenied", {
      pid: killDenied[1],
      detail: killDenied[2],
    });
  }

  const killFailed = message.match(/结束进程失败:\s*(.*)$/);
  if (killFailed) {
    return i18n.t("errors:killProcessFailed", { detail: killFailed[1] });
  }

  const uploadedMany = message.match(/已上传\s+(\d+)\s+个文件/);
  if (uploadedMany) {
    return i18n.t("errors:uploadedMany", { count: uploadedMany[1] });
  }

  const uploadedOne = message.match(/已上传:\s*(.+)$/);
  if (uploadedOne) {
    return i18n.t("errors:uploadedOne", { filename: uploadedOne[1] });
  }

  const downloadedArchive = message.match(/已打包下载:\s*(.+)$/);
  if (downloadedArchive) {
    return i18n.t("errors:downloadedArchive", {
      filename: downloadedArchive[1],
    });
  }

  const downloaded = message.match(/已下载:\s*(.+)$/);
  if (downloaded) {
    return i18n.t("errors:downloaded", { filename: downloaded[1] });
  }

  const sentTo = message.match(/已发送到\s+(.+)$/);
  if (sentTo) {
    return i18n.t("errors:sentTo", { path: sentTo[1] });
  }

  return message;
}
