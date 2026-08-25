import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { getUserFromRequest } from '../_shared/auth.ts';
import { getServiceClient } from '../_shared/supabaseAdmin.ts';
import { corsHeaders } from '../_shared/cors.ts';

// Ported from base44/functions/learnFromSessionFeedback. Reviews a user's recent
// tracked sessions (difficulty ratings + weights used) and proposes calibration /
// weight adjustments as ProgressionRecommendation cards for the user to approve.
// Dedupes against existing pending recommendations so it is idempotent.
//
// Deterministic (no LLM call) — the original prompt already spelled out an exact
// threshold rule ("2+ recent easy at same weight → +2.5kg upper / +5kg lower body,
// hard/failed → decrease"), so this runs that rule directly instead of asking an
// LLM to re-derive it.
const UPPER_BODY_PATTERNS = new Set(['push', 'pull', 'horizontal_push', 'horizontal_pull', 'vertical_push', 'vertical_pull', 'shoulder', 'arms', 'chest', 'back']);

function isUpperBody(pattern: string | null): boolean {
  return !!pattern && UPPER_BODY_PATTERNS.has(pattern.toLowerCase());
}

// A signal's samples must skew consistently one way (not just a single outlier) to propose anything.
function proposeAdjustment(recent: { max_weight: number | null; difficulty: string }[]): { direction: 'up' | 'down'; confidence: number } | null {
  const easy = recent.filter((s) => s.difficulty === 'easy').length;
  const hardOrFailed = recent.filter((s) => s.difficulty === 'hard' || s.difficulty === 'failed').length;
  const total = recent.length;
  if (easy >= 2 && easy / total >= 0.6) return { direction: 'up', confidence: Math.min(60 + easy * 10, 95) };
  if (hardOrFailed >= 2 && hardOrFailed / total >= 0.6) return { direction: 'down', confidence: Math.min(60 + hardOrFailed * 10, 95) };
  return null;
}

function latestWeight(recent: { max_weight: number | null }[]): number | null {
  return recent.find((s) => typeof s.max_weight === 'number')?.max_weight ?? null;
}
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const user = await getUserFromRequest(req);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });

    await req.json().catch(() => ({}));

    const supabase = getServiceClient();
    const [{ data: profiles }, { data: sessions }, { data: exercises }, { data: existing }] = await Promise.all([
      supabase.from('athlete_profiles').select('*').eq('user_id', user.id),
      supabase.from('exercise_sessions').select('*').eq('user_id', user.id).order('created_date', { ascending: false }).limit(60),
      supabase.from('exercises').select('*').order('created_date', { ascending: false }).limit(3000),
      supabase.from('progression_recommendations').select('*').eq('user_id', user.id),
    ]);
    const profile = profiles?.[0];
    if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404, headers: corsHeaders });

    const exByCode: Record<string, any> = {};
    (exercises || []).forEach((e: any) => { if (e.exercise_code) exByCode[e.exercise_code] = e; });

    // Last recommendation date per exercise/pattern (any status). Sessions at or before
    // this date are stale and must not re-trigger the same recommendation; only sessions
    // logged AFTER the last recommendation count toward new signals.
    const lastRecDateByExercise: Record<string, Date> = {};
    const lastRecDateByPattern: Record<string, Date> = {};
    (existing || []).forEach((r: any) => {
      const d = r.created_date ? new Date(r.created_date) : null;
      if (!d) return;
      if (r.adjustment_type === 'pattern_baseline' && r.pattern) {
        if (!lastRecDateByPattern[r.pattern] || d > lastRecDateByPattern[r.pattern]) lastRecDateByPattern[r.pattern] = d;
      } else if (r.exercise_id) {
        if (!lastRecDateByExercise[r.exercise_id] || d > lastRecDateByExercise[r.exercise_id]) lastRecDateByExercise[r.exercise_id] = d;
      }
    });

    // Group sessions by exercise and by pattern.
    const byExercise: Record<string, any[]> = {};
    (sessions || []).forEach((s: any) => {
      if (!s.exercise_id) return;
      const cutoff = lastRecDateByExercise[s.exercise_id];
      if (cutoff && s.created_date && new Date(s.created_date) <= cutoff) return;
      (byExercise[s.exercise_id] = byExercise[s.exercise_id] || []).push({
        max_weight: s.max_weight,
        difficulty: s.difficulty,
        exercise_name: s.exercise_name,
        created_date: s.created_date,
      });
    });

    const byPattern: Record<string, any[]> = {};
    Object.entries(byExercise).forEach(([exId, list]) => {
      const ex = exByCode[exId];
      const pattern = ex?.movement_pattern || null;
      if (!pattern) return;
      const pCutoff = lastRecDateByPattern[pattern];
      list.forEach((s: any) => {
        if (pCutoff && s.created_date && new Date(s.created_date) <= pCutoff) return;
        (byPattern[pattern] = byPattern[pattern] || []).push({ exercise_id: exId, exercise_name: s.exercise_name, max_weight: s.max_weight, difficulty: s.difficulty });
      });
    });

    const calibration = (profile.strength_calibration || []).filter((c: any) => c.weight_kg);
    const overrides = profile.exercise_weight_overrides || [];

    // Dedup keys: per-exercise by exercise_id, pattern by pattern.
    const pendingExerciseKeys = new Set((existing || []).filter((r: any) => r.adjustment_type !== 'pattern_baseline').map((r: any) => r.exercise_id));
    const pendingPatternKeys = new Set((existing || []).filter((r: any) => r.adjustment_type === 'pattern_baseline').map((r: any) => r.pattern));

    // Only consider exercises/patterns with enough signal (>= 2 sessions).
    const exerciseSignals = Object.entries(byExercise)
      .filter(([, list]) => list.length >= 2)
      .map(([exId, list]) => ({
        exercise_id: exId,
        exercise_name: list[0].exercise_name,
        pattern: exByCode[exId]?.movement_pattern || null,
        recent: list.slice(0, 5),
      }))
      .filter((s) => !pendingExerciseKeys.has(s.exercise_id));

    const patternSignals = Object.entries(byPattern)
      .filter(([, list]) => list.length >= 3)
      .map(([pattern, list]) => ({
        pattern,
        recent: list.slice(0, 8),
      }))
      .filter((s) => !pendingPatternKeys.has(s.pattern));

    if (!exerciseSignals.length && !patternSignals.length) {
      return Response.json({ created: 0 }, { headers: corsHeaders });
    }

    const overrideByExercise: Record<string, any> = {};
    overrides.forEach((o: any) => { overrideByExercise[o.exercise_id] = o; });
    const calibrationByPattern: Record<string, any> = {};
    calibration.forEach((c: any) => { calibrationByPattern[c.pattern] = c; });

    const recommendations: any[] = [];

    for (const s of exerciseSignals) {
      const proposal = proposeAdjustment(s.recent);
      if (!proposal) continue;
      const current = overrideByExercise[s.exercise_id]?.weight_kg ?? latestWeight(s.recent);
      if (current == null) continue;
      const step = isUpperBody(s.pattern) ? 2.5 : 5;
      const suggested = proposal.direction === 'up' ? current + step : Math.max(current - step, 0);
      recommendations.push({
        adjustment_type: 'per_exercise',
        exercise_id: s.exercise_id,
        exercise_name: s.exercise_name,
        pattern: s.pattern,
        current_weight: current,
        suggested_weight: suggested,
        new_weight_kg: suggested,
        reps: null,
        reason: proposal.direction === 'up'
          ? `Recent sessions have felt easy at ${current}kg — time to progress.`
          : `Recent sessions have felt hard at ${current}kg — dialing it back.`,
        evidence: s.recent.map((r: any) => `${r.max_weight ?? '?'}kg/${r.difficulty}`).join(', '),
        confidence: proposal.confidence,
      });
    }

    for (const s of patternSignals) {
      const proposal = proposeAdjustment(s.recent);
      if (!proposal) continue;
      const cal = calibrationByPattern[s.pattern];
      const current = cal?.weight_kg ?? latestWeight(s.recent);
      if (current == null) continue;
      const step = isUpperBody(s.pattern) ? 2.5 : 5;
      const suggested = proposal.direction === 'up' ? current + step : Math.max(current - step, 0);
      const repRef = s.recent[0];
      recommendations.push({
        adjustment_type: 'pattern_baseline',
        exercise_id: repRef?.exercise_id || cal?.exercise || s.pattern,
        exercise_name: repRef?.exercise_name || cal?.exercise || s.pattern,
        pattern: s.pattern,
        current_weight: current,
        suggested_weight: suggested,
        new_weight_kg: suggested,
        reps: cal?.reps ?? 8,
        reason: proposal.direction === 'up'
          ? `${s.pattern} sessions have consistently felt easy — raising the baseline.`
          : `${s.pattern} sessions have consistently felt hard — lowering the baseline.`,
        evidence: s.recent.map((r: any) => `${r.exercise_name}:${r.max_weight ?? '?'}kg/${r.difficulty}`).join(', '),
        confidence: proposal.confidence,
      });
    }

    const res = { recommendations };

    const toCreate = (res.recommendations || [])
      .filter((r: any) => r && r.exercise_id && r.adjustment_type)
      .filter((r: any) => r.adjustment_type === 'pattern_baseline'
        ? !pendingPatternKeys.has(r.pattern)
        : !pendingExerciseKeys.has(r.exercise_id))
      .map((r: any) => ({
        user_id: user.id,
        exercise_id: r.exercise_id,
        exercise_name: r.exercise_name || '',
        current_weight: r.current_weight ?? null,
        suggested_weight: r.suggested_weight ?? r.new_weight_kg ?? null,
        reason: r.reason || '',
        evidence: r.evidence || '',
        confidence: typeof r.confidence === 'number' ? r.confidence : 70,
        status: 'pending',
        adjustment_type: r.adjustment_type,
        pattern: r.pattern || null,
        new_weight_kg: r.new_weight_kg ?? r.suggested_weight ?? null,
        reps: r.reps ?? null,
      }));

    let created = 0;
    if (toCreate.length) {
      await supabase.from('progression_recommendations').insert(toCreate);
      created = toCreate.length;
    }
    return Response.json({ created }, { headers: corsHeaders });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500, headers: corsHeaders });
  }
});
