interface UnsupportedPreviewProps {
  filename: string;
  totalSize: number;
  onOpenExternal?: () => void;
}

export function UnsupportedPreview({
  filename,
  totalSize,
  onOpenExternal,
}: UnsupportedPreviewProps) {
  return (
    <div className="preview-empty">
      <p>暂不支持在应用内预览此文件类型。</p>
      <p className="preview-empty-meta">{filename}</p>
      {onOpenExternal ? (
        <button type="button" className="preview-action-btn" onClick={onOpenExternal}>
          用系统默认程序打开
        </button>
      ) : null}
      <p className="preview-empty-meta">大小：{formatBytes(totalSize)}</p>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
