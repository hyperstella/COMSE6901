"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import ProfileEditor from "@/components/ProfileEditor";
import { rewriteLiveLine, saveLiveProfile } from "@/lib/profile-actions";
import { type DirectionId, type EditableProfile, profileProblem } from "@/lib/profile-options";

/** Edits a live tree's profile and saves it; lines with votes are shown locked. */
export default function LiveProfileEditor({ treeId, initial }: { treeId: string; initial: EditableProfile }) {
  const router = useRouter();
  /** What's in the database now. A line's "original" is always its saved text. */
  const [saved, setSaved] = useState(initial);
  const [profile, setProfile] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const changed =
    profile.name !== saved.name ||
    profile.age !== saved.age ||
    profile.species !== saved.species ||
    profile.bio !== saved.bio ||
    profile.lines.some((l) => l.answer !== l.original);

  const rewrite = async (i: number, direction: DirectionId) => {
    const line = profile.lines[i];
    if (!line?.id) return { ok: false as const, error: "That line doesn't exist." };
    return rewriteLiveLine({ captionId: line.id, current: line.answer, direction });
  };

  const save = async () => {
    const problem = profileProblem(profile);
    if (problem) {
      setMessage(problem);
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await saveLiveProfile(treeId, {
        name: profile.name.trim(),
        age: profile.age,
        species: profile.species.trim(),
        bio: profile.bio.trim(),
        lines: profile.lines.filter((l) => l.id && !l.locked).map((l) => ({ id: l.id, answer: l.answer.trim() })),
      });
      if (!res.ok) throw new Error(res.error);
      if (!res.locked.length) {
        router.push(`/trees/${treeId}`);
        return;
      }
      // Someone voted first: those lines keep their old text and lock; everything else saved.
      const now: EditableProfile = {
        ...profile,
        lines: profile.lines.map((l) =>
          l.id && res.locked.includes(l.id)
            ? { ...l, answer: l.original, locked: "Locked: someone voted on this line while you were editing." }
            : { ...l, answer: l.answer.trim(), original: l.answer.trim() },
        ),
      };
      setSaved(now);
      setProfile(now);
      setMessage("Someone voted on a line while you were editing, so that line kept its old text. Everything else is saved.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Couldn't save your changes. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <ProfileEditor
        value={profile}
        // A rewrite is only a suggestion until it's saved, so "original" stays the saved text.
        onChange={(update) =>
          setProfile((p) => {
            const next = update(p);
            return { ...next, lines: next.lines.map((l) => ({ ...l, original: saved.lines.find((s) => s.id === l.id)?.original ?? l.original })) };
          })
        }
        onRewrite={rewrite}
        disabled={saving}
        undoLabel="Back to the saved line"
      />
      <div className="card sticky bottom-[calc(var(--tabbar)+0.75rem)] z-10 mt-6 p-4 shadow-lg">
        {message && (
          <p role="alert" className="mb-3 rounded-xl bg-like/15 p-3 text-sm text-ink">
            {message}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={save} disabled={saving || !changed} className="btn btn-like text-lg">
            {saving ? "Saving…" : "Save changes"}
          </button>
          <button onClick={() => router.push(`/trees/${treeId}`)} disabled={saving} className="btn btn-paper">
            {changed ? "Cancel" : "Done"}
          </button>
        </div>
      </div>
    </>
  );
}
