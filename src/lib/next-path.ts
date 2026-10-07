/** Cookie holding the page to return to after Google sign-in. */
export const NEXT_COOKIE = "post_auth_next";

/** Accepts only same-site relative paths, to avoid open redirects. */
export function safeNextPath(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return null;
  }
  return value;
}
