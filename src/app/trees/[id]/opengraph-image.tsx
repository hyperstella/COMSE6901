import { ImageResponse } from "next/og";
import { punchLine } from "@/lib/deck";
import { getSupabaseClient } from "@/lib/supabase/public";

export const alt = "A tree's dating profile on Treendr";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The card people see when a tree's profile link is shared: photo, name and punch line. */
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabaseClient();
  const { data: tree } =
    supabase && UUID.test(id)
      ? await supabase
          .from("images")
          .select("tree_name, tree_age, species, spot, image_url, captions(id, prompt, content, upvotes, downvotes)")
          .eq("id", id)
          .maybeSingle()
      : { data: null };
  const line = tree ? punchLine(tree.captions) : undefined;

  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", background: "#f6f0e3", color: "#2f3b3a" }}>
        {tree && (
          <img src={tree.image_url} alt="" width={480} height={630} style={{ width: 480, height: 630, objectFit: "cover" }} />
        )}
        <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: "56px 60px", justifyContent: "space-between" }}>
          <div style={{ display: "flex", fontSize: 34, fontWeight: 700, color: "#1e4d46", letterSpacing: -1 }}>treendr</div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 76, fontWeight: 700, letterSpacing: -2, lineHeight: 1 }}>
              {tree ? `${tree.tree_name}, ${tree.tree_age}` : "Treendr"}
            </div>
            <div style={{ display: "flex", fontSize: 28, color: "#5a6664", marginTop: 12 }}>
              {tree ? [tree.species, tree.spot].filter(Boolean).join(" · ") : "Columbia's trees are looking for love"}
            </div>
            {line && (
              <div style={{ display: "flex", flexDirection: "column", marginTop: 40 }}>
                {line.prompt && (
                  <div style={{ display: "flex", fontSize: 22, letterSpacing: 3, textTransform: "uppercase", color: "#8a9391" }}>
                    {line.prompt}
                  </div>
                )}
                <div style={{ display: "flex", fontSize: line.content.length > 90 ? 34 : 42, lineHeight: 1.2, marginTop: 10 }}>
                  “{line.content}”
                </div>
              </div>
            )}
          </div>
          <div style={{ display: "flex", fontSize: 26, color: "#d9566d" }}>♥ Swipe on their profile</div>
        </div>
      </div>
    ),
    size,
  );
}
