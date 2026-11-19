import { type NextRequest } from "next/server";
import { describeSpot } from "@/lib/campus";
import { loadChain } from "@/lib/chain";
import { generationsInLastDay, sha256, signDraft } from "@/lib/drafts";
import { describeImage, llmLabel, UploadError, writeProfile } from "@/lib/llm";
import { createRecorder } from "@/lib/observability";
import { DAILY_DRAFT_LIMIT, HINT_MAX, vibeById } from "@/lib/profile-options";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { DAILY_UPLOAD_LIMIT, type UploadEvent } from "@/lib/types";
import { uploadsInLastDay } from "@/lib/uploads";

const MAX_BYTES = 4 * 1024 * 1024;
const TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;

function fail(status: number, message: string) {
  return Response.json({ error: message }, { status });
}

/**
 * Runs the prompt chain for one tree photo and streams progress back as
 * newline-delimited JSON (see UploadEvent). It ends with a draft: nothing is
 * saved until the uploader reviews the profile and publishes it
 * (publishDraft in lib/profile-actions.ts).
 */
export async function POST(request: NextRequest) {
  // Server Actions get an Origin check from Next.js; route handlers don't.
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return fail(403, "Cross-site upload refused.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail(401, "Sign in to add a tree.");

  if (!llmLabel()) return fail(503, "Tree profiles are offline: no LLM provider is configured.");

  const form = await request.formData().catch(() => null);
  const file = form?.get("image");
  const width = Number(form?.get("width"));
  const height = Number(form?.get("height"));
  const mapX = Number(form?.get("map_x"));
  const mapY = Number(form?.get("map_y"));
  const spotInput = String(form?.get("spot") ?? "").trim().slice(0, 60);
  const vibe = vibeById(String(form?.get("vibe") ?? ""));
  const hint = String(form?.get("hint") ?? "").trim().slice(0, HINT_MAX);

  if (!(file instanceof File) || file.size === 0) return fail(400, "Choose a photo of a tree.");
  const ext = TYPES[file.type as keyof typeof TYPES];
  if (!ext) return fail(415, "Photos must be JPEG, PNG or WebP.");
  if (file.size > MAX_BYTES) return fail(413, "Photos must be 4MB or smaller.");
  if (![width, height].every((n) => Number.isInteger(n) && n > 0 && n <= 10000)) {
    return fail(400, "Missing image dimensions.");
  }
  if (![mapX, mapY].every((n) => Number.isFinite(n) && n >= 0 && n <= 1)) {
    return fail(400, "Drop a pin on the map where the tree is.");
  }

  const admin = createAdminClient();
  // Both caps, and the chain this upload runs through (from the admin panel's
  // mix; the code's own prompts if none is configured), in one round trip.
  const [published, drafted, chain] = await Promise.all([
    uploadsInLastDay(admin, user.id),
    generationsInLastDay(admin, user.id, "draft"),
    loadChain(admin),
  ]);
  if (published >= DAILY_UPLOAD_LIMIT) {
    return fail(429, `That's ${DAILY_UPLOAD_LIMIT} trees in 24 hours. Come back tomorrow.`);
  }
  if (drafted !== null && drafted >= DAILY_DRAFT_LIMIT) {
    return fail(429, `The AI has written ${DAILY_DRAFT_LIMIT} profiles for you today. Come back tomorrow.`);
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const mediaType = file.type as keyof typeof TYPES;
  const spot = spotInput || describeSpot(mapX, mapY);
  const encoder = new TextEncoder();

  const recorder = createRecorder(admin);
  const requestId = await recorder.start("tree", {
    userId: user.id,
    userEmail: user.email ?? null,
    chainId: chain?.chain.id ?? null,
    spot,
    metadata: { action: "draft", width, height, mediaType, chain: chain?.chain.slug ?? null, vibe: vibe?.id ?? null, hint: hint || null },
  });
  const stepOf = (kind: "describe" | "write") => chain?.steps.find((s) => s.kind === kind);

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: UploadEvent) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));

      try {
        send({ type: "step", step: "describe" });
        const description = await describeImage(
          { data: bytes.toString("base64"), mediaType },
          (delta) => send({ type: "description", delta }),
          request.signal,
          { step: stepOf("describe"), recorder, requestId },
        );

        send({ type: "step", step: "write" });
        const writer = stepOf("write");
        const tree = await writeProfile(description, spot, request.signal, {
          step: writer,
          terms: chain?.terms,
          examples: chain?.examples,
          recorder,
          requestId,
          steer: { vibe, hint },
        });

        // A draft, not a tree: the uploader edits it and publishes it with this token.
        const token = signDraft({
          uid: user.id,
          nonce: crypto.randomUUID(),
          requestId,
          notes: description,
          spot,
          mapX,
          mapY,
          width,
          height,
          mediaType,
          photo: sha256(bytes),
          ai: tree,
          vibe: vibe?.id ?? null,
          model: writer ? { model: writer.model, fallbackModel: writer.fallbackModel, stepId: writer.id } : null,
        });
        send({ type: "draft", profile: tree, token });
        await recorder.finish(requestId, { status: "succeeded" });
      } catch (error) {
        const message =
          error instanceof UploadError
            ? error.message
            : "Something went wrong writing this tree's profile. Please try again.";
        if (!request.signal.aborted) {
          console.error("upload pipeline failed", error);
          send({ type: "error", message });
        }
        await recorder.finish(requestId, {
          status: "failed",
          error: request.signal.aborted ? "Cancelled: the user left before it finished." : error instanceof UploadError ? message : `${message} (${error instanceof Error ? error.message : String(error)})`,
        });
      } finally {
        try {
          controller.close();
        } catch {
          // The client already disconnected.
        }
      }
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
