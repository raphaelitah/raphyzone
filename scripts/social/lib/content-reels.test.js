import { describe, it, expect } from 'vitest';
import { buildCodeReel, CODE_REELS } from './content-reels.mjs';

const step = (name, eq = ['bodyweight']) => ({ name, equipment: eq, step_type: 'exercise', prescription_value: '10', prescription_type: 'reps' });
const workout = (id, over = {}) => ({
  workout_id: id, name: `Workout ${id}`, minutes: 20, difficulty: 'intermediate', format_label: 'EMOM', is_free: true,
  equipmentTokens: ['bodyweight'], split: 'push', movement_focus: 'push',
  blocks: [{ block_label: 'main', block_type: 'superset', rounds: 3, steps: [step('Push-up'), step('Air squat'), step('Plank hold')] }],
  ...over,
});
const catalog = [
  workout('a', { minutes: 12 }), workout('b', { minutes: 25, format_label: 'AMRAP', movement_focus: 'pull', split: 'pull' }),
  workout('c', { minutes: 30, format_label: 'TABATA', movement_focus: 'legs', split: 'legs' }), workout('d', { minutes: 18, difficulty: 'beginner', format_label: 'FOR TIME' }),
  workout('e', { minutes: 28, format_label: 'EMOM' }),
  workout('f', { minutes: 25, equipmentTokens: ['dumbbell'], blocks: [{ block_label: 'main', block_type: 'superset', rounds: 3, steps: [step('Goblet squat', ['dumbbell']), step('Row', ['dumbbell']), step('Press', ['dumbbell'])] }] }),
];
const exercises = ['bodyweight', 'dumbbell', 'barbell'].flatMap((eq) => ['Squat A', 'Squat B'].map((n) => ({ name: `${eq} ${n}`, equipment: eq, movement_pattern: 'Squat' })));
const ctx = (kind) => ({ kind, catalog, exercises, recentIds: new Set(), used: new Set(), perf: '', recentKeys: { formats: [], myths: [], patterns: [] }, plan: {} });

describe('buildCodeReel', () => {
  it.each([...CODE_REELS])('%s builds explicit scenes and a prompt', (kind) => {
    const out = buildCodeReel(ctx(kind));
    expect(out.script.manual).toBe(true);
    expect(out.script.scenes.length).toBeGreaterThanOrEqual(3);
    for (const sc of out.script.scenes) {
      expect(sc.seconds).toBeGreaterThan(0);
      expect(sc.card || sc.timer || sc.tour).toBeTruthy();
    }
    expect(out.slides.length).toBeGreaterThan(0);
    expect(out.user).toContain('Raphyzone removes the mental load.');
    // total length stays inside the 88 s reel limit (plus the 2.5 s end card)
    expect(out.script.scenes.reduce((a, s) => a + s.seconds, 2.5)).toBeLessThan(88);
  });
});
