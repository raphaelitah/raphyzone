import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Reviews a user's recent tracked sessions (difficulty ratings + weights used) and
// proposes calibration / weight adjustments as ProgressionRecommendation cards for
// the user to approve. Produces two kinds of proposals:
//   - pattern_baseline: nudge a movement pattern's calibration weight up/down
//   - per_exercise:     a specific exercise whose working weight diverges from its pattern
// Dedupes against existing pending recommendations so it is idempotent.
//
// Input: { workout_session_id? } — optional, used only as a trigger hint.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));

    const [profiles, sessions, exercises, existing] = await Promise.all([
      base44.asServiceRole.entities.AthleteProfile.filter({ user_id: user.id }),
      base44.asServiceRole.entities.ExerciseSession.filter({ user_id: user.id }, '-created_date', 60),
      base44.asServiceRole.entities.Exercise.list('-created_date', 3000),
      base44.asServiceRole.entities.ProgressionRecommendation.filter({ user_id: user.id }),
    ]);
    const profile = profiles[0];
    if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404 });

    const exByCode = {};
    exercises.forEach((e) => { if (e.exercise_code) exByCode[e.exercise_code] = e; });

    // Last recommendation date per exercise/pattern (any status). Sessions at or before
    // this date are stale and must not re-trigger the same recommendation; only sessions
    // logged AFTER the last recommendation count toward new signals.
    const lastRecDateByExercise = {};
    const lastRecDateByPattern = {};
    existing.forEach((r) => {
      const d = r.created_date ? new Date(r.created_date) : null;
      if (!d) return;
      if (r.adjustment_type === 'pattern_baseline' && r.pattern) {
        if (!lastRecDateByPattern[r.pattern] || d > lastRecDateByPattern[r.pattern]) lastRecDateByPattern[r.pattern] = d;
      } else if (r.exercise_id) {
        if (!lastRecDateByExercise[r.exercise_id] || d > lastRecDateByExercise[r.exercise_id]) lastRecDateByExercise[r.exercise_id] = d;
      }
    });

    // Group sessions by exercise and by pattern.
    const byExercise = {}; // exercise_id -> [{ max_weight, difficulty, exercise_name }]
    sessions.forEach((s) => {
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

    const byPattern = {}; // pattern -> [{ exercise_id, exercise_name, max_weight, difficulty }]
    Object.entries(byExercise).forEach(([exId, list]) => {
      const ex = exByCode[exId];
      const pattern = ex?.movement_pattern || null;
      if (!pattern) return;
      const pCutoff = lastRecDateByPattern[pattern];
      list.forEach((s) => {
        if (pCutoff && s.created_date && new Date(s.created_date) <= pCutoff) return;
        (byPattern[pattern] = byPattern[pattern] || []).push({ exercise_id: exId, exercise_name: s.exercise_name, max_weight: s.max_weight, difficulty: s.difficulty });
      });
    });

    const calibration = (profile.strength_calibration || []).filter((c) => c.weight_kg);
    const overrides = profile.exercise_weight_overrides || [];

    // Dedup keys: per-exercise by exercise_id, pattern by pattern.
    const pendingExerciseKeys = new Set(existing.filter((r) => r.adjustment_type !== 'pattern_baseline').map((r) => r.exercise_id));
    const pendingPatternKeys = new Set(existing.filter((r) => r.adjustment_type === 'pattern_baseline').map((r) => r.pattern));

    // Only consider exercises/patterns with enough signal (>= 2 sessions).
    const exerciseSignals = Object.entries(byExercise)
      .filter(([, list]) => list.length >= 2)
      .map(([exId, list]) => ({
        exercise_id: exId,
        exercise_name: list[0].exercise_name,
        pattern: exByCode[exId]?.movement_pattern || null,
        recent: list.slice(0, 5).map((s) => `${s.max_weight ?? '?'}kg/${s.difficulty}`),
      }))
      .filter((s) => !pendingExerciseKeys.has(s.exercise_id));

    const patternSignals = Object.entries(byPattern)
      .filter(([, list]) => list.length >= 3)
      .map(([pattern, list]) => ({
        pattern,
        recent: list.slice(0, 8).map((s) => `${s.exercise_name}:${s.max_weight ?? '?'}kg/${s.difficulty}`),
      }))
      .filter((s) => !pendingPatternKeys.has(s.pattern));

    if (!exerciseSignals.length && !patternSignals.length) {
      return Response.json({ created: 0 });
    }

    const prompt = `You are an expert strength coach reviewing an athlete's recent training feedback and proposing weight adjustments. All weights are in kg.

ATHLETE PROFILE:
- Goal: ${profile.goal}
- Program difficulty: ${profile.program_difficulty}

CURRENT STRENGTH CALIBRATION (pattern baselines, kg):
${calibration.map((c) => `- ${c.pattern}: ${c.exercise} @ ${c.weight_kg}kg (~${c.reps || 8} reps)`).join('\n') || '- none'}

CURRENT PER-EXERCISE OVERRIDES (kg):
${overrides.map((o) => `- ${o.exercise_id} (${o.exercise_name}): ${o.weight_kg}kg`).join('\n') || '- none'}

RECENT FEEDBACK BY EXERCISE:
${exerciseSignals.map((s) => `- ${s.exercise_id} | ${s.exercise_name} | pattern=${s.pattern || 'n/a'} | ${s.recent.join(', ')}`).join('\n') || '- none'}

RECENT FEEDBACK BY MOVEMENT PATTERN:
${patternSignals.map((s) => `- ${s.pattern}: ${s.recent.join(', ')}`).join('\n') || '- none'}

YOUR TASK — propose adjustments as two kinds of recommendations:
1. pattern_baseline: when a movement pattern's recent sessions are consistently "easy" (suggest raising the pattern baseline) or consistently "hard"/"failed" (suggest lowering it). Set pattern, new_weight_kg, reps (keep ~8 unless evidence shows otherwise), current_weight (current calibration weight for that pattern if known), exercise_name (a representative exercise for the card title), exercise_id (use the representative exercise's id).
2. per_exercise: when a specific exercise diverges from its pattern (e.g. progressing faster, or struggling while the pattern is fine). Set exercise_id, exercise_name, current_weight (last used), suggested_weight/new_weight_kg.

RULES:
- Only propose when there is clear, consistent evidence. Do not propose for a single outlier session.
- Easy (2+ recent easy at same weight) → suggest a modest increase (e.g. +2.5kg upper-body, +5kg lower-body). Hard/failed → suggest a modest decrease.
- Keep suggestions practical and safe. Confidence 0-100 based on consistency and sample size.
- Write a concise reason and evidence string grounded in the feedback data.
- Do not duplicate: only propose exercises/patterns listed above.

Return JSON { "recommendations": [{ "adjustment_type": "per_exercise"|"pattern_baseline", "exercise_id": string, "exercise_name": string, "pattern": string|null, "current_weight": number|null, "suggested_weight": number|null, "new_weight_kg": number|null, "reps": number|null, "reason": string, "evidence": string, "confidence": number }] }`;

    const res = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: 'object',
        properties: {
          recommendations: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                adjustment_type: { type: 'string', enum: ['per_exercise', 'pattern_baseline'] },
                exercise_id: { type: 'string' },
                exercise_name: { type: 'string' },
                pattern: { type: 'string' },
                current_weight: { type: 'number' },
                suggested_weight: { type: 'number' },
                new_weight_kg: { type: 'number' },
                reps: { type: 'number' },
                reason: { type: 'string' },
                evidence: { type: 'string' },
                confidence: { type: 'number' },
              },
              required: ['adjustment_type', 'exercise_id', 'reason'],
            },
          },
        },
        required: ['recommendations'],
      },
    });

    const toCreate = (res.recommendations || [])
      .filter((r) => r && r.exercise_id && r.adjustment_type)
      .filter((r) => r.adjustment_type === 'pattern_baseline'
        ? !pendingPatternKeys.has(r.pattern)
        : !pendingExerciseKeys.has(r.exercise_id))
      .map((r) => ({
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
      await base44.asServiceRole.entities.ProgressionRecommendation.bulkCreate(toCreate);
      created = toCreate.length;
    }
    return Response.json({ created });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}