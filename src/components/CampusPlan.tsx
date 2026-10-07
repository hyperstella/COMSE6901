"use client";

import Link from "next/link";
import { useRef } from "react";
import { BUILDINGS, COLLEGE_WALK, E, LAWNS, S, fromMap, toMap, type Building } from "@/lib/campus";

export type PlanPin = {
  id: string;
  name: string;
  x: number; // map_x, 0..1
  y: number; // map_y, 0..1
  rank?: number;
};

const PAD = 1.75;
const VIEW = `${-PAD} ${-PAD} ${S + PAD * 2} ${E + PAD * 2}`;
const LABELED = new Set(["Low Library", "Butler Library", "St. Paul's Chapel", "Uris Hall", "Pupin Hall"]);

const HEART = "M0 0.42C-0.54 0.06-0.52-0.4-0.22-0.42C-0.08-0.43-0.01-0.32 0-0.24C0.01-0.32 0.08-0.43 0.22-0.42C0.52-0.4 0.54 0.06 0 0.42Z";

/** A building seen from above: its roof. */
function Roof({ b }: { b: Building }) {
  const x = b.s0;
  const y = b.e0;
  const w = b.s1 - b.s0;
  const h = b.e1 - b.e0;
  const cx = x + w / 2;
  const cy = y + h / 2;
  switch (b.kind) {
    case "hall":
    case "pupin": {
      const long = w >= h;
      const inset = Math.min(w, h) / 2;
      return (
        <g>
          <rect x={x} y={y} width={w} height={h} fill="#8fcab4" stroke="#6ea893" strokeWidth={0.04} />
          <path
            d={long ? `M${x} ${y}L${x + inset} ${cy}L${x + w - inset} ${cy}L${x + w} ${y}M${x} ${y + h}L${x + inset} ${cy}M${x + w - inset} ${cy}L${x + w} ${y + h}` : `M${x} ${y}L${cx} ${y + inset}L${cx} ${y + h - inset}L${x} ${y + h}M${x + w} ${y}L${cx} ${y + inset}M${cx} ${y + h - inset}L${x + w} ${y + h}`}
            fill="none"
            stroke="#6ea893"
            strokeWidth={0.035}
          />
          {b.kind === "pupin" &&
            [-0.28, 0.28].map((t) => (
              <circle key={t} cx={long ? cx + t * w : cx} cy={long ? cy : cy + t * h} r={0.23} fill="#6fae96" stroke="#4f8a74" strokeWidth={0.03} />
            ))}
        </g>
      );
    }
    case "library":
      return <rect x={x} y={y} width={w} height={h} fill="#e9e1cd" stroke="#c9bc9f" strokeWidth={0.04} />;
    case "low": {
      // the terrace, then the Greek cross set toward its back (+s), as in the 3D book
      const size = Math.min(h, w - 0.4) * 0.9;
      const lx = x + w - size - 0.06;
      const lcx = lx + size / 2;
      const a = size * 0.29;
      const c = size * 0.28;
      return (
        <g>
          <rect x={x} y={y} width={w} height={h} fill="#efe7d4" stroke="#d6cab0" strokeWidth={0.03} />
          <path
            d={`M${lx} ${cy - c}H${lcx - a}V${cy - size / 2}H${lcx + a}V${cy - c}H${lx + size}V${cy + c}H${lcx + a}V${cy + size / 2}H${lcx - a}V${cy + c}H${lx}Z`}
            fill="#ece4d1"
            stroke="#c9bc9f"
            strokeWidth={0.04}
          />
          <circle cx={lcx} cy={cy} r={size * 0.27} fill="#e2d7ba" stroke="#c4b591" strokeWidth={0.04} />
          <circle cx={lcx} cy={cy} r={0.11} fill="#d3c59f" />
        </g>
      );
    }
    case "chapel":
      // nave east-west (along e), portico toward Low at the Broadway end
      return (
        <g>
          <rect x={cx - w * 0.36} y={y + 0.24} width={w * 0.72} height={h - 0.52} fill="#9a5a43" />
          <rect x={x} y={cy - 0.325} width={w} height={0.55} fill="#9a5a43" />
          <circle cx={cx} cy={y + h - 0.28} r={w * 0.34} fill="#9a5a43" />
          <rect x={cx - w * 0.3} y={y} width={w * 0.6} height={0.26} fill="#eee6d4" />
          <circle cx={cx} cy={cy - 0.05} r={w * 0.28} fill="#7fbfa6" stroke="#5f9c85" strokeWidth={0.03} />
        </g>
      );
    case "domed":
      return (
        <g>
          <rect x={x} y={y} width={w} height={h} fill="#bb6446" />
          <circle cx={cx} cy={cy} r={Math.min(w, h) * 0.36} fill="#ece2cc" stroke="#cbbd9c" strokeWidth={0.03} />
        </g>
      );
    case "cottage":
      return <rect x={x} y={y} width={w} height={h} fill="#7d858d" stroke="#646b72" strokeWidth={0.04} />;
    case "glass":
      // Lerner: brick, with its glass ramp wall facing the campus
      return (
        <g>
          <rect x={x} y={y} width={w} height={h} fill="#a4553e" stroke="#8a4533" strokeWidth={0.04} />
          <rect x={cx - w * 0.26} y={y + h - 0.04} width={w * 0.52} height={0.22} fill="#8ea5b5" stroke="#6f8797" strokeWidth={0.03} />
        </g>
      );
    case "tower":
      return (
        <g>
          <rect x={x} y={y} width={w} height={h} fill="#a9b1b8" stroke="#7d868d" strokeWidth={0.04} />
          <path d={`M${x} ${y}L${x + w} ${y + h}M${x + w} ${y}L${x} ${y + h}`} stroke="#7d868d" strokeWidth={0.04} />
        </g>
      );
    case "modern":
      return (
        <g>
          {b.podium && <rect x={x} y={y} width={w} height={h} fill="#8ea5b5" />}
          <rect
            x={b.podium ? cx - w * 0.41 : x}
            y={b.podium ? cy - h * 0.39 : y}
            width={b.podium ? w * 0.82 : w}
            height={b.podium ? h * 0.78 : h}
            fill={b.brick ? "#b8735a" : "#dcd6ca"}
            stroke={b.brick ? "#9a5c46" : "#bdb5a6"}
            strokeWidth={0.04}
          />
        </g>
      );
  }
}

function HeartPin({ s, e, rank, active }: { s: number; e: number; rank?: number; active?: boolean }) {
  const k = active ? 1.25 : 0.95;
  return (
    <g transform={`translate(${s} ${e - 0.5 * k}) scale(${k})`} className={active ? "plan-pin-active" : undefined}>
      <ellipse cx={0} cy={0.5} rx={0.22} ry={0.08} fill="rgba(40,30,20,0.25)" />
      <path d={HEART} fill="#d9566d" stroke="#fbf4ea" strokeWidth={0.07} />
      {rank !== undefined && (
        <text y={0.02} textAnchor="middle" dominantBaseline="middle" fontSize={0.42} fill="#fff8f0" className="font-display">
          {rank}
        </text>
      )}
    </g>
  );
}

/**
 * The campus from above, oriented like the storybook: 114th St at the left,
 * Amsterdam Ave along the bottom. Shows tree pins, or lets you drop one.
 */
export default function CampusPlan({
  pins = [],
  highlight,
  pick,
  onPick,
  className = "",
}: {
  pins?: PlanPin[];
  highlight?: string;
  pick?: { x: number; y: number } | null;
  onPick?: (p: { x: number; y: number }) => void;
  className?: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);

  const place = (s: number, e: number) => {
    const { mapX, mapY } = toMap(Math.min(S - 0.05, Math.max(0.05, s)), Math.min(E - 0.05, Math.max(0.05, e)));
    onPick?.({ x: Number(mapX.toFixed(4)), y: Number(mapY.toFixed(4)) });
  };

  const onClick = (ev: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    const m = svg?.getScreenCTM();
    if (!svg || !m || !onPick) return;
    const p = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(m.inverse());
    place(p.x, p.y);
  };

  const onKeyDown = (ev: React.KeyboardEvent) => {
    if (!onPick) return;
    const step = ev.shiftKey ? 0.5 : 0.12;
    const at = pick ? fromMap(pick.x, pick.y) : { s: S / 2, e: E / 2 };
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const mv = moves[ev.key];
    if (!mv) return;
    ev.preventDefault();
    place(at.s + mv[0], at.e + mv[1]);
  };

  const picked = pick ? fromMap(pick.x, pick.y) : null;
  const street = "#c3c1bb";

  return (
    <div className={`plan relative ${className}`}>
      <svg
        ref={svgRef}
        viewBox={VIEW}
        className={`block h-auto w-full ${onPick ? "cursor-crosshair" : ""}`}
        onClick={onClick}
        onKeyDown={onKeyDown}
        tabIndex={onPick ? 0 : undefined}
        role={onPick ? "application" : "img"}
        aria-label={
          onPick
            ? "Campus map. Click where the tree stands, or use the arrow keys to move the pin."
            : `Campus map with ${pins.length} tree${pins.length === 1 ? "" : "s"}`
        }
      >
        <rect x={-PAD} y={-PAD} width={S + PAD * 2} height={E + PAD * 2} fill="#f2ead8" />
        {/* streets */}
        <rect x={-PAD + 0.2} y={-1.6} width={S + PAD * 2 - 0.4} height={1.1} fill={street} />
        <rect x={-PAD + 0.2} y={E + 0.5} width={S + PAD * 2 - 0.4} height={1.1} fill={street} />
        <rect x={-1.6} y={-PAD + 0.2} width={1.1} height={E + PAD * 2 - 0.4} fill={street} />
        <rect x={S + 0.5} y={-PAD + 0.2} width={1.1} height={E + PAD * 2 - 0.4} fill={street} />
        <g stroke="#fbfaf6" strokeWidth={0.05} strokeDasharray="0.42 0.48">
          <path d={`M${-PAD + 0.4} -1.05H${S + PAD - 0.4}M${-PAD + 0.4} ${E + 1.05}H${S + PAD - 0.4}`} />
          <path d={`M-1.05 ${-PAD + 0.4}V${E + PAD - 0.4}M${S + 1.05} ${-PAD + 0.4}V${E + PAD - 0.4}`} />
        </g>
        <g className="font-display" fontSize={0.36} fill="#fbfaf6" letterSpacing={0.1} textAnchor="middle" dominantBaseline="middle">
          <text x={S / 2} y={E + 1.05}>AMSTERDAM AVENUE</text>
          <text x={S / 2} y={-1.05}>BROADWAY</text>
          <text transform={`translate(-1.05 ${E / 2}) rotate(-90)`}>W 114TH ST</text>
          <text transform={`translate(${S + 1.05} ${E / 2}) rotate(-90)`}>W 120TH ST</text>
        </g>
        {/* the campus block */}
        <rect x={-0.5} y={-0.5} width={S + 1} height={E + 1} fill="#e9e3d4" />
        <rect x={0} y={0} width={S} height={E} fill="#e4d8bf" />
        <rect x={COLLEGE_WALK.s0} y={-0.5} width={COLLEGE_WALK.s1 - COLLEGE_WALK.s0} height={E + 1} fill="#a9503d" />
        <rect x={7.05} y={3.65} width={1.5} height={2.95} fill="#a54c3a" />
        <g fill="none" stroke="#d6917a" strokeWidth={0.03}>
          {Array.from({ length: 3 }, (_, i) =>
            Array.from({ length: 6 }, (_, j) => <rect key={`${i}-${j}`} x={7.1 + i * 0.5} y={3.7 + j * 0.49} width={0.4} height={0.4} />),
          )}
        </g>
        <rect x={8.55} y={3.65} width={0.9} height={2.95} fill="#ebe3d0" />
        {Array.from({ length: 6 }, (_, i) => (
          <rect key={i} x={8.55 + i * 0.15} y={3.65} width={0.02} height={2.95} fill="#d3c7ad" />
        ))}
        {LAWNS.map((l, i) => (
          <rect key={i} x={l.s0} y={l.e0} width={l.s1 - l.s0} height={l.e1 - l.e0} fill="#4f8a44" stroke="#3f7438" strokeWidth={0.03} />
        ))}
        {BUILDINGS.map((b) => (
          <Roof key={b.name} b={b} />
        ))}
        <g className="font-display" fontSize={0.34} fill="#33403f" textAnchor="middle" dominantBaseline="middle" pointerEvents="none">
          {BUILDINGS.filter((b) => LABELED.has(b.name)).map((b) => (
            <text key={b.name} x={(b.s0 + b.s1) / 2} y={b.kind === "low" ? b.e1 + 0.32 : (b.e0 + b.e1) / 2} className="plan-label">
              {b.name}
            </text>
          ))}
          <text x={4.18} y={5.25} fill="#f2ead8" className="plan-label">
            South Field
          </text>
          <text x={6.7} y={E - 0.2} fill="#f2ead8" fontSize={0.26}>
            COLLEGE WALK
          </text>
        </g>
        <text x={S + PAD - 0.3} y={E + PAD - 0.2} textAnchor="end" fontSize={0.32} fill="#3f4c4b" className="font-display" letterSpacing={0.08}>
          N →
        </text>

        {pins.map((p) => {
          if (p.id === highlight) return null;
          const { s, e } = fromMap(p.x, p.y);
          return (
            <Link key={p.id} href={`/trees/${p.id}`} aria-label={p.name}>
              <title>{p.name}</title>
              <HeartPin s={s} e={e} rank={p.rank} />
            </Link>
          );
        })}
        {pins
          .filter((p) => p.id === highlight)
          .map((p) => {
            const { s, e } = fromMap(p.x, p.y);
            return <HeartPin key={p.id} s={s} e={e} rank={p.rank} active />;
          })}
        {picked && <HeartPin s={picked.s} e={picked.e} active />}
      </svg>
    </div>
  );
}
