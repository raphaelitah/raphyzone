import { callLLM } from './llm.ts';
import { buildProfileContext, buildWorkoutCatalog, filterCatalogForSelection, computeBaseSlots, WEEK_DAYS } from './planContext.ts';
import { verifyWorkoutReasons } from './verifyWorkoutReasons.ts';
import { generateWarmup } from './warmupGenerator.ts';

export interface GeneratePlanRequest {
  week_start_date: string;
  context_answer?: string;
  context_notes?: string;
  setup_equipment?: string[] | null;
  regenerate?: boolean;
}

// The actual weekly-plan generation logic — one LLM call (see generateWeeklyPlan's
// former two-phase structure+selection prompts, now merged) plus a reason-verification
// pass, then a DB write. Pulled out of generateWeeklyPlan/index.ts so both the
// synchronous fast path (no queue contention) and the queued worker path
// (pollPlanJob) can run the identical logic without duplicating it.
export async function runPlanGeneration(supabase: any, user: { id: string }, body: GeneratePlanRequest) {
  const weekStartDate = body.week_start_date;
  const contextAnswer = body.context_answer || '';
  const contextNotes = body.context_notes || '';
  const setupEquipment: string[] | null = Array.isArray(body.setup_equipment) && body.setup_equipment.length ? body.setup_equipment : null;
  const isRegen = !!body.regenerate;

  if (!weekStartDate) throw new Error('week_start_date required');

  const [{ data: profiles }, { data: feedback }, { data: workouts }, { data: exerciseCatalog }, { data: existing }] = await Promise.all([
    supabase.from('athlete_profiles').select('*').eq('user_id', user.id),
    supabase.from('workout_feedback').select('*').eq('user_id', user.id),
    supabase.from('workouts').select('*').eq('status', 'approved'),
    supabase.from('exercises').select('id, name, movement_category, body_region, movement_pattern, primary_muscle_group, secondary_muscle_group, equipment_tags, modality'),
    supabase.from('weekly_plans').select('*').eq('user_id', user.id).eq('week_start_date', weekStartDate),
  ]);

  const profile = profiles?.[0];
  if (!profile) throw new Error('Profile not found');

  const existingPlan = existing?.[0];
  const existingByDay: Record<string, any> = {};
  (existingPlan?.workouts || []).forEach((w: any) => { existingByDay[w.day] = w; });

  const todayISO = new Date().toISOString().slice(0, 10);
  const monday = new Date(weekStartDate + 'T00:00:00Z');
  const dateForDay = (day: string) => {
    const idx = WEEK_DAYS.indexOf(day);
    return idx >= 0 ? new Date(monday.getTime() + idx * 86400000).toISOString().slice(0, 10) : weekStartDate;
  };

  let lockedDays = new Set<string>();
  if (isRegen && existingPlan) {
    const weekDates = Object.values(existingByDay).map((w: any) => w.date).filter(Boolean);
    const { data: completedSessions } = weekDates.length
      ? await supabase
          .from('workout_sessions')
          .select('date')
          .eq('user_id', user.id)
          .eq('status', 'completed')
          .in('date', weekDates)
      : { data: [] as any[] };
    const completedDates = new Set((completedSessions || []).map((s: any) => s.date));
    Object.values(existingByDay).forEach((w: any) => {
      if (!w.date) return;
      if (w.date < todayISO || completedDates.has(w.date)) lockedDays.add(w.day);
    });
  }

  // Days already elapsed this week that aren't covered by the regen-locked logic
  // above (i.e. the very first "Build my week", with no existing plan to preserve)
  // can't be trained on retroactively — force them to rest rather than asking the
  // LLM to plan a workout for a date that's already gone. The user can still add a
  // manual activity for those days afterward.
  const pastRestDays = new Set<string>(
    WEEK_DAYS.filter((day) => !lockedDays.has(day) && dateForDay(day) < todayISO)
  );

  const effectiveProfile = setupEquipment
    ? { ...profile, equipment_profile: 'custom', available_equipment: setupEquipment, custom_equipment: [] }
    : profile;

  const profileContext = buildProfileContext(effectiveProfile, feedback || []);
  const baseSlots = computeBaseSlots(profile);

  const trainDayCount = baseSlots.filter((s) => s.slot_type === 'train').length;
  const resistancePriority = profile?.resistance_priority ?? 70;
  const conditioningPriority = profile?.conditioning_priority ?? 30;
  const ratioTotal = resistancePriority + conditioningPriority || 1;
  const targetStrengthDays = Math.round((resistancePriority / ratioTotal) * trainDayCount);
  const targetConditioningDays = trainDayCount - targetStrengthDays;

  const filteredWorkouts = filterCatalogForSelection(workouts || [], effectiveProfile, [], true);
  const catalog = buildWorkoutCatalog(filteredWorkouts);

  const openSlots = baseSlots.filter((s) => !lockedDays.has(s.day) && !pastRestDays.has(s.day));

  const planPrompt = `You are an expert training coach building a training week for an athlete — deciding day structure and picking specific workouts in one pass.

${profileContext}

WEEK CONTEXT: ${contextAnswer || 'normal week'}${contextNotes ? ' — ' + contextNotes : ''}${setupEquipment ? `\nWEEK EQUIPMENT OVERRIDE (replaces the athlete's normal equipment for THIS WEEK ONLY): ${setupEquipment.join(', ')}` : ''}

DETERMINED DAY SLOTS (the user is always right — do NOT change activity or rest days):
${openSlots.map((s) => `- ${s.day}: ${s.slot_type}${s.activity ? ' (' + s.activity + ')' : ''}`).join('\n')}
${lockedDays.size ? `\nLOCKED DAYS (already completed or already past — do NOT plan these, they are excluded above): ${[...lockedDays].join(', ')}` : ''}${pastRestDays.size ? `\nPAST DAYS (already elapsed this week, forced to rest — do NOT plan these, they are excluded above): ${[...pastRestDays].join(', ')}` : ''}

WORKOUT CATALOG (select ONLY from these by id; each row is "id|name|modality|movement_focus|duration_min|equipment|exercises"):
${catalog}

YOUR TASK, for each day listed above:
1. STRUCTURE — For each TRAIN day, decide its "modality": "Strength / Muscular Endurance" (resistance training), "Mixed Conditioning" (metcons, circuits, cardio circuits), "Cyclical / Monostructural" (running, cycling, rowing), "Mobility / Flexibility" (yoga, mobility), or "Skill / Power" (powerlifting/skill). The week's modality mix should be driven by the athlete's primary goal, secondary goal, body_focus, performance_focus, AND the resistance/conditioning priority ratio below.
   - RESISTANCE/CONDITIONING RATIO (strong guiding constraint — stay close to this): The athlete has ${trainDayCount} train day(s). Aim for ~${targetStrengthDays} strength-modality day(s) and ~${targetConditioningDays} conditioning/mixed-modality day(s). You may deviate when the athlete's goal or focus clearly justifies it, but do not stray far.
   - For each TRAIN day assigned "Strength / Muscular Endurance" modality, also set a concise "focus" that balances movement patterns across the week and respects body_focus/performance_focus.
   - You MAY downgrade a train day to "rest" ONLY if the week's context clearly requires it (e.g. recovery issue, schedule change). Never upgrade a rest or activity day. Never change an activity day or its activity.
2. SELECTION — Once a day's modality is decided, pick exactly one catalog workout for it:
   - TRAIN days: pick exactly one workout_id matching that day's modality. No duplicate workout_ids across the entire week (train days AND guided activity days combined).
   - ACTIVITY days: check if the catalog contains a workout whose "modality" matches the user's activity (e.g. activity "Running" → "Cyclical / Monostructural"; "Yoga" → "Mobility / Flexibility"; "Cycling" → "Cyclical / Monostructural"). If a matching-modality workout exists, assign the best match as that day's workout_id with a reason. If NO matching-modality workout exists, leave workout_id unset for that day and instead add it to "suggestions" with 2-3 closest conditioning/cardio catalog workout ids as optional guidance.
   - Never assign a workout to a rest day.
   - Match each day's modality/focus/activity, the athlete's desired duration, and goal.
   - EQUIPMENT MATCHING IS MANDATORY: Only assign a workout if ALL its required equipment is in the athlete's "Available equipment" list. If the equipment profile is CUSTOM, the athlete does NOT have a full gym — never assign a workout requiring equipment they don't have, even if it fits the modality/focus/goal perfectly.
   - EVERY TRAIN DAY MUST GET A WORKOUT: never leave a train day with no selection. If no catalog workout satisfies the day's modality AND equipment constraints together, first relax the modality match (pick the closest available modality) before relaxing equipment; only relax equipment as a last resort, and pick the workout requiring the fewest missing items.
   - Strongly avoid any exercise/pattern in dislikes or frequently-rejected.
   - VARY movement_focus across the week: when multiple train days share the same modality, do NOT repeat the same movement_focus value on consecutive or multiple days if the catalog offers a different one that still fits — spread the training stimulus out instead of picking the same focus every time.
- Return only the DETERMINED DAY SLOTS listed above — do not include locked days.

Return JSON with a "days" array, each item { day, slot_type, modality (for train days), focus (for strength-modality train days), activity (for activity days), workout_id (for train/matched activity days), reason (for days with a workout_id) }, and a "suggestions" array (array of { day, workout_ids }) for activity days with no matching-modality workout.`;

  const planRes = await callLLM({
    functionName: 'generateWeeklyPlan',
    prompt: planPrompt,
    schema: {
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
              workout_id: { type: 'string' },
              reason: { type: 'string' },
            },
            required: ['day', 'slot_type'],
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
      required: ['days', 'suggestions'],
    },
  });

  const planByDay: Record<string, any> = {};
  (planRes.days || []).forEach((d: any) => { planByDay[d.day] = d; });
  const finalSlots = baseSlots.map((base) => {
    if (lockedDays.has(base.day)) {
      const existingEntry = existingByDay[base.day];
      return {
        day: base.day,
        slot_type: existingEntry.slot_type,
        activity: existingEntry.activity || null,
        modality: existingEntry.modality || null,
        focus: existingEntry.focus || null,
        locked: true,
      };
    }
    if (pastRestDays.has(base.day)) {
      return {
        day: base.day,
        slot_type: 'rest',
        activity: null,
        modality: null,
        focus: null,
        locked: false,
      };
    }
    const s = planByDay[base.day] || {};
    let slot_type = base.slot_type;
    if (base.slot_type === 'train' && s.slot_type === 'rest') slot_type = 'rest';
    return {
      day: base.day,
      slot_type,
      activity: (base as any).activity || null,
      modality: slot_type === 'train' ? (s.modality || 'Strength / Muscular Endurance') : null,
      focus: slot_type === 'train' && s.modality === 'Strength / Muscular Endurance' ? (s.focus || '') : null,
    };
  });

  const workoutMap = new Map((workouts || []).map((w: any) => [w.id, w]));
  const selByDay: Record<string, any> = planByDay;
  const sugByDay: Record<string, string[]> = {};
  (planRes.suggestions || []).forEach((s: any) => { sugByDay[s.day] = s.workout_ids || []; });

  const draftItems = (planRes.days || [])
    .map((s: any) => ({ workout_id: s.workout_id, draft_reason: s.reason }))
    .filter((i: any) => i.workout_id);
  let verifiedReasons: Record<string, string> = {};
  if (draftItems.length) {
    try {
      const verified = await verifyWorkoutReasons(supabase, draftItems);
      verified.forEach((v) => { verifiedReasons[v.workout_id] = v.reason; });
    } catch {
      draftItems.forEach((i: any) => { verifiedReasons[i.workout_id] = i.draft_reason; });
    }
  }

  const mapped = finalSlots.map((slot) => {
    if ((slot as any).locked) {
      return { ...existingByDay[slot.day], locked: true };
    }
    const date = dateForDay(slot.day);
    const entry: any = {
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
      warmup: null,
    };
    if (slot.slot_type === 'train' || slot.slot_type === 'activity') {
      const sel = selByDay[slot.day];
      if (sel) {
        const wo: any = workoutMap.get(sel.workout_id);
        entry.workout_id = sel.workout_id;
        entry.workout_name = wo?.name || sel.workout_id;
        entry.reason = verifiedReasons[sel.workout_id] || sel.reason;
        if (slot.slot_type === 'train' && wo?.modality) entry.modality = wo.modality;
        if (wo) {
          try {
            entry.warmup = generateWarmup(
              profile,
              [...(profile?.available_equipment || []), ...(profile?.custom_equipment || [])],
              wo,
              exerciseCatalog || []
            );
          } catch {
            entry.warmup = null;
          }
        }
      } else if (slot.slot_type === 'activity') {
        entry.suggested_workout_ids = (sugByDay[slot.day] || [])
          .filter((id: string) => workoutMap.has(id))
          .slice(0, 3);
      }
    }
    return entry;
  });

  const usedWorkoutIds = new Set(mapped.map((m: any) => m.workout_id).filter(Boolean));
  for (const entry of mapped) {
    if (entry.slot_type !== 'train' || entry.workout_id || (entry as any).locked) continue;
    const modality = entry.modality;
    const candidates = (workouts || []).filter((w: any) => w.modality === modality && !usedWorkoutIds.has(w.id));
    const equipped = candidates.filter((w: any) => filteredWorkouts.some((f: any) => f.id === w.id));
    const fallback = equipped[0] || candidates[0];
    if (fallback) {
      entry.workout_id = fallback.id;
      entry.workout_name = fallback.name;
      entry.reason = equipped[0]
        ? 'Assigned automatically to keep every training day filled.'
        : 'Assigned automatically — closest match; equipment may not fully match your setup for this week.';
      usedWorkoutIds.add(fallback.id);
      try {
        entry.warmup = generateWarmup(
          profile,
          [...(profile?.available_equipment || []), ...(profile?.custom_equipment || [])],
          fallback,
          exerciseCatalog || []
        );
      } catch {
        entry.warmup = null;
      }
    }
  }

  const regenCount = (existingPlan?.regenerations_used || 0) + (isRegen ? 1 : 0);
  const payload = {
    user_id: user.id,
    week_start_date: weekStartDate,
    status: 'approved',
    context_answer: contextAnswer,
    context_notes: contextNotes,
    setup_equipment: setupEquipment,
    workouts: mapped,
    regenerations_used: regenCount,
  };
  let plan;
  if (existingPlan) {
    const { data, error } = await supabase.from('weekly_plans').update(payload).eq('id', existingPlan.id).select().single();
    if (error) throw new Error(`Failed to update weekly plan: ${error.message}`);
    plan = data;
  } else {
    const { data, error } = await supabase.from('weekly_plans').insert(payload).select().single();
    if (error) throw new Error(`Failed to insert weekly plan: ${error.message}`);
    plan = data;
  }

  const trainCount = mapped.filter((m) => m.slot_type === 'train').length;
  const activityCount = mapped.filter((m) => m.slot_type === 'activity').length;
  const restCount = mapped.filter((m) => m.slot_type === 'rest').length;
  const summary = `Your week: ${trainCount} training, ${activityCount} activity, ${restCount} rest.`;

  return { plan, summary };
}
