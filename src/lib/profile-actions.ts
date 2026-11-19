"use server";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { loadChain, type StepConfig, type Term } from "./chain";
import { type DraftPayload, generationsInLastDay, readDraft, sha256, signDraft } from "./drafts";
import { PROFILE_PROMPTS, rewriteLine, type RewriteInput, UploadError } from "./llm";
import { createRecorder } from "./observability";
import { DAILY_REWRITE_LIMIT, directionById, LIMITS, vibeById } from "./profile-options";
import { createAdminClient, createClient } from "./supabase/server";
import { missingColumn, saveTree } from "./trees";
import { DAILY_UPLOAD_LIMIT, type TreeProfile } from "./types";
import { uploadsInLastDay } from "./uploads";

/**
 * Uploaders' control over their tree's profile: publishing the draft they
 * edited, asking the AI to redo one line, and editing a live profile. Lines
 * people have voted on stay locked, so votes always match the text people saw.
 */

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;

const Fields = z.object({
  name: z.string().trim().min(1).max(LIMITS.name),
  age: z.number().int().min(LIMITS.ageMin).max(LIMITS.ageMax),
  species: z.string().trim().max(LIMITS.species),
  bio: z.string().trim().max(LIMITS.bio),
});
const Answer = z.string().trim().min(1).max(LIMITS.answer);
const DraftEdits = Fields.extend({
  lines: z.array(z.object({ prompt: z.enum(PROFILE_PROMPTS), answer: Answer })).min(1).max(5),
});
const LiveEdits = Fields.extend({
  lines: z.array(z.object({ id: z.string().regex(UUID), answer: Answer })).max(20),
});

async function signedInUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

const oneLine = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, LIMITS.answer);

// ---------------------------------------------------------------- drafts

/** Saves the uploader's edited draft as a live tree. Publishing the same draft twice returns the same tree. */
export async function publishDraft(form: FormData): Promise<Result<{ imageId: string }>> {
  const { supabase, user } = await signedInUser();
  if (!user) return { ok: false, error: "Sign in to publish your tree." };
  const draft = readDraft(form.get("token"), user.id);
  if (!draft) return { ok: false, error: "This draft has expired. Start over to write a new one." };

  let edits: z.infer<typeof DraftEdits>;
  try {
    edits = DraftEdits.parse(JSON.parse(String(form.get("profile") ?? "")));
  } catch {
    return { ok: false, error: "Something in the profile is too long or empty. Check each field and try again." };
  }
  // Only the prompts the AI answered, each once.
  const aiAnswer = new Map(draft.ai.prompts.map((p) => [p.prompt, p.answer]));
  if (edits.lines.some((l) => !aiAnswer.has(l.prompt)) || new Set(edits.lines.map((l) => l.prompt)).size !== edits.lines.length) {
    return { ok: false, error: "That profile doesn't match the draft. Start over to write a new one." };
  }

  const file = form.get("image");
  if (!(file instanceof File)) return { ok: false, error: "The photo went missing. Start over." };
  const bytes = Buffer.from(await file.arrayBuffer());
  if (sha256(bytes) !== draft.photo) return { ok: false, error: "That isn't the photo this profile was written for." };

  const admin = createAdminClient();
  const storagePath = `${user.id}/${draft.nonce}.${EXT[draft.mediaType]}`;
  const [{ data: existing }, published, { data: me }] = await Promise.all([
    admin.from("images").select("id").eq("storage_path", storagePath).maybeSingle<{ id: string }>(),
    uploadsInLastDay(admin, user.id),
    supabase.from("profiles").select("first_name").eq("id", user.id).maybeSingle<{ first_name: string | null }>(),
  ]);
  if (existing) return { ok: true, imageId: existing.id };
  if (published >= DAILY_UPLOAD_LIMIT) {
    return { ok: false, error: `That's ${DAILY_UPLOAD_LIMIT} trees in 24 hours. Come back tomorrow to publish this one.` };
  }

  const profile: TreeProfile = {
    name: edits.name,
    age: edits.age,
    species: edits.species,
    bio: edits.bio,
    prompts: edits.lines.map((l) => ({ prompt: l.prompt, answer: l.answer })),
  };
  try {
    const imageId = await saveTree(admin, {
      uploaderId: user.id,
      uploaderName: me?.first_name?.trim() || null,
      storagePath,
      bytes,
      mediaType: draft.mediaType,
      width: draft.width,
      height: draft.height,
      description: draft.notes,
      profile,
      edited: edits.lines.filter((l) => l.answer !== aiAnswer.get(l.prompt)).map((l) => l.prompt),
      spot: draft.spot,
      mapX: draft.mapX,
      mapY: draft.mapY,
    });
    if (draft.requestId) {
      // Point the draft's log entry at the tree it became (best effort).
      await admin.from("generation_requests").update({ image_id: imageId }).eq("id", draft.requestId);
    }
    revalidatePath("/");
    revalidatePath("/trees");
    return { ok: true, imageId };
  } catch (error) {
    console.error("publishDraft failed", error);
    return { ok: false, error: "Couldn't publish your tree. Try again." };
  }
}

/** The writer step's model from the draft, so a rewrite uses the same model the profile came from. */
function draftStep(draft: DraftPayload): StepConfig | undefined {
  const m = draft.model;
  if (!m?.stepId) return undefined;
  return {
    id: m.stepId,
    kind: "write",
    systemPrompt: "",
    userPrompt: null,
    temperature: 1,
    maxTokens: 2000,
    model: m.model,
    fallbackModel: m.fallbackModel,
  };
}

/** A new AI take on one line of a draft. Returns the line and a token that knows about it. */
export async function rewriteDraftLine(input: {
  token: string;
  prompt: string;
  current: string;
  direction: string;
}): Promise<Result<{ answer: string; token: string }>> {
  const { user } = await signedInUser();
  if (!user) return { ok: false, error: "Sign in to rewrite lines." };
  const draft = readDraft(input.token, user.id);
  if (!draft) return { ok: false, error: "This draft has expired. Start over to write a new one." };
  if (!draft.ai.prompts.some((p) => p.prompt === input.prompt)) return { ok: false, error: "That line isn't on this draft." };

  const result = await runRewrite(createAdminClient(), user, {
    input: {
      notes: draft.notes,
      spot: draft.spot,
      profile: draft.ai,
      prompt: input.prompt,
      current: oneLine(input.current),
      direction: directionById(input.direction).guide,
      vibe: vibeById(draft.vibe),
    },
    step: draftStep(draft),
    metadata: { draftOf: draft.requestId },
  });
  if (!result.ok) return result;

  const ai = { ...draft.ai, prompts: draft.ai.prompts.map((p) => (p.prompt === input.prompt ? { ...p, answer: result.answer } : p)) };
  return { ok: true, answer: result.answer, token: signDraft({ ...draft, ai }) };
}

// ---------------------------------------------------------------- live trees

type LiveLine = {
  id: string;
  prompt: string | null;
  content: string;
  upvotes: number;
  downvotes: number;
  images: {
    id: string;
    uploader_id: string | null;
    description: string;
    spot: string | null;
    tree_name: string;
    tree_age: number;
    species: string | null;
    bio: string | null;
    captions: { prompt: string | null; content: string }[];
  };
};

/** A new AI take on a line of a live tree nobody has voted on yet. Not saved until the uploader saves. */
export async function rewriteLiveLine(input: { captionId: string; current: string; direction: string }): Promise<Result<{ answer: string }>> {
  const { user } = await signedInUser();
  if (!user) return { ok: false, error: "Sign in to rewrite lines." };
  if (!UUID.test(input.captionId)) return { ok: false, error: "That line doesn't exist." };

  const admin = createAdminClient();
  const [{ data: line }, chain] = await Promise.all([
    admin
      .from("captions")
      .select("id, prompt, content, upvotes, downvotes, images!inner(id, uploader_id, description, spot, tree_name, tree_age, species, bio, captions(prompt, content))")
      .eq("id", input.captionId)
      .maybeSingle<LiveLine>(),
    loadChain(admin),
  ]);
  if (!line || line.images.uploader_id !== user.id) return { ok: false, error: "You can only rewrite lines on trees you added." };
  if (line.upvotes || line.downvotes) return { ok: false, error: "People have voted on this line, so it's locked." };

  const t = line.images;
  return runRewrite(admin, user, {
    input: {
      notes: t.description,
      spot: t.spot ?? "campus",
      profile: {
        name: t.tree_name,
        age: t.tree_age,
        species: t.species ?? "",
        bio: t.bio ?? "",
        prompts: t.captions.map((c) => ({ prompt: c.prompt ?? "", answer: c.content })),
      },
      prompt: line.prompt ?? "A line from its profile",
      current: oneLine(input.current) || line.content,
      direction: directionById(input.direction).guide,
    },
    step: chain?.steps.find((s) => s.kind === "write"),
    terms: chain?.terms,
    metadata: { imageId: t.id, captionId: line.id },
  });
}

/**
 * Saves the uploader's edits to a live tree: name, age, species and bio any
 * time, lines only while nobody has voted on them. Returns the lines that
 * were locked (someone voted first).
 */
export async function saveLiveProfile(treeId: string, input: unknown): Promise<Result<{ locked: string[] }>> {
  const { user } = await signedInUser();
  if (!user) return { ok: false, error: "Sign in to edit your tree." };
  if (!UUID.test(treeId)) return { ok: false, error: "That tree doesn't exist." };
  const parsed = LiveEdits.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Something in the profile is too long or empty. Check each field and try again." };
  const edits = parsed.data;

  const admin = createAdminClient();
  const { data: tree } = await admin
    .from("images")
    .select("id, uploader_id, tree_name, tree_age, species, bio, captions(id, content, upvotes, downvotes)")
    .eq("id", treeId)
    .maybeSingle<{
      id: string;
      uploader_id: string | null;
      tree_name: string;
      tree_age: number;
      species: string | null;
      bio: string | null;
      captions: { id: string; content: string; upvotes: number; downvotes: number }[];
    }>();
  if (!tree || tree.uploader_id !== user.id) return { ok: false, error: "You can only edit trees you added." };

  const saved = new Map(tree.captions.map((c) => [c.id, c]));
  const changed = edits.lines.filter((l) => saved.has(l.id) && saved.get(l.id)!.content !== l.answer);
  const locked = changed.filter((l) => saved.get(l.id)!.upvotes || saved.get(l.id)!.downvotes).map((l) => l.id);
  const open = changed.filter((l) => !locked.includes(l.id));
  const fieldsChanged =
    edits.name !== tree.tree_name || edits.age !== tree.tree_age || edits.species !== (tree.species ?? "") || edits.bio !== (tree.bio ?? "");

  try {
    const results = await Promise.all([
      fieldsChanged
        ? admin
            .from("images")
            .update({ tree_name: edits.name, tree_age: edits.age, species: edits.species, bio: edits.bio })
            .eq("id", treeId)
            .then(({ error }) => {
              if (error) throw new Error(error.message);
              return null;
            })
        : null,
      ...open.map((l) => saveLine(admin, treeId, l)),
    ]);
    const lockedMeanwhile = results.filter((id): id is string => typeof id === "string");
    locked.push(...lockedMeanwhile);

    if (open.length > lockedMeanwhile.length || edits.bio !== (tree.bio ?? "")) {
      // The matchmaker read the old profile: drop its scores so they're redone on the next swipe.
      await admin.from("tree_compat").delete().eq("image_id", treeId);
    }
  } catch (error) {
    console.error("saveLiveProfile failed", error);
    return { ok: false, error: "Couldn't save your changes. Try again." };
  }

  revalidatePath(`/trees/${treeId}`);
  revalidatePath("/trees");
  revalidatePath("/");
  return { ok: true, locked };
}

/** Updates one line only if it still has no votes; returns its id if it was locked meanwhile. */
async function saveLine(admin: SupabaseClient, treeId: string, line: { id: string; answer: string }) {
  const update = (fields: Record<string, unknown>) =>
    admin.from("captions").update(fields).eq("id", line.id).eq("image_id", treeId).eq("upvotes", 0).eq("downvotes", 0).select("id");
  let { data, error } = await update({ content: line.answer, edited_by_uploader: true });
  if (missingColumn(error)) ({ data, error } = await update({ content: line.answer }));
  if (error) throw new Error(error.message);
  return data?.length ? null : line.id;
}

// ---------------------------------------------------------------- shared

/** Runs one logged rewrite under the daily cap. */
async function runRewrite(
  admin: SupabaseClient,
  user: User,
  job: { input: RewriteInput; step?: StepConfig; terms?: Term[]; metadata: Record<string, unknown> },
): Promise<Result<{ answer: string }>> {
  const recorder = createRecorder(admin);
  const [used, requestId] = await Promise.all([
    generationsInLastDay(admin, user.id, "rewrite"),
    recorder.start("tree", {
      userId: user.id,
      userEmail: user.email ?? null,
      chainId: null,
      spot: job.input.spot,
      metadata: { action: "rewrite", prompt: job.input.prompt, direction: job.input.direction || null, ...job.metadata },
    }),
  ]);
  if (used !== null && used > DAILY_REWRITE_LIMIT) {
    await recorder.finish(requestId, { status: "failed", error: "Daily rewrite limit reached." });
    return { ok: false, error: `That's ${DAILY_REWRITE_LIMIT} rewrites today. Edit the line yourself, or come back tomorrow.` };
  }

  try {
    const answer = await rewriteLine(job.input, { step: job.step, terms: job.terms, recorder, requestId });
    await recorder.finish(requestId, { status: "succeeded" });
    return { ok: true, answer };
  } catch (error) {
    if (!(error instanceof UploadError)) console.error("rewrite failed", error);
    await recorder.finish(requestId, { status: "failed", error: error instanceof Error ? error.message : String(error) });
    return { ok: false, error: error instanceof UploadError ? error.message : "Couldn't rewrite that line. Try again." };
  }
}
