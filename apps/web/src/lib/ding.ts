/**
 * The "rest is over" ding, synthesised with Web Audio — no audio file to ship
 * or cache offline.
 *
 * iOS only lets an AudioContext make sound once it has been resumed inside a
 * user gesture, and it suspends it again whenever the app goes to the
 * background. The countdown ends on a timer, not a tap, so `unlockDing` has to
 * run on the taps that come before it (see `RestTimerProvider`).
 *
 * Like any web audio on iOS, the ding follows the ring/silent switch.
 */

let context: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (context) return context;
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  context = new Ctor();
  return context;
}

/** Call from a user gesture so a later, timer-driven `playDing` is audible. */
export function unlockDing(): void {
  const ctx = getContext();
  if (ctx && ctx.state !== "running") void ctx.resume().catch(() => {});
}

/** A short bell: a bright fundamental plus a softer overtone, decaying over ~1.5 s. */
export function playDing(): void {
  const ctx = getContext();
  if (!ctx) return;
  if (ctx.state !== "running") void ctx.resume().catch(() => {});

  const start = ctx.currentTime + 0.01;
  const length = 1.5;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.5, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  gain.connect(ctx.destination);

  for (const [frequency, level] of [
    [1318.5, 1], // E6
    [2637, 0.35], // its octave, for the metallic edge
  ] as const) {
    const partial = ctx.createGain();
    partial.gain.value = level;
    partial.connect(gain);

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = frequency;
    osc.connect(partial);
    osc.start(start);
    osc.stop(start + length);
  }
}
