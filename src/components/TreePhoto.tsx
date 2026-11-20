"use client";

import Image from "next/image";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { loadImage, pixelate, smallImageUrl } from "@/lib/pixelate";
import {
  getPixelScale,
  getViewMode,
  PIXEL_SCALE,
  setPixelScale,
  setViewMode,
  subscribePixelScale,
  subscribeViewMode,
} from "@/lib/view-mode";

/**
 * A tree photo that can also show as pixel art. The choice, and how fine the
 * pixels are, is shared across the site; `toggle` adds the Photo / Pixel
 * switch (and, in pixel mode, the pixel size slider) on top of this one.
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
  /** Like next/image's `sizes`. A single px value ("48px") means a fixed-size thumbnail. */
  sizes: string;
  priority?: boolean;
  /** Pixels across in pixel mode, at the default pixel size. */
  cols?: number;
  toggle?: boolean;
  className?: string;
}) {
  const mode = useSyncExternalStore(subscribeViewMode, getViewMode, () => "photo" as const);
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pixel = mode === "pixel";
  const scale = useSyncExternalStore(subscribePixelScale, getPixelScale, () => PIXEL_SCALE.initial);
  const grid = Math.max(4, Math.min(128, Math.round(cols * scale)));
  // A fixed-size thumbnail (sizes="48px") only needs a 1x and a 2x copy.
  // `fill` with `sizes` would list every width Next.js knows: 16 URLs per photo.
  const fixed = /^(\d+)px$/.exec(sizes.trim());
  const px = fixed ? Number(fixed[1]) : 0;

  useEffect(() => {
    if (!pixel) return;
    let cancelled = false;
    const draw = async () => {
      const box = boxRef.current;
      const canvas = canvasRef.current;
      if (!box || !canvas || !box.clientWidth || !box.clientHeight) return;
      try {
        // Fine grids need a bigger copy to sample from; both copies are cached.
        const img = await loadImage(smallImageUrl(src, grid > 56 ? 256 : 128));
        if (cancelled) return;
        const art = pixelate(img, grid, box.clientWidth / box.clientHeight);
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
  }, [pixel, src, grid]);

  return (
    <div ref={boxRef} className={`relative overflow-hidden bg-ink ${className}`}>
      {px ? (
        <Image
          src={src}
          alt={alt}
          width={px}
          height={px}
          priority={priority}
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <Image src={src} alt={alt} fill sizes={sizes} priority={priority} draggable={false} className="object-cover" />
      )}
      {pixel && (
        <canvas ref={canvasRef} aria-hidden className="absolute inset-0 h-full w-full [image-rendering:pixelated]" />
      )}
      {toggle && (
        // Pointer and click events stop here, so using the controls never drags or opens a swipe card.
        <div
          className="absolute right-3 top-3 z-10 flex flex-col items-end gap-1.5"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="flex rounded-full bg-paper/85 p-0.5 text-xs font-semibold shadow-md backdrop-blur-sm"
            role="group"
            aria-label="Show the tree as"
          >
            {(["photo", "pixel"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setViewMode(m)}
                aria-pressed={mode === m}
                className={`rounded-full px-2.5 py-1 capitalize transition-colors ${mode === m ? "bg-ink text-paper" : "text-ink-2 hover:text-ink"}`}
              >
                {m}
              </button>
            ))}
          </div>
          {pixel && (
            <label className="rise flex items-center gap-1.5 rounded-full bg-paper/85 px-2.5 py-1.5 text-ink shadow-md backdrop-blur-sm" title="Pixel size">
              <svg viewBox="0 0 2 2" className="h-3 w-3 shrink-0" aria-hidden>
                <path d="M0 0h1v1H0zM1 1h1v1H1z" fill="currentColor" />
              </svg>
              <input
                type="range"
                min={PIXEL_SCALE.min}
                max={PIXEL_SCALE.max}
                step={PIXEL_SCALE.step}
                value={scale}
                onChange={(e) => setPixelScale(Number(e.target.value))}
                onDoubleClick={() => setPixelScale(PIXEL_SCALE.initial)}
                aria-label="Pixel size, from chunky to fine"
                aria-valuetext={`${grid} pixels across`}
                className="dial w-20"
              />
              <svg viewBox="0 0 4 4" className="h-3 w-3 shrink-0" aria-hidden>
                <path d="M0 0h1v1H0zM2 0h1v1H2zM1 1h1v1H1zM3 1h1v1H3zM0 2h1v1H0zM2 2h1v1H2zM1 3h1v1H1zM3 3h1v1H3z" fill="currentColor" />
              </svg>
            </label>
          )}
        </div>
      )}
    </div>
  );
}
