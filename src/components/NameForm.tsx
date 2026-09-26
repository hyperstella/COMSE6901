"use client";

import { useActionState } from "react";
import { updateName, type FormState } from "@/app/profile/actions";

const inputClass =
  "mt-1 w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900 dark:border-gray-700 dark:focus:border-gray-100 dark:focus:ring-gray-100";

export default function NameForm({
  firstName,
  lastName,
  redirectTo,
  submitLabel = "Save",
}: {
  firstName: string;
  lastName: string;
  redirectTo?: string;
  submitLabel?: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    updateName,
    {},
  );

  return (
    <form action={action} className="space-y-4">
      {redirectTo && <input type="hidden" name="redirect_to" value={redirectTo} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">
          First name
          <input
            name="first_name"
            defaultValue={firstName}
            required
            maxLength={100}
            autoComplete="given-name"
            className={inputClass}
          />
        </label>
        <label className="block text-sm font-medium">
          Last name
          <input
            name="last_name"
            defaultValue={lastName}
            required
            maxLength={100}
            autoComplete="family-name"
            className={inputClass}
          />
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button
          disabled={pending}
          className="rounded-full bg-gray-900 px-5 py-2 text-sm text-white hover:bg-gray-700 disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-300"
        >
          {pending ? "Saving…" : submitLabel}
        </button>
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
        {state.success && <p className="text-sm text-green-600">{state.success}</p>}
      </div>
    </form>
  );
}
