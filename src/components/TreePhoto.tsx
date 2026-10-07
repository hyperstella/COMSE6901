"use client";

import Image from "next/image";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { loadImage, pixelate, smallImageUrl } from "@/lib/pixelate";
import { getViewMode, setViewMode, subscribeViewMode } from "@/lib/view-mode";

/**
 * A tree photo that can also show as pixel art. The choice is shared across
 * the site; `toggle` adds the Photo / Pixel switch on top of this one.
 */
export default function TreePhoto({
  src,
  alt,
  sizes,
  priority = false,
  cols = 44,
  toggle = false,
  className = "",
}: {
  src: string;
  alt: string;
  sizes: string;
  priority?: boolean;
  /** Pixels across in pixel mode. */
  cols?: number;
  toggle?: boolean;
  className?: string;
}) {
  const mode = useSyncExternalStore(subscribeViewMode, getViewMode, () => "photo" as const);
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pixel = mode === "pixel";

  useEffect(() => {
    if (!pixel) return;
    let cancelled = false;
    const draw = async () => {
      const box = boxRef.current;
      const canvas = canvasRef.current;
      if (!box || !canvas || !box.clientWidth || !box.clientHeight) return;
      try {
        const img = await loadImage(smallImageUrl(src, 128));
        if (cancelled) return;
        const art = pixelate(img, cols, box.clientWidth / box.clientHeight);
        canvas.width = art.width;
        canvas.height = art.height;
        canvas.getContext("2d")?.putImageData(art, 0, 0);
      } catch {
        // Leave the photo showing underneath.
      }
    };
    void draw();
    const ro = new ResizeObserver(() => void draw());
    if (boxRef.current) ro.observe(boxRef.current);
    return () => {
      cancelled = true;
      ro.disconnect();
    };
  }, [pixel, src, cols]);

  return (
    <div ref={boxRef} className={`relative overflow-hidden bg-ink ${className}`}>
      <Image src={src} alt={alt} fill sizes={sizes} priority={priority} draggable={false} className="object-cover" />
      {pixel && (
        <canvas ref={canvasRef} aria-hidden className="absolute inset-0 h-full w-full [image-rendering:pixelated]" />
      )}
      {toggle && (
        <div
          className="absolute right-3 top-3 z-10 flex rounded-full bg-paper/85 p-0.5 text-xs font-semibold shadow-md backdrop-blur-sm"
          onPointerDown={(e) => e.stopPropagation()}
          role="group"
          aria-label="Show the tree as"
        >
          {(["photo", "pixel"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setViewMode(m);
              }}
              aria-pressed={mode === m}
              className={`rounded-full px-2.5 py-1 capitalize transition-colors ${mode === m ? "bg-ink text-paper" : "text-ink-2 hover:text-ink"}`}
            >
              {m}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
