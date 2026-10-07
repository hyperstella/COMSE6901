import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/** Development tool: saves a rendered example-tree portrait into scripts/seed-trees/. */
export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") return new Response(null, { status: 404 });
  const form = await request.formData();
  const slug = String(form.get("slug") ?? "");
  const image = form.get("image");
  if (!/^[a-z0-9-]{1,60}$/.test(slug) || !(image instanceof File) || image.type !== "image/jpeg") {
    return Response.json({ error: "Bad portrait." }, { status: 400 });
  }
  const dir = path.join(process.cwd(), "scripts", "seed-trees");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${slug}.jpg`), Buffer.from(await image.arrayBuffer()));
  return Response.json({ ok: true });
}
