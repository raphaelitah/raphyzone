import { DESIRED_ACTIVITY_OPTIONS, SPORT_ACTIVITIES } from '@/lib/fitness';

const KNOWN_ACTIVITIES = [...new Set([...DESIRED_ACTIVITY_OPTIONS, ...SPORT_ACTIVITIES])];
const REPEAT_THRESHOLD = 2;
const LOG_SIZE = 10;

export function matchActivityFromText(text) {
  const q = (text || '').trim().toLowerCase();
  if (q.length < 3) return null;
  return KNOWN_ACTIVITIES.find((a) => a.toLowerCase() === q) || KNOWN_ACTIVITIES.find((a) => a.toLowerCase().startsWith(q)) || null;
}

export function categoryFromWorkout(workout) {
  if (!workout) return null;
  const hay = `${workout.workout_format || ''} ${workout.workout_category || ''} ${workout.goal || ''} ${workout.name || ''}`.toLowerCase();
  return KNOWN_ACTIVITIES.find((label) => hay.includes(label.toLowerCase())) || null;
}

function logKey(userId) {
  return `activityPickLog:${userId}`;
}

function readLog(userId) {
  try { return JSON.parse(localStorage.getItem(logKey(userId)) || '[]'); } catch { return []; }
}

/**
 * Records a picked workout's activity category (whatever type it is —
 * Running, Bodybuilding, CrossFit, ...) and reports back the category if
 * the user has now picked it repeatedly, regardless of which category it is.
 */
export function recordPickAndDetectRepeat(userId, category) {
  if (!userId || !category) return null;
  const log = readLog(userId).concat({ category, ts: Date.now() }).slice(-LOG_SIZE);
  try { localStorage.setItem(logKey(userId), JSON.stringify(log)); } catch { /* ignore */ }
  const count = log.filter((e) => e.category === category).length;
  return count >= REPEAT_THRESHOLD ? category : null;
}

/** An activity category the user has shown repeated interest in, if any. */
export function repeatedActivityInterest(userId) {
  if (!userId) return null;
  const counts = {};
  readLog(userId).forEach((e) => { counts[e.category] = (counts[e.category] || 0) + 1; });
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return top && top[1] >= REPEAT_THRESHOLD ? top[0] : null;
}
