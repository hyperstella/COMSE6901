import type { Profile } from "@/lib/supabase/server";

export default function Avatar({
  profile,
  size = 40,
}: {
  profile: Profile | null;
  size?: number;
}) {
  const initials =
    [profile?.first_name, profile?.last_name]
      .map((n) => n?.trim()?.[0] ?? "")
      .join("")
      .toUpperCase() || "?";

  if (profile?.avatar_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- Supabase Storage URL, no loader configured
      <img
        src={profile.avatar_url}
        alt="Profile photo"
        width={size}
        height={size}
        className="shrink-0 rounded-full object-cover ring-1 ring-line"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-accent font-semibold text-accent-ink"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initials}
    </span>
  );
}
