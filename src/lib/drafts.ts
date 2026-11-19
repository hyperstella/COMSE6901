import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ModelConfig } from "./chain";
import type { TreeProfile } from "./types";

/**
 * A profile draft lives in the browser until the uploader publishes it, so
 * nothing half-finished ever reaches the database. The server hands the
 * browser a signed token with everything it produced (the field notes, the
 * AI's profile, a hash of the photo, where the tree is) and only trusts those
 * when the signature checks out. The uploader's own edits travel separately
 * and are validated on publish.
 */

export type DraftPayload = {
  v: 1;
  /** Who the draft belongs to. */
  uid: string;
  /** Names the photo in Storage, so publishing twice can't make two trees. */
  nonce: string;
  /** The generation_requests row for this draft, if logging is on. */
  requestId: string | null;
  notes: string;
  spot: string;
  mapX: number;
  mapY: number;
  width: number;
  height: number;
  mediaType: "image/jpeg" | "image/png" | "image/webp";
  /** sha256 of the photo bytes, hex. */
  photo: string;
  /** The AI's latest version of the profile (rewrites update it). */
  ai: TreeProfile;
  vibe: string | null;
  /** The writer step's model, so rewrites use the same one. */
  model: { model: ModelConfig | null; fallbackModel: ModelConfig | null; stepId: string | null } | null;
  /** Expiry, ms since epoch. */
  exp: number;
};

const DAY = 24 * 60 * 60 * 1000;

function key() {
  const secret = process.env.DRAFT_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("No secret to sign drafts with (set DRAFT_SECRET or SUPABASE_SERVICE_ROLE_KEY).");
  return createHash("sha256").update(`treendr-draft:${secret}`).digest();
}

export const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

export function signDraft(payload: Omit<DraftPayload, "v" | "exp"> & { exp?: number; v?: 1 }): string {
  const full: DraftPayload = { ...payload, v: 1, exp: payload.exp ?? Date.now() + DAY };
  const body = Buffer.from(JSON.stringify(full)).toString("base64url");
  const mac = createHmac("sha256", key()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

/** The draft, if the token is genuine, unexpired and belongs to this user. */
export function readDraft(token: unknown, uid: string): DraftPayload | null {
  if (typeof token !== "string" || token.length > 64_000) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = createHmac("sha256", key()).update(body).digest();
  const given = Buffer.from(mac, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as DraftPayload;
    if (payload.v !== 1 || payload.uid !== uid || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * How many drafts or rewrites this user asked for in the last 24 hours, from
 * the request log. Null when the log table isn't there, so callers skip the cap.
 */
export async function generationsInLastDay(admin: SupabaseClient, userId: string, action: "draft" | "rewrite") {
  const since = new Date(Date.now() - DAY).toISOString();
  const { count, error } = await admin
    .from("generation_requests")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("metadata->>action", action)
    .gte("started_at", since);
  return error ? null : (count ?? 0);
}
