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
        className="block w-full text-sm file:mr-3 file:rounded-full file:border-0 file:bg-gray-100 file:px-4 file:py-2 file:text-sm hover:file:bg-gray-200 dark:file:bg-gray-800 dark:file:text-gray-200"
      />
      <div className="flex items-center gap-3">
        <button
          disabled={pending}
          className="rounded-full border border-gray-300 px-5 py-2 text-sm hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-900"
        >
          {pending ? "Uploading…" : "Upload photo"}
        </button>
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
        {state.success && <p className="text-sm text-green-600">{state.success}</p>}
      </div>
      <p className="text-xs text-gray-500">JPEG, PNG, WebP or GIF, up to 4MB.</p>
    </form>
  );
}
