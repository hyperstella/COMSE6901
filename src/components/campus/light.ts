/**
 * Season and sun models for the campus storybook. Everything is a pure
 * function of (day of year, hour) so the UI can scrub through time.
 */

export type SeasonState = {
  name: string;
  leaves: [string, string, string];
  density: number; // 0 bare .. 1 full canopy
  blossom: number; // 0..1 spring flowers
  snow: number; // 0..1 snow cover
  lawn: string;
  fx: "snow" | "petals" | "leaves" | "none" | "fireflies";
};

type Key = Omit<SeasonState, "name"> & { d: number; name: string };

const KEYS: Key[] = [
  { d: 0, name: "Deep winter", leaves: ["#e9eef3", "#d5dee8", "#ffffff"], density: 0, blossom: 0, snow: 1, lawn: "#eef2f5", fx: "snow" },
  { d: 55, name: "Late winter", leaves: ["#9fb38a", "#7f9970", "#c3d1ad"], density: 0.05, blossom: 0, snow: 0.3, lawn: "#7d8f63", fx: "snow" },
  { d: 100, name: "Cherry blossoms", leaves: ["#f3b6c8", "#e597b0", "#fbe0e8"], density: 0.78, blossom: 1, snow: 0, lawn: "#5c9a45", fx: "petals" },
  { d: 140, name: "Fresh green", leaves: ["#5f9e44", "#4a8a3a", "#7fb655"], density: 0.92, blossom: 0.08, snow: 0, lawn: "#4f8d3f", fx: "none" },
  { d: 196, name: "High summer", leaves: ["#46893d", "#336f32", "#5f9f46"], density: 1, blossom: 0, snow: 0, lawn: "#3f7d38", fx: "fireflies" },
  { d: 262, name: "Leaves turning", leaves: ["#6f8e38", "#b9953a", "#4d7a33"], density: 0.97, blossom: 0, snow: 0, lawn: "#4b7f3a", fx: "leaves" },
  { d: 296, name: "Peak foliage", leaves: ["#d2742f", "#b5442b", "#e3a83c"], density: 0.9, blossom: 0, snow: 0, lawn: "#5a7f3c", fx: "leaves" },
  { d: 326, name: "Bare branches", leaves: ["#a8693c", "#8a5530", "#c98f4f"], density: 0.3, blossom: 0, snow: 0, lawn: "#6f7a4f", fx: "leaves" },
  { d: 350, name: "First snow", leaves: ["#e9eef3", "#d5dee8", "#ffffff"], density: 0, blossom: 0, snow: 0.7, lawn: "#e4e9ee", fx: "snow" },
  { d: 365, name: "Deep winter", leaves: ["#e9eef3", "#d5dee8", "#ffffff"], density: 0, blossom: 0, snow: 1, lawn: "#eef2f5", fx: "snow" },
];

function hex(h: string) {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

export function mix(a: string, b: string, t: number) {
  const x = hex(a);
  const y = hex(b);
  const k = Math.max(0, Math.min(1, t));
  return (
    "#" +
    [0, 1, 2]
      .map((i) => Math.round(x[i] + (y[i] - x[i]) * k).toString(16).padStart(2, "0"))
      .join("")
  );
}

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function seasonAt(dayOfYear: number): SeasonState {
  const day = ((dayOfYear % 365) + 365) % 365;
  let i = 0;
  while (KEYS[i + 1].d < day) i++;
  const k = KEYS[i];
  const n = KEYS[i + 1];
  const t = (day - k.d) / (n.d - k.d);
  return {
    name: t < 0.5 ? k.name : n.name,
    leaves: [mix(k.leaves[0], n.leaves[0], t), mix(k.leaves[1], n.leaves[1], t), mix(k.leaves[2], n.leaves[2], t)],
    density: k.density + (n.density - k.density) * t,
    blossom: k.blossom + (n.blossom - k.blossom) * t,
    snow: k.snow + (n.snow - k.snow) * t,
    lawn: mix(k.lawn, n.lawn, t),
    fx: t < 0.5 ? k.fx : n.fx,
  };
}

export type SunState = {
  elevation: number; // degrees; negative at night
  progress: number; // 0 at sunrise, 1 at sunset
  direction: [number, number, number]; // unit vector from the scene toward the light
  phase: "Night" | "Dawn" | "Dusk" | "Golden hour" | "Daylight" | "Midday";
};

/** Day length and noon height follow the season (roughly New York). */
export function sunAt(dayOfYear: number, hour: number): SunState {
  const yearPhase = Math.sin((2 * Math.PI * (dayOfYear - 80)) / 365);
  const dayLength = 12.2 + 2.9 * yearPhase;
  const rise = 12.9 - dayLength / 2;
  const set = 12.9 + dayLength / 2;
  const maxElevation = 49 + 23 * yearPhase;
  const u = (hour - rise) / (set - rise);

  let elevation: number;
  if (u >= 0 && u <= 1) elevation = Math.sin(Math.PI * u) * maxElevation;
  else {
    const hoursAway = u < 0 ? rise - hour : hour - set;
    elevation = -Math.min(35, hoursAway * 9);
  }

  // Morning light rakes in from back-right, evening light from back-left, so
  // the faces toward the reader stay softly lit and shadows fall forward.
  const p = clamp(u, 0, 1);
  const theta = ((-37 - 130 * p) * Math.PI) / 180;
  const e = (Math.max(elevation, 4) * Math.PI) / 180;
  const direction: [number, number, number] = [Math.cos(e) * Math.cos(theta), Math.sin(e), Math.cos(e) * Math.sin(theta)];

  const phase =
    elevation < -6 ? "Night" : elevation < 0 ? (u < 0.5 ? "Dawn" : "Dusk") : elevation < 12 ? "Golden hour" : elevation > 50 ? "Midday" : "Daylight";
  return { elevation, progress: u, direction, phase };
}

export type LightState = {
  sunColor: string;
  sunIntensity: number;
  skyColor: string;
  groundColor: string;
  hemiIntensity: number;
  night: number; // 0 day .. 1 night
  exposure: number;
  backdrop: [string, string];
};

/** Warm, natural light: low sun is amber, high sun is soft cream, night is moonlit blue. */
export function lightAt(elevation: number): LightState {
  const stops = [
    { e: -16, sun: "#9db3f0", si: 0.7, sky: "#3a4c80", ground: "#2a2a35", hi: 0.62, night: 1, exp: 1.12, bg: ["#232c45", "#11172a"] },
    { e: -4, sun: "#ff9e7a", si: 0.8, sky: "#8a83ad", ground: "#6a4c3c", hi: 0.66, night: 0.55, exp: 1.06, bg: ["#6a5f7c", "#322e44"] },
    { e: 3, sun: "#ffb06a", si: 2.3, sky: "#e3cfbd", ground: "#c9a483", hi: 1.0, night: 0, exp: 1.0, bg: ["#efe0d2", "#cbbbb0"] },
    { e: 16, sun: "#ffe9cc", si: 2.6, sky: "#e3e9ee", ground: "#d9cbb3", hi: 1.25, night: 0, exp: 1.0, bg: ["#e9edef", "#c8d1d9"] },
    { e: 60, sun: "#fff6ea", si: 2.8, sky: "#e6eef5", ground: "#ddd2bd", hi: 1.35, night: 0, exp: 1.0, bg: ["#e8eef2", "#c5cfd9"] },
  ];
  let i = 0;
  if (elevation > stops[0].e) while (i < stops.length - 2 && stops[i + 1].e < elevation) i++;
  const a = stops[i];
  const b = stops[i + 1];
  const t = clamp((elevation - a.e) / (b.e - a.e), 0, 1);
  const l = (x: number, y: number) => x + (y - x) * t;
  return {
    sunColor: mix(a.sun, b.sun, t),
    sunIntensity: l(a.si, b.si),
    skyColor: mix(a.sky, b.sky, t),
    groundColor: mix(a.ground, b.ground, t),
    hemiIntensity: l(a.hi, b.hi),
    night: l(a.night, b.night),
    exposure: l(a.exp, b.exp),
    backdrop: [mix(a.bg[0], b.bg[0], t), mix(a.bg[1], b.bg[1], t)],
  };
}

export function dayOfYear(date = new Date()) {
  return Math.floor(
    (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(date.getFullYear(), 0, 1)) / 86400000,
  );
}

export function hourOf(date = new Date()) {
  return Math.round((date.getHours() + date.getMinutes() / 60) * 10) / 10;
}
