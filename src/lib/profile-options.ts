/**
 * What uploaders can tell the AI when it writes their tree's profile, and how
 * they can ask it to redo a line. Shared by the upload form and the server.
 */

/** A personality the uploader can pick before the profile is written. */
export const TREE_VIBES = [
  { id: "romantic", label: "Hopeless romantic", guide: "swoony and earnest, a little too much, already planning the wedding" },
  { id: "grumpy", label: "Grumpy old soul", guide: "has seen it all, unimpressed by students, secretly soft" },
  { id: "chaotic", label: "Chaotic", guide: "unhinged energy, non sequiturs, zero chill" },
  { id: "smooth", label: "Smooth talker", guide: "confident and flirty, every answer a pickup line" },
  { id: "overachiever", label: "Overachiever", guide: "Ivy League try-hard, brags like a resume, stressed about finals" },
  { id: "mysterious", label: "Mysterious", guide: "says little, implies a lot, dark and brooding" },
] as const;

export type VibeId = (typeof TREE_VIBES)[number]["id"];

export const vibeById = (id: string | null | undefined) => TREE_VIBES.find((v) => v.id === id) ?? null;

/** Quick directions for "rewrite this line". "again" just asks for another take. */
export const REWRITE_DIRECTIONS = [
  { id: "again", label: "Another take", guide: "" },
  { id: "funnier", label: "Funnier", guide: "funnier: a sharper, more surprising joke" },
  { id: "shorter", label: "Shorter", guide: "shorter: ten words or fewer" },
  { id: "weirder", label: "Weirder", guide: "weirder: more absurd and unexpected" },
  { id: "sweeter", label: "Sweeter", guide: "sweeter: more charming and wholesome" },
] as const;

export type DirectionId = (typeof REWRITE_DIRECTIONS)[number]["id"];

export const directionById = (id: string | null | undefined) => REWRITE_DIRECTIONS.find((d) => d.id === id) ?? REWRITE_DIRECTIONS[0];

/** The longest hint an uploader can give the AI about their tree. */
export const HINT_MAX = 140;

/** Profiles the AI may draft per user per day (published or not). */
export const DAILY_DRAFT_LIMIT = 20;

/** Single-line rewrites per user per day. */
export const DAILY_REWRITE_LIMIT = 60;

/** Field limits, matching the checks in supabase/captions.sql. */
export const LIMITS = { name: 40, species: 80, bio: 200, answer: 300, ageMin: 1, ageMax: 5000 } as const;

/** A profile as the uploader edits it: each line keeps the AI's latest version so edits can be undone. */
export type EditableLine = {
  /** The caption id, once the tree is live. */
  id?: string;
  prompt: string;
  answer: string;
  /** The text to go back to: the AI's latest version in a draft, the saved text on a live tree. */
  original: string;
  /** Why this line can't be changed (it has votes), if it can't. */
  locked?: string | null;
};

export type EditableProfile = {
  name: string;
  age: number | "";
  species: string;
  bio: string;
  lines: EditableLine[];
};

/** What's wrong with a profile before it can be saved, or null if it's fine. */
export function profileProblem(p: EditableProfile): string | null {
  if (!p.name.trim()) return "Give your tree a name.";
  if (p.age === "" || !Number.isInteger(p.age) || p.age < LIMITS.ageMin || p.age > LIMITS.ageMax) {
    return `Its age has to be a whole number from ${LIMITS.ageMin} to ${LIMITS.ageMax}.`;
  }
  if (p.lines.length === 0) return "Keep at least one line on the profile.";
  if (p.lines.some((l) => !l.answer.trim())) return "One of the lines is empty. Write something or remove it.";
  return null;
}
