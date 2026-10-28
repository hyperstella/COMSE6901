import { getVercelOidcToken } from "@vercel/oidc";
import OpenAI from "openai";
import { z } from "zod";
import type { Example, ModelConfig, StepConfig, Term } from "./chain";
import type { Recorder } from "./observability";
import type { TreeProfile } from "./types";

/**
 * The two-step prompt chain behind "Add a tree":
 *   1. describeImage: a vision model looks at the photo and writes field notes.
 *   2. writeProfile: a text model reads only those notes and writes the tree's
 *      dating profile. Each profile answer is a caption people vote on.
 *
 * Both steps use the OpenAI-compatible Chat Completions API, which lets the same
 * code talk to a local Ollama server in development and, in production, to
 * Vercel AI Gateway (no API key: it authenticates with the deployment's OIDC
 * token) or Google's Gemini API. Pick one with LLM_PROVIDER (see README).
 *
 * The prompts, models and providers can also come from the database (a
 * StepConfig from lib/chain.ts, configured in the admin panel). Without one,
 * or with LLM_PROVIDER set, the constants and the env provider below are used.
 * Every model call can be logged through a Recorder (lib/observability.ts).
 */

type Provider = {
  /** The provider slug: ollama, gemini, gateway, or whatever the admin panel calls it. */
  name: string;
  client: OpenAI;
  visionModel: string;
  textModel: string;
  /** Tried once when the main model is overloaded (503) or rate limited. */
  fallbackModel?: string;
  /** Extra request fields only this provider understands. */
  extra: (step: "describe" | "write") => Record<string, unknown>;
  /** Ask for token usage on streams (OpenAI-compatible providers that support stream_options). */
  streamUsage?: boolean;
};

export class UploadError extends Error {}

/** Options every chain step accepts, on top of its positional arguments. */
export type CallOptions = {
  signal?: AbortSignal;
  /** The step's prompts, model and settings from the admin panel; the code's defaults otherwise. */
  step?: StepConfig;
  terms?: Term[];
  examples?: Example[];
  recorder?: Recorder;
  requestId?: string | null;
};

function getProvider(): Provider | null {
  const name = (
    process.env.LLM_PROVIDER ?? (process.env.GEMINI_API_KEY ? "gemini" : process.env.VERCEL ? "gateway" : "")
  ).toLowerCase();

  if (name === "gateway") {
    const model = process.env.AI_GATEWAY_MODEL ?? "google/gemini-3.8-flash";
    return {
      name,
      client: new OpenAI({
        // An AI Gateway key if one is set; otherwise the deployment's OIDC
        // token, fetched per request since it expires.
        apiKey: process.env.AI_GATEWAY_API_KEY ?? (() => getVercelOidcToken()),
        baseURL: "https://ai-gateway.vercel.sh/v1",
      }),
      visionModel: model,
      textModel: model,
      fallbackModel: process.env.AI_GATEWAY_FALLBACK_MODEL ?? "google/gemini-3.5-flash-lite",
      extra: (step) => ({ reasoning_effort: step === "describe" ? "low" : "medium" }),
      streamUsage: true,
    };
  }

  if (name === "gemini") {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return null;
    const model = process.env.GEMINI_MODEL ?? "gemini-3.8-flash";
    return {
      name,
      client: new OpenAI({ apiKey, baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/" }),
      visionModel: model,
      textModel: model,
      fallbackModel: process.env.GEMINI_FALLBACK_MODEL ?? "gemini-3.5-flash-lite",
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

/**
 * A provider built from the admin panel's llm_models / llm_providers rows.
 * Null when its API key isn't in the environment, so the env default is used.
 */
function providerFromModel(model: ModelConfig, fallback: ModelConfig | null): Provider | null {
  const p = model.provider;
  let apiKey: string | (() => Promise<string>);
  if (p.authKind === "oidc") {
    apiKey = process.env.AI_GATEWAY_API_KEY ?? (() => getVercelOidcToken());
  } else if (p.authKind === "api_key") {
    const key = p.apiKeyEnv ? process.env[p.apiKeyEnv] : undefined;
    if (!key) return null;
    apiKey = key;
  } else {
    apiKey = "none"; // required by the client, ignored by the server
  }

  const effort = (step: "describe" | "write") => {
    if (model.reasoningEffort && model.reasoningEffort !== "none") return model.reasoningEffort;
    if (p.slug === "gateway" || p.slug === "gemini") return step === "describe" ? "low" : "medium";
    return null;
  };

  return {
    name: p.slug,
    client: new OpenAI({ apiKey, baseURL: p.baseUrl }),
    visionModel: model.name,
    textModel: model.name,
    fallbackModel: fallback && fallback.provider.slug === p.slug ? fallback.name : undefined,
    extra: (step) => {
      const e = effort(step);
      return e ? { reasoning_effort: e } : {};
    },
    streamUsage: p.slug === "gateway",
  };
}

export function llmLabel() {
  const p = getProvider();
  if (!p) return null;
  return p.visionModel === p.textModel ? p.visionModel : `${p.visionModel} → ${p.textModel}`;
}

/**
 * LLM_PROVIDER in the environment wins (local development); otherwise the
 * step's model from the database; otherwise the env default.
 */
function provider(step?: StepConfig) {
  const fromDb = !process.env.LLM_PROVIDER && step?.model ? providerFromModel(step.model, step.fallbackModel) : null;
  const p = fromDb ?? getProvider();
  if (!p) throw new UploadError("No LLM provider is configured.");
  return p;
}

/** Runs a model call; if the provider is overloaded, tries the fallback model once. */
async function withFallback<T>(p: Provider, model: string, call: (model: string) => Promise<T>): Promise<T> {
  try {
    return await call(model);
  } catch (error) {
    const busy = error instanceof OpenAI.APIError && (error.status === 503 || error.status === 429);
    if (!busy || !p.fallbackModel || p.fallbackModel === model) throw error;
    return call(p.fallbackModel);
  }
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
  if (p.name === "gateway" && error instanceof OpenAI.APIError && [401, 402, 403].includes(error.status ?? 0)) {
    // Auth (OIDC) or credits: nothing the user can fix, so log the details for us.
    console.error("AI Gateway refused the request", error.status, error.message);
    throw new UploadError("Tree profiles are taking a break right now. Try again later.");
  }
  if (error instanceof OpenAI.RateLimitError || (error instanceof OpenAI.APIError && error.status === 503)) {
    throw new UploadError("The AI is getting a lot of requests. Try again in a minute.");
  }
  if (error instanceof OpenAI.NotFoundError && p.name === "ollama") {
    throw new UploadError(`Ollama doesn't have that model. Run \`ollama pull ${p.visionModel}\` and \`ollama pull ${p.textModel}\`.`);
  }
  throw error;
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

type Messages = OpenAI.Chat.Completions.ChatCompletionMessageParam[];

/** The messages as sent, with image bytes replaced by a marker. */
function sanitize(messages: Messages) {
  return messages.map((m) =>
    Array.isArray(m.content)
      ? { ...m, content: m.content.map((part) => (part.type === "image_url" ? { type: "image_url", image_url: "[image]" } : part)) }
      : m,
  );
}

const errorText = (error: unknown) =>
  error instanceof OpenAI.APIError ? `${error.status ?? ""} ${error.message}`.trim() : error instanceof Error ? error.message : String(error);

type Usage = { prompt_tokens?: number; completion_tokens?: number } | null | undefined;

/** Writes one llm_responses row, if this call is being recorded. */
function record(
  opts: CallOptions,
  log: {
    stepKind: string;
    provider: string;
    model: string;
    messages: Messages;
    startedAt: number;
    response?: string | null;
    finishReason?: string | null;
    usage?: Usage;
    error?: unknown;
  },
) {
  if (!opts.recorder || !opts.requestId) return Promise.resolve();
  return opts.recorder.response(opts.requestId, {
    stepId: opts.step?.id ?? null,
    stepKind: log.stepKind,
    provider: log.provider,
    model: log.model,
    messages: sanitize(log.messages),
    response: log.response ?? null,
    finishReason: log.finishReason ?? null,
    promptTokens: log.usage?.prompt_tokens ?? null,
    completionTokens: log.usage?.completion_tokens ?? null,
    latencyMs: Date.now() - log.startedAt,
    status: log.error === undefined ? "ok" : "error",
    error: log.error === undefined ? null : errorText(log.error),
  });
}

/** One non-streaming call, logged as its own row whether it succeeds or fails. */
async function complete(
  p: Provider,
  stepKind: string,
  model: string,
  params: Omit<OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming, "model">,
  opts: CallOptions,
) {
  const startedAt = Date.now();
  try {
    const completion = await p.client.chat.completions.create({ ...params, model }, { signal: opts.signal });
    const choice = completion.choices[0];
    await record(opts, {
      stepKind,
      provider: p.name,
      model,
      messages: params.messages,
      startedAt,
      response: choice?.message?.content,
      finishReason: choice?.finish_reason,
      usage: completion.usage,
    });
    return completion;
  } catch (error) {
    await record(opts, { stepKind, provider: p.name, model, messages: params.messages, startedAt, error });
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const DESCRIBE_SYSTEM = `You are a field botanist taking notes on one tree on Columbia University's campus. A comedy writer will turn your notes into the tree's dating profile without ever seeing the photo, so they depend on you for every detail that could be funny.

Write one paragraph of 80 to 140 words in plain prose, with no lists or headings. Cover the likely species and how sure you are; its size and a rough sense of its age; its shape and posture (leaning, lopsided, majestic, scraggly); bark, leaves, flowers or fruit, and what season it looks like; its condition; what is around it (buildings, benches, paths, people, squirrels, signs); the light and weather; and anything odd, charming or ironic. Describe what you can see rather than guessing, and do not identify real people by name. Do not make jokes yourself.

If there is no tree or large plant in the photo, reply with exactly NO_TREE and nothing else. If the photo is sexually explicit or shows graphic violence or gore, reply with exactly NOT_SUITABLE and nothing else.`;

const DESCRIBE_USER = "Take your field notes on this tree.";

const SENTINELS = ["NOT_SUITABLE", "NO_TREE"];
const HOLD = Math.max(...SENTINELS.map((s) => s.length)) + 4;

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
- prompts: exactly 5 answers, each to a different prompt from this list: {{prompts}}.

Each answer is a caption people will vote on, so make every one funny:
- Under 20 words. Short beats long.
- Anchor it in a specific detail from the notes or the tree's spot. An answer that could fit any tree is a miss.
- Tree-life humor is welcome (squirrels, leaf blowers, photosynthesis, roots, shade, students napping underneath), and so are campus references (finals in Butler, the Steps, the Core), but don't force one into every line.
- Keep it good-natured: tease the tree and the situation, never people's bodies, race, gender, age or other identity traits.
- No hashtags, no emoji, and no surrounding quotation marks.
- "Two truths and a lie" is three short claims separated by commas or periods, like "I've survived 80 winters, I love squirrels, I've never dropped a leaf on a student." Don't number them or say which one is the lie.

Reply with JSON only, shaped like {"name": "...", "age": 80, "species": "...", "bio": "...", "prompts": [{"prompt": "My most irrational fear", "answer": "..."}]}.`;

const PROFILE_USER = `<field_notes>\n{{notes}}\n</field_notes>\n<location>{{spot}}, Columbia University</location>\n\nWrite this tree's profile.`;

/** Fills {{notes}}, {{spot}} and {{prompts}} in a prompt template. */
function fill(template: string, vars: Record<string, string>) {
  const all: Record<string, string> = { prompts: PROFILE_PROMPTS.join("; "), ...vars };
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => (key in all ? all[key] : match));
}

/** The glossary and few-shot examples the admin panel adds to the writer's prompt. */
function writerExtras(terms: Term[] = [], examples: Example[] = []) {
  const parts: string[] = [];
  if (terms.length) {
    parts.push(
      "Campus glossary (use these when they fit, in the tree's voice):\n" +
        terms.map((t) => `- ${t.term}: ${t.definition}`).join("\n"),
    );
  }
  for (const ex of examples.slice(0, 2)) {
    parts.push(
      `Example of field notes and the profile written from them:\n<field_notes>\n${ex.notes}\n</field_notes>\n<profile>\n${JSON.stringify(ex.profile)}\n</profile>`,
    );
  }
  return parts.length ? `\n\n${parts.join("\n\n")}` : "";
}

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
  options: CallOptions = {},
): Promise<string> {
  const opts: CallOptions = { ...options, signal: options.signal ?? signal };
  const step = opts.step;
  const p = provider(step);
  const messages: Messages = [
    { role: "system", content: step?.systemPrompt ?? DESCRIBE_SYSTEM },
    {
      role: "user",
      content: [
        { type: "image_url", image_url: { url: `data:${image.mediaType};base64,${image.data}` } },
        { type: "text", text: fill(step?.userPrompt?.trim() || DESCRIBE_USER, {}) },
      ],
    },
  ];
  let text = "";
  let released = false;
  let model = p.visionModel;
  let usage: Usage;
  let finishReason: string | null = null;
  let startedAt = Date.now();

  try {
    const stream = await withFallback(p, p.visionModel, async (m) => {
      model = m;
      startedAt = Date.now();
      try {
        return await p.client.chat.completions.create(
          {
            model: m,
            stream: true,
            temperature: step?.temperature ?? 0.4,
            max_completion_tokens: step?.maxTokens ?? 2000,
            messages,
            ...(p.streamUsage ? { stream_options: { include_usage: true } } : {}),
            ...p.extra("describe"),
          },
          { signal: opts.signal },
        );
      } catch (error) {
        // The request itself failed (overloaded, refused, unreachable).
        await record(opts, { stepKind: "describe", provider: p.name, model: m, messages, startedAt, error });
        throw error;
      }
    });

    try {
      for await (const chunk of stream) {
        if (chunk.usage) usage = chunk.usage;
        const choice = chunk.choices[0];
        if (choice?.finish_reason) finishReason = choice.finish_reason;
        const delta = choice?.delta?.content;
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
      // The stream broke part-way: log what we got.
      await record(opts, { stepKind: "describe", provider: p.name, model, messages, startedAt, response: text, error });
      throw error;
    }
    await record(opts, { stepKind: "describe", provider: p.name, model, messages, startedAt, response: text, finishReason, usage });
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

const clip = (s: string, n: number) => s.trim().replace(/^["“”']+|["“”']+$/g, "").trim().slice(0, n);

/** Step 2: text -> a dating profile. The model sees only the notes, not the image. */
export async function writeProfile(
  description: string,
  spot: string,
  signal?: AbortSignal,
  options: CallOptions = {},
): Promise<TreeProfile> {
  const opts: CallOptions = { ...options, signal: options.signal ?? signal };
  const step = opts.step;
  const p = provider(step);
  const vars = { notes: description, spot };
  const messages: Messages = [
    { role: "system", content: fill(step?.systemPrompt ?? PROFILE_SYSTEM, vars) + writerExtras(opts.terms, opts.examples) },
    { role: "user", content: fill(step?.userPrompt?.trim() || PROFILE_USER, vars) },
  ];
  let content: string | null | undefined;

  try {
    const completion = await withFallback(p, p.textModel, (model) =>
      complete(
        p,
        "write",
        model,
        {
          temperature: step?.temperature ?? 0.9,
          max_completion_tokens: step?.maxTokens ?? 4000,
          response_format: {
            type: "json_schema",
            json_schema: { name: "tree_profile", schema: z.toJSONSchema(Profile) },
          },
          messages,
          ...p.extra("write"),
        },
        opts,
      ),
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

/** What a user tells the trees about themselves (the "About you" profile). */
export type Person = { firstName: string; about: string; vibes: string[]; hangout: string };

/** A tree as the matchmaker sees it: its AI-written profile, not the photo. */
export type TreeForMatching = {
  id: string;
  name: string;
  age: number;
  species: string | null;
  spot: string | null;
  bio: string | null;
  lines: { prompt: string | null; content: string }[];
};

const Compat = z.object({
  matches: z.array(z.object({ key: z.string(), score: z.number(), reason: z.string() })),
});

const COMPAT_SYSTEM = `You are the matchmaker for Treendr, a dating app where Columbia University students date the trees on campus. You get one person's dating profile and several trees' dating profiles. Rate how compatible the person is with each tree.

For every tree, give:
- score: 0 to 100. Use the whole range: a typical person has a couple of trees above 80, most in the middle, and a couple below 40. Base it on real overlap (shared haunts on campus, matching vibes and habits, complementary quirks), not on which tree is funniest.
- reason: one playful line under 18 words, addressed to the person as "you", naming the specific thing you two share or clash on. No emoji, no quotation marks.

Keep it good-natured; never comment on the person's looks or identity. Reply with JSON only, shaped like {"matches": [{"key": "t1", "score": 87, "reason": "..."}]}, with one entry per tree.`;

/** Scores one person against up to 20 trees per model call. */
export async function rateCompatibility(
  person: Person,
  trees: TreeForMatching[],
  signal?: AbortSignal,
  options: CallOptions = {},
) {
  const opts: CallOptions = { ...options, signal: options.signal ?? signal };
  const p = provider();
  const results = new Map<string, { score: number; reason: string }>();

  for (let i = 0; i < trees.length; i += 20) {
    const batch = trees.slice(i, i + 20);
    const keyed = new Map(batch.map((t, j) => [`t${j + 1}`, t]));
    const treeText = [...keyed]
      .map(
        ([key, t]) =>
          `<tree key="${key}">\n${t.name}, ${t.age}. ${t.species ?? "Unknown species"}, lives ${t.spot ?? "on campus"}.\n` +
          (t.bio ? `Bio: ${t.bio}\n` : "") +
          t.lines.map((l) => `${l.prompt ?? "Line"}: ${l.content}`).join("\n") +
          `\n</tree>`,
      )
      .join("\n");
    const personText =
      `<person>\nName: ${person.firstName || "Anonymous"}\n` +
      (person.about ? `About: ${person.about}\n` : "") +
      (person.vibes.length ? `Vibes: ${person.vibes.join(", ")}\n` : "") +
      (person.hangout ? `Hangs out at: ${person.hangout}\n` : "") +
      `</person>`;
    const messages: Messages = [
      { role: "system", content: COMPAT_SYSTEM },
      { role: "user", content: `${personText}\n\n${treeText}\n\nRate this person with each tree.` },
    ];

    let content: string | null | undefined;
    try {
      const completion = await withFallback(p, p.textModel, (model) =>
        complete(
          p,
          "compat",
          model,
          {
            temperature: 0.5,
            max_completion_tokens: 4000,
            response_format: { type: "json_schema", json_schema: { name: "compatibility", schema: z.toJSONSchema(Compat) } },
            messages,
            ...p.extra("describe"),
          },
          opts,
        ),
      );
      content = completion.choices[0]?.message?.content;
    } catch (error) {
      explain(error, p);
    }

    let parsed: z.infer<typeof Compat>;
    try {
      parsed = Compat.parse(JSON.parse((content ?? "").replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, "")));
    } catch {
      throw new UploadError("The matchmaker's notes came back garbled. Try again.");
    }
    for (const m of parsed.matches) {
      const tree = keyed.get(m.key);
      if (!tree || results.has(tree.id)) continue;
      results.set(tree.id, {
        score: Math.min(100, Math.max(0, Math.round(m.score) || 0)),
        reason: clip(m.reason, 200) || "You'd have plenty to talk about.",
      });
    }
  }
  return results;
}
