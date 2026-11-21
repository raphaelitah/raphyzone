// The "how did it feel / what weight" prompt that opens when an exercise's last set
// is done. It used to live only in memory, so a reload (or jumping to another
// exercise) while it was open dropped it, and the finished exercise was never saved.
// It is now saved with the session's progress and restored from here.

/** What to store in progress for an open prompt (a prompt reviewing a saved result needs no restoring). */
export const pendingLogToSave = (logPrompt) =>
  logPrompt && !logPrompt.review && Array.isArray(logPrompt.keys) && logPrompt.keys.length
    ? { keys: logPrompt.keys, blockId: logPrompt.blockId ?? null }
    : null;

/**
 * Works out whether a saved prompt should be reopened. Only when every exercise it
 * covers still exists and at least one has no saved result yet; otherwise it was
 * already answered (or the workout changed) and there is nothing to restore.
 * @param {{keys: string[], blockId?: string|null}|null} pending  from progress
 * @param {{key: string}[]} exercises  the exercises as loaded
 * @param {Record<string, object>} saved  results already saved, by exercise key
 * @returns {{ keys: string[], blockId: string|null, index: number, entries: Record<string, object> } | null}
 */
export function restorePendingLog(pending, exercises, saved = {}) {
  if (!pending || !Array.isArray(pending.keys) || pending.keys.length === 0) return null;
  const known = new Set(exercises.map((e) => e.key));
  if (!pending.keys.every((k) => known.has(k))) return null;
  if (pending.keys.every((k) => saved[k])) return null;
  const entries = {};
  pending.keys.forEach((k) => {
    const s = saved[k] || {};
    entries[k] = {
      difficulty: s.difficulty ?? null,
      note: s.note || '',
      max_weight: s.max_weight ?? null,
      bodyweight: !!s.bodyweight,
      distance_km: s.distance_km ?? null,
      duration_seconds: s.duration_seconds ?? null,
    };
  });
  return {
    keys: pending.keys,
    blockId: pending.blockId ?? null,
    index: exercises.findIndex((e) => e.key === pending.keys[0]),
    entries,
  };
}
