import { type NextRequest } from "next/server";
import { describeSpot } from "@/lib/campus";
import { describeImage, llmLabel, UploadError, writeProfile } from "@/lib/llm";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { saveTree } from "@/lib/trees";
import { DAILY_UPLOAD_LIMIT, type UploadEvent } from "@/lib/types";
import { uploadsInLastDay } from "@/lib/uploads";

const MAX_BYTES = 4 * 1024 * 1024;
const TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;

function fail(status: number, message: string) {
  return Response.json({ error: message }, { status });
}

/**
 * Runs the prompt chain for one tree photo and streams progress back as
 * newline-delimited JSON (see UploadEvent). The photo and its profile are
 * saved only after both LLM steps succeed.
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
  if ((await uploadsInLastDay(admin, user.id)) >= DAILY_UPLOAD_LIMIT) {
    return fail(429, `That's ${DAILY_UPLOAD_LIMIT} trees in 24 hours. Come back tomorrow.`);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name")
    .eq("id", user.id)
    .maybeSingle();

  const bytes = Buffer.from(await file.arrayBuffer());
  const mediaType = file.type as keyof typeof TYPES;
  const spot = spotInput || describeSpot(mapX, mapY);
  const encoder = new TextEncoder();

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
        );

        send({ type: "step", step: "write" });
        const tree = await writeProfile(description, spot, request.signal);
        send({ type: "profile", profile: tree });

        send({ type: "step", step: "save" });
        const imageId = await saveTree(admin, {
          uploaderId: user.id,
          uploaderName: profile?.first_name?.trim() || null,
          storagePath: `${user.id}/${crypto.randomUUID()}.${ext}`,
          bytes,
          mediaType,
          width,
          height,
          description,
          profile: tree,
          spot,
          mapX,
          mapY,
        });
        send({ type: "done", imageId });
      } catch (error) {
        if (!request.signal.aborted) {
          console.error("upload pipeline failed", error);
          send({
            type: "error",
            message:
              error instanceof UploadError
                ? error.message
                : "Something went wrong writing this tree's profile. Please try again.",
          });
        }
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
