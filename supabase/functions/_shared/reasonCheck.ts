// Decides whether a drafted workout "reason" can contain something the
// verifyWorkoutReasons LLM pass would correct, so that pass is only paid for when
// it can change the text. It targets the two things that pass exists to fix:
// equipment labels that don't match the workout's data exactly, and durations.
// Anything unusual returns true (verify) — skipping is only for clearly clean drafts.

// Equipment words a reason might name. A word counts as "named" when it appears
// in the reason; it is fine only if the workout's own equipment mentions it too.
const EQUIPMENT_WORDS = [
  'dumbbell', 'barbell', 'kettlebell', 'ring', 'trx', 'bench', 'band', 'cable', 'machine', 'rope',
  'bike', 'rower', 'treadmill', 'pull-up bar', 'pullup bar', 'sled', 'box', 'medicine ball', 'slam ball',
  'plate', 'rack', 'ez bar', 'trap bar', 'sandbag', 'wall ball', 'ski', 'stepper', 'foam roller', 'mat',
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9/ -]+/g, ' ').replace(/\s+/g, ' ').trim();
const hasWord = (text: string, word: string) => new RegExp(`(^|[^a-z])${word}(s|es)?([^a-z]|$)`).test(text);

export function reasonNeedsVerification(
  draft: string | null | undefined,
  workout: { equipment?: string[]; est_duration_min?: number | null; duration_minutes?: number | null },
): boolean {
  const reason = norm(draft || '');
  if (!reason) return false; // nothing to correct

  const equipment = (workout.equipment || []).map(norm);
  const equipmentText = equipment.join(' | ');

  // 1. Names a piece of equipment the workout doesn't list.
  for (const word of EQUIPMENT_WORDS) {
    if (hasWord(reason, word) && !hasWord(equipmentText, word)) return true;
  }

  // 2. Multi-part labels ("Rings / TRX") must be quoted whole: naming just one part is the
  // classic mismatch. Quoting whole means "rings/trx" or "rings / trx" appears verbatim.
  for (const label of equipment) {
    if (!label.includes('/')) continue;
    const compact = label.replace(/\s*\/\s*/g, '/');
    const parts = label.split('/').map((p) => p.trim()).filter(Boolean);
    const whole = reason.replace(/\s*\/\s*/g, '/').includes(compact);
    if (!whole && parts.some((p) => hasWord(reason, p))) return true;
  }

  // 3. A stated duration that disagrees with the workout's.
  const minutes = workout.est_duration_min ?? workout.duration_minutes ?? null;
  for (const m of reason.matchAll(/(\d+)\s*(?:-|to)?\s*(?:\d+\s*)?(?:min|minute)/g)) {
    if (minutes == null || Math.abs(Number(m[1]) - Number(minutes)) > 5) return true;
  }
  return false;
}
