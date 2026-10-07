"use client";

import { useActionState } from "react";
import { updateName, type FormState } from "@/app/profile/actions";

const inputClass = "field mt-1.5";

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
        <label className="block text-sm text-ink-2">
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
        <label className="block text-sm text-ink-2">
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
          className="btn"
        >
          {pending ? "Saving…" : submitLabel}
        </button>
        {state.error && <p className="text-sm text-like">{state.error}</p>}
        {state.success && <p className="text-sm text-accent-2">{state.success}</p>}
      </div>
    </form>
  );
}
