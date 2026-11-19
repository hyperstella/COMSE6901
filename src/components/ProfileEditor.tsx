"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { type DirectionId, type EditableLine, type EditableProfile, LIMITS, REWRITE_DIRECTIONS } from "@/lib/profile-options";

type RewriteResult = { ok: true; answer: string } | { ok: false; error: string };

/**
 * A tree's profile as editable fields. Every line can be typed over, or handed
 * back to the AI for another take; "Undo" returns to the AI's latest version
 * (or, on a live tree, the saved text). One rewrite runs at a time.
 */
export default function ProfileEditor({
  value,
  onChange,
  onRewrite,
  canRemove = false,
  disabled = false,
  undoLabel = "Undo my edit",
}: {
  value: EditableProfile;
  /** Takes an updater, so a rewrite that lands late never overwrites newer edits. */
  onChange: (update: (p: EditableProfile) => EditableProfile) => void;
  onRewrite?: (index: number, direction: DirectionId) => Promise<RewriteResult>;
  canRemove?: boolean;
  disabled?: boolean;
  undoLabel?: string;
}) {
  const [menu, setMenu] = useState<number | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [failure, setFailure] = useState<{ index: number; message: string } | null>(null);
  const [removed, setRemoved] = useState<EditableLine[]>([]);

  const set = (patch: Partial<EditableProfile>) => onChange((p) => ({ ...p, ...patch }));
  const setLine = (i: number, patch: Partial<EditableLine>) =>
    onChange((p) => ({ ...p, lines: p.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));

  const rewrite = async (i: number, direction: DirectionId) => {
    if (!onRewrite || busy !== null) return;
    setMenu(null);
    setFailure(null);
    setBusy(i);
    const prompt = value.lines[i].prompt;
    try {
      const res = await onRewrite(i, direction);
      if (res.ok) {
        // Match by prompt: the line may have moved if another was removed meanwhile.
        onChange((p) => ({ ...p, lines: p.lines.map((l) => (l.prompt === prompt ? { ...l, answer: res.answer, original: res.answer } : l)) }));
      } else {
        setFailure({ index: i, message: res.error });
      }
    } catch {
      setFailure({ index: i, message: "Couldn't reach the server. Try again." });
    } finally {
      setBusy(null);
    }
  };

  const remove = (i: number) => {
    setRemoved((r) => [...r, value.lines[i]]);
    onChange((p) => ({ ...p, lines: p.lines.filter((_, j) => j !== i) }));
  };

  const restore = (line: EditableLine) => {
    setRemoved((r) => r.filter((l) => l !== line));
    onChange((p) => ({ ...p, lines: [...p.lines, line] }));
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-[minmax(0,1fr)_6.5rem] gap-3">
        <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-ink-3">
          Name
          <input
            value={value.name}
            onChange={(e) => set({ name: e.target.value.slice(0, LIMITS.name) })}
            disabled={disabled}
            className="field mt-1 font-display! text-3xl! normal-case tracking-normal"
          />
        </label>
        <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-ink-3">
          Age
          <input
            type="number"
            inputMode="numeric"
            min={LIMITS.ageMin}
            max={LIMITS.ageMax}
            value={value.age}
            onChange={(e) => set({ age: e.target.value === "" ? "" : Math.round(Number(e.target.value)) })}
            disabled={disabled}
            className="field mt-1 font-display! text-3xl! tabular-nums"
          />
        </label>
      </div>
      <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-ink-3">
        Species
        <input
          value={value.species}
          onChange={(e) => set({ species: e.target.value.slice(0, LIMITS.species) })}
          disabled={disabled}
          className="field mt-1 text-base! normal-case tracking-normal"
        />
      </label>
      <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-ink-3">
        Bio
        <GrowingText
          value={value.bio}
          onChange={(bio) => set({ bio: bio.slice(0, LIMITS.bio) })}
          disabled={disabled}
          className="field mt-1 font-display! text-xl! normal-case tracking-normal"
        />
      </label>

      <ul className="space-y-3">
        {value.lines.map((l, i) => {
          const edited = !l.locked && l.answer !== l.original;
          const working = busy === i;
          return (
            <li key={l.prompt} className="card p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-3">{l.prompt}</p>
                {canRemove && value.lines.length > 1 && (
                  <button
                    type="button"
                    onClick={() => remove(i)}
                    disabled={disabled || busy !== null}
                    aria-label={`Remove the line for “${l.prompt}”`}
                    title="Remove this line"
                    className="-mr-1 -mt-1 rounded-full px-2 text-lg leading-none text-ink-3 hover:bg-ink/5 hover:text-ink disabled:opacity-40"
                  >
                    ×
                  </button>
                )}
              </div>

              {l.locked ? (
                <>
                  <p className="display mt-1 text-2xl leading-tight">{l.answer}</p>
                  <p className="mt-2 text-xs text-ink-3">{l.locked}</p>
                </>
              ) : (
                <>
                  <GrowingText
                    value={l.answer}
                    onChange={(answer) => setLine(i, { answer: answer.slice(0, LIMITS.answer) })}
                    disabled={disabled || working}
                    aria-label={`Answer to “${l.prompt}”`}
                    className={`display -mx-1.5 mt-1 w-[calc(100%+0.75rem)] resize-none rounded-lg border border-transparent bg-transparent px-1.5 py-0.5 text-2xl leading-tight outline-none transition-colors hover:border-line focus:border-accent focus:bg-[#fffaf0] ${working ? "animate-pulse opacity-50" : ""}`}
                  />
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
                    {onRewrite && (
                      <button
                        type="button"
                        onClick={() => setMenu(menu === i ? null : i)}
                        disabled={disabled || busy !== null}
                        aria-expanded={menu === i}
                        className="chip hover:text-ink disabled:opacity-50"
                      >
                        {working ? "Rewriting…" : "↻ Rewrite with AI"}
                      </button>
                    )}
                    {edited && (
                      <button
                        type="button"
                        onClick={() => setLine(i, { answer: l.original })}
                        disabled={disabled || working}
                        className="text-ink-2 underline decoration-dotted underline-offset-4 hover:text-ink"
                      >
                        {undoLabel}
                      </button>
                    )}
                    {l.answer.length > LIMITS.answer - 60 && (
                      <span className="ml-auto tabular-nums text-ink-3">
                        {l.answer.length}/{LIMITS.answer}
                      </span>
                    )}
                  </div>
                  {menu === i && (
                    <div className="rise mt-2 flex flex-wrap gap-1.5" role="group" aria-label="How should the AI rewrite it?">
                      {REWRITE_DIRECTIONS.map((d) => (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => void rewrite(i, d.id)}
                          className="chip bg-paper! hover:border-accent! hover:text-ink!"
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>
                  )}
                  {failure?.index === i && (
                    <p role="alert" className="mt-2 text-xs text-like">
                      {failure.message}
                    </p>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>

      {removed.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-3">
          <span>Removed:</span>
          {removed.map((l) => (
            <button key={l.prompt} type="button" onClick={() => restore(l)} disabled={disabled} className="chip hover:text-ink">
              + {l.prompt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** A textarea that grows with its text and keeps answers on one line. */
function GrowingText({
  value,
  onChange,
  className,
  disabled,
  ...rest
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight + 2}px`;
    };
    fit();
    // The display font may arrive after the first measure.
    void document.fonts?.ready.then(fit);
    // Refit when the width changes (rewrapping), not when fit() itself changes the height.
    let width = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth === width) return;
      width = el.clientWidth;
      fit();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value.replace(/\s*\n\s*/g, " "))}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.preventDefault();
      }}
      className={`block resize-none overflow-hidden ${className ?? ""}`}
      {...rest}
    />
  );
}
