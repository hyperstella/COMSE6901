import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Logs every generation request (an upload's prompt chain, or a matchmaker
 * run) and every model call inside it, for the admin panel to read
 * (generation_requests and llm_responses in supabase/observability.sql).
 *
 * Best effort by design: nothing here throws, and until the tables exist
 * every call is a quiet no-op, so logging can never break an upload.
 */

export type RequestKind = "tree" | "compat";

export type ResponseLog = {
  stepId?: string | null;
  stepKind: string;
  provider: string;
  model: string;
  messages: unknown;
  response?: string | null;
  finishReason?: string | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  latencyMs?: number | null;
  status: "ok" | "error";
  error?: string | null;
};

export type Recorder = {
  start(
    kind: RequestKind,
    fields: { userId?: string | null; userEmail?: string | null; chainId?: string | null; spot?: string | null; metadata?: Record<string, unknown> },
  ): Promise<string | null>;
  response(requestId: string | null, log: ResponseLog): Promise<void>;
  finish(requestId: string | null, result: { status: "succeeded" | "failed"; error?: string | null; imageId?: string | null }): Promise<void>;
};

/** The tables simply aren't there yet: not worth a log line per upload. */
const missingTable = (error: { code?: string } | null) => error?.code === "42P01" || error?.code === "PGRST205";

export function createRecorder(admin: SupabaseClient): Recorder {
  const startedAt = new Map<string, number>();

  return {
    async start(kind, f) {
      try {
        const { data, error } = await admin
          .from("generation_requests")
          .insert({
            kind,
            user_id: f.userId ?? null,
            user_email: f.userEmail ?? null,
            chain_id: f.chainId ?? null,
            spot: f.spot ?? null,
            metadata: f.metadata ?? {},
          })
          .select("id")
          .single();
        if (error) {
          if (!missingTable(error)) console.error("generation_requests insert failed", error.message);
          return null;
        }
        startedAt.set(data.id, Date.now());
        return data.id as string;
      } catch (error) {
        console.error("generation_requests insert failed", error);
        return null;
      }
    },

    async response(requestId, r) {
      if (!requestId) return;
      try {
        const { error } = await admin.from("llm_responses").insert({
          request_id: requestId,
          step_id: r.stepId ?? null,
          step_kind: r.stepKind,
          provider: r.provider,
          model: r.model,
          messages: r.messages ?? [],
          response: r.response ?? null,
          finish_reason: r.finishReason ?? null,
          prompt_tokens: r.promptTokens ?? null,
          completion_tokens: r.completionTokens ?? null,
          latency_ms: r.latencyMs ?? null,
          status: r.status,
          error: r.error ?? null,
        });
        if (error && !missingTable(error)) console.error("llm_responses insert failed", error.message);
      } catch (error) {
        console.error("llm_responses insert failed", error);
      }
    },

    async finish(requestId, result) {
      if (!requestId) return;
      try {
        const t0 = startedAt.get(requestId);
        const { error } = await admin
          .from("generation_requests")
          .update({
            status: result.status,
            error: result.error ?? null,
            image_id: result.imageId ?? null,
            finished_at: new Date().toISOString(),
            duration_ms: t0 ? Date.now() - t0 : null,
          })
          .eq("id", requestId);
        if (error && !missingTable(error)) console.error("generation_requests update failed", error.message);
        startedAt.delete(requestId);
      } catch (error) {
        console.error("generation_requests update failed", error);
      }
    },
  };
}
