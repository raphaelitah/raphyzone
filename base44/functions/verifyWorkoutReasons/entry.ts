import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Grounds AI-generated workout "reasons" in the actual chosen workout's data.
// Accepts { items: [{ workout_id, draft_reason }] } and returns { verified: [{ workout_id, reason }] }.
// One batched LLM call; falls back to the draft reason on any failure (never blocks plan/swap creation).
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const items = Array.isArray(body?.items) ? body.items : [];
    if (!items.length) return Response.json({ verified: [] });

    const ids = [...new Set(items.map((i) => i.workout_id).filter(Boolean))];
    const workouts = await base44.asServiceRole.entities.Workout.list('-created_date', Math.max(ids.length, 1));
    const workoutMap = new Map(workouts.filter((w) => ids.includes(w.id)).map((w) => [w.id, w]));

    const records = items
      .map((i) => {
        const wo = workoutMap.get(i.workout_id);
        if (!wo) return null;
        return {
          workout_id: i.workout_id,
          draft_reason: i.draft_reason || '',
          name: wo.name,
          exercises: (wo.exercises || []).map((e) => e.exercise_name).filter(Boolean),
          equipment: wo.equipment || [],
          format_label: wo.format_label || wo.workout_format || '',
          modality: wo.modality || '',
          est_duration_min: wo.est_duration_min || wo.duration_minutes || null,
          workout_category: wo.workout_category || '',
        };
      })
      .filter(Boolean);

    if (!records.length) {
      return Response.json({ verified: items.map((i) => ({ workout_id: i.workout_id, reason: i.draft_reason || '' })) });
    }

    const prompt = `You are a strict fact-checker for workout coaching notes. For each workout below you receive a DRAFT REASON (written by another coach) and the workout's ACTUAL DATA. Your job: produce a reason that is fully accurate and uses ONLY labels that exactly match the workout's actual data.

RULES:
- NEVER invent equipment, exercises, durations, formats, or modalities that are not in the actual data.
- If the draft mentions equipment the workout does not use, remove or correct it.
- EQUIPMENT LABELS MUST MATCH EXACTLY: when the reason references a piece of equipment, you MUST use the EXACT string from the workout's equipment array. Never use a shorthand or partial form.
  - CRITICAL EXAMPLE: if the workout's equipment array contains "Rings / TRX", the reason MUST say "rings/TRX" (or "Rings / TRX"). It MUST NOT say just "rings" or just "TRX". If the draft reason says "rings" but the data says "Rings / TRX", you MUST rewrite the reason to say "rings/TRX" instead. This is a mandatory rewrite — do not leave "rings" unchanged.
- Even if the only change needed is the equipment label wording, still output the corrected reason.
- Keep the tone warm and concise (1-2 sentences). Do not introduce new facts beyond the actual data.

WORKOUTS TO VERIFY:
${JSON.stringify(records, null, 2)}

Return JSON with a "verified" array of { workout_id, reason }. Every input workout_id must appear exactly once.`;

    try {
      const res = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: {
          type: 'object',
          properties: {
            verified: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  workout_id: { type: 'string' },
                  reason: { type: 'string' },
                },
                required: ['workout_id', 'reason'],
              },
            },
          },
          required: ['verified'],
        },
      });

      const verifiedMap = new Map((res.verified || []).map((v) => [v.workout_id, v.reason]));
      const verified = items.map((i) => ({
        workout_id: i.workout_id,
        reason: verifiedMap.get(i.workout_id) || i.draft_reason || '',
      }));
      return Response.json({ verified });
    } catch {
      // Verifier LLM call failed — fall back to draft reasons so plan/swap creation is never blocked.
      return Response.json({ verified: items.map((i) => ({ workout_id: i.workout_id, reason: i.draft_reason || '' })) });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}