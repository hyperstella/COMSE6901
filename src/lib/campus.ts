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

/** College Walk runs east-west at 116th St: brick sidewalks, two lawn strips and a paved lane down the middle. */
export const COLLEGE_WALK = { s0: 6.25, s1: 7.45 };

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
  | "pupin"
  | "rotunda";

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

// Footprints traced from OpenStreetMap and aerial imagery, inset slightly
// from the street edges so the sidewalks and street trees fit.
export const BUILDINGS: Building[] = [
  // South campus, 114th to 116th
  { name: "Carman Hall", kind: "modern", s0: 0.15, s1: 0.9, e0: 0.25, e1: 2.95, h: 3.0 },
  { name: "Lerner Hall", kind: "glass", s0: 0.9, s1: 2.85, e0: 0.25, e1: 2.9, h: 2.3 },
  { name: "Butler Library", kind: "library", s0: 0.15, s1: 2.3, e0: 3.5, e1: 7.05, h: 2.2 },
  { name: "John Jay Hall", kind: "hall", s0: 0.15, s1: 1.15, e0: 7.75, e1: 10.25, h: 3.3, plaque: "JOHN JAY" },
  { name: "Wallach Hall", kind: "hall", s0: 1.25, s1: 2.9, e0: 9.65, e1: 10.25, h: 2.3, plaque: "WALLACH" },
  { name: "Hartley Hall", kind: "hall", s0: 3.25, s1: 5.05, e0: 9.65, e1: 10.25, h: 2.3, plaque: "HARTLEY" },
  { name: "Hamilton Hall", kind: "hall", s0: 5.3, s1: 6.15, e0: 7.75, e1: 10.25, h: 2.2, plaque: "HAMILTON" },
  { name: "Furnald Hall", kind: "hall", s0: 3.25, s1: 5.1, e0: 0.25, e1: 0.9, h: 2.3 },
  { name: "Pulitzer Hall", kind: "hall", s0: 5.35, s1: 6.15, e0: 0.25, e1: 2.85, h: 2.2 },
  // North campus, 116th to 120th
  { name: "Dodge Hall", kind: "hall", s0: 7.5, s1: 8.3, e0: 0.25, e1: 2.8, h: 1.9 },
  { name: "Kent Hall", kind: "hall", s0: 7.5, s1: 8.3, e0: 7.75, e1: 10.25, h: 1.9, plaque: "KENT" },
  { name: "Lewisohn Hall", kind: "hall", s0: 8.7, s1: 10.6, e0: 0.25, e1: 0.85, h: 1.9 },
  { name: "Philosophy Hall", kind: "hall", s0: 8.65, s1: 10.6, e0: 9.65, e1: 10.25, h: 2.0, plaque: "PHILOSOPHY" },
  { name: "Buell Hall", kind: "cottage", s0: 9.5, s1: 10.35, e0: 7.35, e1: 8.35, h: 0.8 },
  // St. Paul's and Earl Hall face each other across Low, porticos toward it.
  { name: "Earl Hall", kind: "domed", s0: 11.0, s1: 11.75, e0: 0.85, e1: 2.35, h: 1.3 },
  { name: "St. Paul's Chapel", kind: "chapel", s0: 10.8, s1: 11.85, e0: 8.15, e1: 10.1, h: 1.25 },
  // Low's terrace; the Greek-cross library sits on it, its steps run down to the plaza.
  { name: "Low Library", kind: "low", s0: 9.6, s1: 12.7, e0: 3.85, e1: 6.65, h: 1.55 },
  { name: "Mathematics Hall", kind: "hall", s0: 12.12, s1: 14.15, e0: 0.25, e1: 0.85, h: 1.9 },
  { name: "Avery Hall", kind: "hall", s0: 12.12, s1: 14.15, e0: 7.65, e1: 8.5, h: 1.9 },
  { name: "Fayerweather Hall", kind: "hall", s0: 12.12, s1: 14.15, e0: 9.65, e1: 10.25, h: 1.9, plaque: "FAYERWEATHER" },
  { name: "Havemeyer Hall", kind: "hall", s0: 14.55, s1: 15.7, e0: 0.25, e1: 2.85, h: 2.7 },
  { name: "Havemeyer Hall", kind: "hall", s0: 15.7, s1: 16.7, e0: 1.8, e1: 2.85, h: 2.7 },
  { name: "Chandler Hall", kind: "modern", s0: 15.7, s1: 17.15, e0: 0.25, e1: 0.85, h: 2.7, brick: true },
  { name: "Uris Hall", kind: "modern", s0: 14.4, s1: 16.7, e0: 3.4, e1: 6.9, h: 2.4, podium: true },
  { name: "University Hall", kind: "rotunda", s0: 16.7, s1: 18.05, e0: 4.1, e1: 6.4, h: 0.9 },
  { name: "Schermerhorn Hall", kind: "hall", s0: 14.55, s1: 15.7, e0: 7.7, e1: 10.25, h: 2.1, plaque: "SCHERMERHORN" },
  { name: "Schermerhorn Extension", kind: "modern", s0: 15.8, s1: 17.1, e0: 9.6, e1: 10.25, h: 3.1, brick: true },
  { name: "Fairchild Center", kind: "modern", s0: 16.75, s1: 18.85, e0: 7.05, e1: 8.6, h: 3.4 },
  { name: "Computer Science Building", kind: "modern", s0: 17.75, s1: 18.85, e0: 8.6, e1: 10.25, h: 1.4, brick: true },
  { name: "Northwest Corner Building", kind: "tower", s0: 17.4, s1: 19.85, e0: 0.25, e1: 0.95, h: 4.3 },
  { name: "Pupin Hall", kind: "pupin", s0: 19.1, s1: 19.85, e0: 1.1, e1: 3.7, h: 3.4 },
  { name: "Schapiro CEPSR", kind: "modern", s0: 18.35, s1: 19.85, e0: 4.05, e1: 6.4, h: 3.3, brick: true },
  { name: "Mudd Hall", kind: "modern", s0: 18.9, s1: 19.85, e0: 6.65, e1: 10.25, h: 4.0, plaque: "MUDD" },
];

export type Area = { name: string; near: string; s0: number; s1: number; e0: number; e1: number };

export const LAWNS: Area[] = [
  { name: "South Field", near: "on South Field", s0: 3.1, s1: 5.85, e0: 3.25, e1: 4.78 },
  { name: "South Field", near: "on South Field", s0: 3.1, s1: 5.85, e0: 5.04, e1: 5.4 },
  { name: "South Field", near: "on South Field", s0: 3.1, s1: 5.85, e0: 5.7, e1: 7.0 },
  { name: "Furnald Lawn", near: "on Furnald Lawn", s0: 3.35, s1: 5.0, e0: 1.85, e1: 2.85 },
  { name: "Furnald Lawn", near: "on Furnald Lawn", s0: 3.55, s1: 4.8, e0: 1.05, e1: 1.55 },
  { name: "Van Am Quad", near: "in Van Am Quad", s0: 2.12, s1: 3.0, e0: 7.45, e1: 8.6 },
  { name: "Van Am Quad", near: "in Van Am Quad", s0: 3.16, s1: 5.1, e0: 7.45, e1: 8.6 },
  { name: "College Walk", near: "on College Walk", s0: 6.45, s1: 6.7, e0: 3.4, e1: 5.0 },
  { name: "College Walk", near: "on College Walk", s0: 6.45, s1: 6.7, e0: 5.6, e1: 7.25 },
  { name: "College Walk", near: "on College Walk", s0: 7.0, s1: 7.25, e0: 3.4, e1: 5.0 },
  { name: "College Walk", near: "on College Walk", s0: 7.0, s1: 7.25, e0: 5.6, e1: 7.25 },
  { name: "Low Plaza", near: "on Low Plaza", s0: 7.9, s1: 9.2, e0: 3.0, e1: 4.1 },
  { name: "Low Plaza", near: "on Low Plaza", s0: 7.9, s1: 9.2, e0: 6.4, e1: 7.3 },
  { name: "the lawn by Lewisohn", near: "beside Lewisohn Hall", s0: 8.75, s1: 9.45, e0: 1.45, e1: 2.75 },
  { name: "Low's west lawn", near: "beside Low Library", s0: 10.75, s1: 12.0, e0: 2.72, e1: 3.2 },
  { name: "Low's west lawn", near: "beside Low Library", s0: 12.15, s1: 13.95, e0: 1.36, e1: 3.2 },
  { name: "Low's east lawn", near: "beside Low Library", s0: 10.8, s1: 11.95, e0: 7.25, e1: 7.85 },
  { name: "the lawn behind Low", near: "behind Low Library", s0: 13.25, s1: 14.0, e0: 4.1, e1: 5.9 },
  { name: "Pupin Plaza", near: "on the plaza by Pupin", s0: 17.95, s1: 18.55, e0: 1.5, e1: 2.05 },
  { name: "Pupin Plaza", near: "on the plaza by Pupin", s0: 17.95, s1: 18.55, e0: 2.65, e1: 3.3 },
];

export const AREAS: Area[] = [
  { name: "College Walk", near: "on College Walk", s0: COLLEGE_WALK.s0, s1: COLLEGE_WALK.s1, e0: 0, e1: E },
  { name: "Low Plaza", near: "on Low Plaza", s0: 7.45, s1: 8.7, e0: 3.0, e1: 7.45 },
  { name: "the Low Steps", near: "on the Low Steps", s0: 8.7, s1: 9.6, e0: 4.25, e1: 6.25 },
  { name: "Pupin Plaza", near: "on the plaza by Pupin", s0: 17.2, s1: 19.1, e0: 0.95, e1: 3.75 },
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
