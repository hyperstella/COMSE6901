"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { saveAbout, type AboutState } from "@/app/profile/actions";
import TreePhoto from "@/components/TreePhoto";
import type { DatingProfile } from "@/lib/matchmaking";

const MAX_VIBES = 3;

/** "About you": what the AI matchmaker reads to pair you with trees. */
export default function AboutForm({
  initial,
  vibes,
  places,
}: {
  initial: DatingProfile | null;
  vibes: readonly string[];
  places: string[];
}) {
  const [state, action, pending] = useActionState<AboutState, FormData>(saveAbout, {});
  const [about, setAbout] = useState(initial?.about ?? "");
  const [picked, setPicked] = useState<string[]>(initial?.vibes ?? []);

  const toggle = (v: string) =>
    setPicked((p) => (p.includes(v) ? p.filter((x) => x !== v) : p.length < MAX_VIBES ? [...p, v] : p));

  return (
    <form action={action} className="space-y-7">
      <label className="block">
        <span className="font-semibold">Describe yourself in a sentence or two</span>
        <textarea
          name="about"
          value={about}
          onChange={(e) => setAbout(e.target.value.slice(0, 280))}
          rows={3}
          placeholder="Philosophy major who naps under anything with shade. Will absolutely talk to squirrels."
          className="field mt-2 resize-none"
        />
        <span className="mt-1 block text-right text-xs tabular-nums text-ink-3">{about.length}/280</span>
      </label>

      <fieldset>
        <legend className="font-semibold">
          Pick your vibes <span className="font-normal text-ink-3">(up to {MAX_VIBES})</span>
        </legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {vibes.map((v) => {
            const on = picked.includes(v);
            const full = !on && picked.length >= MAX_VIBES;
            return (
              <label
                key={v}
                className={`cursor-pointer select-none rounded-full border px-3.5 py-1.5 text-sm transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${
                  on
                    ? "border-accent bg-accent text-accent-ink"
                    : full
                      ? "cursor-not-allowed border-line text-ink-3 opacity-60"
                      : "border-line bg-paper-2 text-ink-2 hover:border-ink/30 hover:text-ink"
                }`}
              >
                <input
                  type="checkbox"
                  name="vibes"
                  value={v}
                  checked={on}
                  disabled={full}
                  onChange={() => toggle(v)}
                  className="sr-only"
                />
                {v}
              </label>
            );
          })}
        </div>
      </fieldset>

      <label className="block">
        <span className="font-semibold">Where do you hang out on campus?</span>
        <input
          name="hangout"
          defaultValue={initial?.hangout ?? ""}
          maxLength={60}
          list="campus-places"
          placeholder="Butler Library"
          className="field mt-2"
        />
        <datalist id="campus-places">
          {places.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button disabled={pending} className="btn btn-like text-base">
          {pending ? "Asking the trees…" : "Find my matches"}
        </button>
        {pending && <span className="text-sm text-ink-2">The AI matchmaker is reading every tree&apos;s profile.</span>}
        {!pending && state.error && (
          <p role="alert" className="text-sm text-like">
            {state.error}
          </p>
        )}
      </div>

      {!pending && state.success && (
        <div role="status" className="well pop-in p-4">
          <p className="display text-3xl italic">{state.success}</p>
          {state.picks && state.picks.length > 0 && (
            <ul className="mt-4 space-y-2">
              {state.picks.map((t, i) => (
                <li key={t.id}>
                  <Link
                    href={`/trees/${t.id}`}
                    className="card pop-in flex items-center gap-3 p-2.5 pr-4 transition-transform hover:-translate-y-0.5"
                    style={{ "--delay": `${i * 0.1}s` } as React.CSSProperties}
                  >
                    <TreePhoto src={t.imageUrl} alt="" sizes="56px" cols={14} className="h-14 w-14 shrink-0 rounded-xl" />
                    <span className="min-w-0 flex-1">
                      <span className="display block text-2xl">{t.name}</span>
                      <span className="block text-sm text-ink-2">{t.reason}</span>
                    </span>
                    <span className="display shrink-0 text-3xl tabular-nums text-like">{t.score}%</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/swipe" className="btn btn-like">
              Start swiping
            </Link>
            <Link href="/dashboard" className="btn btn-paper">
              Your garden
            </Link>
          </div>
        </div>
      )}
    </form>
  );
}
