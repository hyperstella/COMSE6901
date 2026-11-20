"use client";

import { useState, useTransition } from "react";
import { setTreeArchived } from "@/lib/profile-actions";

/**
 * Archives a tree you added, or restores it. The server action revalidates
 * Your garden, so the tree moves between rows on its own.
 */
export default function ArchiveButton({ treeId, treeName, archived }: { treeId: string; treeName: string; archived: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const result = await setTreeArchived(treeId, !archived);
            if (!result.ok) setError(result.error);
          })
        }
        aria-label={`${archived ? "Restore" : "Archive"} ${treeName}`}
        title={
          archived
            ? "Put it back on the map, in Swipe and in the Grove"
            : "Take it off the map, Swipe and the Grove. You can restore it here anytime."
        }
        className="text-xs text-ink-2 underline decoration-dotted underline-offset-4 hover:text-ink disabled:opacity-50"
      >
        {pending ? (archived ? "Restoring…" : "Archiving…") : archived ? "Restore" : "Archive"}
      </button>
      {error && (
        <p role="alert" className="mt-1 text-xs text-like">
          {error}
        </p>
      )}
    </>
  );
}
