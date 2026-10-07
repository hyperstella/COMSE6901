import { redirect } from "next/navigation";
import AddTree from "@/components/AddTree";
import { llmLabel } from "@/lib/llm";
import { getUserAndProfile } from "@/lib/supabase/server";
import { DAILY_UPLOAD_LIMIT } from "@/lib/types";
import { uploadsInLastDay } from "@/lib/uploads";

export const metadata = { title: "Add a tree" };

export default async function UploadPage() {
  const model = llmLabel();
  const { supabase, user } = await getUserAndProfile();
  if (!user) redirect("/login?next=/upload");

  const used = await uploadsInLastDay(supabase, user.id);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">
      <h1 className="display italic text-7xl">Add a tree</h1>
      <p className="mt-2 max-w-2xl text-ink-2">
        Every tree deserves love. Snap one, pin it on the map, and AI writes its dating profile in
        two steps: a vision model takes field notes, then a second model writes the profile from
        those notes alone.
      </p>

      {model ? (
        <AddTree remaining={Math.max(0, DAILY_UPLOAD_LIMIT - used)} limit={DAILY_UPLOAD_LIMIT} model={model} />
      ) : (
        <p className="card mt-8 max-w-xl p-5">
          Tree profiles are offline: no LLM provider is configured. Set <code>LLM_PROVIDER</code> to{" "}
          <code>ollama</code>, or set <code>GEMINI_API_KEY</code>, and restart.
        </p>
      )}
    </main>
  );
}
