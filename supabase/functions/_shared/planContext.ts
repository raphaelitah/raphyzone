// Ported from base44/shared/planContext.ts — pure logic, no Base44 dependency,
// so this moved over unchanged.

const WEEK_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export { WEEK_DAYS };

// Compute the deterministic per-day slot structure from the profile.
// Desired-activity days => 'activity' (strict). Non-training days => 'rest' (strict).
// Remaining training days => 'strength'. The AI may only downgrade strength -> rest for context.
export function computeBaseSlots(profile: any) {
  const desiredByDay: Record<string, string> = {};
  (profile?.desired_activities || []).forEach((a: any) => {
    if (a.day) desiredByDay[a.day] = a.activity || 'Activity';
  });
  const trainingDays = profile?.training_days?.length ? profile.training_days : WEEK_DAYS.slice(0, 3);
  return WEEK_DAYS.map((day) => {
    if (desiredByDay[day]) return { day, slot_type: 'activity', activity: desiredByDay[day] };
    if (trainingDays.includes(day)) return { day, slot_type: 'train' };
    return { day, slot_type: 'rest' };
  });
}

// Build a digest of past swap feedback so the LLM learns what the user avoids.
export function computeFeedbackDigest(feedbackList: any[]) {
  const rejected = (feedbackList || []).filter((f) => f.action === 'rejected');
  const patternCounts: Record<string, number> = {};
  for (const f of rejected) {
    for (const p of (f.exercise_patterns || [])) {
      if (!p) continue;
      patternCounts[p] = (patternCounts[p] || 0) + 1;
    }
  }
  const patterns = Object.entries(patternCounts)
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([p, c]) => `${p} (rejected ${c}x)`);
  const rejectedWorkouts = [...new Set(rejected.map((f) => f.workout_name).filter(Boolean))].slice(0, 10);
  return { patterns, rejectedWorkouts };
}

export function buildProfileContext(profile: any, feedback: any[]) {
  const digest = computeFeedbackDigest(feedback);
  const trainingDays = profile?.training_days?.length ? profile.training_days : WEEK_DAYS.slice(0, 3);
  const restDays = WEEK_DAYS.filter((d) => !trainingDays.includes(d));
  const duration = profile?.duration_mode === 'per_day'
    ? 'per day: ' + (profile.training_days || []).map((d: string) => `${d}:${profile.per_day_durations?.[d] ?? 45}min`).join(', ')
    : `${profile?.duration_min ?? 45}–${profile?.duration_max ?? 60} min per session`;
  const scheduled = (profile?.scheduled_activities || []).map((a: any) => `${a.day} ${a.time_of_day}: ${a.activity}`).join('; ') || 'none';
  const desired = (profile?.desired_activities || []).map((a: any) => `${a.day}: ${a.activity}`).join('; ') || 'none';
  const calibration = profile?.calibrated && profile?.strength_calibration?.length
    ? profile.strength_calibration.map((c: any) => `${c.pattern}: ${c.exercise} @ ${c.weight_kg}kg x ${c.reps || '?'}`).join('; ')
    : 'unknown — assume conservative';
  const warmup = `mobility ${profile?.warmup_include_mobility ? 'on' : 'off'}, cardio ${profile?.warmup_include_cardio ? 'on' : 'off'}, first-movement prep ${profile?.warmup_include_first_movement ? 'on' : 'off'}, ${profile?.warmup_duration_minutes ?? 10} min`;
  const ws = profile?.weight_setup || {};

  return `ATHLETE PROFILE:
- Primary goal: ${profile?.goal || 'general_fitness'}
- Secondary goal: ${profile?.secondary_goal && profile.secondary_goal !== 'none' ? profile.secondary_goal : 'none'}
- Body focus: ${(profile?.body_focus || []).join(', ') || 'none'}
- Performance focus: ${(profile?.performance_focus || []).join(', ') || 'none'}
- Experience: ${profile?.experience_level || 'beginner'}
- Training history: ${profile?.training_history || 'unknown'}
- Program difficulty: ${profile?.program_difficulty || 'challenger'} (recruit=easy … apex=maximal)
- Resistance priority: ${profile?.resistance_priority ?? 70}/100
- Conditioning priority: ${profile?.conditioning_priority ?? 30}/100
- Equipment profile: ${profile?.equipment_profile === 'full_gym' ? 'Full gym (standard commercial gym — all common equipment available)' : 'CUSTOM — the athlete has ONLY the specific equipment listed below; this is NOT a full gym. Do NOT assume any equipment beyond what is listed.'}
- Available equipment (ONLY these items, nothing else): ${[...(profile?.available_equipment || []), ...(profile?.custom_equipment || [])].join(', ') || 'none'}
- Weight setup: dumbbells ${ws.dumbbells?.max_kg ?? '?'}kg, barbell ${ws.barbell?.max_kg ?? '?'}kg, kettlebells ${ws.kettlebells?.max_kg ?? '?'}kg
- Weight unit: ${profile?.weight_unit || 'kg'}
- Training days (STRENGTH only — never add a workout to any other day): ${trainingDays.join(', ')}
- Rest days (NEVER assign a workout — the user is always right): ${restDays.join(', ') || 'none'}
- Desired duration: ${duration}
- Scheduled activities (plan around these): ${scheduled}
- Desired activities (STRICT — these days are dedicated to the user's activity; do NOT assign a strength workout): ${desired}
- Strength calibration: ${calibration}
- Warmup prefs: ${warmup}
- Manual dislikes (AVOID these exercises/patterns): ${(profile?.dislikes || []).join(', ') || 'none'}
- Learned from past swaps (frequently rejected): ${digest.patterns.join('; ') || 'none yet'}
- Workouts previously rejected: ${digest.rejectedWorkouts.join('; ') || 'none'}`;
}

// Pared down to only the fields the selection prompt's RULES section actually
// reads (modality, duration, equipment, exercises for dislike/pattern
// matching, name/id for the pick, movement_focus for the week-level variety
// rule). `goal`, `split`, and `difficulty` are still never referenced —
// including them was pure token overhead with no effect on which workout gets
// picked, and the full row (with every field) is re-fetched from the DB later
// by verifyWorkoutReasons anyway.
//
// Emitted as a pipe-delimited table with one header line rather than
// per-object JSON: JSON repeats every field name (id/name/modality/...) for
// each of the ~60-100 rows in a typical filtered catalog, which is pure
// overhead the model doesn't need to see twice. The table form cuts that
// redundant-key cost with no loss of information — the LLM handles delimited
// tabular data just as reliably as JSON for a flat shape like this. Fields
// that could plausibly contain a literal "|" (there are none in this dataset)
// would break a row; exercise names are comma-joined, which is a minor
// ambiguity risk only if an exercise name itself contains a comma.
export function buildWorkoutCatalog(workouts: any[]) {
  const header = 'id|name|modality|movement_focus|duration_min|equipment|exercises';
  const rows = (workouts || []).map((w) => [
    w.id,
    w.name,
    w.modality || '',
    w.movement_focus || '',
    w.est_duration_min || w.duration_minutes || '',
    (w.equipment || []).join(','),
    (w.exercises || []).map((e: any) => e.exercise_name).join(','),
  ].join('|'));
  return [header, ...rows].join('\n');
}

// Pre-filters the catalog to workouts the athlete could actually be assigned,
// before it's ever serialized into a prompt. Both cuts are things the LLM would
// have discarded anyway per its own mandatory rules, so this only removes dead
// weight — it never changes which workout gets picked.
//   - Equipment: a CUSTOM equipment profile can only ever use workouts whose
//     required equipment is fully covered (this is already a MANDATORY rule in
//     the selection prompt). full_gym profiles skip this filter — everything's
//     assumed available.
//   - Modality: a workout can only be selected for a train day if its modality
//     matches that day's decided modality. When there are no activity days (the
//     common case), the day's needed modality set is known ahead of time, so
//     anything else can be safely dropped. Activity days can match against any
//     modality (the mapping is decided by the LLM, not precomputed here), so the
//     modality filter is skipped whenever any activity day is present.
// Cap on how many candidates per modality get sent to the LLM. A week needs at
// most 7 unique picks total, so this is generous headroom for variety/quality —
// it exists only because some modalities (e.g. "Mixed Conditioning") can have
// 70+ approved workouts in the catalog, which alone can blow the prompt budget
// regardless of how tightly the other fields are trimmed.
const MAX_PER_MODALITY = 14;

export function filterCatalogForSelection(workouts: any[], profile: any, neededModalities: string[], hasActivityDays: boolean) {
  let list = workouts || [];

  if (profile?.equipment_profile !== 'full_gym') {
    const available = new Set(
      [...(profile?.available_equipment || []), ...(profile?.custom_equipment || [])].map((e: string) => e.toLowerCase().trim())
    );
    list = list.filter((w) => (w.equipment || []).every((eq: string) => available.has((eq || '').toLowerCase().trim())));
  }

  if (!hasActivityDays && neededModalities.length) {
    const modalitySet = new Set(neededModalities);
    list = list.filter((w) => w.modality && modalitySet.has(w.modality));
  }

  const countByModality: Record<string, number> = {};
  list = list.filter((w) => {
    const key = w.modality || '__none__';
    countByModality[key] = (countByModality[key] || 0) + 1;
    return countByModality[key] <= MAX_PER_MODALITY;
  });

  return list;
}
