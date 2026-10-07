import type { SupabaseClient } from "@supabase/supabase-js";
import type { TreeProfile } from "./types";

export const BUCKET = "captioned-images";

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
  /** Step 2: the dating profile written from those notes. */
  profile: TreeProfile;
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

    const { error: captionError } = await admin
      .from("captions")
      .insert(t.profile.prompts.map((p) => ({ image_id: image.id, prompt: p.prompt, content: p.answer })));
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
