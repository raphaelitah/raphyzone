// Short beeps for the workout interval timer, played via the Web Audio API
// rather than an <audio>/<video> element so they mix with whatever the user
// already has playing (music, a podcast) instead of interrupting it.
let audioCtx = null;

function getContext() {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!audioCtx) audioCtx = new AC();
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  return audioCtx;
}

// A single soft tone: sine wave with an exponential attack/decay envelope so
// it fades in and out smoothly instead of clicking, which is what made plain
// on/off gain ramps sound harsh/buzzy.
function tone(ctx, { freq, startAt, duration, volume }) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.02);
}

// Unlocks/creates the AudioContext — call this from a user-gesture handler
// (e.g. the Start button) since browsers block audio until then.
export function primeTimerAudio() {
  getContext();
}

// 3-2-1 countdown tick, before a phase (lead-in, work, or rest) ends.
export function playCountdownBeep() {
  const ctx = getContext();
  if (!ctx) return;
  tone(ctx, { freq: 740, startAt: ctx.currentTime, duration: 0.12, volume: 0.18 });
}

// Played the instant a new phase starts (end of lead-in, end of work, end of
// rest) — a soft two-note ascending chime so it reads as "go" without being
// a harsh alarm sound.
export function playGoBeep() {
  const ctx = getContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  tone(ctx, { freq: 660, startAt: now, duration: 0.14, volume: 0.2 });
  tone(ctx, { freq: 990, startAt: now + 0.1, duration: 0.22, volume: 0.22 });
}
