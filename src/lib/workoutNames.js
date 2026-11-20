// Names for saved custom workouts. The database enforces the same rules
// (save_workout_copy); this is for instant feedback in the form.

export const MAX_WORKOUT_NAME = 80;

export const normalizeName = (raw) => String(raw ?? '').replace(/\s+/g, ' ').trim();

/**
 * @param {string} raw      what the athlete typed
 * @param {string[]} taken  names it must differ from (the original workout, its catalog source, the athlete's other custom workouts)
 * @returns {{ name: string, error: string|null }}
 */
export function validateWorkoutName(raw, taken = []) {
  const name = normalizeName(raw);
  if (!name) return { name, error: 'Enter a name.' };
  if (name.length > MAX_WORKOUT_NAME) return { name, error: `Keep it under ${MAX_WORKOUT_NAME} characters.` };
  const lower = name.toLowerCase();
  if (taken.some((t) => normalizeName(t).toLowerCase() === lower)) {
    return { name, error: 'That name is already taken. Pick a different one.' };
  }
  return { name, error: null };
}

/** A starting suggestion that is already free: "<Name> (my version)", then "... 2", "... 3". */
export function suggestWorkoutName(baseName, taken = []) {
  const used = new Set(taken.map((t) => normalizeName(t).toLowerCase()));
  const base = `${normalizeName(baseName)} (my version)`;
  let candidate = base;
  for (let n = 2; used.has(candidate.toLowerCase()); n += 1) candidate = `${base} ${n}`;
  return candidate.length > MAX_WORKOUT_NAME ? candidate.slice(candidate.length - MAX_WORKOUT_NAME) : candidate;
}
