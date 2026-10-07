/**
 * The example trees Treendr is seeded with: where each stands on campus (see
 * src/lib/campus.ts) and how its portrait is staged. Portraits are rendered in
 * the storybook style at /dev/portraits (development only) and saved to
 * scripts/seed-trees/; scripts/seed-trees.ts then runs them through the
 * prompt chain.
 */

export type Backdrop = "hall" | "low" | "glass" | "modern";
export type Prop = "bench" | "squirrel" | "lamp" | "thinker" | "trash" | "stake";

export type PortraitSpec = {
  slug: string;
  s: number;
  e: number;
  sky: "day" | "spring" | "golden" | "overcast" | "winter";
  ground: "lawn" | "snow";
  path?: boolean;
  backdrop: Backdrop;
  tree: {
    kind: "round" | "spreading" | "narrow" | "conifer" | "bare" | "sapling";
    leaves?: [string, string, string]; // dark, mid, light
    bark: string;
    height: number;
    lean?: number;
    blossom?: boolean;
    mottled?: boolean;
    sparse?: boolean;
  };
  props: Prop[];
  /** Fallen leaves or petals on the ground. */
  litter?: string[];
};

export const PORTRAITS: PortraitSpec[] = [
  {
    slug: "plane-south-field",
    s: 3.2,
    e: 4.0,
    sky: "day",
    ground: "lawn",
    backdrop: "hall",
    tree: { kind: "spreading", leaves: ["#2f5f2c", "#4b8a3a", "#86b65a"], bark: "#a39e80", height: 3.7, mottled: true },
    props: ["bench", "squirrel"],
  },
  {
    slug: "cherry-low-library",
    s: 11.9,
    e: 7.8,
    sky: "spring",
    ground: "lawn",
    backdrop: "low",
    tree: { kind: "spreading", leaves: ["#d47797", "#ee9fb9", "#fbd9e5"], bark: "#4a3430", height: 2.9, blossom: true },
    props: [],
    litter: ["#f6c3d3", "#fde5ee", "#f0a5bd"],
  },
  {
    slug: "maple-college-walk",
    s: 6.29,
    e: 3.1,
    sky: "golden",
    ground: "lawn",
    path: true,
    backdrop: "hall",
    tree: { kind: "round", leaves: ["#9a2f1f", "#d2502a", "#f0993c"], bark: "#4a3628", height: 3.4 },
    props: ["lamp"],
    litter: ["#c4411f", "#e9822f", "#f2b347"],
  },
  {
    slug: "ginkgo-avery",
    s: 11.45,
    e: 8.45,
    sky: "overcast",
    ground: "lawn",
    backdrop: "hall",
    tree: { kind: "narrow", leaves: ["#c99a17", "#eabd2c", "#fae27c"], bark: "#5b4a3c", height: 3.9 },
    props: [],
    litter: ["#f2c230", "#e8b021", "#f7d65a"],
  },
  {
    slug: "elm-philosophy-snow",
    s: 9.7,
    e: 8.47,
    sky: "winter",
    ground: "snow",
    backdrop: "hall",
    tree: { kind: "bare", bark: "#4b4440", height: 3.9 },
    props: ["thinker"],
  },
  {
    slug: "leaning-lerner",
    s: 2.8,
    e: 2.55,
    sky: "overcast",
    ground: "lawn",
    backdrop: "glass",
    tree: { kind: "round", leaves: ["#4f6b2b", "#6f8f3a", "#a5b866"], bark: "#5d4a3a", height: 3.0, lean: 0.38, sparse: true },
    props: ["trash"],
  },
  {
    slug: "spruce-north-lawn",
    s: 16.0,
    e: 6.3,
    sky: "day",
    ground: "lawn",
    backdrop: "modern",
    tree: { kind: "conifer", leaves: ["#2c5642", "#3d6e55", "#6a9a80"], bark: "#5a4030", height: 3.8 },
    props: ["squirrel"],
  },
  {
    slug: "sapling-van-am",
    s: 3.5,
    e: 8.12,
    sky: "spring",
    ground: "lawn",
    backdrop: "hall",
    tree: { kind: "sapling", leaves: ["#4f8a32", "#78ad45", "#b5d977"], bark: "#6a5340", height: 2.0 },
    props: ["stake"],
  },
];
