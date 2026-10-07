"use client";

import { useEffect, useState } from "react";
import { renderPortrait } from "./render";
import { PORTRAITS } from "./specs";

/** Renders every example tree, shows them, and saves them to scripts/seed-trees/. */
export default function Portraits() {
  const [shots, setShots] = useState<{ slug: string; url: string; blob: Blob }[]>([]);
  const [status, setStatus] = useState("Rendering…");

  useEffect(() => {
    let cancelled = false;
    const urls: string[] = [];
    (async () => {
      const out: { slug: string; url: string; blob: Blob }[] = [];
      for (const [i, spec] of PORTRAITS.entries()) {
        const blob = await renderPortrait(spec, i);
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        urls.push(url);
        out.push({ slug: spec.slug, url, blob });
        setShots([...out]);
      }
      setStatus(`Rendered ${out.length} portraits.`);
    })();
    return () => {
      cancelled = true;
      urls.forEach(URL.revokeObjectURL);
    };
  }, []);

  const save = async () => {
    setStatus("Saving…");
    for (const s of shots) {
      const form = new FormData();
      form.append("slug", s.slug);
      form.append("image", s.blob, `${s.slug}.jpg`);
      const res = await fetch("/api/dev/portraits", { method: "POST", body: form });
      if (!res.ok) return setStatus(`Saving ${s.slug} failed (${res.status}).`);
    }
    setStatus(`Saved ${shots.length} portraits to scripts/seed-trees/.`);
  };

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10">
      <h1 className="display text-5xl italic">Example tree portraits</h1>
      <p className="mt-2 text-ink-2">
        <span data-status>{status}</span>{" "}
        <button onClick={save} disabled={shots.length < PORTRAITS.length} className="btn btn-paper ml-2 px-3 py-1 text-sm">
          Save to scripts/seed-trees
        </button>
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {shots.map((s) => (
          <figure key={s.slug} className="card overflow-hidden p-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
            <img src={s.url} alt={s.slug} className="w-full rounded-xl" />
            <figcaption className="mt-1 text-xs text-ink-3">{s.slug}</figcaption>
          </figure>
        ))}
      </div>
    </main>
  );
}
