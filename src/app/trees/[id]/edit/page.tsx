import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import LiveProfileEditor from "@/components/LiveProfileEditor";
import TreePhoto from "@/components/TreePhoto";
import type { EditableProfile } from "@/lib/profile-options";
import { getUserAndProfile } from "@/lib/supabase/server";

export const metadata = { title: "Edit profile" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type TreeRow = {
  id: string;
  uploader_id: string | null;
  image_url: string;
  tree_name: string;
  tree_age: number;
  species: string | null;
  bio: string | null;
  captions: { id: string; prompt: string | null; content: string; upvotes: number; downvotes: number; created_at: string }[];
};

/** The uploader's editor for a live tree: lines stay editable until someone votes on them. */
export default async function EditTreePage({ params }: PageProps<"/trees/[id]/edit">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { supabase, user } = await getUserAndProfile();
  if (!user) redirect(`/login?next=/trees/${id}/edit`);

  const { data: tree } = await supabase
    .from("images")
    .select("id, uploader_id, image_url, tree_name, tree_age, species, bio, captions(id, prompt, content, upvotes, downvotes, created_at)")
    .eq("id", id)
    .maybeSingle<TreeRow>();
  if (!tree) notFound();
  if (tree.uploader_id !== user.id) redirect(`/trees/${id}`);

  const lines = [...tree.captions].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const initial: EditableProfile = {
    name: tree.tree_name,
    age: tree.tree_age,
    species: tree.species ?? "",
    bio: tree.bio ?? "",
    lines: lines.map((c) => {
      const votes = c.upvotes + c.downvotes;
      return {
        id: c.id,
        prompt: c.prompt ?? "A line from its profile",
        answer: c.content,
        original: c.content,
        locked: votes ? `Locked: ${votes} ${votes === 1 ? "person has" : "people have"} voted on this line, so it stays as they saw it.` : null,
      };
    }),
  };
  const open = initial.lines.filter((l) => !l.locked).length;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
      <Link href={`/trees/${id}`} className="text-sm text-ink-2 underline decoration-dotted underline-offset-4 hover:text-ink">
        ← Back to {tree.tree_name}
      </Link>
      <div className="mt-4 grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div>
          <TreePhoto src={tree.image_url} alt={`Photo of ${tree.tree_name}`} sizes="(min-width: 1024px) 380px, 100vw" className="photo aspect-[4/5] w-full" />
        </div>
        <div>
          <h1 className="display text-6xl italic">Edit {tree.tree_name}</h1>
          <p className="mt-2 text-ink-2">
            Change the name, age, species or bio any time.{" "}
            {open === initial.lines.length
              ? "Nobody has voted yet, so every line is still yours to change."
              : open
                ? `${open} of ${initial.lines.length} lines have no votes yet and can still change; the rest are locked.`
                : "Every line has votes now, so they're locked."}
          </p>
          <div className="mt-6">
            <LiveProfileEditor treeId={id} initial={initial} />
          </div>
        </div>
      </div>
    </main>
  );
}
