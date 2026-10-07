import OpenAI from "openai";
import { z } from "zod";
import type { TreeProfile } from "./types";

/**
 * The two-step prompt chain behind "Add a tree":
 *   1. describeImage: a vision model looks at the photo and writes field notes.
 *   2. writeProfile: a text model reads only those notes and writes the tree's
 *      dating profile. Each profile answer is a caption people vote on.
 *
 * Both steps use the OpenAI-compatible Chat Completions API, which lets the same
 * code talk to a local Ollama server in development and to Google's Gemini API
 * in production. Pick one with LLM_PROVIDER (see README).
 */

type Provider = {
  name: "ollama" | "gemini";
  client: OpenAI;
  visionModel: string;
  textModel: string;
  /** Extra request fields only this provider understands. */
  extra: (step: "describe" | "write") => Record<string, unknown>;
};

export class UploadError extends Error {}

function getProvider(): Provider | null {
  const name = (process.env.LLM_PROVIDER ?? (process.env.GEMINI_API_KEY ? "gemini" : "")).toLowerCase();

  if (name === "gemini") {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return null;
    const model = process.env.GEMINI_MODEL ?? "gemini-3.8-flash";
    return {
      name,
      client: new OpenAI({ apiKey, baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/" }),
      visionModel: model,
      textModel: model,
      // Gemini 3 always thinks a little; keep the description quick and
      // give the jokes a bit more room.
      extra: (step) => ({ reasoning_effort: step === "describe" ? "low" : "medium" }),
    };
  }

  if (name === "ollama") {
    return {
      name,
      client: new OpenAI({
        apiKey: "ollama", // required by the client, ignored by Ollama
        baseURL: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1",
      }),
      visionModel: process.env.OLLAMA_VISION_MODEL ?? "qwen2.5vl:7b",
      textModel: process.env.OLLAMA_TEXT_MODEL ?? "qwen2.5:7b",
      extra: () => ({}),
    };
  }

  return null;
}

export function llmLabel() {
  const p = getProvider();
  if (!p) return null;
  return p.visionModel === p.textModel ? p.visionModel : `${p.visionModel} → ${p.textModel}`;
}

function provider() {
  const p = getProvider();
  if (!p) throw new UploadError("No LLM provider is configured.");
  return p;
}

/** Turns provider/network failures into messages fit for the UI. */
function explain(error: unknown, p: Provider): never {
  if (error instanceof UploadError) throw error;
  if (error instanceof OpenAI.APIConnectionError) {
    throw new UploadError(
      p.name === "ollama"
        ? "Can't reach Ollama. Is `ollama serve` running?"
        : "Couldn't reach the model provider. Try again in a moment.",
    );
  }
  if (error instanceof OpenAI.RateLimitError) {
    throw new UploadError("The AI is getting a lot of requests. Try again in a minute.");
  }
  if (error instanceof OpenAI.NotFoundError && p.name === "ollama") {
    throw new UploadError(`Ollama doesn't have that model. Run \`ollama pull ${p.visionModel}\` and \`ollama pull ${p.textModel}\`.`);
  }
  throw error;
}

const DESCRIBE_SYSTEM = `You are a field botanist taking notes on one tree on Columbia University's campus. A comedy writer will turn your notes into the tree's dating profile without ever seeing the photo, so they depend on you for every detail that could be funny.

Write one paragraph of 80 to 140 words in plain prose, with no lists or headings. Cover the likely species and how sure you are; its size and a rough sense of its age; its shape and posture (leaning, lopsided, majestic, scraggly); bark, leaves, flowers or fruit, and what season it looks like; its condition; what is around it (buildings, benches, paths, people, squirrels, signs); the light and weather; and anything odd, charming or ironic. Describe what you can see rather than guessing, and do not identify real people by name. Do not make jokes yourself.

If there is no tree or large plant in the photo, reply with exactly NO_TREE and nothing else. If the photo is sexually explicit or shows graphic violence or gore, reply with exactly NOT_SUITABLE and nothing else.`;

const SENTINELS = ["NOT_SUITABLE", "NO_TREE"];
const HOLD = Math.max(...SENTINELS.map((s) => s.length)) + 4;

export type ImageInput = {
  data: string; // base64, no data: prefix
  mediaType: "image/jpeg" | "image/png" | "image/webp";
};

/**
 * Step 1: image -> text. Streams the field notes through onText as they are
 * written and resolves with the full text.
 */
export async function describeImage(
  image: ImageInput,
  onText: (delta: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const p = provider();
  let text = "";
  let released = false;

  try {
    const stream = await p.client.chat.completions.create(
      {
        model: p.visionModel,
        stream: true,
        temperature: 0.4,
        max_completion_tokens: 2000,
        messages: [
          { role: "system", content: DESCRIBE_SYSTEM },
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: `data:${image.mediaType};base64,${image.data}` } },
              { type: "text", text: "Take your field notes on this tree." },
            ],
          },
        ],
        ...p.extra("describe"),
      },
      { signal },
    );

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (!delta) continue;
      text += delta;
      if (released) {
        onText(delta);
      } else if (text.length > HOLD && !SENTINELS.some((s) => text.trimStart().startsWith(s))) {
        // Held back until now so a sentinel reply never reaches the UI.
        released = true;
        onText(text);
      }
    }
  } catch (error) {
    explain(error, p);
  }

  const description = text.trim();
  if (description.startsWith("NO_TREE")) {
    throw new UploadError("We couldn't spot a tree in that photo. Treendr is trees only.");
  }
  if (description.startsWith("NOT_SUITABLE")) {
    throw new UploadError("That photo isn't right for Treendr. Try a different one.");
  }
  if (!description) throw new UploadError("The model couldn't describe this photo.");
  if (!released) onText(text);
  return description;
}

export const PROFILE_PROMPTS = [
  "My most irrational fear",
  "I'm looking for",
  "Two truths and a lie",
  "My simple pleasures",
  "Dating me is like",
  "I'll fall for you if",
  "Typical Sunday",
  "My love language is",
  "Green flags I look for",
  "We'll get along if",
  "My toxic trait is",
  "The key to my heart is",
  "I'm weirdly attracted to",
  "I won't shut up about",
  "Don't hate me if I",
  "A shower thought I recently had",
] as const;

const Profile = z.object({
  name: z.string(),
  age: z.number().int(),
  species: z.string(),
  bio: z.string(),
  prompts: z.array(
    z.object({
      prompt: z.enum(PROFILE_PROMPTS),
      answer: z.string(),
    }),
  ),
});

const PROFILE_SYSTEM = `You write dating-app profiles for trees on Columbia University's Morningside Heights campus, for an app called Treendr. You receive a botanist's field notes on one tree and where it stands on campus. You never see the photo.

Write the profile in the tree's own voice:
- name: a first name that fits its vibe.
- age: its age in years, estimated from the notes. Playful but plausible.
- species: from the notes. If they're unsure, say "probably" (for example "Probably a London plane").
- bio: one line, under 15 words.
- prompts: exactly 5 answers, each to a different prompt from this list: ${PROFILE_PROMPTS.join("; ")}.

Each answer is a caption people will vote on, so make every one funny:
- Under 20 words. Short beats long.
- Anchor it in a specific detail from the notes or the tree's spot. An answer that could fit any tree is a miss.
- Tree-life humor is welcome (squirrels, leaf blowers, photosynthesis, roots, shade, students napping underneath), and so are campus references (finals in Butler, the Steps, the Core), but don't force one into every line.
- Keep it good-natured: tease the tree and the situation, never people's bodies, race, gender, age or other identity traits.
- No hashtags, no emoji, and no surrounding quotation marks.

Reply with JSON only, shaped like {"name": "...", "age": 80, "species": "...", "bio": "...", "prompts": [{"prompt": "My most irrational fear", "answer": "..."}]}.`;

const clip = (s: string, n: number) => s.trim().replace(/^["“”']+|["“”']+$/g, "").trim().slice(0, n);

/** Step 2: text -> a dating profile. The model sees only the notes, not the image. */
export async function writeProfile(
  description: string,
  spot: string,
  signal?: AbortSignal,
): Promise<TreeProfile> {
  const p = provider();
  let content: string | null | undefined;

  try {
    const completion = await p.client.chat.completions.create(
      {
        model: p.textModel,
        temperature: 0.9,
        max_completion_tokens: 4000,
        response_format: {
          type: "json_schema",
          json_schema: { name: "tree_profile", schema: z.toJSONSchema(Profile) },
        },
        messages: [
          { role: "system", content: PROFILE_SYSTEM },
          {
            role: "user",
            content: `<field_notes>\n${description}\n</field_notes>\n<location>${spot}, Columbia University</location>\n\nWrite this tree's profile.`,
          },
        ],
        ...p.extra("write"),
      },
      { signal },
    );
    content = completion.choices[0]?.message?.content;
  } catch (error) {
    explain(error, p);
  }

  let parsed: z.infer<typeof Profile>;
  try {
    // Some models wrap JSON in a code fence; strip it before parsing.
    const json = (content ?? "").replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, "");
    parsed = Profile.parse(JSON.parse(json));
  } catch {
    throw new UploadError("The profile came back garbled. Try again.");
  }

  const seen = new Set<string>();
  const prompts = parsed.prompts
    .map((p) => ({ prompt: p.prompt, answer: clip(p.answer, 300) }))
    .filter((p) => p.answer && !seen.has(p.prompt) && seen.add(p.prompt))
    .slice(0, 5);
  if (prompts.length === 0) throw new UploadError("The tree had nothing to say. Try again.");

  return {
    name: clip(parsed.name, 40) || "Mystery Tree",
    age: Math.min(5000, Math.max(1, Math.round(parsed.age) || 1)),
    species: clip(parsed.species, 80),
    bio: clip(parsed.bio, 200),
    prompts,
  };
}
