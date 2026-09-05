import { describe, it, expect } from 'vitest';
import { computeFormatLabel } from './formatLabel';

describe('computeFormatLabel', () => {
  it('returns an empty string for a missing format', () => {
    expect(computeFormatLabel('', false, 'Leg Day')).toBe('');
    expect(computeFormatLabel(null, false, 'Leg Day')).toBe('');
  });

  it('forces "Conditioning" for a workout with "run" as a whole word in its name, regardless of format', () => {
    expect(computeFormatLabel('emom', false, 'Run intervals')).toBe('Conditioning');
    expect(computeFormatLabel('strength_sets', false, 'run')).toBe('Conditioning');
    expect(computeFormatLabel('strength_sets', false, 'Easy Run')).toBe('Conditioning');
  });

  it('does not match "run" as a prefix of a longer word like "Running"', () => {
    expect(computeFormatLabel('emom', false, 'Running club warmup')).toBe('EMOM');
    expect(computeFormatLabel('emom', false, 'Marathon prep')).toBe('EMOM');
  });

  it('maps known single formats to their display labels', () => {
    expect(computeFormatLabel('for_time', false, 'W')).toBe('For Time');
    expect(computeFormatLabel('amrap', false, 'W')).toBe('AMRAP');
    expect(computeFormatLabel('emom', false, 'W')).toBe('EMOM');
    expect(computeFormatLabel('circuit', false, 'W')).toBe('Circuit');
  });

  it('maps strength_sets/superset to Bodybuilding, or Calisthenics when all bodyweight', () => {
    expect(computeFormatLabel('strength_sets', false, 'W')).toBe('Bodybuilding');
    expect(computeFormatLabel('superset', false, 'W')).toBe('Bodybuilding');
    expect(computeFormatLabel('strength_sets', true, 'W')).toBe('Calisthenics');
    expect(computeFormatLabel('superset', true, 'W')).toBe('Calisthenics');
  });

  it('title-cases an unrecognized format by replacing underscores', () => {
    expect(computeFormatLabel('death_by', false, 'W')).toBe('Death By');
  });

  it('joins mixed(...) components with " + ", mapping each one', () => {
    expect(computeFormatLabel('mixed(emom+amrap)', false, 'W')).toBe('EMOM + AMRAP');
    expect(computeFormatLabel('mixed(superset+for_time)', false, 'W')).toBe('Bodybuilding + For Time');
  });

  it('trims whitespace inside a mixed(...) format', () => {
    expect(computeFormatLabel('mixed( emom + amrap )', false, 'W')).toBe('EMOM + AMRAP');
  });

  it('applies the bodyweight strength label consistently across mixed components', () => {
    expect(computeFormatLabel('mixed(superset+strength_sets)', true, 'W')).toBe('Calisthenics');
  });

  it('dedupes repeated component labels in a mixed format', () => {
    expect(computeFormatLabel('mixed(circuit+strength_sets+superset)', false, 'W')).toBe('Circuit + Bodybuilding');
  });
});
