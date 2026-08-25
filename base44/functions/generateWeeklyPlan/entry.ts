import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { buildProfileContext, buildWorkoutCatalog, computeBaseSlots, WEEK_DAYS } from '../../shared/planContext.ts';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const weekStartDate = body.week_start_date;
    const contextAnswer = body.context_answer || '';
    const contextNotes = body.context_notes || '';
    const isRegen = !!body.regenerate;

    if (!weekStartDate) return Response.json({ error: 'week_start_date required' }, { status: 400 });

    const [profiles, feedback, workouts] = await Promise.all([
      base44.asServiceRole.entities.AthleteProfile.filter({ user_id: user.id }),
      base44.asServiceRole.entities.WorkoutFeedback.filter({ user_id: user.id }),
      base44.asServiceRole.entities.Workout.filter({ status: 'approved' }),
    ]);

    const profile = profiles[0];
    if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404 });

    const profileContext = buildProfileContext(profile, feedback);
    const catalog = buildWorkoutCatalog(workouts);
    const baseSlots = computeBaseSlots(profile);

    const trainDayCount = baseSlots.filter((s) => s.slot_type === 'train').length;
    const resistancePriority = profile?.resistance_priority ?? 70;
    const conditioningPriority = profile?.conditioning_priority ?? 30;
    const ratioTotal = resistancePriority + conditioningPriority || 1;
    const targetStrengthDays = Math.round((resistancePriority / ratioTotal) * trainDayCount);
    const targetConditioningDays = trainDayCount - targetStrengthDays;

    // Phase 1 — structure: assign a modality to each train day from the catalog's modality values.
    const structurePrompt = `You are an expert training coach planning a training week.

${profileContext}

WEEK CONTEXT: ${contextAnswer || 'normal week'}${contextNotes ? ' — ' + contextNotes : ''}

DETERMINED DAY SLOTS (the user is always right — do NOT change activity or rest days):
${baseSlots.map((s) => `- ${s.day}: ${s.slot_type}${s.activity ? ' (' + s.activity + ')' : ''}`).join('\n')}

YOUR TASK:
- For each TRAIN day, decide its "modality" — the kind of training that day should be. Choose from the catalog's modality values: "Strength / Muscular Endurance" (resistance training), "Mixed Conditioning" (metcons, circuits, cardio circuits), "Cyclical / Monostructural" (running, cycling, rowing), "Mobility / Flexibility" (yoga, mobility), "Skill / Power" (powerlifting/skill).
- The week's modality mix should be driven by the athlete's primary goal, secondary goal, body_focus, performance_focus, AND the resistance/conditioning priority ratio below.
- RESISTANCE/CONDITIONING RATIO (strong guiding constraint — stay close to this): The athlete has ${trainDayCount} train day(s). Aim for ~${targetStrengthDays} strength-modality day(s) and ~${targetConditioningDays} conditioning/mixed-modality day(s). You may deviate when the athlete's goal or focus clearly justifies it, but do not stray far.
- For each TRAIN day assigned "Strength / Muscular Endurance" modality, also set a concise "focus" that balances movement patterns across the week and respects body_focus/performance_focus.
- You MAY downgrade a train day to "rest" ONLY if the week's context clearly requires it (e.g. recovery issue, schedule change). Never upgrade a rest or activity day. Never change an activity day or its activity.
- Return all 7 days.

Return JSON with a "days" array, each item { day, slot_type, modality (for train days), focus (for strength-modality train days), activity (for activity days) }.`;

    const structureRes = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: structurePrompt,
      response_json_schema: {
        type: 'object',
        properties: {
          days: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                day: { type: 'string' },
                slot_type: { type: 'string', enum: ['train', 'activity', 'rest'] },
                modality: { type: 'string' },
                focus: { type: 'string' },
                activity: { type: 'string' },
              },
              required: ['day', 'slot_type'],
            },
          },
        },
        required: ['days'],
      },
    });

    const structByDay = {};
    (structureRes.days || []).forEach((d) => { structByDay[d.day] = d; });
    const finalSlots = baseSlots.map((base) => {
      const s = structByDay[base.day] || {};
      let slot_type = base.slot_type;
      if (base.slot_type === 'train' && s.slot_type === 'rest') slot_type = 'rest';
      return {
        day: base.day,
        slot_type,
        activity: base.activity || null,
        modality: slot_type === 'train' ? (s.modality || 'Strength / Muscular Endurance') : null,
        focus: slot_type === 'train' && s.modality === 'Strength / Muscular Endurance' ? (s.focus || '') : null,
      };
    });

    const trainDays = finalSlots.filter((s) => s.slot_type === 'train');
    const activityDays = finalSlots.filter((s) => s.slot_type === 'activity');

    // Phase 2 — selection: pick catalog workouts matching each day's decided modality.
    const selectionPrompt = `You are an expert training coach selecting workouts from a catalog.

${profileContext}

WEEK CONTEXT: ${contextAnswer || 'normal week'}${contextNotes ? ' — ' + contextNotes : ''}

TRAIN DAYS TO FILL (pick exactly one catalog workout per day, no duplicates across the week):
${trainDays.map((s) => `- ${s.day}: modality "${s.modality}"${s.focus ? ', focus "' + s.focus + '"' : ''}`).join('\n') || 'none'}

ACTIVITY DAYS (the user wants to do their own activity on these days):
${activityDays.map((s) => `- ${s.day}: ${s.activity || 'activity'}`).join('\n') || 'none'}

WORKOUT CATALOG (select ONLY from these by id; each workout has a "modality" field):
${catalog}

RULES:
- Pick exactly one workout_id per train day from the catalog, matching that day's decided modality. No duplicate workout_ids across the entire week (train days AND guided activity days combined).
- For each ACTIVITY day: check if the catalog contains a workout whose "modality" matches the user's activity. The catalog uses these modality values: "Cyclical / Monostructural" (running, cycling, rowing), "Mixed Conditioning" (metcons, circuits, cardio circuits), "Strength / Muscular Endurance" (resistance training), "Mobility / Flexibility" (yoga, mobility), "Skill / Power" (powerlifting/skill). Match accordingly (e.g. activity "Running" → "Cyclical / Monostructural"; "Yoga" → "Mobility / Flexibility"; "Cycling" → "Cyclical / Monostructural"). If a matching-modality workout exists, assign the best match as that day's main workout — add it to "selections" with the day name and a reason. If NO matching-modality workout exists, do NOT assign a main workout — instead add the day to "suggestions" with 2-3 closest conditioning/cardio catalog workout ids as optional guidance.
- Never assign a workout to a rest day.
- Match each day's modality/focus/activity, the athlete's desired duration, and goal.
- EQUIPMENT MATCHING IS MANDATORY: Only assign a workout if ALL its required equipment is in the athlete's "Available equipment" list. If the equipment profile is CUSTOM, the athlete does NOT have a full gym — never assign a workout requiring equipment they don't have, even if it fits the modality/focus/goal perfectly.
- Strongly avoid any exercise/pattern in dislikes or frequently-rejected.

Return JSON with "selections" (array of { day, workout_id, reason }) and "suggestions" (array of { day, workout_ids }).`;

    const selRes = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: selectionPrompt,
      response_json_schema: {
        type: 'object',
        properties: {
          selections: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                day: { type: 'string' },
                workout_id: { type: 'string' },
                reason: { type: 'string' },
              },
              required: ['day', 'workout_id', 'reason'],
            },
          },
          suggestions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                day: { type: 'string' },
                workout_ids: { type: 'array', items: { type: 'string' } },
              },
              required: ['day', 'workout_ids'],
            },
          },
        },
        required: ['selections', 'suggestions'],
      },
    });

    const workoutMap = new Map(workouts.map((w) => [w.id, w]));
    const selByDay = {};
    (selRes.selections || []).forEach((s) => { selByDay[s.day] = s; });
    const sugByDay = {};
    (selRes.suggestions || []).forEach((s) => { sugByDay[s.day] = s.workout_ids || []; });

    // Verify all draft reasons against the actual chosen workout data so no claim is hallucinated.
    const draftItems = (selRes.selections || [])
      .map((s) => ({ workout_id: s.workout_id, draft_reason: s.reason }))
      .filter((i) => i.workout_id);
    let verifiedReasons = {};
    if (draftItems.length) {
      try {
        const verifyRes = await base44.asServiceRole.functions.invoke('verifyWorkoutReasons', { items: draftItems });
        (verifyRes.data?.verified || []).forEach((v) => { verifiedReasons[v.workout_id] = v.reason; });
      } catch {
        (selRes.selections || []).forEach((s) => { if (s.workout_id) verifiedReasons[s.workout_id] = s.reason; });
      }
    }

    const monday = new Date(weekStartDate + 'T00:00:00Z');
    const mapped = finalSlots.map((slot) => {
      const idx = WEEK_DAYS.indexOf(slot.day);
      const date = idx >= 0 ? new Date(monday.getTime() + idx * 86400000).toISOString().slice(0, 10) : weekStartDate;
      const entry = {
        day: slot.day,
        date,
        slot_type: slot.slot_type,
        activity: slot.activity,
        modality: slot.modality || null,
        focus: slot.focus,
        workout_id: null,
        workout_name: null,
        reason: null,
        suggested_workout_ids: [],
        locked: false,
      };
      if (slot.slot_type === 'train' || slot.slot_type === 'activity') {
        const sel = selByDay[slot.day];
        if (sel) {
          const wo = workoutMap.get(sel.workout_id);
          entry.workout_id = sel.workout_id;
          entry.workout_name = wo?.name || sel.workout_id;
          entry.reason = verifiedReasons[sel.workout_id] || sel.reason;
          if (slot.slot_type === 'train' && wo?.modality) entry.modality = wo.modality;
        } else if (slot.slot_type === 'activity') {
          entry.suggested_workout_ids = (sugByDay[slot.day] || [])
            .filter((id) => workoutMap.has(id))
            .slice(0, 3);
        }
      }
      return entry;
    });

    const existing = await base44.asServiceRole.entities.WeeklyPlan.filter({ user_id: user.id, week_start_date: weekStartDate });
    const regenCount = (existing[0]?.regenerations_used || 0) + (isRegen ? 1 : 0);
    const payload = {
      user_id: user.id,
      week_start_date: weekStartDate,
      status: 'approved',
      context_answer: contextAnswer,
      context_notes: contextNotes,
      workouts: mapped,
      regenerations_used: regenCount,
    };
    let plan;
    if (existing[0]) {
      plan = await base44.asServiceRole.entities.WeeklyPlan.update(existing[0].id, payload);
    } else {
      plan = await base44.asServiceRole.entities.WeeklyPlan.create(payload);
    }

    const trainCount = mapped.filter((m) => m.slot_type === 'train').length;
    const activityCount = mapped.filter((m) => m.slot_type === 'activity').length;
    const restCount = mapped.filter((m) => m.slot_type === 'rest').length;
    const summary = `Your week: ${trainCount} training, ${activityCount} activity, ${restCount} rest.`;

    return Response.json({ plan, summary });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}