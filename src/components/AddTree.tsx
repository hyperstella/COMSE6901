"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import CampusPlan from "@/components/CampusPlan";
import Logo from "@/components/Logo";
import ProfileEditor from "@/components/ProfileEditor";
import TreePhoto from "@/components/TreePhoto";
import { describeSpot } from "@/lib/campus";
import { publishDraft, rewriteDraftLine } from "@/lib/profile-actions";
import { type DirectionId, type EditableProfile, HINT_MAX, profileProblem, TREE_VIBES, type VibeId } from "@/lib/profile-options";
import { errorSound, readySound } from "@/lib/sfx";
import type { TreeProfile, UploadEvent } from "@/lib/types";

type Phase = "pick" | "prepping" | "describing" | "writing" | "draft" | "publishing" | "done" | "error";

/** The AI's profile as a draft the uploader can edit. */
const toEditable = (p: TreeProfile): EditableProfile => ({
  name: p.name,
  age: p.age,
  species: p.species,
  bio: p.bio,
  lines: p.prompts.map((l) => ({ prompt: l.prompt, answer: l.answer, original: l.answer })),
});

const MAX_EDGE = 1568; // plenty for vision models, small enough to upload fast

/** Downscale in the browser so uploads stay small and fast. */
async function prepare(file: File) {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const longest = Math.max(bitmap.width, bitmap.height);
  const scale = Math.min(1, MAX_EDGE / longest);
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser can't process images.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.87));
  if (!blob) throw new Error("Couldn't read that image.");
  return { blob, width, height };
}

const WRITING = [
  "Reading the field notes…",
  "Picking a name…",
  "Guessing its age (rudely)…",
  "Workshopping its toxic trait…",
  "Choosing its best angle…",
];

export default function AddTree({ remaining: initialRemaining, limit, model }: { remaining: number; limit: number; model: string }) {
  const [phase, setPhase] = useState<Phase>("pick");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [pin, setPin] = useState<{ x: number; y: number } | null>(null);
  const [spot, setSpot] = useState("");
  const [notes, setNotes] = useState("");
  const [vibe, setVibe] = useState<VibeId | null>(null);
  const [hint, setHint] = useState("");
  const [draft, setDraft] = useState<EditableProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [treeId, setTreeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [remaining, setRemaining] = useState(initialRemaining);
  const [line, setLine] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  /** The shrunken photo the draft was written for; publishing sends these same bytes. */
  const blobRef = useRef<Blob | null>(null);

  const working = phase === "prepping" || phase === "describing" || phase === "writing" || phase === "publishing";
  const outOfTickets = remaining <= 0;

  useEffect(() => {
    if (phase !== "writing") return;
    const t = setInterval(() => setLine((i) => (i + 1) % WRITING.length), 1600);
    return () => clearInterval(t);
  }, [phase]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const choose = useCallback((f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setError("That's not a photo. Try a JPEG, PNG or WebP.");
      return;
    }
    setError(null);
    setFile(f);
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(f);
    });
  }, []);

  // Paste a photo from the clipboard anywhere on the page.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (phase !== "pick") return;
      const f = [...(e.clipboardData?.files ?? [])].find((x) => x.type.startsWith("image/"));
      if (f) choose(f);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [choose, phase]);

  const reset = () => {
    abortRef.current?.abort();
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview(null);
    setPin(null);
    setSpot("");
    setNotes("");
    setVibe(null);
    setHint("");
    setDraft(null);
    setToken(null);
    setPublishError(null);
    blobRef.current = null;
    setTreeId(null);
    setError(null);
    setPhase("pick");
    if (inputRef.current) inputRef.current.value = "";
  };

  const submit = async () => {
    if (!file || !pin || working) return;
    setError(null);
    setNotes("");
    setDraft(null);
    setToken(null);
    setPublishError(null);
    setPhase("prepping");
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const { blob, width, height } = await prepare(file);
      blobRef.current = blob;
      const form = new FormData();
      form.append("image", blob, "tree.jpg");
      form.append("width", String(width));
      form.append("height", String(height));
      form.append("map_x", pin.x.toFixed(4));
      form.append("map_y", pin.y.toFixed(4));
      form.append("spot", spot.trim());
      if (vibe) form.append("vibe", vibe);
      if (hint.trim()) form.append("hint", hint.trim());

      const res = await fetch("/api/upload", { method: "POST", body: form, signal: controller.signal });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Upload failed (${res.status}).`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finished = false;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const raw of lines) {
          if (!raw.trim()) continue;
          const event = JSON.parse(raw) as UploadEvent;
          if (event.type === "step") {
            setPhase(event.step === "describe" ? "describing" : "writing");
          } else if (event.type === "description") {
            setNotes((n) => n + event.delta);
          } else if (event.type === "draft") {
            finished = true;
            setDraft(toEditable(event.profile));
            setToken(event.token);
            setPhase("draft");
            readySound();
          } else if (event.type === "error") {
            throw new Error(event.message);
          }
        }
      }
      if (!finished) throw new Error("The connection dropped before the profile was written. Try again.");
    } catch (e) {
      if (controller.signal.aborted) return;
      errorSound();
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setPhase("error");
    }
  };

  const rewrite = async (i: number, direction: DirectionId) => {
    const line = draft?.lines[i];
    if (!token || !line) return { ok: false as const, error: "This draft is gone. Start over." };
    const res = await rewriteDraftLine({ token, prompt: line.prompt, current: line.answer, direction });
    if (res.ok) setToken(res.token);
    return res;
  };

  const publish = async () => {
    if (!draft || !token || !blobRef.current || phase === "publishing") return;
    const problem = profileProblem(draft);
    if (problem) {
      setPublishError(problem);
      return;
    }
    setPublishError(null);
    setPhase("publishing");
    const form = new FormData();
    form.append("token", token);
    form.append("image", blobRef.current, "tree.jpg");
    form.append(
      "profile",
      JSON.stringify({
        name: draft.name.trim(),
        age: draft.age,
        species: draft.species.trim(),
        bio: draft.bio.trim(),
        lines: draft.lines.map((l) => ({ prompt: l.prompt, answer: l.answer.trim() })),
      }),
    );
    try {
      const res = await publishDraft(form);
      if (!res.ok) throw new Error(res.error);
      setTreeId(res.imageId);
      setPhase("done");
      setRemaining((r) => Math.max(0, r - 1));
      readySound();
    } catch (e) {
      errorSound();
      setPublishError(e instanceof Error ? e.message : "Couldn't publish your tree. Try again.");
      setPhase("draft");
    }
  };

  const autoSpot = pin ? describeSpot(pin.x, pin.y) : null;

  // ------------------------------------------------------------ step 1: pick
  if (phase === "pick") {
    return (
      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <section>
          <h2 className="display text-3xl italic">1. Snap the tree</h2>
          {preview ? (
            <div className="mt-4">
              <TreePhoto src={preview} alt="Your tree" sizes="(min-width: 1024px) 400px, 100vw" toggle className="photo aspect-[4/3] w-full" />
              <p className="mt-2 text-xs text-ink-3">Flip to Pixel to see the sprite your tree gets on the campus map.</p>
              <button onClick={() => inputRef.current?.click()} className="btn btn-paper mt-4 text-sm">
                Choose a different photo
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                choose(e.dataTransfer.files[0]);
              }}
              disabled={outOfTickets}
              className={`well mt-4 flex aspect-[4/3] w-full flex-col items-center justify-center gap-3 border-2 border-dashed p-6 text-center transition-colors ${
                dragging ? "border-like bg-like/10" : "border-ink/15 hover:border-ink/30"
              } disabled:opacity-50`}
            >
              <Logo className="h-16 w-16" />
              <span className="display text-3xl italic">{outOfTickets ? "That's enough trees for today" : dragging ? "Drop it!" : "Drop a tree photo"}</span>
              <span className="text-sm text-ink-2">
                {outOfTickets ? "You can add more tomorrow." : "or click to choose, or paste one"}
              </span>
            </button>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => choose(e.target.files?.[0])}
          />
          <p className="mt-3 text-sm text-ink-3">
            {remaining} of {limit} trees left today · JPEG, PNG, WebP or iPhone photos
          </p>
        </section>

        <section>
          <h2 className="display text-3xl italic">2. Pin where it lives</h2>
          <p className="mt-1 text-sm text-ink-2">Click the map where the tree stands. Arrow keys nudge the pin.</p>
          <div className="card mt-4 overflow-hidden p-1.5">
            <CampusPlan pick={pin} onPick={setPin} className="overflow-hidden rounded-xl" />
          </div>
          <label className="mt-5 block text-sm text-ink-2">
            Nickname for the spot (optional)
            <input
              value={spot}
              onChange={(e) => setSpot(e.target.value.slice(0, 60))}
              placeholder={autoSpot ?? "by the Sundial"}
              className="field mt-1.5"
            />
          </label>

          <details className="group mt-4 rounded-2xl border border-line px-4 py-3">
            <summary className="cursor-pointer list-none text-sm [&::-webkit-details-marker]:hidden font-semibold text-ink-2 hover:text-ink">
              <span className="mr-1 inline-block transition-transform group-open:rotate-90">›</span> Give the AI a nudge (optional)
              {vibe && <span className="ml-2 font-normal text-ink-3">· {TREE_VIBES.find((v) => v.id === vibe)?.label}</span>}
            </summary>
            <p className="mt-3 text-xs text-ink-3">Pick a personality, or leave it to the AI. You can edit every line before it goes live.</p>
            <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Personality">
              {TREE_VIBES.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  aria-pressed={vibe === v.id}
                  title={v.guide}
                  onClick={() => setVibe(vibe === v.id ? null : v.id)}
                  // `!`: the global .chip rule would otherwise win over these colors.
                  className={`chip transition-colors ${vibe === v.id ? "border-ink! bg-ink! text-paper!" : "hover:text-ink"}`}
                >
                  {v.label}
                </button>
              ))}
            </div>
            <label className="mt-3 block text-xs text-ink-3">
              Anything the AI should know about this tree?
              <input
                value={hint}
                onChange={(e) => setHint(e.target.value.slice(0, HINT_MAX))}
                placeholder="Everyone naps under it during finals"
                className="field mt-1.5 text-sm"
              />
            </label>
          </details>

          {error && <p role="alert" className="shake mt-4 rounded-xl bg-like/15 p-3 text-sm text-ink">{error}</p>}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button onClick={submit} disabled={!file || !pin || outOfTickets} className="btn btn-like text-lg">
              Write its dating profile
            </button>
            <span className="text-sm text-ink-3">
              {!file ? "Add a photo first" : !pin ? "Then drop a pin on the map" : `Cooked by ${model}`}
            </span>
          </div>
        </section>
      </div>
    );
  }

  // ------------------------------------------------- step 2: watch the chain
  const step1 = phase === "describing" || phase === "prepping" ? "active" : notes ? "done" : "waiting";
  const step2 = phase === "writing" ? "active" : draft ? "done" : "waiting";
  const editing = draft && (phase === "draft" || phase === "publishing");

  return (
    <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <section>
        {preview && <TreePhoto src={preview} alt="Your tree" sizes="(min-width: 1024px) 400px, 100vw" toggle className="photo aspect-[4/3] w-full" />}
        {pin && (
          <div className="mt-6">
            <div className="card pointer-events-none overflow-hidden p-1.5">
              <CampusPlan pick={pin} className="overflow-hidden rounded-xl" />
            </div>
            <p className="mt-2 text-sm text-ink-2">Lives {spot.trim() || autoSpot}</p>
          </div>
        )}
      </section>

      <section className="space-y-6">
        <Step n={1} title="Field notes" tag="image → words" state={step1}>
          {notes ? (
            <p className={`notes mt-3 text-ink ${phase === "describing" ? "caret" : ""}`}>{notes}</p>
          ) : (
            <Waiting active={step1 === "active"} text={phase === "prepping" ? "Shrinking your photo…" : "A vision model is studying the tree…"} />
          )}
        </Step>

        <Step n={2} title="Dating profile" tag="words → jokes" state={step2}>
          <p className="mt-2 text-sm text-ink-3">
            {editing
              ? "Here's the AI's draft. Change anything you like, or have the AI redo a line. Nothing goes live until you publish."
              : "The writer only sees the notes above, never the photo."}
          </p>
          {editing ? (
            <div className="pop-in mt-4">
              <ProfileEditor
                value={draft}
                onChange={(update) => setDraft((d) => (d ? update(d) : d))}
                onRewrite={rewrite}
                canRemove
                disabled={phase === "publishing"}
              />
            </div>
          ) : draft ? (
            <div className="mt-4">
              <p className="display pop-in text-5xl italic">
                {draft.name}, {draft.age}
              </p>
              <p className="pop-in mt-1 text-ink-2" style={{ "--delay": "0.1s" } as React.CSSProperties}>
                {draft.species}
              </p>
              {draft.bio && (
                <p className="display pop-in mt-2 text-xl" style={{ "--delay": "0.2s" } as React.CSSProperties}>
                  “{draft.bio}”
                </p>
              )}
              <ul className="mt-4 space-y-3">
                {draft.lines.map((p, i) => (
                  <li key={p.prompt} className="card pop-in p-3" style={{ "--delay": `${0.3 + i * 0.15}s` } as React.CSSProperties}>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-3">{p.prompt}</p>
                    <p className="display mt-1 text-2xl leading-tight">{p.answer}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <Waiting active={step2 === "active"} text={step2 === "active" ? WRITING[line] : "Waiting for the notes"} />
          )}
        </Step>

        {phase === "error" && (
          <div role="alert" className="card shake p-4">
            <p className="display text-3xl italic text-like">Uh oh</p>
            <p className="mt-1">{error}</p>
            <div className="mt-4 flex gap-2">
              <button onClick={submit} className="btn">
                Try again
              </button>
              <button onClick={reset} className="btn btn-paper">
                Start over
              </button>
            </div>
          </div>
        )}

        {editing && (
          <div className="card sticky bottom-[calc(var(--tabbar)+0.75rem)] z-10 p-4 shadow-lg">
            {publishError && (
              <p role="alert" className="shake mb-3 rounded-xl bg-like/15 p-3 text-sm text-ink">
                {publishError}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={publish} disabled={phase === "publishing"} className="btn btn-like text-lg">
                {phase === "publishing" ? "Publishing…" : `Publish ${draft.name.trim() || "your tree"}`}
              </button>
              <button onClick={reset} disabled={phase === "publishing"} className="btn btn-paper">
                Start over
              </button>
            </div>
          </div>
        )}

        {phase === "done" && treeId && draft && (
          <div className="card pop-in p-5">
            <p className="display text-4xl italic text-like">{draft.name} is on Treendr!</p>
            <p className="mt-1 text-ink-2">
              Their profile is live. Be the first to swipe on their lines. You can still edit a line until someone votes on it.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={`/swipe?tree=${treeId}`} className="btn btn-like">
                Swipe on {draft.name}
              </Link>
              <Link href={`/trees/${treeId}`} className="btn btn-paper">
                See the profile
              </Link>
              <Link href={`/trees/${treeId}/edit`} className="btn btn-paper">
                Edit profile
              </Link>
              {remaining > 0 && (
                <button onClick={reset} className="btn btn-paper">
                  Add another tree
                </button>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function Step({
  n,
  title,
  tag,
  state,
  children,
}: {
  n: number;
  title: string;
  tag: string;
  state: "waiting" | "active" | "done";
  children: React.ReactNode;
}) {
  return (
    <div className={`card p-5 ${state === "waiting" ? "opacity-70" : ""}`}>
      <div className="flex items-center gap-3">
        <span className={`grid h-9 w-9 place-items-center rounded-full text-base ${state === "waiting" ? "bg-paper-2 text-ink-3" : state === "done" ? "bg-lawn text-paper" : "bg-ink text-paper"}`}>
          {state === "done" ? "✓" : n}
        </span>
        <h2 className="display flex-1 text-3xl italic">{title}</h2>
        <span className="chip">{tag}</span>
      </div>
      {children}
    </div>
  );
}

function Waiting({ active, text }: { active: boolean; text: string }) {
  return (
    <p className="mt-4 flex items-center gap-3 text-ink-2">
      <span className={`h-2.5 w-2.5 rounded-full ${active ? "bob bg-like" : "bg-ink-3/40"}`} />
      <span key={text} className={active ? "rise" : ""}>
        {text}
      </span>
    </p>
  );
}
