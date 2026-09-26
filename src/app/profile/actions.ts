"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export type FormState = { error?: string; success?: string };

const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
const PHOTO_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

function readName(formData: FormData, field: string) {
  const value = String(formData.get(field) ?? "").trim();
  return value.slice(0, 100);
}

export async function updateName(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const first_name = readName(formData, "first_name");
  const last_name = readName(formData, "last_name");
  if (!first_name || !last_name) {
    return { error: "Please enter both your first and last name." };
  }

  // Upsert so the save works even if the trigger row is somehow missing.
  const { error } = await createAdminClient()
    .from("profiles")
    .upsert({
      id: user.id,
      email: user.email,
      first_name,
      last_name,
      updated_at: new Date().toISOString(),
    });
  if (error) return { error: error.message };

  revalidatePath("/", "layout");

  // Onboarding sends the user on to the gated page once they're done.
  if (formData.get("redirect_to") === "/dashboard") redirect("/dashboard");
  return { success: "Name saved." };
}

export async function uploadAvatar(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a photo to upload." };
  }
  const ext = PHOTO_TYPES[file.type];
  if (!ext) return { error: "Photo must be a JPEG, PNG, WebP or GIF." };
  if (file.size > MAX_PHOTO_BYTES) return { error: "Photo must be 4MB or smaller." };

  // The image bytes go to Supabase Storage; only the URL is stored in the
  // profiles table. The path is scoped to the authenticated user's id.
  const admin = createAdminClient();
  const path = `${user.id}/avatar-${Date.now()}.${ext}`;
  const { error: uploadError } = await admin.storage
    .from("avatars")
    .upload(path, file, { contentType: file.type, upsert: true });
  if (uploadError) return { error: uploadError.message };

  const {
    data: { publicUrl },
  } = admin.storage.from("avatars").getPublicUrl(path);

  const { data: existing } = await admin
    .from("profiles")
    .select("avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  const { error } = await admin
    .from("profiles")
    .upsert({
      id: user.id,
      email: user.email,
      avatar_url: publicUrl,
      updated_at: new Date().toISOString(),
    });
  if (error) return { error: error.message };

  // Remove the previous photo so old uploads don't pile up.
  const marker = "/storage/v1/object/public/avatars/";
  const oldPath = existing?.avatar_url?.split(marker)[1];
  if (oldPath && oldPath.startsWith(`${user.id}/`) && oldPath !== path) {
    await admin.storage.from("avatars").remove([oldPath]);
  }

  revalidatePath("/", "layout");
  return { success: "Photo updated." };
}
