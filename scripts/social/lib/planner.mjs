// Content planner for the weekly Instagram run. Looks at what was posted before, what
// performed, and which app features have (not) been featured lately, then decides the
// week's 7 posts: kind, feature, angle, and why. The writer
// (write-week.mjs) only writes the copy around those decisions.
//
// Pure functions (no I/O) so the logic is unit-tested in planner.test.mjs.
import { pickAngle } from './angles.mjs';
import { FEATURES, pickFeature } from './features.mjs';

// Baseline week. slot -> weekday offset from Monday. Reels carry the reach, so they open and mid-week.
export const TEMPLATE = [
  { slot: 1, day: 0, kind: 'reel_workout' },
  { slot: 2, day: 1, kind: 'carousel_humour' },
  { slot: 3, day: 2, kind: 'reel_travel', variant: 'hotel_room' },
  { slot: 4, day: 3, kind: 'carousel_smarter' }, // feature spotlight
  { slot: 5, day: 4, kind: 'reel_workout' },
  { slot: 6, day: 5, kind: 'single_split' },
  { slot: 7, day: 6, kind: 'reel_travel', variant: 'jet_lag' },
];

// Slots whose kind the planner may turn into a second feature spotlight.
const SWAPPABLE = [2, 6];
// A feature counts as stale when it was not spotlighted in the history window.
const STALE_MIN_FOR_SECOND_SPOTLIGHT = 3;

// Saves count double and shares triple, per reach (same score the writer shows the model).
export const score = (r) => ((r.saves ?? 0) * 2 + (r.shares ?? 0) * 3) / Math.max(r.reach ?? 1, 1);

// perfRows: [{ kind, reach, saves, shares }]. Returns { kind: avgScore } for kinds with >= 2 samples.
export function kindScores(perfRows) {
  const by = {};
  for (const r of perfRows || []) (by[r.kind] ||= []).push(score(r));
  return Object.fromEntries(Object.entries(by).filter(([, v]) => v.length >= 2).map(([k, v]) => [k, v.reduce((a, b) => a + b, 0) / v.length]));
}

// Feature ids seen in history (rows newest first), and which registry entries are stale.
export function featureCoverage(history, features = FEATURES) {
  const seen = (history || []).map((r) => r.script?.feature_id).filter(Boolean);
  return { recent: seen, stale: features.filter((f) => !seen.includes(f.id)).map((f) => f.id) };
}

// history: past posts, newest first: { kind, hook, script }.
// fixed:   this week's posts that must stay as they are (published/approved): { slot, kind, script }.
// perfRows: see kindScores. rng injectable for tests.
export function planWeek({ history = [], fixed = [], perfRows = [], rng = Math.random } = {}) {
  const fixedBySlot = new Map(fixed.map((p) => [p.slot, p]));
  const scores = kindScores(perfRows);
  const { recent: recentFeatures, stale } = featureCoverage(history);
  const notes = [];

  // 1. Kind mix. Start from the template; if many features have not been shown lately,
  //    turn the weakest-performing swappable slot into a second spotlight.
  const kinds = new Map(TEMPLATE.map((t) => [t.slot, t.kind]));
  const spotlightsFixed = fixed.filter((p) => p.kind === 'carousel_smarter').length;
  const spotlightsPlanned = TEMPLATE.filter((t) => t.kind === 'carousel_smarter' && !fixedBySlot.has(t.slot)).length;
  if (stale.length >= STALE_MIN_FOR_SECOND_SPOTLIGHT && spotlightsFixed + spotlightsPlanned < 2) {
    const candidates = SWAPPABLE.filter((s) => !fixedBySlot.has(s));
    if (candidates.length) {
      const weakest = [...candidates].sort((a, b) => (scores[kinds.get(a)] ?? 0) - (scores[kinds.get(b)] ?? 0))[0];
      notes.push(`slot ${weakest}: ${kinds.get(weakest)} -> carousel_smarter (second spotlight; ${stale.length} features not shown recently)`);
      kinds.set(weakest, 'carousel_smarter');
    }
  }

  // 2. Per slot: feature (spotlights only), angle. "Taken" starts from fixed posts so nothing repeats in the week.
  const takenAngles = new Set(fixed.map((p) => p.script?.angle_id).filter(Boolean));
  const takenFeatures = new Set(fixed.map((p) => p.script?.feature_id).filter(Boolean));
  const recentAngles = history.map((r) => r.script?.angle_id).filter(Boolean);

  const plans = [];
  for (const t of TEMPLATE) {
    if (fixedBySlot.has(t.slot)) continue;
    const kind = kinds.get(t.slot);
    const plan = { slot: t.slot, day: t.day, kind, ...(kind === t.kind && t.variant ? { variant: t.variant } : {}) };
    const reasons = [];
    if (kind === 'carousel_smarter') {
      // never-featured features first, then least-recently-used
      const pool = stale.filter((id) => !takenFeatures.has(id));
      const pickedId = pool.length ? pool[Math.floor(rng() * pool.length)] : null;
      const f = pickedId ? FEATURES.find((x) => x.id === pickedId) : pickFeature(recentFeatures, takenFeatures, rng);
      plan.featureId = f.id;
      takenFeatures.add(f.id);
      reasons.push(`feature "${f.name}" (${stale.includes(f.id) ? 'not shown recently' : 'least recently shown'})`);
    }
    const angle = pickAngle(plan, recentAngles, takenAngles, rng);
    if (angle) { plan.angleId = angle.id; takenAngles.add(angle.id); reasons.push(`angle ${angle.id}`); }
    plan.rationale = reasons.join('; ');
    plans.push(plan);
  }
  return { plans, notes, coverage: { stale, scores } };
}
