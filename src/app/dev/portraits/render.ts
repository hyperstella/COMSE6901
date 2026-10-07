import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import type { PortraitSpec } from "./specs";

/**
 * Renders an example tree's "photo" in the storybook's style: the same
 * flat-shaded foliage, brick-and-mint halls, cream paper and soft natural
 * light as the campus book on the home page. Development tool only.
 */

const W = 960;
const H = 720;

let seed = 1;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const between = (a: number, b: number) => a + rnd() * (b - a);
const UP = new THREE.Vector3(0, 1, 0);

const std = (color: string | THREE.Color, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.86, metalness: 0, ...extra });

function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function box(w: number, h: number, d: number, mat: THREE.Material | THREE.Material[], x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

function cyl(rTop: number, rBottom: number, h: number, mat: THREE.Material, x = 0, y = 0, z = 0, sides = 12) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, sides), mat);
  m.position.set(x, y, z);
  return m;
}

function hipRoof(w: number, d: number, h: number) {
  const half = (w - d) / 2;
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const [a, b, c, e] = [v(-w / 2, 0, -d / 2), v(w / 2, 0, -d / 2), v(w / 2, 0, d / 2), v(-w / 2, 0, d / 2)];
  const [r1, r2] = [v(-half, h, 0), v(half, h, 0)];
  const tris = [[e, c, r2], [e, r2, r1], [b, a, r1], [b, r1, r2], [a, e, r1], [c, b, r2]];
  const pos: number[] = [];
  for (const t of tris) for (const p of t) pos.push(p.x, p.y, p.z);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------ textures

function facadeTexture(style: "brick" | "stone" | "glass" | "modern", wu: number, hu: number) {
  const ppu = 90;
  const Wp = Math.round(wu * ppu);
  const Hp = Math.round(hu * ppu);
  return canvasTexture(Wp, Hp, (ctx) => {
    if (style === "glass") {
      const g = ctx.createLinearGradient(0, 0, Wp, Hp);
      g.addColorStop(0, "#a8bccb");
      g.addColorStop(1, "#7f97a8");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, Wp, Hp);
      ctx.fillStyle = "rgba(255,255,255,0.14)";
      for (let i = 0; i < 5; i++) {
        const x = rnd() * Wp;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + 40, 0);
        ctx.lineTo(x - 60, Hp);
        ctx.lineTo(x - 100, Hp);
        ctx.fill();
      }
      ctx.fillStyle = "#e7ebee";
      for (let x = 0; x < Wp; x += 0.42 * ppu) ctx.fillRect(x, 0, 3, Hp);
      for (let y = 0; y < Hp; y += 0.36 * ppu) ctx.fillRect(0, y, Wp, 3);
      return;
    }
    const brick = style === "brick";
    ctx.fillStyle = brick ? "#bb6446" : style === "stone" ? "#ece4d1" : "#e2dbce";
    ctx.fillRect(0, 0, Wp, Hp);
    for (let i = 0; i < (Wp * Hp) / 40; i++) {
      const v = 0.92 + rnd() * 0.16;
      ctx.fillStyle = brick ? `rgba(${190 * v},${102 * v},${72 * v},0.45)` : `rgba(${200 * v},${190 * v},${170 * v},0.18)`;
      ctx.fillRect(rnd() * Wp, rnd() * Hp, brick ? 9 : 4, brick ? 3 : 2);
    }
    const base = brick ? 0.42 : 0.3;
    ctx.fillStyle = brick ? "#ece4d2" : "#d6ccb6";
    ctx.fillRect(0, Hp - base * ppu, Wp, base * ppu);
    ctx.fillStyle = "#efe8d8";
    ctx.fillRect(0, 0, Wp, 0.08 * ppu);
    const colW = style === "modern" ? 0.24 : 0.36;
    const rowH = style === "modern" ? 0.26 : 0.4;
    const ww = style === "modern" ? 0.15 : 0.13;
    const wh = style === "modern" ? 0.15 : 0.24;
    const cols = Math.floor((wu - 0.2) / colW);
    const x0 = (wu - cols * colW) / 2;
    for (let y = base + 0.1; y < hu - 0.3; y += rowH) {
      for (let c = 0; c < cols; c++) {
        const wx = (x0 + c * colW + (colW - ww) / 2) * ppu;
        const wy = Hp - (y + wh) * ppu;
        if (style !== "modern") {
          ctx.fillStyle = "#f2ebdc";
          ctx.fillRect(wx - 3, wy - 3, ww * ppu + 6, wh * ppu + 6);
        }
        ctx.fillStyle = style === "modern" ? "#6f7881" : "#3d4654";
        ctx.fillRect(wx, wy, ww * ppu, wh * ppu);
        ctx.fillStyle = "rgba(170,190,210,0.35)";
        ctx.fillRect(wx, wy, ww * ppu, wh * ppu * 0.35);
      }
    }
  });
}

function stripes(color: string, n = 10) {
  return canvasTexture(512, 512, (ctx) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = i % 2 ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)";
      ctx.fillRect(0, (i * 512) / n, 512, 512 / n);
    }
    for (let i = 0; i < 4000; i++) {
      ctx.fillStyle = `rgba(0,0,0,${rnd() * 0.06})`;
      ctx.fillRect(rnd() * 512, rnd() * 512, 2, 2);
    }
  });
}

function paper(color: string) {
  return canvasTexture(1024, 1024, (ctx) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1024, 1024);
    for (let i = 0; i < 26000; i++) {
      ctx.fillStyle = rnd() < 0.5 ? `rgba(120,95,60,${rnd() * 0.05})` : `rgba(255,255,255,${rnd() * 0.08})`;
      ctx.fillRect(rnd() * 1024, rnd() * 1024, 1 + rnd() * 2, 1);
    }
  });
}

function mottledBark(base: string) {
  return canvasTexture(256, 256, (ctx) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 70; i++) {
      ctx.fillStyle = ["#d9d3b4", "#a7a57e", "#ebe6d2", "#8c8a6c"][Math.floor(rnd() * 4)];
      ctx.beginPath();
      ctx.ellipse(rnd() * 256, rnd() * 256, 10 + rnd() * 26, 8 + rnd() * 18, rnd() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

// ------------------------------------------------------------------ the set

const SKIES: Record<PortraitSpec["sky"], { bg: [string, string]; sun: string; sunI: number; sunPos: [number, number, number]; sky: string; ground: string; hemi: number }> = {
  day: { bg: ["#eef2f5", "#c9d4dd"], sun: "#fff1dc", sunI: 2.7, sunPos: [-6, 9, 5], sky: "#dfe8ef", ground: "#d9c9a8", hemi: 1.15 },
  spring: { bg: ["#f4f1f2", "#dcd9e4"], sun: "#fff4e8", sunI: 2.5, sunPos: [-5, 9, 6], sky: "#e8e6ef", ground: "#dccbb0", hemi: 1.2 },
  golden: { bg: ["#f6e2c8", "#d9b9a4"], sun: "#ffb46a", sunI: 2.6, sunPos: [-9, 4, 3], sky: "#e7cdb6", ground: "#c9a483", hemi: 1.0 },
  overcast: { bg: ["#ecebe6", "#cfd2d1"], sun: "#f3efe6", sunI: 1.2, sunPos: [-4, 10, 4], sky: "#e5e6e3", ground: "#d6ccb8", hemi: 1.55 },
  winter: { bg: ["#eef2f6", "#cbd5df"], sun: "#eef3ff", sunI: 1.8, sunPos: [-6, 7, 5], sky: "#dfe6ee", ground: "#e6ebf0", hemi: 1.35 },
};

function hall(scene: THREE.Scene, x: number, z: number, w: number, h: number, d: number) {
  const g = new THREE.Group();
  const trim = std("#eee6d4");
  const front = std("#ffffff", { map: facadeTexture("brick", w, h) });
  const side = std("#ffffff", { map: facadeTexture("brick", d, h) });
  g.add(box(w, h, d, [side, side, trim, trim, front, front], 0, h / 2, 0));
  g.add(box(w + 0.16, 0.12, d + 0.16, trim, 0, h + 0.06, 0));
  const roof = new THREE.Mesh(hipRoof(w + 0.2, d + 0.2, d * 0.42), std("#97d3bd", { flatShading: true, roughness: 0.7 }));
  roof.position.y = h + 0.12;
  g.add(roof);
  for (let i = 0; i < Math.round(w / 1.6); i++) {
    const cx = -w / 2 + 0.9 + i * 1.6;
    g.add(box(0.18, 0.7, 0.18, std("#b25a42"), cx, h + 0.4, i % 2 ? 0.25 : -0.25));
    g.add(box(0.24, 0.07, 0.24, trim, cx, h + 0.76, i % 2 ? 0.25 : -0.25));
  }
  g.position.set(x, 0, z);
  scene.add(g);
}

function lowLibrary(scene: THREE.Scene, x: number, z: number) {
  const g = new THREE.Group();
  const lime = std("#efe7d4", { roughness: 0.78 });
  const stone = std("#ffffff", { map: facadeTexture("stone", 7, 2.4) });
  g.add(box(9, 0.5, 4.5, lime, 0, 0.25, 0));
  g.add(box(7, 2.4, 3.6, [stone, stone, lime, lime, stone, stone], 0, 1.7, 0));
  for (let i = 0; i < 10; i++) g.add(cyl(0.11, 0.12, 1.9, std("#f6f0e3"), -2.6 + i * 0.58, 1.45, 1.95));
  g.add(box(6.4, 0.32, 0.6, lime, 0, 2.55, 1.9));
  g.add(cyl(2.0, 2.05, 0.8, lime, 0, 3.3, 0, 8));
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1.95, 20, 9, 0, Math.PI * 2, 0, Math.PI / 2), std("#e6dcc0", { flatShading: true, roughness: 0.65 }));
  dome.scale.y = 0.86;
  dome.position.y = 3.7;
  g.add(dome);
  g.add(cyl(0.26, 0.28, 0.45, lime, 0, 5.5, 0, 10));
  for (let i = 0; i < 6; i++) g.add(box(9.6 + i * 0.5, 0.12, 0.36, i % 2 ? std("#e0d5bd") : lime, 0, 0.06 + (5 - i) * 0.08, 2.4 + i * 0.36));
  g.position.set(x, 0, z);
  scene.add(g);
}

function glassBlock(scene: THREE.Scene, x: number, z: number, w: number, h: number, d: number) {
  const g = new THREE.Group();
  const glass = std("#ffffff", { map: facadeTexture("glass", w, h), roughness: 0.3, metalness: 0.2 });
  const frame = std("#e3ddd0");
  g.add(box(w, h, d, [glass, glass, frame, frame, glass, glass], 0, h / 2, 0));
  g.add(box(w + 0.2, 0.2, d + 0.2, frame, 0, h + 0.1, 0));
  for (const s of [-1, 1]) g.add(box(0.2, h, d + 0.05, frame, (s * w) / 2, h / 2, 0));
  g.position.set(x, 0, z);
  scene.add(g);
}

function modernBlock(scene: THREE.Scene, x: number, z: number, w: number, h: number, d: number) {
  const face = std("#ffffff", { map: facadeTexture("modern", w, h) });
  const side = std("#ffffff", { map: facadeTexture("modern", d, h) });
  const top = std("#d6d0c4");
  const m = box(w, h, d, [side, side, top, top, face, face], x, h / 2, z);
  scene.add(m);
  scene.add(box(w * 0.3, 0.4, d * 0.3, std("#c9c6bf"), x + w * 0.1, h + 0.2, z));
}

// ------------------------------------------------------------------ trees

type Puff = { p: THREE.Vector3; r: number };

function grow(
  g: THREE.Group,
  o: { bark: THREE.Material; trunk: number; trunkR: number; depth: number; spread: number; up: number; lean: number; leafy: boolean; snow?: THREE.Material },
) {
  const puffs: Puff[] = [];
  const seg = (p0: THREE.Vector3, dir: THREE.Vector3, len: number, r0: number, depth: number) => {
    const p1 = p0.clone().addScaledVector(dir, len);
    const r1 = r0 * 0.66;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, 8), o.bark);
    m.position.copy(p0).addScaledVector(dir, len / 2);
    m.quaternion.setFromUnitVectors(UP, dir);
    g.add(m);
    if (o.snow && dir.y < 0.9 && r0 > 0.025) {
      const s = new THREE.Mesh(new THREE.CylinderGeometry(r1 * 0.55, r0 * 0.55, len * 0.9, 6), o.snow);
      s.position.copy(m.position).add(new THREE.Vector3(0, r0 * 0.75, 0));
      s.quaternion.copy(m.quaternion);
      g.add(s);
    }
    if (depth === 0) {
      puffs.push({ p: p1, r: 1 });
      return;
    }
    if (depth <= 2) puffs.push({ p: p0.clone().lerp(p1, 0.7), r: 0.8 });
    const n = rnd() < 0.4 ? 3 : 2;
    const az0 = rnd() * Math.PI * 2;
    const perp = Math.abs(dir.x) > 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
    const a1 = new THREE.Vector3().crossVectors(dir, perp).normalize();
    const a2 = new THREE.Vector3().crossVectors(dir, a1).normalize();
    for (let k = 0; k < n; k++) {
      const az = az0 + (k / n) * Math.PI * 2 + between(-0.4, 0.4);
      const tilt = o.spread * between(0.75, 1.2);
      const side = a1.clone().multiplyScalar(Math.cos(az)).addScaledVector(a2, Math.sin(az));
      const child = dir.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(side, Math.sin(tilt));
      child.y += o.up;
      seg(p1, child.normalize(), len * between(0.68, 0.82), r1, depth - 1);
    }
  };
  const trunkDir = new THREE.Vector3(Math.sin(o.lean), Math.cos(o.lean), 0).normalize();
  seg(new THREE.Vector3(0, 0, 0), trunkDir, o.trunk, o.trunkR, o.depth);
  return puffs;
}

function foliage(g: THREE.Group, puffs: Puff[], colors: [string, string, string], size: number, density: number, light: THREE.Vector3, blossom = false) {
  if (!puffs.length) return;
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const n = puffs.length * Math.round(5 * density + (blossom ? 2 : 0));
  const mesh = new THREE.InstancedMesh(geo, std("#ffffff", { flatShading: true, roughness: 0.82 }), n);
  const box3 = new THREE.Box3().setFromPoints(puffs.map((p) => p.p));
  const center = box3.getCenter(new THREE.Vector3());
  const ySpan = Math.max(0.1, box3.max.y - box3.min.y);
  const tmp = new THREE.Object3D();
  const col = new THREE.Color();
  let i = 0;
  for (const puff of puffs) {
    for (let k = 0; k < n / puffs.length && i < n; k++, i++) {
      const r = size * 0.72 * puff.r * between(0.5, 1.0);
      tmp.position.copy(puff.p).add(new THREE.Vector3(between(-1, 1), between(-0.7, 0.9), between(-1, 1)).multiplyScalar(size * 0.85));
      tmp.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
      tmp.scale.set(r, r * between(0.85, 1.1), r);
      tmp.updateMatrix();
      mesh.setMatrixAt(i, tmp.matrix);
      const h = (tmp.position.y - box3.min.y) / ySpan;
      const facing = tmp.position.clone().sub(center).normalize().dot(light);
      const t = h * 0.55 + facing * 0.45 + between(-0.25, 0.25);
      col.set(t > 0.62 ? colors[2] : t < 0.15 ? colors[0] : colors[1]);
      if (blossom && rnd() < 0.18) col.set("#fff6f8");
      mesh.setColorAt(i, col);
    }
  }
  mesh.count = i;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  g.add(mesh);
}

function tree(scene: THREE.Scene, spec: PortraitSpec, light: THREE.Vector3) {
  const t = spec.tree;
  const g = new THREE.Group();
  const H = t.height;
  const bark = std(t.mottled ? "#ffffff" : t.bark, t.mottled ? { map: mottledBark(t.bark) } : {});
  const leaves = t.leaves ?? ["#3f6f35", "#5c8f45", "#8db865"];

  if (t.kind === "conifer") {
    g.add(cyl(0.09, 0.14, H * 0.3, bark, 0, H * 0.15, 0, 8));
    const tiers = 8;
    for (let i = 0; i < tiers; i++) {
      const f = i / tiers;
      const r = 1.25 * (1 - f) + 0.18;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(r, H * 0.26, 9), std(i % 3 === 2 ? leaves[2] : i % 2 ? leaves[1] : leaves[0], { flatShading: true }));
      cone.position.y = H * 0.16 + f * H * 0.78 + H * 0.12;
      cone.rotation.y = rnd() * 3;
      g.add(cone);
    }
  } else if (t.kind === "sapling") {
    const puffs = grow(g, { bark, trunk: H * 0.55, trunkR: 0.045, depth: 3, spread: 0.5, up: 0.4, lean: 0, leafy: true });
    foliage(g, puffs, leaves, 0.2, 0.9, light);
  } else {
    const opts = {
      round: { trunk: 0.36, trunkR: 0.17, depth: 5, spread: 0.55, up: 0.3, size: 0.42, density: 1 },
      spreading: { trunk: 0.3, trunkR: 0.2, depth: 5, spread: 0.72, up: 0.12, size: 0.44, density: 1.1 },
      narrow: { trunk: 0.3, trunkR: 0.15, depth: 5, spread: 0.36, up: 0.55, size: 0.34, density: 1 },
      bare: { trunk: 0.34, trunkR: 0.16, depth: 6, spread: 0.42, up: 0.42, size: 0, density: 0 },
    }[t.kind];
    const snow = spec.ground === "snow" ? std("#f6f8fb") : undefined;
    const puffs = grow(g, { bark, trunk: H * opts.trunk, trunkR: opts.trunkR * (H / 3.5), depth: opts.depth, spread: opts.spread, up: opts.up, lean: t.lean ?? 0, leafy: true, snow });
    // scale the crown so the tree's top lands near the requested height
    const top = Math.max(...puffs.map((p) => p.p.y));
    g.scale.setScalar(H / Math.max(top, 0.5));
    if (t.kind !== "bare") foliage(g, puffs, leaves, opts.size * (top / H), (t.sparse ? 0.55 : 1) * opts.density, light, t.blossom);
  }
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  scene.add(g);
}

// ------------------------------------------------------------------ props

function props(scene: THREE.Scene, spec: PortraitSpec) {
  const iron = std("#2b2e33", { metalness: 0.3, roughness: 0.5 });
  const wood = std("#8a5a35");
  const fur = std("#7a5236");
  const add = (o: THREE.Object3D) => {
    o.traverse((c) => {
      if ((c as THREE.Mesh).isMesh) {
        c.castShadow = true;
        c.receiveShadow = true;
      }
    });
    scene.add(o);
  };
  const squirrel = (x: number, y: number, z: number, ry: number) => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), fur);
    body.scale.set(1.3, 1, 0.9);
    body.position.y = 0.1;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 10), fur);
    head.position.set(0.13, 0.18, 0);
    const tail = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), std("#9a7050"));
    tail.scale.set(0.8, 1.7, 0.8);
    tail.position.set(-0.13, 0.24, 0);
    tail.rotation.z = 0.4;
    g.add(body, head, tail);
    g.position.set(x, y, z);
    g.rotation.y = ry;
    add(g);
  };
  for (const p of spec.props) {
    if (p === "bench") {
      const g = new THREE.Group();
      for (let k = 0; k < 3; k++) g.add(box(1.5, 0.04, 0.1, wood, 0, 0.42, -0.12 + k * 0.12));
      for (let k = 0; k < 3; k++) g.add(box(1.5, 0.08, 0.035, wood, 0, 0.62 + k * 0.12, -0.24));
      for (const lx of [-0.62, 0.62]) {
        g.add(box(0.05, 0.42, 0.05, iron, lx, 0.21, 0.1));
        g.add(box(0.05, 0.85, 0.05, iron, lx, 0.42, -0.24));
      }
      g.position.set(1.9, 0, 1.0);
      g.rotation.y = -0.5;
      add(g);
      squirrel(1.75, 0.44, 1.1, 0.6);
    } else if (p === "squirrel") {
      squirrel(0.7, 0, 1.1, -0.8);
    } else if (p === "lamp") {
      const g = new THREE.Group();
      g.add(cyl(0.035, 0.05, 2.4, iron, 0, 1.2, 0, 8));
      g.add(box(0.24, 0.3, 0.24, std("#f3e6c4", { emissive: "#ffcf86", emissiveIntensity: 0.6 }), 0, 2.55, 0));
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.18, 4), iron);
      cap.position.y = 2.79;
      cap.rotation.y = Math.PI / 4;
      g.add(cap);
      g.position.set(2.3, 0, -0.4);
      add(g);
    } else if (p === "thinker") {
      const g = new THREE.Group();
      const bronze = std("#4a3f31", { metalness: 0.45, roughness: 0.45 });
      g.add(box(0.75, 0.9, 0.6, std("#a9a69f"), 0, 0.45, 0));
      g.add(box(0.85, 0.08, 0.7, std("#bdbab2"), 0, 0.94, 0));
      g.add(box(0.36, 0.22, 0.4, bronze, 0, 1.08, 0));
      const torso = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), bronze);
      torso.scale.set(0.9, 1.4, 0.8);
      torso.position.set(0.05, 1.42, 0);
      torso.rotation.z = -0.35;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), bronze);
      head.position.set(0.2, 1.78, 0);
      const arm = cyl(0.045, 0.05, 0.42, bronze, 0.22, 1.5, 0.08, 8);
      arm.rotation.z = 0.3;
      g.add(torso, head, arm);
      g.position.set(2.2, 0, 0.2);
      g.rotation.y = -0.6;
      add(g);
    } else if (p === "trash") {
      add(cyl(0.22, 0.2, 0.62, std("#3f4f45"), 1.6, 0.31, 0.7, 14));
      add(cyl(0.24, 0.24, 0.05, std("#2c3832"), 1.6, 0.64, 0.7, 14));
    } else if (p === "stake") {
      add(cyl(0.025, 0.03, 1.6, std("#c9a57a"), 0.16, 0.8, 0.05, 6));
      for (const y of [0.55, 1.05]) add(box(0.2, 0.03, 0.03, std("#2f6b3a"), 0.08, y, 0.04));
      const mulch = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, 0.04, 20), std("#6b4a2f"));
      mulch.position.y = 0.04;
      add(mulch);
    }
  }
}

// ------------------------------------------------------------------ render

export async function renderPortrait(spec: PortraitSpec, index: number): Promise<Blob> {
  seed = 11 + index * 7919;
  const sky = SKIES[spec.sky];
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(2);
  renderer.setSize(W, H, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = canvasTexture(64, 256, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, sky.bg[1]);
    g.addColorStop(0.75, sky.bg[0]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 256);
  });
  scene.fog = new THREE.Fog(sky.bg[0], 10, 24);

  const camera = new THREE.PerspectiveCamera(36, W / H, 0.1, 100);
  camera.position.set(-0.6, 1.25, 7.8);
  camera.lookAt(0.35, 1.85, 0);

  scene.add(new THREE.HemisphereLight(sky.sky, sky.ground, sky.hemi));
  const sun = new THREE.DirectionalLight(sky.sun, sky.sunI);
  sun.position.set(...sky.sunPos);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 40 });
  sun.shadow.radius = 6;
  sun.shadow.blurSamples = 16;
  sun.shadow.bias = -0.0005;
  scene.add(sun);
  const lightDir = new THREE.Vector3(...sky.sunPos).normalize();

  // the page and the lawn printed on it
  const pageTex = paper(spec.ground === "snow" ? "#f1f4f8" : "#e4d8bf");
  pageTex.wrapS = pageTex.wrapT = THREE.RepeatWrapping;
  pageTex.repeat.set(3, 3);
  const page = box(40, 0.3, 30, std("#ffffff", { map: pageTex, roughness: 0.92 }), 0, -0.15, -6);
  page.receiveShadow = true;
  scene.add(page);
  if (spec.ground === "lawn") {
    const lawnTex = stripes("#ffffff", 14);
    const lawn = box(30, 0.03, 9.5, std(spec.sky === "golden" ? "#4a7638" : "#47793a", { map: lawnTex, roughness: 0.97 }), 0, 0.015, 0.6);
    lawn.receiveShadow = true;
    scene.add(lawn);
  } else {
    // a soft blanket of snow with a few gentle mounds
    for (let i = 0; i < 7; i++) {
      const drift = new THREE.Mesh(new THREE.SphereGeometry(between(1.5, 3), 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), std("#f6f8fb", { roughness: 0.95 }));
      drift.scale.y = 0.06;
      drift.position.set(between(-8, 8), 0, between(-4, 3));
      drift.receiveShadow = true;
      scene.add(drift);
    }
  }
  if (spec.path) {
    const brick = canvasTexture(128, 512, (ctx) => {
      ctx.fillStyle = "#a9503d";
      ctx.fillRect(0, 0, 128, 512);
      for (let y = 0; y < 512; y += 8) {
        ctx.fillStyle = "rgba(255,225,205,0.12)";
        ctx.fillRect(0, y, 128, 2);
      }
    });
    brick.wrapT = THREE.RepeatWrapping;
    brick.repeat.set(1, 4);
    const path = box(1.6, 0.04, 20, std("#ffffff", { map: brick }), 2.2, 0.03, -4);
    path.rotation.y = 0.18;
    path.receiveShadow = true;
    scene.add(path);
  }

  // what stands behind the tree
  if (spec.backdrop === "hall") {
    hall(scene, -2.5, -7, 9, 3.6 + between(-0.3, 0.4), 2.2);
    hall(scene, 7.5, -8.5, 7, 3.4, 2.2);
  } else if (spec.backdrop === "low") {
    lowLibrary(scene, -1.5, -8.5);
    hall(scene, 8.5, -9, 6, 3.4, 2.2);
  } else if (spec.backdrop === "glass") {
    glassBlock(scene, -0.5, -7, 13, 4, 3);
  } else {
    modernBlock(scene, -4.5, -8, 5, 7, 3);
    modernBlock(scene, 5, -9.5, 6, 5.5, 3);
  }

  tree(scene, spec, lightDir);
  props(scene, spec);

  if (spec.litter) {
    const n = 260;
    const leaf = new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, 0.008, 0.05), std("#ffffff", { roughness: 0.9 }), n);
    const tmp = new THREE.Object3D();
    const col = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      const r = Math.pow(rnd(), 0.7) * 2.4;
      tmp.position.set(Math.cos(a) * r, 0.04, Math.sin(a) * r * 0.8 + 0.3);
      tmp.rotation.set(0, rnd() * 3, 0);
      tmp.updateMatrix();
      leaf.setMatrixAt(i, tmp.matrix);
      leaf.setColorAt(i, col.set(spec.litter[i % spec.litter.length]));
    }
    leaf.receiveShadow = true;
    scene.add(leaf);
  }

  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(2);
  composer.setSize(W, H);
  composer.addPass(new RenderPass(scene, camera));
  const gtao = new GTAOPass(scene, camera, W * 2, H * 2);
  gtao.blendIntensity = 0.5;
  composer.addPass(gtao);
  composer.addPass(new OutputPass());
  composer.render();

  // Down-sample, then a touch of paper grain and a soft vignette, like the book.
  const out = document.createElement("canvas");
  out.width = W;
  out.height = H;
  const ctx = out.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(renderer.domElement, 0, 0, W, H);
  const img = ctx.getImageData(0, 0, W, H);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rnd() - 0.5) * 7;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
  const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, W * 0.75);
  v.addColorStop(0, "rgba(40,30,20,0)");
  v.addColorStop(1, "rgba(40,30,20,0.18)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);

  composer.dispose();
  renderer.dispose();
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    (Array.isArray(m.material) ? m.material : m.material ? [m.material] : []).forEach((mat) => mat.dispose());
  });

  return new Promise((resolve, reject) => out.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't export."))), "image/jpeg", 0.9));
}
