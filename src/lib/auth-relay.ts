/**
 * Google only accepts sign-ins from origins registered on the OAuth client, and
 * every Vercel deployment gets its own URL (comse-6901-<hash>-hyperstella...).
 * So on a deployment URL, sign-in takes a detour: Google posts the ID token to
 * the production /auth/callback (which is registered), and production posts
 * it straight on to the deployment's own /auth/callback, which signs in there.
 *
 *   deployment /auth/google  →  Google  →  production /auth/callback
 *     →  deployment /auth/callback (checks the state cookie set at the start)
 *
 * Production and localhost keep the normal Google button.
 */

/** The deployment's own preview URLs, and no one else's. */
const DEPLOYMENT_HOST = /^comse-6901-[a-z0-9-]+-hyperstella\.vercel\.app$/;

/** Holds `<state>.<nonce>` between /auth/google and the relayed callback. */
export const RELAY_COOKIE = "google_relay";

/** The production origin, where Google is allowed to send users back. Null off Vercel. */
export function productionOrigin() {
  if (!process.env.VERCEL) return null;
  return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL ?? "comse-6901.vercel.app"}`;
}

/** Whether `origin` is one of this project's deployment URLs (not production). */
export function isDeploymentOrigin(origin: string) {
  try {
    const url = new URL(origin);
    return url.protocol === "https:" && url.origin === origin && DEPLOYMENT_HOST.test(url.host);
  } catch {
    return false;
  }
}

/** Sign-in on this origin needs the detour through production. */
export function needsRelay(origin: string) {
  const prod = productionOrigin();
  return Boolean(prod) && origin !== prod && isDeploymentOrigin(origin);
}

export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Buffer.from(digest).toString("hex");
}

export function randomToken() {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString("hex");
}

/** Google's state parameter: our random state plus where to send the token. */
export function packState(state: string, origin: string) {
  return `${state}~${Buffer.from(origin).toString("base64url")}`;
}

export function unpackState(packed: string) {
  const [state, encoded] = packed.split("~");
  if (!state || !encoded) return null;
  return { state, origin: Buffer.from(encoded, "base64url").toString() };
}
