/**
 * Seeds Treendr with example trees, run through the same two-step prompt chain
 * as /api/upload: the vision model writes field notes on each portrait, then
 * the text model writes the dating profile from those notes alone.
 *
 *   npx tsx --env-file=.env.local scripts/seed-trees.ts [--replace]
 *
 * The portraits in scripts/seed-trees/ are rendered in the storybook style at
 * /dev/portraits (development only; see src/app/dev/portraits/specs.ts).
 * Uses LLM_PROVIDER from the environment (Ollama locally). Trees that are
 * already seeded are skipped; --replace deletes the seeded trees (only those:
 * no uploader, stored under seed/) and seeds them again. Seeded trees have no
 * uploader, so they don't count against anyone's daily limit.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { PORTRAITS, type PortraitSpec } from "../src/app/dev/portraits/specs";
import { describeSpot, toMap } from "../src/lib/campus";
import { describeImage, llmLabel, writeProfile } from "../src/lib/llm";
import { BUCKET, saveTree } from "../src/lib/trees";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see .env.local).");
const model = llmLabel();
if (!model) throw new Error("No LLM provider is configured; set LLM_PROVIDER (see README).");

const admin = createClient(url, key, { auth: { persistSession: false } });
const DIR = path.join(__dirname, "seed-trees");

async function main() {
  if (process.argv.includes("--replace")) await removeSeeded();
  console.log(`Seeding ${PORTRAITS.length} trees with ${model}\n`);
  for (const spec of PORTRAITS) await seed(spec);
}

/** Deletes previously seeded trees. Their profile lines and votes go with them (on delete cascade). */
async function removeSeeded() {
  const { data, error } = await admin.from("images").select("id, storage_path").is("uploader_id", null).like("storage_path", "seed/%");
  if (error) throw error;
  if (!data.length) return;
  const { error: deleteError } = await admin.from("images").delete().in("id", data.map((r) => r.id));
  if (deleteError) throw deleteError;
  await admin.storage.from(BUCKET).remove(data.map((r) => r.storage_path));
  console.log(`Removed ${data.length} seeded trees.\n`);
}

async function seed(spec: PortraitSpec) {
  const storagePath = `seed/${spec.slug}.jpg`;
  const { data: existing } = await admin.from("images").select("tree_name").eq("storage_path", storagePath).maybeSingle();
  if (existing) {
    console.log(`- ${spec.slug}: already seeded as ${existing.tree_name}`);
    return;
  }

  const bytes = await readFile(path.join(DIR, `${spec.slug}.jpg`));
  const { mapX, mapY } = toMap(spec.s, spec.e);
  const spot = describeSpot(mapX, mapY);
  const description = await describeImage({ data: bytes.toString("base64"), mediaType: "image/jpeg" }, () => {});
  const profile = await writeProfile(description, spot);
  await saveTree(admin, {
    uploaderId: null,
    uploaderName: "Treendr",
    storagePath,
    bytes,
    mediaType: "image/jpeg",
    width: 960,
    height: 720,
    description,
    profile,
    spot,
    mapX,
    mapY,
  });
  console.log(`+ ${profile.name}, ${profile.age} (${profile.species}), ${spot}`);
  for (const p of profile.prompts) console.log(`    ${p.prompt}: ${p.answer}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
