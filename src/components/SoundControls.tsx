"use client";

import { useSyncExternalStore } from "react";
import { isRadioOn, isSoundOn, setSoundOn, startRadio, stopRadio, subscribeSound } from "@/lib/sfx";

/** Sound effects on/off and the lofi radio. */
export default function SoundControls() {
  const sound = useSyncExternalStore(subscribeSound, isSoundOn, () => true);
  const radio = useSyncExternalStore(subscribeSound, isRadioOn, () => false);

  const toggleRadio = () => {
    if (radio) return stopRadio();
    if (!sound) setSoundOn(true);
    startRadio();
  };

  return (
    <div className="flex items-center gap-0.5">
      <button
        onClick={toggleRadio}
        aria-pressed={radio}
        title={radio ? "Stop the lofi radio" : "Play lofi beats"}
        className={`flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs transition-colors ${
          radio ? "bg-ink/8 text-ink" : "text-ink-2 hover:bg-ink/5 hover:text-ink"
        }`}
      >
        <span className="flex h-3 items-end gap-[2px]" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={`w-[3px] rounded-full bg-current ${radio ? "bob" : ""}`}
              style={{ height: `${[6, 12, 9][i]}px`, "--delay": `${i * 0.25}s` } as React.CSSProperties}
            />
          ))}
        </span>
        <span className="hidden md:inline">lofi</span>
      </button>
      <button
        onClick={() => setSoundOn(!sound)}
        aria-pressed={sound}
        title={sound ? "Mute sounds" : "Turn sounds on"}
        className="flex h-8 w-8 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-ink/5 hover:text-ink"
      >
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z" fill="currentColor" fillOpacity="0.15" />
          {sound ? (
            <>
              <path d="M15.5 9.2a4 4 0 0 1 0 5.6" />
              <path d="M18.2 6.8a7.4 7.4 0 0 1 0 10.4" />
            </>
          ) : (
            <path d="m16 9.5 5 5m0-5-5 5" />
          )}
        </svg>
        <span className="sr-only">{sound ? "Sound on" : "Sound off"}</span>
      </button>
    </div>
  );
}
