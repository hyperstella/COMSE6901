import { createAdminClient } from "./supabase/server";

/**
 * Who may create an account (allowed_signup_domains and whitelisted_emails,
 * managed in the admin panel). With no rows in either table, or before the
 * tables exist, anyone can sign up. Existing accounts always get in.
 */
export async function signupAllowed(email: string | null): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!email) return { ok: true };
  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { ok: true };
  }
  const lower = email.trim().toLowerCase();

  const { data: existing, error: profileError } = await admin
    .from("profiles")
    .select("id")
    .in("email", [email, lower])
    .limit(1);
  if (!profileError && existing?.length) return { ok: true };

  const [{ data: domainRows, error: domainError }, { data: emailRows, error: emailError }] = await Promise.all([
    admin.from("allowed_signup_domains").select("domain"),
    admin.from("whitelisted_emails").select("email"),
  ]);
  if (domainError || emailError) return { ok: true };

  const domains = (domainRows ?? []).map((r) => String(r.domain).toLowerCase());
  const emails = (emailRows ?? []).map((r) => String(r.email).toLowerCase());
  if (!domains.length && !emails.length) return { ok: true };

  const domain = lower.split("@")[1] ?? "";
  if (domains.includes(domain) || emails.includes(lower)) return { ok: true };
  return {
    ok: false,
    reason: domains.length
      ? `Sign-ups are limited to ${domains.map((d) => `@${d}`).join(", ")} addresses.`
      : "Sign-ups are invite-only right now.",
  };
}

/** The email claim of a Google ID token. No signature check here: Supabase verifies the token. */
export function tokenEmail(token: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"));
    return typeof payload.email === "string" ? payload.email : null;
  } catch {
    return null;
  }
}
