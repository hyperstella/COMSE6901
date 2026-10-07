"use client";

import { getImageProps } from "next/image";

/**
 * Pixel art from tree photos, entirely in the browser. Next.js already serves
 * a small, cached copy of every photo, so pixelating costs one tiny image
 * request and a few milliseconds of canvas work: no extra storage, model
 * calls or server time. The same pixels color each tree's voxel model on the
 * campus book.
 */

type RGB = [number, number, number];

/** A same-origin, resized copy of a photo (so canvas can read its pixels). */
export function smallImageUrl(src: string, width = 128) {
  if (src.startsWith("blob:") || src.startsWith("data:")) return src;
  return getImageProps({ src, alt: "", width, height: width, quality: 75 }).props.src;
}

const cache = new Map<string, Promise<HTMLImageElement>>();

export function loadImage(url: string) {
  let p = cache.get(url);
  if (!p) {
    p = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Couldn't load the photo."));
      img.src = url;
    });
    cache.set(url, p);
    p.catch(() => cache.delete(url));
  }
  return p;
}

/** Draws the image into a cols x rows grid, cropped like object-fit: cover. */
function sample(img: HTMLImageElement, cols: number, rows: number) {
  const c = document.createElement("canvas");
  c.width = cols;
  c.height = rows;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  const scale = Math.max(cols / img.naturalWidth, rows / img.naturalHeight);
  const sw = cols / scale;
  const sh = rows / scale;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, 0, 0, cols, rows);
  return ctx.getImageData(0, 0, cols, rows);
}

const lum = (c: RGB) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
const sat = (c: RGB) => {
  const mx = Math.max(...c);
  return mx === 0 ? 0 : (mx - Math.min(...c)) / mx;
};

/** k-means over a list of colors; returns the centers and how many pixels each holds. */
function kmeans(colors: RGB[], k: number, rounds = 8) {
  if (colors.length === 0) return [];
  const sorted = [...colors].sort((a, b) => lum(a) - lum(b));
  let centers: RGB[] = Array.from({ length: Math.min(k, colors.length) }, (_, i) => [
    ...sorted[Math.floor(((i + 0.5) / k) * sorted.length)],
  ] as RGB);
  let counts: number[] = [];
  for (let r = 0; r < rounds; r++) {
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (const c of colors) {
      let best = 0;
      let bestD = Infinity;
      centers.forEach((m, i) => {
        const d = (c[0] - m[0]) ** 2 + (c[1] - m[1]) ** 2 + (c[2] - m[2]) ** 2;
        if (d < bestD) [best, bestD] = [i, d];
      });
      const s = sums[best];
      s[0] += c[0];
      s[1] += c[1];
      s[2] += c[2];
      s[3]++;
    }
    centers = sums.map((s, i) => (s[3] ? ([s[0] / s[3], s[1] / s[3], s[2] / s[3]] as RGB) : centers[i]));
    counts = sums.map((s) => s[3]);
  }
  return centers.map((c, i) => ({ color: c, count: counts[i] }));
}

/**
 * Pixel-art version of a photo: a cols-wide grid reduced to a small palette,
 * with a little extra saturation so it reads like a sprite.
 */
export function pixelate(img: HTMLImageElement, cols: number, aspect: number, k = 14) {
  const rows = Math.max(1, Math.round(cols / aspect));
  const data = sample(img, cols, rows);
  const px: RGB[] = [];
  for (let i = 0; i < data.data.length; i += 4) px.push([data.data[i], data.data[i + 1], data.data[i + 2]]);
  const centers = kmeans(px, k).map((c) => c.color);
  for (let i = 0; i < px.length; i++) {
    const c = px[i];
    let best = centers[0];
    let bestD = Infinity;
    for (const m of centers) {
      const d = (c[0] - m[0]) ** 2 + (c[1] - m[1]) ** 2 + (c[2] - m[2]) ** 2;
      if (d < bestD) [best, bestD] = [m, d];
    }
    const l = lum(best);
    for (let ch = 0; ch < 3; ch++) data.data[i * 4 + ch] = Math.max(0, Math.min(255, l + (best[ch] - l) * 1.18));
  }
  return data;
}

export type TreeLook = {
  leaves: [string, string, string]; // dark, mid, light
  bark: string;
  shape: "round" | "wide" | "narrow" | "cone" | "bare";
};

const toHex = (c: RGB) => "#" + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");

/** Colors and silhouette for a tree's voxel model, read from its photo and species. */
export function treeLook(img: HTMLImageElement, species: string | null): TreeLook {
  const W = 48;
  const H = 48;
  const data = sample(img, W, H);
  const at = (x: number, y: number): RGB => {
    const i = (y * W + x) * 4;
    return [data.data[i], data.data[i + 1], data.data[i + 2]];
  };
  // Crown: the middle of the upper half, minus anything that looks like sky.
  const crown: RGB[] = [];
  for (let y = Math.round(H * 0.06); y < H * 0.55; y++) {
    for (let x = Math.round(W * 0.22); x < W * 0.78; x++) {
      const c = at(x, y);
      const sky = (c[2] > c[0] + 12 && c[2] >= c[1] - 4 && lum(c) > 110) || (sat(c) < 0.1 && lum(c) > 175);
      if (!sky) crown.push(c);
    }
  }
  // Bark: the darker half of a strip low in the middle.
  const trunk: RGB[] = [];
  for (let y = Math.round(H * 0.62); y < H * 0.92; y++) for (let x = Math.round(W * 0.42); x < W * 0.58; x++) trunk.push(at(x, y));
  trunk.sort((a, b) => lum(a) - lum(b));
  const dark = trunk.slice(0, Math.max(1, trunk.length >> 1));
  const bark = dark.reduce<RGB>((s, c) => [s[0] + c[0] / dark.length, s[1] + c[1] / dark.length, s[2] + c[2] / dark.length], [0, 0, 0]);

  const clusters = kmeans(crown, 5)
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count * (0.35 + sat(b.color)) - a.count * (0.35 + sat(a.color)))
    .slice(0, 3)
    .map((c) => c.color)
    .sort((a, b) => lum(a) - lum(b));
  const fallback: RGB[] = [[52, 98, 46], [79, 133, 58], [140, 180, 90]];
  const leaves = (crown.length < 30 || clusters.length < 3 ? fallback : clusters) as [RGB, RGB, RGB];

  const s = species ?? "";
  const meanSat = leaves.reduce((n, c) => n + sat(c), 0) / 3;
  const shape: TreeLook["shape"] = /pine|fir|spruce|cedar|hemlock|conifer|juniper|yew|larch/i.test(s)
    ? "cone"
    : /ginkgo|poplar|cypress|columnar|birch|zelkova/i.test(s)
      ? "narrow"
      : meanSat < 0.14
        ? "bare"
        : /plane|oak|cherry|elm|beech|willow|linden|chestnut/i.test(s)
          ? "wide"
          : "round";
  return { leaves: leaves.map(toHex) as TreeLook["leaves"], bark: toHex(bark), shape };
}
