"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { dayOfYear, hourOf, type LightState, type SeasonState, type SunState } from "./light";
import TreePhoto from "@/components/TreePhoto";
import { loadImage, smallImageUrl, treeLook, type TreeLook } from "@/lib/pixelate";
import type { CampusScene } from "./scene";

export type BookTree = {
  id: string;
  name: string;
  age: number;
  species: string | null;
  spot: string | null;
  imageUrl: string;
  likes: number;
  passes: number;
  mapX: number;
  mapY: number;
};

/** Relative brightness of a #rrggbb color, 0..1. */
function brightness(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function timeLabel(h: number) {
  let hh = Math.floor(h);
  let mm = Math.round((h - hh) * 60);
  if (mm === 60) {
    hh += 1;
    mm = 0;
  }
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${String(mm).padStart(2, "0")} ${hh >= 12 && hh < 24 ? "pm" : "am"}`;
}

/**
 * The home page: Columbia's campus as a pop-up book. Every tree on Treendr
 * is a heart on the map, numbered by rank. The season and the light follow
 * the real date and time unless you scrub them.
 */
export default function CampusBook({ serif, trees, error }: { serif: string; trees: BookTree[]; error?: string }) {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<CampusScene | null>(null);
  const [ready, setReady] = useState(false);
  // The clock is read once the scene starts in the browser, so the server's
  // time zone never leaks into the first render (and hydration matches).
  const [day, setDay] = useState<number | null>(null);
  const [hour, setHour] = useState<number | null>(null);
  const [open, setOpen] = useState(true);
  const [pixel, setPixel] = useState(false);
  const [playing, setPlaying] = useState<"year" | "day" | null>(null);
  const [info, setInfo] = useState<{ season: SeasonState; sun: SunState; light: LightState } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [looks, setLooks] = useState<Record<string, TreeLook>>({});

  const byId = useMemo(() => new Map(trees.map((t, i) => [t.id, { tree: t, rank: i + 1 }])), [trees]);
  const pins = useMemo(
    () => trees.map((t, i) => ({ id: t.id, mapX: t.mapX, mapY: t.mapY, rank: i + 1, look: looks[t.id] })),
    [trees, looks],
  );

  // Read each tree's colors from a tiny copy of its photo for its voxel model.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        trees.map(async (t) => {
          try {
            return [t.id, treeLook(await loadImage(smallImageUrl(t.imageUrl, 64)), t.species)] as const;
          } catch {
            return null;
          }
        }),
      );
      if (!cancelled) setLooks(Object.fromEntries(entries.filter((e) => e !== null)));
    })();
    return () => {
      cancelled = true;
    };
  }, [trees]);
  const onSelect = useRef((id: string) => router.push(`/trees/${id}`));
  useEffect(() => {
    onSelect.current = (id: string) => router.push(`/trees/${id}`);
  }, [router]);

  useEffect(() => {
    let disposed = false;
    let scene: CampusScene | null = null;
    (async () => {
      try {
        await document.fonts.load(`400 40px ${serif}`);
        const { createCampusScene } = await import("./scene");
        if (disposed || !canvasRef.current) return;
        scene = createCampusScene(canvasRef.current, {
          serif,
          onHover: (id, x, y) => setHover(id ? { id, x: Math.min(x + 18, window.innerWidth - 252), y: y + 18 } : null),
          onSelect: (id) => onSelect.current(id),
        });
        sceneRef.current = scene;
        setDay(dayOfYear());
        setHour(hourOf());
        setReady(true);
        setTimeout(() => scene?.setOpen(true), 250);
      } catch (e) {
        setFailure(e instanceof Error ? e.message : "WebGL is not available in this browser.");
      }
    })();
    return () => {
      disposed = true;
      scene?.dispose();
      sceneRef.current = null;
    };
  }, [serif]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || day === null || hour === null) return;
    const result = scene.setTime(day, hour);
    const id = requestAnimationFrame(() => setInfo(result));
    return () => cancelAnimationFrame(id);
  }, [day, hour, ready]);

  useEffect(() => {
    sceneRef.current?.setPins(pins);
  }, [pins, ready]);

  useEffect(() => {
    sceneRef.current?.setHighlight(highlight);
  }, [highlight, ready]);

  useEffect(() => {
    if (ready) sceneRef.current?.setOpen(open);
  }, [open, ready]);

  useEffect(() => {
    sceneRef.current?.setPixel(pixel);
  }, [pixel, ready]);

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      if (playing === "year") setDay((d) => ((d ?? 0) + 2) % 365);
      else setHour((h) => Math.round((((h ?? 0) + 0.1) % 24) * 10) / 10);
    }, 60);
    return () => clearInterval(t);
  }, [playing]);

  const backdrop = info?.light.backdrop ?? ["#e8eef2", "#c5cfd9"];
  // Pick the ink from how bright the sky behind the copy actually is, so dusk
  // (a dark sky that isn't "night" yet) still gets light text.
  const dark = brightness(backdrop[0]) * 0.6 + brightness(backdrop[1]) * 0.4 < 0.5;
  const date = day === null ? null : new Date(2026, 0, 1 + day);
  const ink = dark ? "#efe7d8" : "#2f3b3a";
  const hovered = hover ? byId.get(hover.id) : undefined;
  const totalLikes = trees.reduce((n, t) => n + t.likes, 0);

  return (
    <section
      className="relative h-[calc(100svh-3.5rem)] min-h-[560px] w-full overflow-hidden"
      style={{
        background: `radial-gradient(110% 85% at 45% 30%, ${backdrop[0]}, ${backdrop[1]})`,
        transition: "background 600ms",
        color: ink,
      }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 block h-full w-full cursor-grab touch-none active:cursor-grabbing"
        style={{ imageRendering: pixel ? "pixelated" : "auto" }}
        aria-label="A 3D pop-up book of Columbia's Morningside campus. Drag to turn it; hearts mark trees on Treendr."
      />

      <div
        className="pointer-events-none absolute left-4 top-4 max-w-[min(30rem,calc(100%-2rem))] sm:left-8 sm:top-7"
        // A soft halo in the sky's color keeps the copy readable over the book.
        style={{ textShadow: `0 0 18px ${backdrop[0]}, 0 0 4px ${backdrop[0]}` }}
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] opacity-60">The most eligible trees in Morningside Heights</p>
        <h1 className="wordmark mt-2 text-6xl sm:text-[5.25rem]">Treendr</h1>
        <p className="display mt-2 text-2xl sm:text-[1.9rem]">Single, rooted, and ready to mingle.</p>
        <p className="mt-2 hidden max-w-sm text-sm opacity-75 sm:block">
          Every tree on campus deserves a date. Snap one and AI writes its dating profile; swipe on its
          best lines, and the most liked trees rise to the top.
        </p>
        <div className="pointer-events-auto mt-4 flex flex-wrap gap-2 [text-shadow:none]">
          <Link href="/swipe" className="btn btn-like">
            Start swiping
          </Link>
          <Link href="/upload" className="btn btn-paper">
            Add a tree
          </Link>
        </div>
      </div>

      <aside className="card absolute right-4 top-4 hidden w-[17.5rem] p-4 text-ink md:block lg:right-6 lg:top-6">
        <div className="flex items-baseline justify-between">
          <h2 className="display text-2xl italic">Most eligible</h2>
          <span className="text-xs text-ink-3">
            {trees.length} tree{trees.length === 1 ? "" : "s"} · ♥ {totalLikes}
          </span>
        </div>
        {error ? (
          <p className="mt-3 text-sm text-ink-2">The grove is resting right now. Try again in a moment.</p>
        ) : trees.length === 0 ? (
          <p className="mt-3 text-sm text-ink-2">
            Nobody&apos;s on the market yet.{" "}
            <Link href="/upload" className="text-ink underline decoration-line underline-offset-4">
              Add the first tree
            </Link>{" "}
            and it&apos;ll get a heart on the map.
          </p>
        ) : (
          <ol className="mt-2 space-y-0.5" onMouseLeave={() => setHighlight(null)}>
            {trees.slice(0, 5).map((t, i) => (
              <li key={t.id}>
                <Link
                  href={`/trees/${t.id}`}
                  onMouseEnter={() => setHighlight(t.id)}
                  onFocus={() => setHighlight(t.id)}
                  onBlur={() => setHighlight(null)}
                  className="-mx-2 flex items-center gap-2.5 rounded-xl px-2 py-1.5 transition-colors hover:bg-ink/5"
                >
                  <span className={`display w-5 text-center text-2xl ${i === 0 ? "text-like" : "text-ink-3"}`}>{i + 1}</span>
                  <TreePhoto src={t.imageUrl} alt="" sizes="40px" cols={10} className="h-10 w-10 shrink-0 rounded-lg" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {t.name}, {t.age}
                    </span>
                    <span className="block truncate text-xs text-ink-2">{t.species}</span>
                  </span>
                  <span className="text-xs tabular-nums text-like">♥ {t.likes}</span>
                </Link>
              </li>
            ))}
          </ol>
        )}
        {trees.length > 5 && (
          <Link href="/trees" className="mt-2 inline-block text-xs text-ink-2 underline decoration-line underline-offset-4 hover:text-ink">
            See the whole grove
          </Link>
        )}
        <p className="mt-3 border-t border-line pt-2 text-[11px] leading-snug text-ink-3">
          Hover a heart to meet a tree, click to see its profile. Drag to turn the book.
        </p>
      </aside>

      {hovered && hover && (
        <div
          className="card pointer-events-none fixed z-40 flex w-60 gap-3 p-2.5 text-ink"
          style={{ left: hover.x, top: hover.y }}
        >
          <TreePhoto src={hovered.tree.imageUrl} alt="" sizes="64px" cols={14} className="h-16 w-16 shrink-0 rounded-lg" />
          <div className="min-w-0">
            <p className="display truncate text-xl">
              {hovered.tree.name}, {hovered.tree.age}
            </p>
            <p className="truncate text-xs text-ink-2">{hovered.tree.species}</p>
            <p className="mt-1 text-xs">
              <span className="text-like">#{hovered.rank} · ♥ {hovered.tree.likes}</span>
              <span className="text-ink-3"> · click to meet</span>
            </p>
          </div>
        </div>
      )}

      {failure && (
        <p className="card absolute left-1/2 top-1/2 w-[min(90%,26rem)] -translate-x-1/2 -translate-y-1/2 p-5 text-center text-ink">
          Couldn&apos;t open the 3D book: {failure}{" "}
          <Link href="/trees" className="underline underline-offset-4">
            See the grove instead
          </Link>
          .
        </p>
      )}

      <div
        className="absolute bottom-3 left-1/2 grid w-[min(860px,calc(100%-24px))] -translate-x-1/2 grid-cols-2 items-end gap-x-5 gap-y-2 rounded-2xl px-4 py-3 text-[13px] shadow-[0_18px_40px_-18px_rgba(40,30,20,0.45)] backdrop-blur-md sm:bottom-5 sm:grid-cols-[1fr_1fr_auto] sm:px-5"
        style={{ background: dark ? "rgba(24,30,48,0.72)" : "rgba(250,246,238,0.8)", color: ink }}
      >
        <label className="block">
          <span className="flex justify-between gap-2">
            <span className="opacity-60">Season</span>
            <span className="truncate font-semibold">
              {date && info ? `${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })} · ${info.season.name}` : "…"}
            </span>
          </span>
          <input type="range" min={0} max={364} value={day ?? 0} disabled={day === null} onChange={(e) => setDay(Number(e.target.value))} className="dial mt-2 w-full" aria-label="Day of the year" />
        </label>
        <label className="block">
          <span className="flex justify-between gap-2">
            <span className="opacity-60">Time</span>
            <span className="truncate font-semibold">{hour !== null && info ? `${timeLabel(hour)} · ${info.sun.phase}` : "…"}</span>
          </span>
          <input type="range" min={0} max={23.9} step={0.1} value={hour ?? 12} disabled={hour === null} onChange={(e) => setHour(Number(e.target.value))} className="dial mt-2 w-full" aria-label="Time of day" />
        </label>
        <div className="col-span-2 flex flex-wrap justify-center gap-1.5 sm:col-span-1 sm:justify-end">
          {[
            { label: "Now", on: false, act: () => (setDay(dayOfYear()), setHour(hourOf()), setPlaying(null)) },
            { label: "Year", on: playing === "year", act: () => setPlaying((p) => (p === "year" ? null : "year")) },
            { label: "Day", on: playing === "day", act: () => setPlaying((p) => (p === "day" ? null : "day")) },
            { label: "Pixel", on: pixel, act: () => setPixel((p) => !p) },
            { label: open ? "Close" : "Open", on: false, act: () => setOpen((o) => !o) },
          ].map((b) => (
            <button
              key={b.label}
              onClick={b.act}
              aria-pressed={b.on}
              className={`rounded-full border px-3 py-1 transition ${
                b.on ? "border-transparent bg-brick text-paper" : dark ? "border-white/25 hover:bg-white/10" : "border-ink/20 hover:bg-ink/5"
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
