"use client";

/**
 * Soft sound effects (little marimba plucks) and a lofi radio, synthesized
 * with Web Audio (no audio files). Effects only play in response to a click
 * or key press.
 */

const STORAGE_KEY = "treendr-sound";
let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;
let fallback = true;
const listeners = new Set<() => void>();

export function isSoundOn() {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return fallback;
  }
}

export function setSoundOn(on: boolean) {
  fallback = on;
  try {
    localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
  } catch {
    // Storage blocked; the toggle still works for this page view.
  }
  if (!on) stopRadio();
  listeners.forEach((l) => l());
}

/** For useSyncExternalStore: re-render when sound or radio state changes. */
export function subscribeSound(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function audio() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** A soft pluck: a sine with a quiet octave above, quick attack and a gentle decay. */
function blip(ac: AudioContext, out: AudioNode, at: number, freq: number, dur: number, gain = 0.16) {
  for (const [mult, level] of [[1, 1], [2, 0.18], [4, 0.04]] as const) {
    const osc = ac.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq * mult, at);
    const env = ac.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(gain * level, at + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, at + Math.max(0.18, dur * 2.2));
    osc.connect(env).connect(out);
    osc.start(at);
    osc.stop(at + dur * 2.2 + 0.05);
  }
}

function play(notes: [number, number][], step: number, gain = 0.16) {
  if (!isSoundOn()) return;
  const ac = audio();
  if (!ac) return;
  const out = ac.createGain();
  out.gain.value = 0.7;
  const warm = ac.createBiquadFilter();
  warm.type = "lowpass";
  warm.frequency.value = 3200;
  out.connect(warm).connect(ac.destination);
  let t = ac.currentTime + 0.01;
  for (const [freq, len] of notes) {
    if (freq) blip(ac, out, t, freq, step * len, gain);
    t += step * len;
  }
}

const N = { C5: 523, D5: 587, E5: 659, G5: 784, A5: 880, C6: 1047, E6: 1319, G4: 392, E4: 330, C4: 262, A4: 440 };

/** Swipe right. */
export const likeSound = () => play([[N.E5, 1], [N.A5, 1.5]], 0.08);
/** Swipe left. */
export const passSound = () => play([[N.E4, 1], [N.C4, 1.5]], 0.08, 0.2);
/** It's a match. */
export const matchSound = () =>
  play([[N.C5, 1], [N.E5, 1], [N.G5, 1], [N.C6, 2], [0, 1], [N.A5, 1], [N.C6, 1], [N.E6, 3]], 0.09);
/** A new tree profile is ready. */
export const readySound = () => play([[N.G5, 1], [N.C6, 1], [N.E6, 2]], 0.1);
/** Something went wrong. */
export const errorSound = () => play([[N.A4 / 2, 2], [N.A4 / 2.4, 3]], 0.09, 0.22);

// ---------------------------------------------------------------- lofi radio

let radio: { stop: () => void } | null = null;

export function isRadioOn() {
  return radio !== null;
}

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

// ii-V-I-vi in F, voiced softly: Gm9, C13, Fmaj9, Dm9.
const CHORDS = [
  [55, 58, 62, 65, 69],
  [48, 58, 62, 64, 69],
  [53, 57, 60, 64, 67],
  [50, 57, 60, 64, 65],
];

/** A tiny lofi loop: mellow chords, a sleepy beat and vinyl crackle. */
export function startRadio() {
  if (radio) return;
  const ac = audio();
  if (!ac || !noise) return;

  const master = ac.createGain();
  master.gain.value = 0;
  master.gain.linearRampToValueAtTime(0.5, ac.currentTime + 1.5);
  const tone = ac.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 1400;
  tone.connect(master).connect(ac.destination);

  // Vinyl crackle: quiet band-passed noise plus random pops.
  const hiss = ac.createBufferSource();
  hiss.buffer = noise;
  hiss.loop = true;
  const hissFilter = ac.createBiquadFilter();
  hissFilter.type = "bandpass";
  hissFilter.frequency.value = 3000;
  const hissGain = ac.createGain();
  hissGain.gain.value = 0.015;
  hiss.connect(hissFilter).connect(hissGain).connect(master);
  hiss.start();

  const beat = 60 / 72; // 72 bpm
  let next = ac.currentTime + 0.1;
  let bar = 0;
  const timers: ReturnType<typeof setInterval>[] = [];

  const scheduleBar = (at: number, chord: number[]) => {
    // Chord: soft triangle/sine pads with a slow attack.
    for (const note of chord) {
      for (const [type, detune, level] of [["triangle", -6, 0.035], ["sine", 5, 0.045]] as const) {
        const osc = ac.createOscillator();
        osc.type = type;
        osc.frequency.value = midi(note);
        osc.detune.value = detune;
        const env = ac.createGain();
        env.gain.setValueAtTime(0.0001, at);
        env.gain.linearRampToValueAtTime(level, at + 0.25);
        env.gain.setTargetAtTime(0.0001, at + beat * 3.4, 0.4);
        osc.connect(env).connect(tone);
        osc.start(at);
        osc.stop(at + beat * 4 + 1);
      }
    }
    // Beat: kick on 1 and 3 (with a lazy swing), snare-ish noise on 2 and 4, hats on 8ths.
    for (let i = 0; i < 8; i++) {
      const t = at + i * (beat / 2) + (i % 2 ? beat * 0.08 : 0);
      if (i === 0 || i === 5) {
        const osc = ac.createOscillator();
        osc.frequency.setValueAtTime(110, t);
        osc.frequency.exponentialRampToValueAtTime(40, t + 0.18);
        const g = ac.createGain();
        g.gain.setValueAtTime(0.5, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
        osc.connect(g).connect(master);
        osc.start(t);
        osc.stop(t + 0.32);
      }
      const src = ac.createBufferSource();
      src.buffer = noise;
      const f = ac.createBiquadFilter();
      const g = ac.createGain();
      const snare = i === 2 || i === 6;
      f.type = snare ? "bandpass" : "highpass";
      f.frequency.value = snare ? 1800 : 7000;
      g.gain.setValueAtTime(snare ? 0.12 : 0.025, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (snare ? 0.18 : 0.05));
      src.connect(f).connect(g).connect(master);
      src.start(t, Math.random(), 0.25);
    }
    // A pop or two of dust on the record.
    for (let i = 0; i < 2; i++) {
      const t = at + Math.random() * beat * 4;
      const src = ac.createBufferSource();
      src.buffer = noise;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.06, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.01);
      src.connect(g).connect(master);
      src.start(t, Math.random(), 0.02);
    }
  };

  // Look-ahead scheduler: keep about one bar queued.
  const tick = () => {
    while (next < ac.currentTime + beat * 4) {
      scheduleBar(next, CHORDS[bar % CHORDS.length]);
      next += beat * 4;
      bar++;
    }
  };
  tick();
  timers.push(setInterval(tick, 500));

  radio = {
    stop: () => {
      timers.forEach(clearInterval);
      master.gain.cancelScheduledValues(ac.currentTime);
      master.gain.setValueAtTime(master.gain.value, ac.currentTime);
      master.gain.linearRampToValueAtTime(0, ac.currentTime + 0.6);
      setTimeout(() => {
        hiss.stop();
        master.disconnect();
      }, 700);
    },
  };
  listeners.forEach((l) => l());
}

export function stopRadio() {
  if (!radio) return;
  radio.stop();
  radio = null;
  listeners.forEach((l) => l());
}
