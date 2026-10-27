import { describe, it, expect } from 'vitest';
import { formatStepPrescription } from './prescriptionLabel';

const be = (over) => ({ step_type: 'exercise', ...over });

describe('formatStepPrescription', () => {
  it('labels counted reps', () => {
    expect(formatStepPrescription(be({ prescription_type: 'reps', prescription_value: '24' }), [{ target_reps: 24 }]))
      .toBe('1 set × 24 reps');
    expect(formatStepPrescription(be({ prescription_type: 'reps', prescription_value: '1' }), []))
      .toBe('1 set × 1 rep');
  });

  it('keeps the unit when sets carry a bare number (and drops the set prefix for cardio)', () => {
    expect(formatStepPrescription(be({ prescription_type: 'distance', prescription_value: '300m' }), [{ target_reps: 300 }]))
      .toBe('300m');
    expect(formatStepPrescription(be({ prescription_type: null, prescription_value: '6 cals' }), [{ target_reps: 6 }]))
      .toBe('6 cals');
    expect(formatStepPrescription(be({ prescription_type: 'distance', prescription_value: '1 mile' }), [{ target_reps: 1 }]))
      .toBe('1 mile');
  });

  it('keeps the original formatting when the set number matches', () => {
    expect(formatStepPrescription(be({ prescription_type: 'distance', prescription_value: '1,000m' }), [{ target_reps: 1000 }]))
      .toBe('1,000m');
  });

  it('uses the set number when the athlete changed it', () => {
    expect(formatStepPrescription(be({ prescription_type: 'distance', prescription_value: '300m' }), [{ target_reps: 400 }]))
      .toBe('400m');
  });

  it('infers a unit for bare numbers on typed steps', () => {
    expect(formatStepPrescription(be({ prescription_type: 'distance', prescription_value: '400' }), []))
      .toBe('400m');
    expect(formatStepPrescription(be({ prescription_type: 'time', prescription_value: '45' }), []))
      .toBe('45s');
  });

  it('keeps the set prefix for multi-set cardio and for non-cardio text', () => {
    expect(formatStepPrescription(be({ prescription_type: 'distance', prescription_value: '400m' }), [{ target_reps: 400 }, { target_reps: 400 }, { target_reps: 400 }]))
      .toBe('3 sets × 400m');
    expect(formatStepPrescription(be({ prescription_type: 'reps', prescription_value: '10 each side' }), [{ target_reps: 10 }]))
      .toBe('1 set × 10 each side');
  });

  it('appends the load and passes rest steps through', () => {
    expect(formatStepPrescription(be({ prescription_type: 'reps', prescription_value: '5', load_value: '60 kg' }), [{ target_reps: 5 }]))
      .toBe('1 set × 5 reps · 60 kg');
    expect(formatStepPrescription({ step_type: 'rest', prescription_value: '3 minutes' }, [])).toBe('3 minutes');
  });
});
