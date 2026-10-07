"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import Heart from "@/components/Heart";
import Logo from "@/components/Logo";
import SignInPrompt from "@/components/SignInPrompt";
import TreePhoto from "@/components/TreePhoto";
import { likeSound, matchSound, passSound } from "@/lib/sfx";
import type { Card } from "@/lib/types";
import { castVote, fetchCards } from "@/lib/votes";

const THRESHOLD = 100;
const FLY_MS = 320;

type Burst = { id: number; dx: number; delay: number };
let uid = 0;

export default function SwipeDeck({ initialCards, signedIn }: { initialCards: Card[]; signedIn: boolean }) {
  const [queue, setQueue] = useState(initialCards);
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState<-1 | 0 | 1>(0);
  const [toast, setToast] = useState<{ text: string; tone: "like" | "pass" | "error" } | null>(null);
  const [match, setMatch] = useState<Card | null>(null);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [signInOpen, setSignInOpen] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const [pressed, setPressed] = useState<-1 | 1 | null>(null);

  const cardRef = useRef<HTMLElement>(null);
  const likeStamp = useRef<HTMLSpanElement>(null);
  const nopeStamp = useRef<HTMLSpanElement>(null);
  const drag = useRef<{ id: number; x0: number; y0: number; dx: number; dy: number } | null>(null);
  const likedByTree = useRef(new Map<string, number>());
  const matched = useRef(new Set<string>());
  const loadingMore = useRef(false);

  const card = queue[index] as Card | undefined;
  const next = queue[index + 1] as Card | undefined;

  useEffect(() => {
    if (exhausted || loadingMore.current || queue.length - index > 5) return;
    loadingMore.current = true;
    fetchCards(queue.map((c) => c.caption_id))
      .then((more) => {
        if (more.length === 0) setExhausted(true);
        else setQueue((q) => [...q, ...more]);
      })
      .catch(() => setExhausted(true))
      .finally(() => {
        loadingMore.current = false;
      });
  }, [index, queue, exhausted]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const paint = (dx: number, dy: number, animate: boolean) => {
    const el = cardRef.current;
    if (!el) return;
    el.style.transition = animate ? `transform ${FLY_MS}ms cubic-bezier(.2,.8,.3,1)` : "none";
    el.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx / 16}deg)`;
    const like = Math.max(0, Math.min(1, dx / THRESHOLD));
    const nope = Math.max(0, Math.min(1, -dx / THRESHOLD));
    if (likeStamp.current) likeStamp.current.style.opacity = String(like);
    if (nopeStamp.current) nopeStamp.current.style.opacity = String(nope);
  };

  const advance = useCallback(() => {
    setIndex((i) => i + 1);
    setLeaving(0);
  }, []);

  const commit = useCallback(
    async (vote: 1 | -1, skip = false) => {
      if (!card || leaving) return;
      if (!signedIn && !skip) {
        paint(0, 0, true);
        setSignInOpen(true);
        return;
      }

      setLeaving(skip ? -1 : vote);
      const width = cardRef.current?.offsetWidth ?? 360;
      paint(skip ? 0 : vote * width * 1.6, skip ? 600 : (drag.current?.dy ?? 0) + 40, true);
      drag.current = null;
      setTimeout(advance, FLY_MS - 40);
      if (skip) return;

      if (vote === 1) {
        likeSound();
        const batch = Array.from({ length: 6 }, (_, i) => ({ id: ++uid, dx: (Math.random() - 0.5) * 160, delay: i * 0.05 }));
        setBursts((b) => [...b, ...batch]);
        setTimeout(() => setBursts((b) => b.filter((x) => !batch.includes(x))), 1500);
      } else {
        passSound();
      }

      const res = await castVote(card.caption_id, vote);
      if (!res.ok) {
        if (res.needsSignIn) setSignInOpen(true);
        else setToast({ text: res.error, tone: "error" });
        return;
      }
      const total = res.tally.upvotes + res.tally.downvotes;
      const pct = total ? Math.round((res.tally.upvotes / total) * 100) : 0;
      setToast({
        text:
          total <= 1
            ? `First ${vote === 1 ? "like" : "pass"} on this line!`
            : `${pct}% liked this line · ${total} votes`,
        tone: vote === 1 ? "like" : "pass",
      });

      if (vote === 1) {
        const count = (likedByTree.current.get(card.image_id) ?? 0) + 1;
        likedByTree.current.set(card.image_id, count);
        if (count === 2 && !matched.current.has(card.image_id)) {
          matched.current.add(card.image_id);
          setTimeout(() => {
            setMatch(card);
            matchSound();
          }, 350);
        }
      }
    },
    [card, leaving, signedIn, advance],
  );

  // Keyboard: right/L like, left/J pass, down/S skip.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || signInOpen || match) return;
      if ((e.target as HTMLElement).closest("input, textarea, select, [contenteditable]")) return;
      const key = e.key.toLowerCase();
      if (key === "arrowright" || key === "l") {
        setPressed(1);
        void commit(1);
      } else if (key === "arrowleft" || key === "j") {
        setPressed(-1);
        void commit(-1);
      } else if (key === "arrowdown" || key === "s") {
        void commit(-1, true);
      } else return;
      e.preventDefault();
    };
    const onUp = () => setPressed(null);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onUp);
    };
  }, [commit, signInOpen, match]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (leaving) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0 };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    d.dx = e.clientX - d.x0;
    d.dy = (e.clientY - d.y0) * 0.4;
    paint(d.dx, d.dy, false);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    if (Math.abs(d.dx) > THRESHOLD) void commit(d.dx > 0 ? 1 : -1);
    else {
      drag.current = null;
      paint(0, 0, true);
    }
  };

  const restart = async () => {
    const fresh = await fetchCards();
    if (fresh.length) {
      setQueue(fresh);
      setIndex(0);
      setExhausted(false);
    }
  };

  return (
    <div className="relative mx-auto w-full max-w-[400px]">
      <div className="relative h-[min(620px,72svh)] min-h-[460px]">
        {next && (
          <article className="card absolute inset-0 flex flex-col overflow-hidden opacity-80" style={{ transform: "translateY(14px) scale(0.95) rotate(-1.5deg)" }} aria-hidden>
            <TreePhoto src={next.image_url} alt="" sizes="400px" className="h-[56%] shrink-0" />
          </article>
        )}

        {card ? (
          <article
            key={card.caption_id}
            ref={cardRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            className="card pop-in absolute inset-0 flex cursor-grab touch-none select-none flex-col overflow-hidden active:cursor-grabbing"
            aria-label={`${card.tree_name}: ${card.prompt ?? ""} ${card.content}`}
          >
            <div className="relative h-[56%] shrink-0">
              <TreePhoto src={card.image_url} alt={`Photo of ${card.tree_name}`} sizes="400px" priority toggle className="h-full w-full" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-5 pb-3 pt-12">
                <p className="display text-[2.6rem] italic text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.45)]">
                  {card.tree_name}, {card.tree_age}
                </p>
                <p className="mt-1 truncate text-sm text-white/90">
                  {card.species}
                  {card.spot && ` · ${card.spot}`}
                </p>
              </div>
              <span
                ref={likeStamp}
                className="pointer-events-none absolute left-4 top-5 -rotate-12 rounded-xl border-[3px] border-like bg-paper/85 px-3 py-1 text-3xl font-bold tracking-[0.2em] text-like opacity-0"
              >
                LIKE
              </span>
              <span
                ref={nopeStamp}
                className="pointer-events-none absolute right-4 top-5 rotate-12 rounded-xl border-[3px] border-ink bg-paper/85 px-3 py-1 text-3xl font-bold tracking-[0.2em] text-ink opacity-0"
              >
                NOPE
              </span>
            </div>
            <div className="flex flex-1 flex-col justify-center px-5 py-4">
              {card.prompt && <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-3">{card.prompt}</p>}
              <p className="display mt-1.5 text-balance text-[1.9rem] leading-[1.08] text-ink">{card.content}</p>
              <Link
                href={`/trees/${card.image_id}`}
                onPointerDown={(e) => e.stopPropagation()}
                className="mt-3 self-start text-xs text-ink-3 underline decoration-dotted underline-offset-4 hover:text-ink"
              >
                See {card.tree_name}&apos;s full profile
              </Link>
            </div>
          </article>
        ) : (
          <div className="card absolute inset-0 flex flex-col items-center justify-center p-8 text-center">
            <Logo className="h-16 w-16" />
            <p className="display mt-4 text-4xl italic">{queue.length ? "You've seen every line" : "No trees yet"}</p>
            <p className="mt-3 text-ink-2">
              {queue.length
                ? signedIn
                  ? "You've swiped on every tree on campus. Add a new one, or see who's winning."
                  : "That's every tree for now. Sign in to swipe for real, or go around again."
                : "Be the first to put a tree on Treendr."}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <Link href="/upload" className="btn">
                Add a tree
              </Link>
              {queue.length > 0 && !signedIn && (
                <button onClick={restart} className="btn btn-paper">
                  Go again
                </button>
              )}
              {queue.length > 0 && (
                <Link href="/trees" className="btn btn-paper">
                  The Grove
                </Link>
              )}
            </div>
          </div>
        )}

        {bursts.map((b) => (
          <span
            key={b.id}
            className="float-heart pointer-events-none absolute bottom-24 left-1/2 z-20 h-6 w-7 text-like"
            style={{ "--dx": `${b.dx}px`, "--delay": `${b.delay}s`, "--rot": `${b.dx / 8}deg` } as React.CSSProperties}
          >
            <Heart className="h-full w-full drop-shadow" />
          </span>
        ))}

        {toast && (
          <div
            role="status"
            className={`pop-in absolute -top-4 left-1/2 z-30 -translate-x-1/2 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm shadow-lg ${
              toast.tone === "like" ? "bg-like text-like-ink" : toast.tone === "error" ? "bg-ink text-paper" : "bg-paper text-ink"
            }`}
          >
            {toast.text}
          </div>
        )}
      </div>

      {card && (
        <div className="mt-6 flex items-center justify-center gap-5">
          <button
            onClick={() => void commit(-1)}
            data-pressed={pressed === -1}
            className="btn btn-paper h-16 w-16 p-0 text-2xl"
            aria-label="Pass (left arrow)"
          >
            ✕
          </button>
          <button onClick={() => void commit(-1, true)} className="text-sm text-ink-3 underline decoration-dotted underline-offset-4 hover:text-ink">
            skip
          </button>
          <button
            onClick={() => void commit(1)}
            data-pressed={pressed === 1}
            className="btn btn-like h-16 w-16 p-0"
            aria-label="Like (right arrow)"
          >
            <Heart className="h-7 w-7" />
          </button>
        </div>
      )}
      <p className="mt-4 hidden text-center text-sm text-ink-3 sm:block">
        Drag the card, or use ← pass · → like · ↓ skip
        {!signedIn && " · sign in to vote"}
      </p>

      {match && <MatchModal card={match} onClose={() => setMatch(null)} />}
      <SignInPrompt open={signInOpen} onClose={() => setSignInOpen(false)} next="/swipe" />
    </div>
  );
}

function MatchModal({ card, onClose }: { card: Card; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="match-title"
      className="fixed inset-0 z-[60] grid place-items-center bg-ink/50 p-4 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="card pop-in relative w-full max-w-sm p-6 text-center">
        {Array.from({ length: 8 }, (_, i) => (
          <span
            key={i}
            className="float-heart pointer-events-none absolute left-1/2 top-1/3 h-5 w-6 text-like"
            style={{ "--dx": `${(i - 3.5) * 40}px`, "--delay": `${i * 0.08}s` } as React.CSSProperties}
          >
            <Heart className="h-full w-full" />
          </span>
        ))}
        <p id="match-title" className="display text-6xl italic text-like">
          It&apos;s a match!
        </p>
        <Image src={card.image_url} alt={`Photo of ${card.tree_name}`} width={160} height={160} sizes="160px" className="mx-auto mt-5 h-40 w-40 rounded-full object-cover ring-4 ring-paper shadow-lg" />
        <p className="mt-4 text-ink-2">
          You liked two of {card.tree_name}&apos;s lines. Good news: {card.tree_name} is into you too.
          (Trees are very easy to impress.)
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link href={`/trees/${card.image_id}`} className="btn btn-like">
            See {card.tree_name}
          </Link>
          <button onClick={onClose} className="btn btn-paper">
            Keep swiping
          </button>
        </div>
      </div>
    </div>
  );
}
