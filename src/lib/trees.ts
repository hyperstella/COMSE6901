import type { SupabaseClient } from "@supabase/supabase-js";
import type { TreeProfile } from "./types";

export const BUCKET = "captioned-images";

/** A column that supabase/profile_editing.sql adds isn't there yet. */
export const missingColumn = (error: { code?: string } | null) => error?.code === "42703" || error?.code === "PGRST204";

export type NewTree = {
  uploaderId: string | null;
  uploaderName: string | null;
  storagePath: string;
  bytes: Buffer;
  mediaType: "image/jpeg" | "image/png" | "image/webp";
  width: number;
  height: number;
  /** Step 1 of the prompt chain: the vision model's field notes. */
  description: string;
  /** Step 2: the dating profile written from those notes, as the uploader published it. */
  profile: TreeProfile;
  /** Prompts whose answers the uploader changed from the AI's version. */
  edited?: string[];
  spot: string;
  mapX: number;
  mapY: number;
};

/**
 * Saves a tree once both LLM steps have succeeded: the photo to Storage, then
 * the tree and one caption per profile answer. Undoes what it wrote if any
 * step fails. Needs the service-role client, since users can't write these
 * tables themselves (see supabase/captions.sql).
 */
export async function saveTree(admin: SupabaseClient, t: NewTree): Promise<string> {
  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(t.storagePath, t.bytes, { contentType: t.mediaType });
  if (uploadError) throw new Error(uploadError.message);

  try {
    const imageUrl = admin.storage.from(BUCKET).getPublicUrl(t.storagePath).data.publicUrl;
    const { data: image, error: imageError } = await admin
      .from("images")
      .insert({
        uploader_id: t.uploaderId,
        uploader_name: t.uploaderName,
        storage_path: t.storagePath,
        image_url: imageUrl,
        width: t.width,
        height: t.height,
        description: t.description,
        tree_name: t.profile.name,
        tree_age: t.profile.age,
        species: t.profile.species,
        bio: t.profile.bio,
        spot: t.spot,
        map_x: t.mapX,
        map_y: t.mapY,
      })
      .select("id")
      .single();
    if (imageError) throw new Error(imageError.message);

    const rows = t.profile.prompts.map((p) => ({ image_id: image.id, prompt: p.prompt, content: p.answer }));
    const edited = new Set(t.edited ?? []);
    let { error: captionError } = await admin
      .from("captions")
      .insert(rows.map((r) => ({ ...r, edited_by_uploader: edited.has(r.prompt) })));
    if (missingColumn(captionError)) {
      // supabase/profile_editing.sql hasn't been run yet: save without the flag.
      ({ error: captionError } = await admin.from("captions").insert(rows));
    }
    if (captionError) {
      await admin.from("images").delete().eq("id", image.id);
      throw new Error(captionError.message);
    }
    return image.id as string;
  } catch (error) {
    await admin.storage.from(BUCKET).remove([t.storagePath]);
    throw error;
  }
}
