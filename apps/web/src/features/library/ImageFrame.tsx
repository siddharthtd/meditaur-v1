import type { CSSProperties } from "react";

export function ImageFrame({
  src,
  alt,
  className = "",
  style,
}: {
  src: string | null;
  alt: string;
  className?: string;
  /** Inline paint, for an accent hex Tailwind cannot know about. */
  style?: CSSProperties;
}) {
  return (
    <div
      style={style}
      className={`flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-surface-raised/80 ${className}`}
    >
      {src ? (
        <img src={src} alt={alt} className="max-h-full max-w-full object-contain" />
      ) : (
        <span className="text-xs text-muted">No image</span>
      )}
    </div>
  );
}
