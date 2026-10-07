import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { RenderPixelatedPass } from "three/addons/postprocessing/RenderPixelatedPass.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { BUILDINGS, COLLEGE_WALK, E, LAWNS, S, fromMap, type Building } from "@/lib/campus";
import type { TreeLook } from "@/lib/pixelate";
import { clamp, lightAt, mix, seasonAt, sunAt, type LightState, type SeasonState, type SunState } from "./light";

/**
 * Columbia's Morningside campus as a pop-up storybook, rendered with three.js.
 * Everything is laid out from src/lib/campus.ts. Campus coordinates (s, e)
 * map to x = s - S/2 (114th St at the left, 120th St at the right) and
 * z = e - E/2 (Broadway at the back, Amsterdam Ave at the front). The page
 * is y = 0 and the campus block sits on a low curb at y = G.
 */

/** A tree on Treendr. `look` (colors and shape read from its photo) builds its voxel model. */
export type ScenePin = { id: string; mapX: number; mapY: number; rank: number; look?: TreeLook };

export type CampusScene = {
  setTime: (day: number, hour: number) => { season: SeasonState; sun: SunState; light: LightState };
  setOpen: (open: boolean) => void;
  setPixel: (on: boolean) => void;
  setPins: (pins: ScenePin[]) => void;
  setHighlight: (id: string | null) => void;
  dispose: () => void;
};

export type SceneOptions = {
  serif: string;
  /** The pointer moved over (or off) a tree's heart. x, y are client coordinates. */
  onHover?: (id: string | null, x: number, y: number) => void;
  onSelect?: (id: string) => void;
};

type Popper = { object: THREE.Object3D; delay: number };
type TreeSpec = { x: number; z: number; y: number; s: number; off: number; pick: number; kind: "round" | "pine" };
type FacadeStyle = "brick" | "stone" | "modern" | "modernBrick" | "glass" | "tower" | "lerner" | "ramps";

const G = 0.07; // curb height of the campus block
const WALK = 0.5; // sidewalk inside the curb
const STREET = 1.1;
const OUTER = 0.4; // sidewalk across the street
const MAX_PINS = 150;

const X = (s: number) => s - S / 2;
const Z = (e: number) => e - E / 2;

const CAMPUS = { x0: X(0) - WALK, x1: X(S) + WALK, z0: Z(0) - WALK, z1: Z(E) + WALK };
const PAGE = {
  x0: CAMPUS.x0 - STREET - OUTER - 0.7,
  x1: CAMPUS.x1 + STREET + OUTER + 0.7,
  z0: CAMPUS.z0 - STREET - OUTER - 0.5,
  z1: CAMPUS.z1 + STREET + OUTER + 2.7,
};
const PAGE_W = PAGE.x1 - PAGE.x0;
const PAGE_D = PAGE.z1 - PAGE.z0;
const PAGE_Z = (PAGE.z0 + PAGE.z1) / 2;
const BOARD_T = 0.28; // cover board thickness
const SPINE_Z = PAGE.z0 - 0.06; // the hinge runs along the Broadway edge of the page
const HINGE_Y = 0.06; // half the gap the shut page leaves over the flattened campus

// ------------------------------------------------------------------ helpers

let seed = 11;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

type Ctx = CanvasRenderingContext2D & { letterSpacing: string };

function canvasTexture(w: number, h: number, draw: (ctx: Ctx) => void, color = true) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")! as Ctx;
  draw(ctx);
  const tex = new THREE.CanvasTexture(c);
  if (color) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

const std = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.88, metalness: 0, ...extra });

function shadowed<T extends THREE.Object3D>(o: T, cast = true, receive = true) {
  o.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) {
      c.castShadow = cast;
      c.receiveShadow = receive;
    }
  });
  return o;
}

function box(w: number, h: number, d: number, mat: THREE.Material | THREE.Material[], x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

function cylinder(r: number, h: number, mat: THREE.Material, x = 0, y = 0, z = 0, sides = 12, rTop = r) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, r, h, sides), mat);
  m.position.set(x, y, z);
  return m;
}

/** A hip roof over a w x d footprint: ridge along the longer side. */
function hipRoof(w: number, d: number, h: number) {
  const long = w >= d;
  const half = (long ? w - d : d - w) / 2;
  const r1 = long ? new THREE.Vector3(-half, h, 0) : new THREE.Vector3(0, h, -half);
  const r2 = long ? new THREE.Vector3(half, h, 0) : new THREE.Vector3(0, h, half);
  const a = new THREE.Vector3(-w / 2, 0, -d / 2);
  const b = new THREE.Vector3(w / 2, 0, -d / 2);
  const c = new THREE.Vector3(w / 2, 0, d / 2);
  const e = new THREE.Vector3(-w / 2, 0, d / 2);
  const tris = long
    ? [[e, c, r2], [e, r2, r1], [b, a, r1], [b, r1, r2], [a, e, r1], [c, b, r2]]
    : [[a, e, r2], [a, r2, r1], [c, b, r1], [c, r1, r2], [b, a, r1], [e, c, r2]];
  const pos: number[] = [];
  for (const t of tris) for (const v of t) pos.push(v.x, v.y, v.z);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** A triangular pediment facing +x, `w` wide along z. */
function pediment(w: number, h: number, depth: number) {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0);
  shape.lineTo(w / 2, 0);
  shape.lineTo(0, h);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  g.translate(0, 0, -depth / 2);
  g.rotateY(Math.PI / 2);
  return g;
}

// ------------------------------------------------------------------ facades

const facadeCache = new Map<string, { map: THREE.Texture; emissive: THREE.Texture }>();

const GRID: Record<FacadeStyle, { colW: number; floorH: number; base: number; ww: number; wh: number }> = {
  brick: { colW: 0.27, floorH: 0.29, base: 0.36, ww: 0.085, wh: 0.15 },
  stone: { colW: 0.34, floorH: 0.42, base: 0.3, ww: 0.12, wh: 0.27 },
  modern: { colW: 0.2, floorH: 0.22, base: 0.25, ww: 0.13, wh: 0.12 },
  modernBrick: { colW: 0.22, floorH: 0.24, base: 0.28, ww: 0.16, wh: 0.13 },
  glass: { colW: 0.3, floorH: 0.25, base: 0, ww: 0.3, wh: 0.25 },
  tower: { colW: 0.18, floorH: 0.17, base: 0.22, ww: 0.14, wh: 0.1 },
  lerner: { colW: 0.26, floorH: 0.27, base: 0.3, ww: 0.15, wh: 0.15 },
  ramps: { colW: 0.24, floorH: 0.36, base: 0, ww: 0.24, wh: 0.36 },
};

/** A face texture plus an emissive map that lights some windows at night. */
function facade(widthU: number, heightU: number, style: FacadeStyle) {
  const wq = Math.max(0.25, Math.round(widthU * 4) / 4);
  const hq = Math.max(0.1, Math.round(heightU * 20) / 20);
  const key = `${style}:${wq}:${hq}`;
  const hit = facadeCache.get(key);
  if (hit) return hit;

  const ppu = 112;
  const W = Math.min(1024, Math.max(32, Math.round(wq * ppu)));
  const H = Math.min(1024, Math.max(32, Math.round(hq * ppu)));
  const sx = W / wq;
  const sy = H / hq;
  const { colW, floorH, base, ww, wh } = GRID[style];
  const cols = Math.max(1, Math.floor((wq - 0.14) / colW));
  const rows = Math.max(1, Math.floor((hq - base - 0.1) / floorH));
  const x0 = (wq - cols * colW) / 2;
  const win = (r: number, c: number) => ({
    x: (x0 + c * colW + (colW - ww) / 2) * sx,
    y: H - (base + (floorH - wh) / 2 + r * floorH + wh) * sy,
    w: ww * sx,
    h: wh * sy,
  });
  const lit: boolean[] = [];
  for (let i = 0; i < cols * rows; i++) lit.push(rnd() < (style === "glass" || style === "ramps" ? 0.35 : 0.5));

  const grain = (ctx: Ctx, rgb: [number, number, number], alpha: number, n: number) => {
    for (let i = 0; i < n; i++) {
      const v = 0.9 + rnd() * 0.2;
      ctx.fillStyle = `rgba(${Math.round(rgb[0] * v)},${Math.round(rgb[1] * v)},${Math.round(rgb[2] * v)},${alpha})`;
      ctx.fillRect(rnd() * W, rnd() * H, 2 + rnd() * 6, 2);
    }
  };

  const map = canvasTexture(W, H, (ctx) => {
    const glass = "#3d4654";
    if (style === "brick" || style === "modernBrick") {
      ctx.fillStyle = style === "brick" ? "#bb6446" : "#a95a41";
      ctx.fillRect(0, 0, W, H);
      for (let y = 0; y < H; y += 5) {
        for (let x = (y / 5) % 2 ? 0 : -6; x < W; x += 12) {
          const v = 0.92 + rnd() * 0.14;
          ctx.fillStyle = `rgba(${Math.round(190 * v)},${Math.round(102 * v)},${Math.round(72 * v)},0.45)`;
          ctx.fillRect(x, y, 11, 4);
        }
      }
    }
    if (style === "brick") {
      // cream stone base with arched ground-floor windows, and a cornice band
      ctx.fillStyle = "#ece4d2";
      ctx.fillRect(0, H - base * sy, W, base * sy);
      ctx.fillRect(0, 0, W, 0.07 * sy);
      ctx.fillStyle = "#d9cdb5";
      ctx.fillRect(0, H - (base + 0.02) * sy, W, 0.025 * sy);
      for (let c = 0; c < cols; c++) {
        const aw = 0.1 * sx;
        const ax = (x0 + c * colW + (colW - 0.1) / 2) * sx;
        const top = H - (base - 0.05) * sy;
        ctx.fillStyle = glass;
        ctx.beginPath();
        ctx.moveTo(ax, H - 0.05 * sy);
        ctx.lineTo(ax, top + aw / 2);
        ctx.arc(ax + aw / 2, top + aw / 2, aw / 2, Math.PI, 0);
        ctx.lineTo(ax + aw, H - 0.05 * sy);
        ctx.fill();
      }
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const o = win(r, c);
          ctx.fillStyle = "#efe8d8";
          ctx.fillRect(o.x - 2, o.y - 2, o.w + 4, o.h + 5);
          ctx.fillStyle = glass;
          ctx.fillRect(o.x, o.y, o.w, o.h);
          ctx.fillStyle = "rgba(160,180,200,0.35)";
          ctx.fillRect(o.x, o.y, o.w, o.h * 0.35);
          ctx.fillStyle = "#efe8d8";
          ctx.fillRect(o.x, o.y + o.h / 2 - 1, o.w, 2);
        }
      }
    } else if (style === "modernBrick") {
      for (let r = 0; r <= rows; r++) {
        ctx.fillStyle = "#ddd3c2";
        ctx.fillRect(0, H - (base + r * floorH) * sy - 3, W, 4);
      }
      ctx.fillStyle = "#d9cfbd";
      ctx.fillRect(0, H - base * sy, W, base * sy);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const o = win(r, c);
          ctx.fillStyle = "#4a535e";
          ctx.fillRect(o.x, o.y, o.w, o.h);
          ctx.fillStyle = "rgba(170,190,205,0.3)";
          ctx.fillRect(o.x, o.y, o.w, o.h * 0.4);
        }
      }
    } else if (style === "stone") {
      ctx.fillStyle = "#ebe3d0";
      ctx.fillRect(0, 0, W, H);
      grain(ctx, [205, 192, 165], 0.25, (W * H) / 60);
      ctx.strokeStyle = "rgba(150,130,100,0.18)";
      ctx.lineWidth = 1;
      for (let y = H; y > 0; y -= 0.07 * sy) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }
      ctx.fillStyle = "#dcd1ba";
      ctx.fillRect(0, H - base * sy, W, base * sy);
      ctx.fillStyle = "#f3ede0";
      ctx.fillRect(0, 0, W, 0.08 * sy);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const o = win(r, c);
          ctx.fillStyle = "#f5f0e4";
          ctx.fillRect(o.x - 3, o.y - 3, o.w + 6, o.h + 6);
          ctx.fillStyle = glass;
          ctx.beginPath();
          ctx.moveTo(o.x, o.y + o.h);
          ctx.lineTo(o.x, o.y + o.w / 2);
          ctx.arc(o.x + o.w / 2, o.y + o.w / 2, o.w / 2, Math.PI, 0);
          ctx.lineTo(o.x + o.w, o.y + o.h);
          ctx.fill();
          ctx.fillStyle = "rgba(160,180,200,0.3)";
          ctx.fillRect(o.x, o.y + o.w / 2, o.w, o.h * 0.25);
        }
      }
    } else if (style === "modern") {
      ctx.fillStyle = "#e3dccf";
      ctx.fillRect(0, 0, W, H);
      grain(ctx, [210, 200, 185], 0.2, (W * H) / 80);
      for (let r = 0; r <= rows; r++) {
        ctx.fillStyle = "rgba(150,140,125,0.22)";
        ctx.fillRect(0, H - (base + r * floorH) * sy - 1, W, 2);
      }
      ctx.fillStyle = "#d3cbbd";
      ctx.fillRect(0, H - base * sy, W, base * sy);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const o = win(r, c);
          ctx.fillStyle = "#6f7881";
          ctx.fillRect(o.x, o.y, o.w, o.h);
          ctx.fillStyle = "rgba(200,215,225,0.35)";
          ctx.fillRect(o.x, o.y, o.w * 0.45, o.h);
        }
      }
    } else if (style === "glass") {
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, "#9db3c1");
      g.addColorStop(0.55, "#7c94a5");
      g.addColorStop(1, "#6a8191");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      for (let i = 0; i < 4; i++) {
        const x = rnd() * W;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + 0.25 * sx, 0);
        ctx.lineTo(x - 0.3 * sx, H);
        ctx.lineTo(x - 0.55 * sx, H);
        ctx.fill();
      }
      ctx.fillStyle = "#e6eaec";
      for (let c = 0; c <= cols; c++) ctx.fillRect((x0 + c * colW) * sx - 1.5, 0, 3, H);
      for (let y = H; y > 0; y -= floorH * sy) ctx.fillRect(0, y - 2, W, 3);
    } else if (style === "lerner") {
      // Lerner's Broadway walls: darker brick over a granite base, with
      // square punched windows between thin stone bands
      ctx.fillStyle = "#9a4f3b";
      ctx.fillRect(0, 0, W, H);
      for (let y = 0; y < H; y += 5) {
        for (let x = (y / 5) % 2 ? 0 : -6; x < W; x += 12) {
          const v = 0.9 + rnd() * 0.16;
          ctx.fillStyle = `rgba(${Math.round(168 * v)},${Math.round(88 * v)},${Math.round(66 * v)},0.5)`;
          ctx.fillRect(x, y, 11, 4);
        }
      }
      ctx.fillStyle = "#b7b3ab";
      ctx.fillRect(0, H - base * sy, W, base * sy);
      grain(ctx, [150, 146, 140], 0.35, (W * base * sy) / 40);
      ctx.fillStyle = "#cfcac0";
      ctx.fillRect(0, 0, W, 0.06 * sy);
      for (let r = 1; r < rows; r += 2) ctx.fillRect(0, H - (base + r * floorH) * sy - 2, W, 3);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const o = win(r, c);
          ctx.fillStyle = "#8d8a84";
          ctx.fillRect(o.x - 2, o.y - 2, o.w + 4, o.h + 4);
          ctx.fillStyle = "#39414b";
          ctx.fillRect(o.x, o.y, o.w, o.h);
          ctx.fillStyle = "rgba(170,190,205,0.28)";
          ctx.fillRect(o.x, o.y, o.w, o.h * 0.4);
        }
      }
    } else if (style === "ramps") {
      // the glass wall on the campus side, with the switchback ramps behind it
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "#a8bcc8");
      g.addColorStop(1, "#7790a1");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      const fh = floorH * sy;
      ctx.lineCap = "butt";
      for (let r = 0; r * fh < H; r++) {
        const yb = H - r * fh;
        const up = r % 2 === 0;
        ctx.strokeStyle = "rgba(232,232,226,0.85)";
        ctx.lineWidth = Math.max(3, 0.04 * sy);
        ctx.beginPath();
        ctx.moveTo(up ? W * 0.08 : W * 0.92, yb - fh * 0.12);
        ctx.lineTo(up ? W * 0.92 : W * 0.08, yb - fh * 0.88);
        ctx.stroke();
        ctx.strokeStyle = "rgba(60,70,80,0.35)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(up ? W * 0.08 : W * 0.92, yb - fh * 0.12 + 0.03 * sy);
        ctx.lineTo(up ? W * 0.92 : W * 0.08, yb - fh * 0.88 + 0.03 * sy);
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(255,255,255,0.1)";
      for (let i = 0; i < 3; i++) {
        const x = rnd() * W;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + 0.2 * sx, 0);
        ctx.lineTo(x - 0.25 * sx, H);
        ctx.lineTo(x - 0.45 * sx, H);
        ctx.fill();
      }
      ctx.fillStyle = "#e9ecec";
      for (let x = 0; x <= W; x += colW * sx * 0.5) ctx.fillRect(x - 1, 0, 2, H);
      for (let y = H; y > 0; y -= fh * 0.5) ctx.fillRect(0, y - 1, W, 2);
    } else if (style === "tower") {
      ctx.fillStyle = "#aab2b9";
      ctx.fillRect(0, 0, W, H);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const o = win(r, c);
          ctx.fillStyle = "#6b747c";
          ctx.fillRect(o.x, o.y, o.w, o.h);
        }
      }
      for (let r = 0; r <= rows; r++) {
        ctx.fillStyle = "#d9dde0";
        ctx.fillRect(0, H - (base + r * floorH) * sy - 1, W, 3);
      }
      ctx.fillStyle = "#c9ced2";
      ctx.fillRect(0, H - base * sy, W, base * sy);
      // the Northwest Corner Building's diagonal bracing
      ctx.strokeStyle = "#3c434a";
      ctx.lineWidth = Math.max(3, 0.045 * sx);
      const bays = Math.max(1, Math.round((hq - base) / (wq * 0.95)));
      const bh = (H - base * sy) / bays;
      for (let i = 0; i < bays; i++) {
        const top = i * bh;
        ctx.beginPath();
        ctx.moveTo(2, top);
        ctx.lineTo(W - 2, top + bh);
        ctx.moveTo(W - 2, top);
        ctx.lineTo(2, top + bh);
        ctx.stroke();
      }
      ctx.strokeRect(2, 2, W - 4, H - base * sy - 2);
    }
  });

  const emissive = canvasTexture(W, H, (ctx) => {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!lit[r * cols + c]) continue;
        const o = win(r, c);
        ctx.fillStyle = rnd() < 0.3 ? "#ffd9a0" : "#ffbf6b";
        if (style === "glass" || style === "ramps") ctx.fillStyle = "rgba(255,200,130,0.45)";
        ctx.fillRect(o.x, o.y, o.w, o.h);
      }
    }
  });
  const out = { map, emissive };
  facadeCache.set(key, out);
  return out;
}

function stripes() {
  return canvasTexture(256, 256, (ctx) => {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.06)";
      ctx.fillRect(i * 32, 0, 32, 256);
    }
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = `rgba(0,0,0,${rnd() * 0.06})`;
      ctx.fillRect(rnd() * 256, rnd() * 256, 2, 2);
    }
  });
}

function heartPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  const k = r / 44;
  ctx.beginPath();
  ctx.moveTo(cx, cy + 42 * k);
  ctx.bezierCurveTo(cx - 54 * k, cy + 6 * k, cx - 52 * k, cy - 40 * k, cx - 22 * k, cy - 42 * k);
  ctx.bezierCurveTo(cx - 8 * k, cy - 43 * k, cx - 1 * k, cy - 32 * k, cx, cy - 24 * k);
  ctx.bezierCurveTo(cx + 1 * k, cy - 32 * k, cx + 8 * k, cy - 43 * k, cx + 22 * k, cy - 42 * k);
  ctx.bezierCurveTo(cx + 52 * k, cy - 40 * k, cx + 54 * k, cy + 6 * k, cx, cy + 42 * k);
  ctx.closePath();
}

// ------------------------------------------------------------------ the scene

export function createCampusScene(canvas: HTMLCanvasElement, opts: SceneOptions): CampusScene {
  seed = 11;
  const serif = opts.serif;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(27, 1, 0.5, 220);
  const viewDir = new THREE.Vector3(-12.5, 22, 19.5).normalize();
  let userMoved = false;

  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0.2, -1.2, 2.2);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.enablePan = false;
  controls.minDistance = 18;
  controls.maxDistance = 80;
  // Turn the book all the way around; just don't look at it from underneath.
  controls.minPolarAngle = 0.25;
  controls.maxPolarAngle = 1.3;
  controls.rotateSpeed = 0.55;
  controls.zoomSpeed = 0.6;
  controls.addEventListener("start", () => (userMoved = true));

  // ---------------------------------------------------------------- lights
  const hemi = new THREE.HemisphereLight("#d4e2ef", "#e2cfae", 0.9);
  scene.add(hemi);
  const fill = new THREE.AmbientLight("#f4f1ec", 0.15);
  scene.add(fill);
  const sun = new THREE.DirectionalLight("#fff1dc", 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.camera.left = -17;
  sun.shadow.camera.right = 17;
  sun.shadow.camera.top = 17;
  sun.shadow.camera.bottom = -17;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 90;
  sun.shadow.radius = 9;
  sun.shadow.blurSamples = 24;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);

  // ---------------------------------------------------------------- the page
  // Streets, sidewalks and all the lettering are printed on the page.
  const CW = 3072;
  const CH = Math.round((CW * PAGE_D) / PAGE_W);
  const ppu = CW / PAGE_W;
  const px = (x: number) => (x - PAGE.x0) * ppu;
  const pz = (z: number) => (z - PAGE.z0) * ppu;
  const fillXZ = (ctx: Ctx, x0: number, z0: number, x1: number, z1: number) =>
    ctx.fillRect(px(x0), pz(z0), (x1 - x0) * ppu, (z1 - z0) * ppu);
  const letters = (ctx: Ctx, text: string, x: number, z: number, size: number, opts2: { rot?: number; spacing?: number; weight?: number; align?: CanvasTextAlign; color: string }) => {
    ctx.save();
    ctx.translate(px(x), pz(z));
    if (opts2.rot) ctx.rotate(opts2.rot);
    ctx.font = `${opts2.weight ?? 400} ${Math.round(size * ppu)}px ${serif}`;
    ctx.letterSpacing = `${Math.round((opts2.spacing ?? 0.3) * size * ppu)}px`;
    ctx.textAlign = opts2.align ?? "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = opts2.color;
    const shift = opts2.align === "left" || opts2.align === "right" ? 0 : ((opts2.spacing ?? 0.3) * size * ppu) / 2;
    ctx.fillText(text, shift, 0);
    ctx.restore();
  };

  const pageTex = canvasTexture(CW, CH, (ctx) => {
    ctx.fillStyle = "#f2ead8";
    ctx.fillRect(0, 0, CW, CH);
    for (let i = 0; i < 52000; i++) {
      const v = rnd();
      ctx.fillStyle = v < 0.5 ? `rgba(120,95,60,${rnd() * 0.05})` : `rgba(255,255,255,${rnd() * 0.08})`;
      ctx.fillRect(rnd() * CW, rnd() * CH, 1 + rnd() * 2, 1);
    }
    const edge = ctx.createLinearGradient(0, 0, CW, 0);
    edge.addColorStop(0, "rgba(110,85,50,0.10)");
    edge.addColorStop(0.04, "rgba(110,85,50,0)");
    edge.addColorStop(0.96, "rgba(110,85,50,0)");
    edge.addColorStop(1, "rgba(110,85,50,0.12)");
    ctx.fillStyle = edge;
    ctx.fillRect(0, 0, CW, CH);

    const asphalt = "#bdbcb7";
    const walk = "#e3dccb";
    const ax0 = PAGE.x0 + 0.35;
    const ax1 = PAGE.x1 - 0.35;
    const sz0 = PAGE.z0 + 0.3;
    const front = CAMPUS.z1 + STREET + OUTER;
    // outer sidewalks, then the streets on top
    ctx.fillStyle = walk;
    fillXZ(ctx, ax0, CAMPUS.z0 - STREET - OUTER, ax1, CAMPUS.z0 - STREET);
    fillXZ(ctx, ax0, CAMPUS.z1 + STREET, ax1, front);
    fillXZ(ctx, CAMPUS.x0 - STREET - OUTER, sz0, CAMPUS.x0 - STREET, front);
    fillXZ(ctx, CAMPUS.x1 + STREET, sz0, CAMPUS.x1 + STREET + OUTER, front);
    ctx.fillStyle = asphalt;
    fillXZ(ctx, ax0, CAMPUS.z0 - STREET, ax1, CAMPUS.z0); // Broadway
    fillXZ(ctx, ax0, CAMPUS.z1, ax1, CAMPUS.z1 + STREET); // Amsterdam
    fillXZ(ctx, CAMPUS.x0 - STREET, sz0, CAMPUS.x0, CAMPUS.z1 + STREET); // 114th
    fillXZ(ctx, CAMPUS.x1, sz0, CAMPUS.x1 + STREET, CAMPUS.z1 + STREET); // 120th
    for (let i = 0; i < 9000; i++) {
      ctx.fillStyle = `rgba(${rnd() < 0.5 ? "60,60,60" : "255,255,255"},${rnd() * 0.06})`;
      ctx.fillRect(rnd() * CW, rnd() * CH, 2, 2);
    }
    // curbs
    ctx.fillStyle = "rgba(90,85,75,0.22)";
    fillXZ(ctx, ax0, CAMPUS.z1 + STREET - 0.03, ax1, CAMPUS.z1 + STREET);
    fillXZ(ctx, ax0, CAMPUS.z0 - STREET, ax1, CAMPUS.z0 - STREET + 0.03);
    // dashed center lines
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    for (let x = ax0 + 0.3; x < ax1 - 0.6; x += 0.9) {
      if (Math.abs(x - CAMPUS.x0 + STREET / 2) < 0.9 || Math.abs(x - CAMPUS.x1 - STREET / 2) < 0.9) continue;
      fillXZ(ctx, x, CAMPUS.z1 + STREET / 2 - 0.025, x + 0.42, CAMPUS.z1 + STREET / 2 + 0.025);
      fillXZ(ctx, x, CAMPUS.z0 - STREET / 2 - 0.025, x + 0.42, CAMPUS.z0 - STREET / 2 + 0.025);
    }
    for (let z = sz0 + 0.3; z < CAMPUS.z1 - 0.4; z += 0.9) {
      if (Math.abs(z - CAMPUS.z0 + STREET / 2) < 0.9) continue;
      fillXZ(ctx, CAMPUS.x0 - STREET / 2 - 0.025, z, CAMPUS.x0 - STREET / 2 + 0.025, z + 0.42);
      fillXZ(ctx, CAMPUS.x1 + STREET / 2 - 0.025, z, CAMPUS.x1 + STREET / 2 + 0.025, z + 0.42);
    }
    // zebra crossings at College Walk and the corners
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    const zebra = (x: number, z0: number, z1: number, horizontal = false) => {
      for (let k = 0; k < 7; k++) {
        if (horizontal) fillXZ(ctx, z0 + 0.06, x - 0.3 + k * 0.09, z1 - 0.06, x - 0.3 + k * 0.09 + 0.05);
        else fillXZ(ctx, x - 0.3 + k * 0.09, z0 + 0.06, x - 0.3 + k * 0.09 + 0.05, z1 - 0.06);
      }
    };
    zebra(X((COLLEGE_WALK.s0 + COLLEGE_WALK.s1) / 2) + 0.03, CAMPUS.z1, CAMPUS.z1 + STREET);
    zebra(X((COLLEGE_WALK.s0 + COLLEGE_WALK.s1) / 2) + 0.03, CAMPUS.z0 - STREET, CAMPUS.z0);

    // street names, engraved like an old map
    const street = "rgba(250,247,240,0.92)";
    const midA = CAMPUS.z1 + STREET / 2;
    letters(ctx, "AMSTERDAM  AVENUE", -4.6, midA, 0.3, { color: street, spacing: 0.32 });
    letters(ctx, "AMSTERDAM  AVENUE", 6.4, midA, 0.3, { color: street, spacing: 0.32 });
    letters(ctx, "BROADWAY", -2.2, CAMPUS.z0 - STREET / 2, 0.3, { color: street, spacing: 0.4 });
    letters(ctx, "BROADWAY", 7.6, CAMPUS.z0 - STREET / 2, 0.3, { color: street, spacing: 0.4 });
    letters(ctx, "WEST  114TH  STREET", CAMPUS.x0 - STREET / 2, 0.6, 0.26, { color: street, rot: -Math.PI / 2, spacing: 0.3 });
    letters(ctx, "WEST  120TH  STREET", CAMPUS.x1 + STREET / 2, 0.6, 0.26, { color: street, rot: -Math.PI / 2, spacing: 0.3 });

    // the front margin
    const slate = "#3f4c4b";
    letters(ctx, "COLUMBIA", PAGE.x0 + 1.0, PAGE.z1 - 1.0, 1.1, { color: slate, spacing: 0.32, weight: 400, align: "left" });
    const sub = "MORNINGSIDE HEIGHTS CAMPUS    ·    114TH TO 120TH STREET    N";
    letters(ctx, sub, PAGE.x1 - 2.05, front + 0.75, 0.24, { color: slate, spacing: 0.3, align: "right" });
    // north arrow after the N
    ctx.strokeStyle = slate;
    ctx.fillStyle = slate;
    ctx.lineWidth = 0.025 * ppu;
    const ay = pz(front + 0.75);
    ctx.beginPath();
    ctx.moveTo(px(PAGE.x1 - 1.85), ay);
    ctx.lineTo(px(PAGE.x1 - 1.05), ay);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(px(PAGE.x1 - 1.0), ay);
    ctx.lineTo(px(PAGE.x1 - 1.16), ay - 0.07 * ppu);
    ctx.lineTo(px(PAGE.x1 - 1.16), ay + 0.07 * ppu);
    ctx.closePath();
    ctx.fill();
    // a fine rule framing the margin
    ctx.fillStyle = "rgba(63,76,75,0.35)";
    fillXZ(ctx, PAGE.x0 + 0.35, PAGE.z1 - 0.3, PAGE.x1 - 0.35, PAGE.z1 - 0.285);
  });
  const edgeTex = canvasTexture(512, 64, (ctx) => {
    ctx.fillStyle = "#efe6d2";
    ctx.fillRect(0, 0, 512, 64);
    for (let y = 0; y < 64; y += 2) {
      ctx.fillStyle = `rgba(150,125,90,${0.12 + rnd() * 0.12})`;
      ctx.fillRect(0, y, 512, 1);
    }
  });
  const clothMat = std("#1e4d46", { roughness: 0.75 });
  const boardD = PAGE.z1 + 0.4 - SPINE_Z;
  const cover = box(PAGE_W + 0.9, BOARD_T, boardD, clothMat, 0, -0.62 - BOARD_T / 2, SPINE_Z + boardD / 2);
  const edgeMat = std("#efe6d2", { map: edgeTex });
  const topMat = std("#ffffff", { map: pageTex, roughness: 0.92 });
  const block = box(PAGE_W, 0.62, PAGE_D, [edgeMat, edgeMat, topMat, edgeMat, edgeMat, edgeMat], 0, -0.31, PAGE_Z);
  scene.add(shadowed(cover, false, true), shadowed(block, false, true));

  // ---------------------------------------------------------------- the facing page
  // A second page on the front board, hinged along the Broadway edge. Built
  // shut (lying on the campus), then swung open about the hinge: it lies flat
  // behind the campus like the left page of an open book, and folds over it
  // when the book closes.
  const facingTex = canvasTexture(CW, CH, (ctx) => {
    ctx.fillStyle = "#f2ead8";
    ctx.fillRect(0, 0, CW, CH);
    for (let i = 0; i < 52000; i++) {
      const v = rnd();
      ctx.fillStyle = v < 0.5 ? `rgba(120,95,60,${rnd() * 0.05})` : `rgba(255,255,255,${rnd() * 0.08})`;
      ctx.fillRect(rnd() * CW, rnd() * CH, 1 + rnd() * 2, 1);
    }
    // the gutter shadow sits at the bottom of this page, by the spine
    const gutter = ctx.createLinearGradient(0, CH, 0, CH * 0.88);
    gutter.addColorStop(0, "rgba(110,85,50,0.22)");
    gutter.addColorStop(1, "rgba(110,85,50,0)");
    ctx.fillStyle = gutter;
    ctx.fillRect(0, 0, CW, CH);
    const slate = "#3f4c4b";
    const k = CW / PAGE_W;
    const text = (s: string, x: number, y: number, size: number, weight = 400, spacing = 0.2, color = slate) => {
      ctx.font = `${weight} ${Math.round(size * k)}px ${serif}`;
      ctx.letterSpacing = `${Math.round(spacing * size * k)}px`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = color;
      ctx.fillText(s, x * CW + (spacing * size * k) / 2, y * CH);
    };
    ctx.strokeStyle = "rgba(63,76,75,0.45)";
    ctx.lineWidth = 0.02 * k;
    ctx.strokeRect(0.6 * k, 0.6 * k, CW - 1.2 * k, CH - 1.2 * k);
    ctx.lineWidth = 0.008 * k;
    ctx.strokeRect(0.75 * k, 0.75 * k, CW - 1.5 * k, CH - 1.5 * k);
    // Set in the right half, down by the spine: the home page's hero copy
    // sits over the upper left of this page, so that part stays blank paper.
    const ink = "rgba(63,76,75,0.7)";
    const cx = 0.7;
    text("THE TREES OF", cx, 0.5, 0.34, 500, 0.4, ink);
    text("Morningside Heights", cx, 0.62, 1.25, 400, 0.02, ink);
    text("A POP-UP ATLAS OF THE COLUMBIA CAMPUS", cx, 0.73, 0.24, 500, 0.32, ink);
    ctx.fillStyle = "rgba(200,69,93,0.85)";
    heartPath(ctx, cx * CW, CH * 0.82, 0.24 * k);
    ctx.fill();
    text("Every heart is a tree with a dating profile, numbered by likes.", cx, 0.9, 0.24, 400, 0.04, ink);
  });
  const coverTex = canvasTexture(2048, Math.round((2048 * boardD) / (PAGE_W + 0.9)), (ctx) => {
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;
    const k = W / (PAGE_W + 0.9);
    ctx.fillStyle = "#1e4d46";
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 30000; i++) {
      ctx.fillStyle = rnd() < 0.5 ? `rgba(0,0,0,${rnd() * 0.12})` : `rgba(255,255,255,${rnd() * 0.05})`;
      ctx.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 3, 1);
    }
    const gold = "#d8b66a";
    ctx.strokeStyle = gold;
    ctx.lineWidth = 0.05 * k;
    ctx.strokeRect(0.8 * k, 0.8 * k, W - 1.6 * k, H - 1.6 * k);
    ctx.lineWidth = 0.015 * k;
    ctx.strokeRect(1.0 * k, 1.0 * k, W - 2.0 * k, H - 2.0 * k);
    ctx.fillStyle = gold;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `400 ${Math.round(2.2 * k)}px ${serif}`;
    ctx.letterSpacing = `${Math.round(0.5 * k)}px`;
    ctx.fillText("COLUMBIA", W / 2 + 0.25 * k, H * 0.42);
    ctx.font = `500 ${Math.round(0.36 * k)}px ${serif}`;
    ctx.letterSpacing = `${Math.round(0.12 * k)}px`;
    ctx.fillText("THE TREES OF MORNINGSIDE HEIGHTS", W / 2 + 0.06 * k, H * 0.6);
    heartPath(ctx, W / 2, H * 0.72, 0.28 * k);
    ctx.fill();
  });
  const leaf = new THREE.Group();
  leaf.position.set(0, HINGE_Y, SPINE_Z);
  {
    // Shut, this page lies face down on the campus, just above the lawns.
    const pageY = 2 * HINGE_Y; // underside of the shut page
    const facingMat = std("#ffffff", { map: facingTex, roughness: 0.92 });
    const leafBlock = box(PAGE_W, 0.62, PAGE_D, [edgeMat, edgeMat, edgeMat, facingMat, edgeMat, edgeMat], 0, pageY + 0.31 - HINGE_Y, PAGE_Z - SPINE_Z);
    const coverMat = std("#ffffff", { map: coverTex, roughness: 0.75 });
    const board = box(PAGE_W + 0.9, BOARD_T, boardD, [clothMat, clothMat, coverMat, clothMat, clothMat, clothMat], 0, pageY + 0.62 + BOARD_T / 2 - HINGE_Y, boardD / 2);
    leaf.add(shadowed(leafBlock), shadowed(board));
  }
  leaf.rotation.x = 0;
  scene.add(leaf);
  // The spine closes the back of the shut book.
  const spineH = 2 * HINGE_Y + 2 * (0.62 + BOARD_T);
  const spine = box(PAGE_W + 0.9, spineH, 0.12, clothMat, 0, HINGE_Y, SPINE_Z - 0.06);
  scene.add(shadowed(spine));

  // ---------------------------------------------------------------- the campus block
  const SW = CAMPUS.x1 - CAMPUS.x0;
  const SD = CAMPUS.z1 - CAMPUS.z0;
  const slabTex = canvasTexture(2048, Math.round((2048 * SD) / SW), (ctx) => {
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;
    const k = W / SW;
    const at = (s: number, e: number) => [(X(s) - CAMPUS.x0) * k, (Z(e) - CAMPUS.z0) * k] as const;
    const rect = (s0: number, e0: number, s1: number, e1: number) => {
      const [x0, y0] = at(s0, e0);
      const [x1, y1] = at(s1, e1);
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    };
    // sidewalk ring, then the paved campus
    ctx.fillStyle = "#e9e3d4";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(120,110,95,0.18)";
    for (let i = 0; i < W; i += 0.5 * k) ctx.fillRect(i, 0, 1, H);
    ctx.fillStyle = "#e4d8bf";
    rect(0, 0, S, E);
    for (let i = 0; i < 20000; i++) {
      ctx.fillStyle = rnd() < 0.5 ? `rgba(120,95,60,${rnd() * 0.06})` : `rgba(255,255,255,${rnd() * 0.1})`;
      ctx.fillRect(rnd() * W, rnd() * H, 2, 2);
    }
    // College Walk: red brick with stone edging
    ctx.fillStyle = "#a9503d";
    rect(COLLEGE_WALK.s0, -WALK, COLLEGE_WALK.s1, E + WALK);
    ctx.fillStyle = "rgba(255,230,210,0.08)";
    for (let e = -WALK; e < E + WALK; e += 0.12) rect(COLLEGE_WALK.s0, e, COLLEGE_WALK.s1, e + 0.05);
    ctx.fillStyle = "#d8c9ad";
    rect(COLLEGE_WALK.s0 - 0.04, 0, COLLEGE_WALK.s0, E);
    rect(COLLEGE_WALK.s1, 0, COLLEGE_WALK.s1 + 0.04, E);
    // Low Plaza: brick with stone diamonds
    const [px0, pz0] = at(7.05, 3.75);
    const [px1, pz1] = at(8.55, 6.75);
    ctx.fillStyle = "#a54c3a";
    ctx.fillRect(px0, pz0, px1 - px0, pz1 - pz0);
    ctx.strokeStyle = "#d6917a";
    ctx.lineWidth = 3;
    const cell = 0.5 * k;
    for (let x = px0 + cell * 0.1; x < px1 - cell * 0.5; x += cell) {
      for (let y = pz0 + cell * 0.1; y < pz1 - cell * 0.5; y += cell) {
        ctx.strokeRect(x, y, cell * 0.8, cell * 0.8);
        ctx.strokeRect(x + cell * 0.2, y + cell * 0.2, cell * 0.4, cell * 0.4);
      }
    }
    // brick paths: the east walk past Buell and St. Paul's, and the walk behind Low
    ctx.fillStyle = "#b25a45";
    rect(6.98, 6.95, 16.9, 7.15);
    rect(12.75, 1.1, 13.0, 7.15);
    // lawns are separate meshes; paint a darker bed under them for crisp edges
    ctx.fillStyle = "rgba(70,60,40,0.25)";
    for (const l of LAWNS) rect(l.s0 - 0.03, l.e0 - 0.03, l.s1 + 0.03, l.e1 + 0.03);
  });
  const slab = box(SW, G, SD, [std("#d9d0bd"), std("#d9d0bd"), std("#ffffff", { map: slabTex, roughness: 0.92 }), std("#d9d0bd"), std("#d9d0bd"), std("#d9d0bd")], (CAMPUS.x0 + CAMPUS.x1) / 2, G / 2, (CAMPUS.z0 + CAMPUS.z1) / 2);
  scene.add(shadowed(slab, false, true));

  const lawnTex = stripes();
  lawnTex.wrapS = lawnTex.wrapT = THREE.RepeatWrapping;
  const lawnMat = std("#3f7d38", { map: lawnTex, roughness: 0.95 });
  for (const l of LAWNS) {
    const w = l.s1 - l.s0;
    const d = l.e1 - l.e0;
    const m = box(w, 0.03, d, lawnMat, X((l.s0 + l.s1) / 2), G + 0.015, Z((l.e0 + l.e1) / 2));
    m.receiveShadow = true;
    scene.add(m);
  }

  // ---------------------------------------------------------------- buildings
  const poppers: Popper[] = [];
  const pop = (o: THREE.Object3D, delay: number) => {
    o.scale.y = 0.001;
    poppers.push({ object: o, delay });
    scene.add(o);
  };
  const windowMats: THREE.MeshStandardMaterial[] = [];
  const snowy: { mat: THREE.MeshStandardMaterial; base: string; amount: number }[] = [];
  const trim = std("#eee6d4", { roughness: 0.8 });
  const lime = std("#efe7d4", { roughness: 0.78 });
  const limeShade = std("#e0d5bd", { roughness: 0.8 });
  const column = std("#f6f0e3");
  const chimneyMat = std("#b25a42");
  const greenDome = (r: number) => {
    const mat = std("#7fbfa6", { flatShading: true, roughness: 0.6 });
    snowy.push({ mat, base: "#7fbfa6", amount: 0.7 });
    return new THREE.Mesh(new THREE.SphereGeometry(r, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2), mat);
  };
  const roofMat = (base: string, flatShading = true) => {
    const mat = std(base, { flatShading, roughness: 0.7 });
    snowy.push({ mat, base, amount: 0.85 });
    return mat;
  };
  const flatRoof = roofMat("#d6d0c4", false);

  function faceMat(u: number, h: number, style: FacadeStyle) {
    const f = facade(u, h, style);
    const glassy = style === "glass" || style === "ramps";
    const m = std("#ffffff", {
      map: f.map,
      emissiveMap: f.emissive,
      emissive: "#ffc477",
      emissiveIntensity: 0,
      roughness: glassy ? 0.35 : 0.88,
      metalness: glassy ? 0.15 : 0,
    });
    windowMats.push(m);
    return m;
  }
  /** A box whose four walls carry facades sized to fit; w runs along x and d along z. */
  function body(w: number, d: number, h: number, style: FacadeStyle, y0 = 0, top: THREE.Material = flatRoof) {
    const side = faceMat(d, h, style);
    const front = faceMat(w, h, style);
    return box(w, h, d, [side, side, top, top, front, front], 0, y0 + h / 2, 0);
  }
  function portico(g: THREE.Group, x: number, z: number, span: number, h: number, facing: 1 | -1, n = 4, y0 = 0) {
    for (let i = 0; i < n; i++) {
      const cz = z - span / 2 + (i * span) / (n - 1);
      g.add(cylinder(0.055, h, column, x, y0 + h / 2, cz, 10, 0.05));
    }
    g.add(box(0.26, 0.1, span + 0.24, trim, x, y0 + h + 0.05, z));
    const p = new THREE.Mesh(pediment(span + 0.24, 0.22, 0.24), trim);
    p.position.set(x, y0 + h + 0.1, z);
    if (facing === -1) p.rotation.y = Math.PI;
    g.add(p);
  }
  /** Chimneys poking out of a hip roof of height roofH; each runs down into the roof. */
  function chimneys(g: THREE.Group, w: number, d: number, y: number, roofH: number) {
    const long = Math.max(w, d);
    const short = Math.min(w, d);
    const n = Math.max(2, Math.round(long / 0.85));
    for (let i = 0; i < n; i++) {
      const t = -0.36 + (0.72 * i) / (n - 1);
      const side = (i % 2 ? 1 : -1) * short * 0.16;
      const cx = w >= d ? t * w : side;
      const cz = w >= d ? side : t * d;
      const top = roofH * (1 - Math.abs(side) / (short / 2)) + 0.2;
      g.add(box(0.12, top, 0.12, chimneyMat, cx, y + top / 2, cz));
      g.add(box(0.16, 0.05, 0.16, trim, cx, y + top, cz));
    }
  }

  const builders: Record<Building["kind"], (b: Building, w: number, d: number) => THREE.Group> = {
    hall(b, w, d) {
      const g = new THREE.Group();
      g.add(box(w + 0.1, 0.12, d + 0.1, trim, 0, 0.06, 0));
      g.add(body(w, d, b.h, "brick"));
      g.add(box(w + 0.14, 0.09, d + 0.14, trim, 0, b.h + 0.045, 0));
      const roofH = Math.min(w, d) * 0.42;
      const r = new THREE.Mesh(hipRoof(w + 0.16, d + 0.16, roofH), roofMat("#97d3bd"));
      r.position.y = b.h + 0.09;
      g.add(r);
      if (b.kind === "hall") chimneys(g, w, d, b.h + 0.09, roofH);
      return g;
    },
    pupin(b, w, d) {
      // Pupin: a brick hall with its two observatory domes
      const g = builders.hall(b, w, d);
      const long = w >= d;
      const drumH = Math.min(w, d) * 0.42 * 0.85;
      for (const t of [-0.28, 0.28]) {
        const cx = long ? t * w : 0;
        const cz = long ? 0 : t * d;
        g.add(cylinder(0.21, drumH, trim, cx, b.h + 0.09 + drumH / 2, cz, 12));
        const dome = greenDome(0.23);
        dome.position.set(cx, b.h + 0.09 + drumH, cz);
        g.add(dome);
      }
      return g;
    },
    library(b, w, d) {
      // Butler: limestone, with its colonnade facing South Field (+x)
      const g = new THREE.Group();
      g.add(box(w + 0.16, 0.16, d + 0.16, limeShade, 0, 0.08, 0));
      g.add(body(w, d, b.h, "stone"));
      g.add(box(w + 0.12, 0.12, d + 0.12, trim, 0, b.h + 0.06, 0));
      g.add(body(w - 0.45, d - 0.6, 0.34, "stone", b.h + 0.12));
      const n = Math.max(6, Math.floor((d - 0.8) / 0.3));
      const ch = b.h * 0.66;
      for (let i = 0; i < n; i++) {
        g.add(cylinder(0.06, ch, column, w / 2 + 0.12, 0.16 + ch / 2, -(d - 0.8) / 2 + (i * (d - 0.8)) / (n - 1), 10, 0.055));
      }
      g.add(box(0.3, 0.16, d - 0.55, trim, w / 2 + 0.12, 0.16 + ch + 0.08, 0));
      g.add(box(0.36, 0.08, d - 0.5, lime, w / 2 + 0.14, 0.04, 0));
      return g;
    },
    low(b, w, d) {
      // Built facing +z, then turned so the portico faces College Walk (-x).
      // A Greek cross: four arms around an octagonal core under the dome.
      const g = new THREE.Group();
      const inner = new THREE.Group();
      inner.rotation.y = -Math.PI / 2;
      g.add(inner);
      const lw = d; // across the front
      const ld = w; // front to back
      const terrace = 0.3;
      inner.add(box(lw, terrace, ld, lime, 0, terrace / 2, 0));
      const size = Math.min(lw, ld - 0.4) * 0.9;
      const zc = -(ld - size) / 2 + 0.06; // sits at the back, leaving the top of the steps in front
      const mh = b.h * 0.78;
      const armN = body(size * 0.58, size, mh, "stone", terrace);
      const armE = body(size, size * 0.56, mh, "stone", terrace);
      armN.position.z = armE.position.z = zc;
      inner.add(armN, armE);
      const apothem = (size / 2) * 0.89;
      const R8 = apothem / Math.cos(Math.PI / 8);
      const coreH = mh * 1.12;
      const core = new THREE.Mesh(
        new THREE.CylinderGeometry(R8, R8, coreH, 8).rotateY(Math.PI / 8),
        [faceMat(8 * 2 * R8 * Math.sin(Math.PI / 8), coreH, "stone"), flatRoof, flatRoof],
      );
      core.position.set(0, terrace + coreH / 2, zc);
      inner.add(core);
      inner.add(box(size * 0.6, 0.08, size + 0.06, trim, 0, terrace + mh + 0.04, zc));
      inner.add(box(size + 0.06, 0.08, size * 0.58, trim, 0, terrace + mh + 0.04, zc));
      // portico: ten columns across the south arm
      const span = size * 0.5;
      const zf = zc + size / 2 + 0.1;
      for (let i = 0; i < 10; i++) inner.add(cylinder(0.055, mh * 0.82, column, -span / 2 + (i * span) / 9, terrace + (mh * 0.82) / 2, zf, 10, 0.05));
      inner.add(box(span + 0.2, 0.18, 0.3, lime, 0, terrace + mh * 0.82 + 0.09, zf - 0.06));
      // drum, thermal windows, dome and lantern
      const r = size * 0.27;
      const drumY = terrace + coreH;
      const drum = cylinder(r * 1.04, 0.3, lime, 0, drumY + 0.15, zc, 8);
      drum.rotation.y = Math.PI / 8;
      inner.add(drum);
      for (let k = 0; k < 4; k++) {
        const winMesh = new THREE.Mesh(new THREE.CircleGeometry(r * 0.26, 16, 0, Math.PI), std("#3c4a57"));
        const a = (k * Math.PI) / 2;
        winMesh.position.set(Math.sin(a) * apothem * 1.001, terrace + coreH - 0.32, zc + Math.cos(a) * apothem * 1.001);
        winMesh.rotation.y = a;
        inner.add(winMesh);
      }
      const domeMat = std("#e6dcc0", { flatShading: true, roughness: 0.65 });
      snowy.push({ mat: domeMat, base: "#e6dcc0", amount: 0.7 });
      const dome = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), domeMat);
      dome.scale.y = 0.82;
      dome.position.set(0, drumY + 0.3, zc);
      inner.add(dome);
      inner.add(cylinder(0.11, 0.22, lime, 0, drumY + 0.3 + r * 0.82 + 0.09, zc, 10));
      return g;
    },
    chapel(b, w, d) {
      // St. Paul's: brick nave running east-west, a green dome over the
      // crossing, an apse at the Amsterdam end and the portico facing Low.
      // Built with the portico at -x, then turned so it faces west (-z).
      const g = new THREE.Group();
      const inner = new THREE.Group();
      inner.rotation.y = -Math.PI / 2;
      g.add(inner);
      const L = d;
      const D = w;
      const naveX0 = -L / 2 + 0.24;
      const naveX1 = L / 2 - 0.28;
      const nave = body(naveX1 - naveX0, D * 0.72, b.h, "brick");
      nave.position.x = (naveX0 + naveX1) / 2;
      const cross = -0.05;
      const transept = body(0.55, D, b.h, "brick");
      transept.position.x = cross;
      inner.add(nave, transept);
      const apse = new THREE.Mesh(new THREE.CylinderGeometry(D * 0.34, D * 0.34, b.h, 14, 1, false, 0, Math.PI), std("#b4634a"));
      apse.position.set(naveX1, b.h / 2, 0);
      inner.add(apse);
      const tile = roofMat("#9a5a43");
      const naveRoof = new THREE.Mesh(hipRoof(naveX1 - naveX0 + 0.04, D * 0.76, 0.3), tile);
      naveRoof.position.set((naveX0 + naveX1) / 2, b.h, 0);
      const trRoof = new THREE.Mesh(hipRoof(0.59, D + 0.04, 0.3), tile);
      trRoof.position.set(cross, b.h, 0);
      inner.add(naveRoof, trRoof);
      const r = D * 0.27;
      inner.add(cylinder(r, 0.36, trim, cross, b.h + 0.36, 0, 8));
      const dome = greenDome(r * 1.04);
      dome.position.set(cross, b.h + 0.54, 0);
      inner.add(dome);
      inner.add(cylinder(0.06, 0.18, trim, cross, b.h + 0.6 + r, 0, 8));
      portico(inner, naveX0 - 0.1, 0, D * 0.5, b.h * 0.7, -1);
      return g;
    },
    domed(b, w, d) {
      // Earl Hall: brick with a pale dome, its portico facing Low (+z).
      // Built with the portico at -x, then turned.
      const g = new THREE.Group();
      const inner = new THREE.Group();
      inner.rotation.y = Math.PI / 2;
      g.add(inner);
      const L = d - 0.2;
      const D = w;
      inner.add(body(L, D, b.h, "brick"));
      inner.add(box(L + 0.1, 0.09, D + 0.1, trim, 0, b.h + 0.045, 0));
      const r = Math.min(L, D) * 0.4;
      inner.add(cylinder(r, 0.2, trim, 0, b.h + 0.19, 0, 10));
      const domeMat = std("#ece2cc", { flatShading: true, roughness: 0.6 });
      snowy.push({ mat: domeMat, base: "#ece2cc", amount: 0.7 });
      const dome = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2), domeMat);
      dome.position.y = b.h + 0.29;
      inner.add(dome);
      portico(inner, -L / 2 - 0.12, 0, D * 0.6, b.h * 0.72, -1);
      return g;
    },
    cottage(b, w, d) {
      const g = new THREE.Group();
      g.add(body(w, d, b.h, "brick"));
      const r = new THREE.Mesh(hipRoof(w + 0.1, d + 0.1, 0.4), roofMat("#727a83"));
      r.position.y = b.h;
      g.add(r);
      return g;
    },
    modern(b, w, d) {
      const g = new THREE.Group();
      const style: FacadeStyle = b.brick ? "modernBrick" : "modern";
      let y0 = 0;
      let bw = w;
      let bd = d;
      if (b.podium) {
        g.add(body(w, d, 0.55, "glass"));
        g.add(box(w + 0.06, 0.06, d + 0.06, trim, 0, 0.58, 0));
        y0 = 0.6;
        bw = w * 0.82;
        bd = d * 0.78;
      }
      g.add(body(bw, bd, b.h - y0, style, y0));
      g.add(box(bw + 0.08, 0.08, bd + 0.08, b.brick ? trim : limeShade, 0, b.h + 0.04, 0));
      g.add(box(bw * 0.3, 0.24, bd * 0.32, std("#c9c6bf"), bw * 0.12, b.h + 0.2, -bd * 0.1));
      return g;
    },
    glass(b, w, d) {
      // Lerner: brick and granite toward Broadway, with a glass wall on the
      // campus side (+z) that shows the switchback ramps inside
      const g = new THREE.Group();
      g.add(body(w, d, b.h, "lerner"));
      g.add(box(w + 0.1, 0.1, d + 0.1, limeShade, 0, b.h + 0.05, 0));
      const gw = w * 0.52;
      const gh = b.h * 0.94;
      const gd = 0.22;
      const ramps = faceMat(gw, gh, "ramps");
      const frame = std("#dcdedd", { roughness: 0.5, metalness: 0.2 });
      g.add(box(gw, gh, gd, [frame, frame, frame, frame, ramps, frame], 0, gh / 2, d / 2 + gd / 2 - 0.02));
      g.add(box(gw + 0.08, 0.06, gd + 0.06, frame, 0, gh + 0.03, d / 2 + gd / 2 - 0.02));
      return g;
    },
    tower(b, w, d) {
      // Northwest Corner Building: tall, grey, with diagonal bracing
      const g = new THREE.Group();
      g.add(body(w, d, b.h, "tower"));
      g.add(box(w + 0.05, 0.1, d + 0.05, std("#9aa2a9"), 0, b.h + 0.05, 0));
      g.add(box(w * 0.4, 0.22, d * 0.35, std("#c9c6bf"), 0, b.h + 0.2, 0));
      return g;
    },
  };

  for (const b of BUILDINGS) {
    const w = b.s1 - b.s0;
    const d = b.e1 - b.e0;
    // Heights are a touch shorter than life so you can see into the quads.
    const g = builders[b.kind](b.kind === "low" ? b : { ...b, h: b.h * 0.86 }, w, d);
    g.position.set(X((b.s0 + b.s1) / 2), G, Z((b.e0 + b.e1) / 2));
    pop(shadowed(g), 140 + (g.position.x - X(0)) * 30 + rnd() * 80);
  }

  // Low Steps, the Alma Mater, fountains and flagpoles
  {
    const g = new THREE.Group();
    const s0 = 8.55;
    const s1 = 9.6;
    const zc = Z((3.75 + 6.75) / 2);
    const width = 6.75 - 3.75;
    const n = 6;
    const depth = (s1 - s0) / n;
    for (let i = 0; i < n; i++) {
      const h = 0.05 * (i + 1);
      g.add(box(depth, h, width - i * 0.05, i % 2 ? limeShade : lime, X(s0) + depth * (i + 0.5), h / 2, zc));
    }
    const am = new THREE.Group();
    am.add(box(0.3, 0.2, 0.3, limeShade, 0, 0.1, 0));
    am.add(cylinder(0.08, 0.3, std("#c99a3a", { metalness: 0.45, roughness: 0.4 }), 0, 0.35, 0, 8, 0.05));
    am.position.set(X(9.05), 0.15, zc);
    g.add(am);
    g.position.y = G;
    pop(shadowed(g), 420);

    for (const dz of [-1.15, 1.15]) {
      const f = new THREE.Group();
      f.add(cylinder(0.3, 0.08, lime, 0, 0.04, 0, 24));
      f.add(cylinder(0.25, 0.02, std("#8fb7c9", { roughness: 0.25, metalness: 0.1 }), 0, 0.085, 0, 24));
      f.add(cylinder(0.04, 0.2, lime, 0, 0.12, 0, 8));
      f.position.set(X(7.6), G, zc + dz);
      pop(shadowed(f, false, true), 480);
    }
    for (const dz of [-1.6, 1.6]) {
      const pole = cylinder(0.018, 1.7, std("#d9d6d0", { metalness: 0.4, roughness: 0.4 }), 0, 0.85, 0, 6);
      const flag = box(0.004, 0.2, 0.3, std("#7aa7c7"), 0, 1.55, 0.16);
      const f = new THREE.Group();
      f.add(pole, flag);
      f.position.set(X(7.2), G, zc + dz);
      pop(shadowed(f, true, false), 560);
    }
  }

  // name plaques on the Amsterdam Ave sidewalk
  for (const b of BUILDINGS) {
    if (!b.plaque) continue;
    const chars = b.plaque.length;
    const len = Math.min(b.s1 - b.s0 - 0.15, 0.3 + chars * 0.085);
    const tex = canvasTexture(Math.round(len * 300), 66, (ctx) => {
      const W = ctx.canvas.width;
      ctx.fillStyle = "#f4eedf";
      ctx.fillRect(0, 0, W, 66);
      ctx.strokeStyle = "#5b6766";
      ctx.lineWidth = 3;
      ctx.strokeRect(5, 5, W - 10, 56);
      ctx.fillStyle = "#33403f";
      ctx.font = `400 36px ${serif}`;
      ctx.letterSpacing = "5px";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      let size = 36;
      while (ctx.measureText(b.plaque!).width > W - 24 && size > 18) ctx.font = `400 ${(size -= 2)}px ${serif}`;
      ctx.fillText(b.plaque!, W / 2 + 2.5, 35);
    });
    const face = std("#ffffff", { map: tex, roughness: 0.7 });
    const m = box(len, 0.025, 0.2, [trim, trim, face, trim, trim, trim]);
    m.rotation.x = 0.75;
    const g = new THREE.Group();
    g.add(m);
    m.position.y = 0.08;
    g.add(box(0.03, 0.08, 0.03, std("#4d5655"), -len * 0.35, 0.04, -0.02), box(0.03, 0.08, 0.03, std("#4d5655"), len * 0.35, 0.04, -0.02));
    g.position.set(X((b.s0 + b.s1) / 2), G, Z(E) + 0.3);
    pop(shadowed(g, true, true), 700 + (g.position.x - X(0)) * 25);
  }

  // ---------------------------------------------------------------- trees
  const inside = (s: number, e: number, a: { s0: number; s1: number; e0: number; e1: number }, pad: number) =>
    s > a.s0 - pad && s < a.s1 + pad && e > a.e0 - pad && e < a.e1 + pad;
  const blocked = (s: number, e: number, pad = 0.18) =>
    BUILDINGS.some((b) => inside(s, e, b, pad)) ||
    inside(s, e, { s0: 7.0, s1: 9.6, e0: 3.6, e1: 6.9 }, 0) || // plaza and steps
    (e > 6.92 && e < 7.18 && s > 6.9 && s < 16.95) || // the east walk
    (s > COLLEGE_WALK.s0 - 0.02 && s < COLLEGE_WALK.s1 + 0.02);

  const trees: TreeSpec[] = [];
  const addTree = (s: number, e: number, kind: TreeSpec["kind"] = "round", size = 0.82 + rnd() * 0.36, y = G) => {
    trees.push({ x: X(s), z: Z(e), y, s: size, off: Math.round((rnd() - 0.5) * 18), pick: Math.floor(rnd() * 3), kind });
  };
  const tryTree = (s: number, e: number, kind: TreeSpec["kind"] = "round", size?: number) => {
    if (!blocked(s, e)) addTree(s, e, kind, size);
  };
  const plaqueAt = BUILDINGS.filter((b) => b.plaque).map((b) => (b.s0 + b.s1) / 2);

  // street trees on the curb
  for (let s = 0.25; s <= S - 0.2; s += 0.62) {
    if (!plaqueAt.some((p) => Math.abs(p - s) < 0.5)) addTree(s + (rnd() - 0.5) * 0.08, E + WALK - 0.14, "round", 0.62 + rnd() * 0.18);
    addTree(s + 0.3, -WALK + 0.14, "round", 0.6 + rnd() * 0.18);
  }
  for (let e = 0.4; e <= E - 0.3; e += 0.66) {
    addTree(-WALK + 0.14, e, rnd() < 0.15 ? "pine" : "round", 0.6 + rnd() * 0.2);
    addTree(S + WALK - 0.14, e + 0.3, "round", 0.6 + rnd() * 0.2);
  }
  // College Walk allées
  for (let e = 0.35; e <= E - 0.2; e += 0.6) {
    tryTree(COLLEGE_WALK.s0 - 0.13, e, "round", 0.78 + rnd() * 0.12);
    tryTree(COLLEGE_WALK.s1 + 0.13, e + 0.3, "round", 0.78 + rnd() * 0.12);
  }
  // South Field: a ring of trees around the four lawns, and the cross walks
  for (let e = 2.85; e <= 7.7; e += 0.55) {
    tryTree(2.08, e);
    tryTree(6.24, e);
  }
  for (let s = 2.5; s <= 6.0; s += 0.55) {
    tryTree(s, 2.82);
    tryTree(s, 7.66);
  }
  for (let s = 2.5; s <= 6.0; s += 1.1) tryTree(s, 5.25, "round", 0.7);
  const cluster = (s0: number, s1: number, e0: number, e1: number, n: number, pine = 0.15) => {
    for (let i = 0; i < n; i++) tryTree(s0 + rnd() * (s1 - s0), e0 + rnd() * (e1 - e0), rnd() < pine ? "pine" : "round");
  };
  cluster(2.2, 4.8, 7.85, 8.4, 5); // Van Am Quad
  cluster(9.35, 12.45, 2.8, 3.5, 9); // Low's west lawn
  cluster(10.55, 11.95, 7.4, 7.9, 4); // Low's east lawn, in front of St. Paul's
  cluster(15.25, 16.85, 5.05, 6.8, 8, 0.25); // north lawn
  cluster(12.8, 13.15, 3.2, 6.9, 6); // behind Low
  cluster(7.2, 8.6, 2.5, 3.5, 5); // between Dodge and the plaza
  cluster(9.0, 10.8, 1.3, 2.6, 4); // by Earl
  cluster(14.2, 16.5, 7.3, 8.0, 5); // the east walk
  cluster(9.4, 10.6, 0.05, 0.2, 2);
  cluster(16.85, 17.15, 0.3, 10.2, 7, 0.2); // north of the lawns

  trees.sort((a, b) => a.x - b.x);
  // Decorative trees standing where a Treendr tree has been pinned step aside.
  let hiddenTrees = new Set<number>();

  const canopyGeo = mergeGeometries([
    new THREE.IcosahedronGeometry(0.34, 1).scale(1, 1.15, 1).translate(0, 0.78, 0),
    new THREE.IcosahedronGeometry(0.25, 1).translate(0.17, 0.62, 0.07),
    new THREE.IcosahedronGeometry(0.23, 1).translate(-0.16, 0.64, -0.06),
    new THREE.IcosahedronGeometry(0.2, 1).translate(0.02, 1.0, 0.02),
  ]);
  const trunkGeo = new THREE.CylinderGeometry(0.035, 0.06, 0.62, 6).translate(0, 0.31, 0);
  const branchGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.012, 0.022, 0.42, 4).rotateZ(0.5).translate(-0.1, 0.55, 0),
    new THREE.CylinderGeometry(0.012, 0.022, 0.4, 4).rotateZ(-0.55).translate(0.1, 0.56, 0),
    new THREE.CylinderGeometry(0.01, 0.02, 0.36, 4).rotateX(0.5).translate(0, 0.6, 0.08),
    new THREE.CylinderGeometry(0.01, 0.02, 0.34, 4).rotateX(-0.5).translate(0, 0.62, -0.08),
    new THREE.CylinderGeometry(0.01, 0.018, 0.3, 4).translate(0, 0.72, 0),
  ]);
  const pineGeo = mergeGeometries([
    new THREE.ConeGeometry(0.28, 0.5, 7).translate(0, 0.5, 0),
    new THREE.ConeGeometry(0.21, 0.42, 7).translate(0, 0.76, 0),
  ]);

  const canopyMat = std("#ffffff", { flatShading: true, roughness: 0.82 });
  const pineMat = std("#ffffff", { flatShading: true, roughness: 0.85 });
  const barkMat = std("#6e4d35");
  const roundCap = trees.filter((t) => t.kind === "round").length;
  const canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, roundCap);
  const trunks = new THREE.InstancedMesh(trunkGeo, barkMat, trees.length);
  const branches = new THREE.InstancedMesh(branchGeo, barkMat, roundCap);
  const pines = new THREE.InstancedMesh(pineGeo, pineMat, Math.max(1, trees.filter((t) => t.kind === "pine").length));
  for (const m of [canopies, trunks, branches, pines]) {
    m.castShadow = true;
    m.receiveShadow = true;
    m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(m);
  }
  const tmp = new THREE.Object3D();
  const color = new THREE.Color();
  let treeGrow = 0; // 0..1 pop-up progress for trees
  let currentSeason = seasonAt(280);
  let currentDay = 280;

  function layoutTrees() {
    const all = trees;
    const ease = (p: number) => (p <= 0 ? 0 : p >= 1 ? 1 : 1 + 2.4 * Math.pow(p - 1, 3) + 1.4 * Math.pow(p - 1, 2));
    let ri = 0;
    let pi = 0;
    all.forEach((tr, i) => {
      const local = hiddenTrees.has(i) ? 0 : ease(clamp(treeGrow * 1.6 - (i / all.length) * 0.6, 0, 1));
      const spin = (i * 1.7) % (Math.PI * 2);
      tmp.position.set(tr.x, tr.y, tr.z);
      tmp.rotation.set(0, spin, 0);
      tmp.scale.set(tr.s, tr.s * Math.max(0.001, local), tr.s);
      tmp.updateMatrix();
      trunks.setMatrixAt(i, tmp.matrix);
      if (tr.kind === "round") {
        const s = seasonAt(currentDay + tr.off);
        const canopyScale = s.density < 0.06 ? 0.001 : tr.s * (0.25 + 0.75 * s.density);
        tmp.scale.set(canopyScale, Math.max(0.001, canopyScale * local), canopyScale);
        tmp.updateMatrix();
        canopies.setMatrixAt(ri, tmp.matrix);
        color.set(s.leaves[tr.pick]);
        canopies.setColorAt(ri, color);
        const bare = clamp(1 - s.density * 1.4, 0, 1);
        tmp.scale.set(tr.s, Math.max(0.001, tr.s * local * (bare > 0.05 ? 1 : 0.001)), tr.s);
        tmp.updateMatrix();
        branches.setMatrixAt(ri, tmp.matrix);
        ri++;
      } else {
        tmp.scale.set(tr.s, Math.max(0.001, tr.s * local), tr.s);
        tmp.updateMatrix();
        pines.setMatrixAt(pi, tmp.matrix);
        color.set(mix("#2f6a45", "#e8eef2", currentSeason.snow * 0.55));
        pines.setColorAt(pi, color);
        pi++;
      }
    });
    trunks.count = all.length;
    canopies.count = ri;
    branches.count = ri;
    pines.count = pi;
    for (const m of [canopies, trunks, branches, pines]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    barkMat.color.set(mix("#6e4d35", "#d9e1e8", currentSeason.snow * 0.45));
    layoutVoxels(ease);
  }

  // ---------------------------------------------------------------- voxel trees
  // Every tree on Treendr stands on the map as a little voxel model, colored
  // from its own photo (see treeLook in src/lib/pixelate.ts).
  const VOX = 0.08;
  const voxGeo = new THREE.BoxGeometry(VOX, VOX, VOX);
  const voxMat = std("#ffffff", { roughness: 0.78 });
  let voxMesh: THREE.InstancedMesh | null = null;
  type Voxel = { x: number; y: number; z: number; bx: number; bz: number; color: THREE.Color; top: boolean };
  let voxels: Voxel[] = [];
  const SNOW = new THREE.Color("#f4f7fa");
  const DEFAULT_LOOK: TreeLook = { leaves: ["#2f6a2c", "#4f8a3a", "#8dbb5c"], bark: "#5d4332", shape: "round" };

  /** Integer voxel cells (x, y, z) for one tree, with colors. */
  function voxelCells(look: TreeLook, n: number) {
    const cells: { x: number; y: number; z: number; c: string; top: boolean }[] = [];
    const [dark, mid, light] = look.leaves;
    const r = () => {
      n = (n * 16807) % 2147483647;
      return n / 2147483647;
    };
    const leaf = (x: number, y: number, z: number, up: number, top: boolean) => {
      const t = up - x * 0.06 + (r() - 0.5) * 0.5;
      cells.push({ x, y, z, c: t > 0.45 ? light : t < -0.35 ? dark : mid, top });
    };
    if (look.shape === "cone") {
      for (let y = 0; y < 3; y++) cells.push({ x: 0, y, z: 0, c: look.bark, top: false });
      for (let y = 2; y <= 16; y++) {
        const rad = 5.2 * (1 - (y - 2) / 15) + 0.4 - (y % 3 === 1 ? 0.7 : 0);
        for (let x = -6; x <= 6; x++)
          for (let z = -6; z <= 6; z++) {
            const d = Math.hypot(x, z);
            if (d <= rad && (d > rad - 1.5 || y === 2 || y === 16) && r() > 0.06) leaf(x, y, z, (y - 9) / 7, d > rad - 1 || y === 16);
          }
      }
      return cells;
    }
    if (look.shape === "bare") {
      for (let y = 0; y < 10; y++) cells.push({ x: 0, y, z: 0, c: look.bark, top: false });
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]]) {
        const start = 4 + Math.floor(r() * 4);
        for (let k = 1; k <= 5; k++) cells.push({ x: dx * k, y: start + k, z: dz * k, c: look.bark, top: true });
      }
      return cells;
    }
    const spec = {
      round: { trunk: 6, cy: 10, rx: 4.6, ry: 4.4 },
      wide: { trunk: 5, cy: 9, rx: 6.2, ry: 4 },
      narrow: { trunk: 5, cy: 10.5, rx: 2.9, ry: 6.4 },
    }[look.shape];
    for (let y = 0; y < spec.trunk + 2; y++) cells.push({ x: 0, y, z: 0, c: look.bark, top: false });
    cells.push({ x: 1, y: 0, z: 0, c: look.bark, top: false }, { x: -1, y: 0, z: 0, c: look.bark, top: false });
    const R = Math.ceil(spec.rx);
    for (let y = Math.floor(spec.cy - spec.ry); y <= Math.ceil(spec.cy + spec.ry); y++)
      for (let x = -R; x <= R; x++)
        for (let z = -R; z <= R; z++) {
          const d = (x / spec.rx) ** 2 + ((y - spec.cy) / spec.ry) ** 2 + (z / spec.rx) ** 2;
          // A shell is enough; nobody sees inside the crown.
          if (d > 1 || d < 0.42 || r() < 0.1) continue;
          const above = (x / spec.rx) ** 2 + ((y + 1 - spec.cy) / spec.ry) ** 2 + (z / spec.rx) ** 2;
          leaf(x, y, z, (y - spec.cy) / spec.ry, above > 1);
        }
    return cells;
  }

  function buildVoxels(pins: { x: number; z: number; look: TreeLook }[]) {
    if (voxMesh) {
      scene.remove(voxMesh);
      voxMesh.dispose();
      voxMesh = null;
    }
    voxels = [];
    pins.forEach((p, i) => {
      for (const c of voxelCells(p.look, 7 + i * 101)) {
        voxels.push({ x: p.x + c.x * VOX, y: c.y, z: p.z + c.z * VOX, bx: p.x, bz: p.z, color: new THREE.Color(c.c), top: c.top });
      }
    });
    if (!voxels.length) return;
    voxMesh = new THREE.InstancedMesh(voxGeo, voxMat, voxels.length);
    voxMesh.castShadow = true;
    voxMesh.receiveShadow = true;
    voxMesh.frustumCulled = false;
    voxMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(voxMesh);
  }

  function layoutVoxels(ease: (p: number) => number) {
    if (!voxMesh) return;
    // Treendr trees grow last, after the rest of the campus.
    const local = Math.max(0.001, ease(clamp(treeGrow * 1.6 - 0.6, 0, 1)));
    const snow = currentSeason.snow;
    voxels.forEach((v, i) => {
      tmp.position.set(v.x, G + (v.y + 0.5) * VOX * local, v.z);
      tmp.rotation.set(0, 0, 0);
      tmp.scale.set(1, local, 1);
      tmp.updateMatrix();
      voxMesh!.setMatrixAt(i, tmp.matrix);
      color.copy(v.color);
      if (v.top && snow > 0.05) color.lerp(SNOW, snow * 0.8);
      voxMesh!.setColorAt(i, color);
    });
    voxMesh.instanceMatrix.needsUpdate = true;
    if (voxMesh.instanceColor) voxMesh.instanceColor.needsUpdate = true;
  }

  // ---------------------------------------------------------------- pins
  type PinSprite = THREE.Sprite & { userData: { id: string; base: number; phase: number } };
  let pinSprites: PinSprite[] = [];
  const pinGroup = new THREE.Group();
  scene.add(pinGroup);
  let hovered: string | null = null;
  let highlighted: string | null = null;

  function heartTexture(rank: number) {
    return canvasTexture(160, 160, (ctx) => {
      ctx.shadowColor = "rgba(60,30,30,0.35)";
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 4;
      heartPath(ctx, 80, 78, 64);
      ctx.fillStyle = rank === 1 ? "#c8455d" : "#d9566d";
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.lineWidth = 7;
      ctx.strokeStyle = "#fbf4ea";
      ctx.stroke();
      ctx.fillStyle = "#fff8f0";
      ctx.font = `400 ${rank > 9 ? 56 : 68}px ${serif}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(rank), 80, 70);
    });
  }

  function setPins(pins: ScenePin[]) {
    for (const s of pinSprites) {
      s.material.map?.dispose();
      s.material.dispose();
      pinGroup.remove(s);
    }
    pinSprites = [];
    const placed = pins.slice(0, MAX_PINS).map((p) => {
      const { s, e } = fromMap(clamp(p.mapX, 0, 1), clamp(p.mapY, 0, 1));
      return { x: X(s), z: Z(e), look: p.look ?? DEFAULT_LOOK };
    });
    buildVoxels(placed);
    hiddenTrees = new Set(trees.flatMap((t, i) => (placed.some((p) => Math.hypot(p.x - t.x, p.z - t.z) < 0.45) ? [i] : [])));
    pins.slice(0, MAX_PINS).forEach((p, i) => {
      const { s, e } = fromMap(clamp(p.mapX, 0, 1), clamp(p.mapY, 0, 1));
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: heartTexture(p.rank), depthTest: false, depthWrite: false, transparent: true }),
      ) as PinSprite;
      const base = G + 1.75;
      sprite.position.set(X(s), base, Z(e));
      sprite.scale.setScalar(0.001);
      sprite.renderOrder = 10 + (MAX_PINS - p.rank);
      sprite.userData = { id: p.id, base, phase: i * 1.3 };
      pinGroup.add(sprite);
      pinSprites.push(sprite);
    });
    layoutTrees();
  }

  // ---------------------------------------------------------------- lamps
  const lampLights: THREE.PointLight[] = [];
  const bulbMat = std("#fff4dc", { emissive: "#ffcf86", emissiveIntensity: 0 });
  const postMat = std("#3b3f4a", { metalness: 0.3, roughness: 0.5 });
  const lamp = (x: number, z: number, light: boolean) => {
    const g = new THREE.Group();
    g.position.set(x, G, z);
    g.add(cylinder(0.025, 0.75, postMat, 0, 0.37, 0, 6, 0.018));
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), bulbMat);
    bulb.position.y = 0.78;
    g.add(bulb);
    if (light) {
      const l = new THREE.PointLight("#ffc77d", 0, 3.4, 1.6);
      l.position.y = 0.8;
      g.add(l);
      lampLights.push(l);
    }
    pop(shadowed(g, true, false), 650);
  };
  for (const e of [1.9, 8.6]) {
    lamp(X(COLLEGE_WALK.s0) + 0.05, Z(e), true);
    lamp(X(COLLEGE_WALK.s1) - 0.05, Z(e + 0.3), true);
  }
  for (let s = 1.0; s < S; s += 2.6) lamp(X(s), Z(E) + WALK - 0.08, false);

  // ---------------------------------------------------------------- weather
  const N = 520;
  const pos = new Float32Array(N * 3);
  const vel = new Float32Array(N * 3);
  const spawn = (k: number) => {
    pos[k] = PAGE.x0 + rnd() * PAGE_W;
    pos[k + 2] = PAGE.z0 + rnd() * PAGE_D;
  };
  for (let i = 0; i < N; i++) {
    spawn(i * 3);
    pos[i * 3 + 1] = rnd() * 9;
    vel[i * 3] = (rnd() - 0.5) * 0.004;
    vel[i * 3 + 1] = -(0.006 + rnd() * 0.01);
    vel[i * 3 + 2] = (rnd() - 0.5) * 0.004;
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const flakeTex = canvasTexture(32, 32, (ctx) => {
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.5, "rgba(255,255,255,0.8)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
  });
  const pMat = new THREE.PointsMaterial({ size: 0.09, map: flakeTex, transparent: true, depthWrite: false, color: "#ffffff", opacity: 0.9 });
  const particles = new THREE.Points(pGeo, pMat);
  particles.frustumCulled = false;
  scene.add(particles);
  let fx: SeasonState["fx"] = "none";

  // ---------------------------------------------------------------- post
  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  const pixelPass = new RenderPixelatedPass(4, scene, camera, { normalEdgeStrength: 0.25, depthEdgeStrength: 0.35 });
  pixelPass.enabled = false;
  const gtao = new GTAOPass(scene, camera, 1, 1);
  gtao.blendIntensity = 0.5;
  gtao.updateGtaoMaterial({ radius: 0.5, distanceExponent: 1.4, thickness: 1.2, scale: 1, samples: 12 });
  const output = new OutputPass();
  composer.addPass(renderPass);
  composer.addPass(pixelPass);
  composer.addPass(gtao);
  composer.addPass(output);

  // ---------------------------------------------------------------- sizing
  const resize = () => {
    const parent = canvas.parentElement;
    if (!parent) return;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (!userMoved) {
      // Fit the whole book, with a margin, whatever the window shape.
      const distance = Math.max(53, 70 / camera.aspect + 4);
      controls.maxDistance = Math.max(80, distance * 1.25);
      camera.position.copy(controls.target).addScaledVector(viewDir, distance);
      controls.update();
    }
  };
  const ro = new ResizeObserver(resize);
  if (canvas.parentElement) ro.observe(canvas.parentElement);
  resize();

  // ---------------------------------------------------------------- picking
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let down: { x: number; y: number } | null = null;
  const pickAt = (clientX: number, clientY: number) => {
    if (!pinSprites.length) return null;
    const r = canvas.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(pinSprites, false);
    // Sprites ignore depth, so prefer the best-ranked heart under the pointer.
    hits.sort((a, b) => b.object.renderOrder - a.object.renderOrder);
    return hits.length ? (hits[0].object as PinSprite).userData.id : null;
  };
  const onMove = (ev: PointerEvent) => {
    if (down && Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 4) {
      if (hovered) {
        hovered = null;
        opts.onHover?.(null, ev.clientX, ev.clientY);
      }
      return;
    }
    const id = pickAt(ev.clientX, ev.clientY);
    if (id !== hovered) {
      hovered = id;
      canvas.style.cursor = id ? "pointer" : "";
      if (!id) opts.onHover?.(null, ev.clientX, ev.clientY);
    }
    if (id) opts.onHover?.(id, ev.clientX, ev.clientY);
  };
  const onDown = (ev: PointerEvent) => {
    down = { x: ev.clientX, y: ev.clientY };
  };
  const onUp = (ev: PointerEvent) => {
    const start = down;
    down = null;
    if (!start || Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > 5) return;
    const id = pickAt(ev.clientX, ev.clientY);
    if (id) opts.onSelect?.(id);
  };
  const onLeave = (ev: PointerEvent) => {
    down = null;
    if (hovered) {
      hovered = null;
      canvas.style.cursor = "";
      opts.onHover?.(null, ev.clientX, ev.clientY);
    }
  };
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointerleave", onLeave);

  // ---------------------------------------------------------------- animation
  let open = false;
  let openAt = performance.now();
  let raf = 0;
  let fold = 0; // 0 = shut, 1 = lying open
  let popStart = performance.now(); // when the pop-ups began rising (once the page has swung open)
  let last = performance.now();
  const easeInOut = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
  const easeOutBack = (p: number) => {
    const c1 = 1.5;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
  };

  const tick = () => {
    raf = requestAnimationFrame(tick);
    const now = performance.now();
    const elapsed = now - openAt;
    // Real elapsed time, uncapped: in a throttled tab the fold and the tree
    // collapse catch up in a step instead of crawling a frame at a time.
    const dt = now - last;
    last = now;

    // Opening swings the page back first; closing lets the campus fold flat first.
    // The pop-ups follow the fold, not the clock, so a throttled tab can't
    // raise the campus through a page that is still shut.
    if (open) fold = Math.min(1, fold + dt / 1100);
    if (open && fold < 0.86) popStart = now;
    else if (elapsed > 950 && treeGrow === 0) fold = Math.max(0, fold - dt / 1200);
    leaf.rotation.x = -Math.PI * easeInOut(fold);
    spine.visible = fold < 0.5;
    const t = open ? now - popStart : elapsed;

    for (const p of poppers) {
      const local = clamp((t - (open ? p.delay : p.delay * 0.4)) / 700, 0, 1);
      const target = open ? easeOutBack(local) : 1 - local;
      p.object.scale.y = Math.max(0.001, open ? target : Math.min(p.object.scale.y, target));
    }
    const tTarget = open ? clamp((t - 700) / 1300, 0, 1) : 0;
    if (Math.abs(treeGrow - tTarget) > 0.001) {
      treeGrow = open ? tTarget : Math.max(0, treeGrow - dt / 300);
      layoutTrees();
    }
    pinSprites.forEach((h, i) => {
      const id = h.userData.id;
      const focus = id === hovered || id === highlighted;
      const shown = open && treeGrow > 0.9 && t > 2000 + i * 40;
      const target = shown ? (focus ? 1.25 : 0.95) : 0.001;
      const s = h.scale.x + (target - h.scale.x) * 0.16;
      h.scale.setScalar(s);
      h.position.y = h.userData.base + (focus ? 0.18 : 0) + Math.sin(now / 420 + h.userData.phase) * 0.06;
    });

    if (fx !== "none") {
      const swirl = fx === "leaves" || fx === "petals";
      for (let i = 0; i < N; i++) {
        const k = i * 3;
        if (fx === "fireflies") {
          pos[k] += Math.sin(now / 900 + i) * 0.003;
          pos[k + 1] = 0.3 + ((i * 0.37) % 1.4) + Math.sin(now / 700 + i * 2) * 0.12;
          pos[k + 2] += Math.cos(now / 800 + i) * 0.003;
        } else {
          pos[k] += vel[k] + (swirl ? Math.sin(now / 600 + i) * 0.006 : 0);
          pos[k + 1] += vel[k + 1] * (swirl ? 0.7 : 1);
          pos[k + 2] += vel[k + 2];
          if (pos[k + 1] < 0) {
            pos[k + 1] = 8 + rnd();
            spawn(k);
          }
        }
      }
      pGeo.attributes.position.needsUpdate = true;
      if (fx === "fireflies") pMat.opacity = 0.5 + 0.5 * Math.sin(now / 300);
    }

    controls.update();
    composer.render();
  };
  raf = requestAnimationFrame(tick);

  // ---------------------------------------------------------------- api
  function setTime(day: number, hour: number) {
    currentDay = day;
    currentSeason = seasonAt(day);
    const season = currentSeason;
    const s = sunAt(day, hour);
    const L = lightAt(s.elevation);

    const night = s.elevation < -2;
    const d = night ? ([-0.45, 0.75, -0.48] as const) : s.direction;
    sun.position.set(d[0] * 34, d[1] * 34, d[2] * 34);
    sun.color.set(L.sunColor);
    sun.intensity = L.sunIntensity;
    hemi.color.set(L.skyColor);
    hemi.groundColor.set(L.groundColor);
    hemi.intensity = L.hemiIntensity;
    fill.intensity = 0.12 * (1 - L.night);
    renderer.toneMappingExposure = L.exposure;

    for (const m of windowMats) m.emissiveIntensity = L.night * 1.6;
    bulbMat.emissiveIntensity = 0.3 + L.night * 3;
    for (const l of lampLights) l.intensity = L.night * 2.2;
    for (const { mat, base, amount } of snowy) mat.color.set(mix(base, "#f4f7f9", season.snow * amount));
    lawnMat.color.set(season.lawn);

    fx = season.fx === "fireflies" && L.night < 0.4 ? "none" : season.fx;
    particles.visible = fx !== "none";
    if (fx === "snow") {
      pMat.color.set("#ffffff");
      pMat.size = 0.09;
      pMat.opacity = 0.95;
      pMat.blending = THREE.NormalBlending;
    } else if (fx === "petals") {
      pMat.color.set("#f6b8ca");
      pMat.size = 0.08;
      pMat.blending = THREE.NormalBlending;
    } else if (fx === "leaves") {
      pMat.color.set(season.leaves[0]);
      pMat.size = 0.085;
      pMat.blending = THREE.NormalBlending;
    } else if (fx === "fireflies") {
      pMat.color.set("#ffe27a");
      pMat.size = 0.07;
      pMat.blending = THREE.AdditiveBlending;
    }
    pMat.needsUpdate = true;
    layoutTrees();
    return { season, sun: s, light: L };
  }

  function setOpen(next: boolean) {
    if (next === open) return;
    open = next;
    openAt = performance.now();
    popStart = openAt;
  }

  function setPixel(on: boolean) {
    renderPass.enabled = !on;
    pixelPass.enabled = on;
    gtao.enabled = !on;
  }

  return {
    setTime,
    setOpen,
    setPixel,
    setPins,
    setHighlight(id) {
      highlighted = id;
    },
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointerleave", onLeave);
      controls.dispose();
      composer.dispose();
      renderer.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
        mats.forEach((mat) => {
          (mat as THREE.MeshStandardMaterial).map?.dispose();
          mat.dispose();
        });
      });
      facadeCache.forEach((f) => {
        f.map.dispose();
        f.emissive.dispose();
      });
      facadeCache.clear();
    },
  };
}
