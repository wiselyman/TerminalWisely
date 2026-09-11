import { useEffect, useState } from "react";
import {
  mediaDisplaySrc,
  resolveMediaId,
} from "../../lib/aiEngineer/chatMedia";
import type { ToolMediaRef } from "../../lib/aiEngineer/turnMedia";

/** Show tool-fetched images when the assistant forgot markdown embeds. */
export function TurnMediaGallery({
  items,
  onImageClick,
}: {
  items: ToolMediaRef[];
  onImageClick?: (src: string) => void;
}) {
  if (!items.length) return null;
  return (
    <div className="ai-engineer-turn-media" data-testid="ai-engineer-turn-media">
      {items.map((item) => (
        <TurnMediaItem
          key={item.mediaId}
          item={item}
          onImageClick={onImageClick}
        />
      ))}
    </div>
  );
}

function TurnMediaItem({
  item,
  onImageClick,
}: {
  item: ToolMediaRef;
  onImageClick?: (src: string) => void;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const cached = await resolveMediaId(item.mediaId);
        if (!cancelled) setSrc(mediaDisplaySrc(cached));
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [item.mediaId]);

  if (failed) {
    return (
      <div className="ai-engineer-turn-media-failed" data-testid="ai-md-image-failed">
        image unavailable
      </div>
    );
  }
  if (!src) {
    return (
      <div className="ai-engineer-turn-media-loading" aria-hidden>
        …
      </div>
    );
  }
  return (
    <img
      className="ai-engineer-md-img"
      data-testid="ai-md-image"
      data-media-id={item.mediaId}
      src={src}
      alt=""
      onClick={() => onImageClick?.(src)}
    />
  );
}
