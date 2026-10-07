"use client";

import { useActionState } from "react";
import { uploadAvatar, type FormState } from "@/app/profile/actions";

export default function AvatarForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(
    uploadAvatar,
    {},
  );

  return (
    <form action={action} className="space-y-3">
      <input
        type="file"
        name="avatar"
        accept="image/jpeg,image/png,image/webp,image/gif"
        required
        className="block w-full text-sm text-ink-2 file:mr-3 file:border-0 file:bg-paper-2 file:px-3 file:py-1.5 file:font-[inherit] file:text-ink file:shadow-[0_0_0_2px_var(--ink)] hover:file:bg-paper"
      />
      <div className="flex items-center gap-3">
        <button
          disabled={pending}
          className="btn btn-paper text-sm"
        >
          {pending ? "Uploading…" : "Upload photo"}
        </button>
        {state.error && <p className="text-sm text-like">{state.error}</p>}
        {state.success && <p className="text-sm text-accent-2">{state.success}</p>}
      </div>
      <p className="text-xs text-ink-3">JPEG, PNG, WebP or GIF, up to 4MB.</p>
    </form>
  );
}
