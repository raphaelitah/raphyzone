import { describe, it, expect } from 'vitest';
import { reasonNeedsVerification } from '../../supabase/functions/_shared/reasonCheck.ts';

const w = (equipment, min = 30) => ({ equipment, est_duration_min: min });

describe('reasonNeedsVerification', () => {
  it('skips a clean draft that names matching equipment and duration', () => {
    expect(reasonNeedsVerification('A 30 minute dumbbell session to build upper-body strength.', w(['Dumbbells']))).toBe(false);
  });
  it('skips a draft that names no equipment', () => {
    expect(reasonNeedsVerification('Keeps your legs fresh before the weekend.', w(['Barbell']))).toBe(false);
  });
  it('verifies equipment the workout does not list', () => {
    expect(reasonNeedsVerification('Use the barbell for heavy squats.', w(['Dumbbells']))).toBe(true);
  });
  it('verifies a partial multi-part label', () => {
    expect(reasonNeedsVerification('Pulls on the rings for back volume.', w(['Rings / TRX']))).toBe(true);
  });
  it('accepts a whole multi-part label', () => {
    expect(reasonNeedsVerification('Pulls on rings/TRX for back volume.', w(['Rings / TRX']))).toBe(false);
  });
  it('verifies a duration that disagrees', () => {
    expect(reasonNeedsVerification('A quick 15 minute burner.', w(['Dumbbells'], 40))).toBe(true);
  });
  it('treats an empty draft as nothing to verify', () => {
    expect(reasonNeedsVerification('', w([]))).toBe(false);
  });
});
