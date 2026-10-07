/**
 * Columbia's Morningside campus, from W 114th St to W 120th St and Broadway to
 * Amsterdam Ave. Campus coordinates:
 *   s: 0 at 114th St (south) .. S at 120th St (north)
 *   e: 0 at Broadway (west)  .. E at Amsterdam Ave (east)
 * The 3D storybook, the 2D plan and spot descriptions all read this file.
 * Trees are stored as map_x = e / E and map_y = 1 - s / S (a north-up map
 * with Broadway on the left), both 0..1.
 */

export const S = 20;
export const E = 10.5;

/** College Walk runs east-west at 116th St. */
export const COLLEGE_WALK = { s0: 6.42, s1: 6.98 };

export type BuildingKind =
  | "hall"
  | "library"
  | "low"
  | "chapel"
  | "domed"
  | "cottage"
  | "modern"
  | "glass"
  | "tower"
  | "pupin";

export type Building = {
  name: string;
  kind: BuildingKind;
  s0: number;
  s1: number;
  e0: number;
  e1: number;
  h: number;
  /** Short name printed on a plaque on the Amsterdam Ave sidewalk. */
  plaque?: string;
  /** Rendering hints for the 3D book: a brick (not stone) modern block, or a glass podium. */
  brick?: true;
  podium?: true;
};

export const BUILDINGS: Building[] = [
  // South campus, 114th to 116th
  { name: "Carman Hall", kind: "modern", s0: 0.15, s1: 1.75, e0: 0.25, e1: 2.3, h: 2.9 },
  { name: "Butler Library", kind: "library", s0: 0.2, s1: 1.85, e0: 2.85, e1: 7.65, h: 2.2 },
  { name: "John Jay Hall", kind: "hall", s0: 0.15, s1: 1.9, e0: 8.2, e1: 10.25, h: 3.3, plaque: "JOHN JAY" },
  { name: "Lerner Hall", kind: "glass", s0: 2.0, s1: 3.6, e0: 0.25, e1: 2.3, h: 2.3 },
  { name: "Furnald Hall", kind: "hall", s0: 3.85, s1: 5.1, e0: 0.25, e1: 1.95, h: 2.2 },
  { name: "Pulitzer Hall", kind: "hall", s0: 5.25, s1: 6.2, e0: 0.25, e1: 2.25, h: 2.1 },
  { name: "Wallach Hall", kind: "hall", s0: 2.1, s1: 3.4, e0: 8.65, e1: 10.25, h: 2.45, plaque: "WALLACH" },
  { name: "Hartley Hall", kind: "hall", s0: 3.6, s1: 4.9, e0: 8.65, e1: 10.25, h: 2.45, plaque: "HARTLEY" },
  { name: "Hamilton Hall", kind: "hall", s0: 5.05, s1: 6.2, e0: 7.9, e1: 10.25, h: 2.45, plaque: "HAMILTON" },
  // North campus, 116th to 120th
  { name: "Dodge Hall", kind: "hall", s0: 7.2, s1: 8.7, e0: 0.25, e1: 2.3, h: 2.3 },
  { name: "Earl Hall", kind: "domed", s0: 11.0, s1: 11.75, e0: 1.1, e1: 2.35, h: 1.3 },
  { name: "Kent Hall", kind: "hall", s0: 7.2, s1: 8.7, e0: 8.2, e1: 10.25, h: 2.3, plaque: "KENT" },
  { name: "Buell Hall", kind: "cottage", s0: 9.5, s1: 10.3, e0: 7.4, e1: 8.35, h: 0.8 },
  { name: "Philosophy Hall", kind: "hall", s0: 8.95, s1: 10.6, e0: 9.35, e1: 10.25, h: 2.2, plaque: "PHILOSOPHY" },
  // St. Paul's and Earl Hall face each other across Low, porticos toward it.
  { name: "St. Paul's Chapel", kind: "chapel", s0: 10.8, s1: 11.9, e0: 8.2, e1: 10.1, h: 1.25 },
  // Low's terrace; the Greek-cross library sits on it, its steps run down to the plaza.
  { name: "Low Library", kind: "low", s0: 9.6, s1: 12.7, e0: 3.75, e1: 6.75, h: 1.55 },
  { name: "Lewisohn Hall", kind: "hall", s0: 8.95, s1: 10.6, e0: 0.25, e1: 1.1, h: 2.2 },
  { name: "Mathematics Hall", kind: "hall", s0: 12.1, s1: 14.0, e0: 0.25, e1: 1.1, h: 2.2 },
  { name: "Avery Hall", kind: "hall", s0: 12.15, s1: 14.0, e0: 7.55, e1: 8.5, h: 2.2 },
  { name: "Fayerweather Hall", kind: "hall", s0: 12.15, s1: 14.0, e0: 9.35, e1: 10.25, h: 2.2, plaque: "FAYERWEATHER" },
  { name: "Uris Hall", kind: "modern", s0: 13.25, s1: 15.0, e0: 3.7, e1: 6.8, h: 2.7, podium: true },
  { name: "Schermerhorn Hall", kind: "hall", s0: 14.2, s1: 16.3, e0: 8.2, e1: 10.25, h: 2.9, plaque: "SCHERMERHORN" },
  { name: "Chandler Hall", kind: "hall", s0: 15.3, s1: 16.8, e0: 0.25, e1: 2.1, h: 2.4 },
  { name: "Havemeyer Hall", kind: "hall", s0: 15.3, s1: 16.8, e0: 2.4, e1: 4.8, h: 2.4 },
  { name: "Pupin Hall", kind: "pupin", s0: 17.2, s1: 19.85, e0: 0.25, e1: 2.5, h: 3.4 },
  { name: "Northwest Corner Building", kind: "tower", s0: 17.6, s1: 19.85, e0: 2.75, e1: 4.6, h: 4.3 },
  { name: "Schapiro CEPSR", kind: "modern", s0: 17.2, s1: 19.85, e0: 4.9, e1: 7.05, h: 3.3, brick: true },
  { name: "Mudd Hall", kind: "modern", s0: 17.0, s1: 19.85, e0: 7.4, e1: 10.25, h: 4.0, plaque: "MUDD", podium: true },
];

export type Area = { name: string; near: string; s0: number; s1: number; e0: number; e1: number };

export const LAWNS: Area[] = [
  { name: "South Field", near: "on South Field", s0: 2.25, s1: 4.05, e0: 3.0, e1: 5.05 },
  { name: "South Field", near: "on South Field", s0: 4.35, s1: 6.1, e0: 3.0, e1: 5.05 },
  { name: "South Field", near: "on South Field", s0: 2.25, s1: 4.05, e0: 5.45, e1: 7.5 },
  { name: "South Field", near: "on South Field", s0: 4.35, s1: 6.1, e0: 5.45, e1: 7.5 },
  { name: "Van Am Quad", near: "in Van Am Quad", s0: 2.1, s1: 4.85, e0: 7.8, e1: 8.45 },
  { name: "Low's west lawn", near: "beside Low Library", s0: 9.3, s1: 12.5, e0: 2.75, e1: 3.55 },
  { name: "Low's east lawn", near: "beside Low Library", s0: 10.5, s1: 12.0, e0: 7.35, e1: 7.95 },
  { name: "the north lawn", near: "behind Uris", s0: 15.2, s1: 16.9, e0: 5.0, e1: 6.85 },
];

export const AREAS: Area[] = [
  { name: "College Walk", near: "on College Walk", s0: COLLEGE_WALK.s0, s1: COLLEGE_WALK.s1, e0: 0, e1: E },
  { name: "Low Plaza", near: "on Low Plaza", s0: 7.05, s1: 8.55, e0: 3.75, e1: 6.75 },
  { name: "the Low Steps", near: "on the Low Steps", s0: 8.55, s1: 9.6, e0: 3.75, e1: 6.75 },
  ...LAWNS,
];

const distance = (s: number, e: number, a: { s0: number; s1: number; e0: number; e1: number }) =>
  Math.hypot(Math.max(a.s0 - s, 0, s - a.s1), Math.max(a.e0 - e, 0, e - a.e1));

export const toMap = (s: number, e: number) => ({ mapX: e / E, mapY: 1 - s / S });
export const fromMap = (mapX: number, mapY: number) => ({ s: (1 - mapY) * S, e: mapX * E });

/** "by Butler Library", "on South Field", … for a point stored as map_x/map_y. */
export function describeSpot(mapX: number, mapY: number) {
  const { s, e } = fromMap(mapX, mapY);
  let best = "somewhere on campus";
  let bestDistance = Infinity;
  for (const a of AREAS) {
    const d = distance(s, e, a);
    if (d < bestDistance) [best, bestDistance] = [a.near, d];
  }
  for (const b of BUILDINGS) {
    // Buildings win ties within a short walk, since they're easier to find.
    const d = distance(s, e, b) - 0.25;
    if (d < bestDistance) [best, bestDistance] = [`by ${b.name}`, d];
  }
  return best;
}
