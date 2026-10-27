// One-line summary of a block step for the workout lists ("1 set × 24 reps",
// "Run · 300m", "Row · 6 cals"). The unit lives in `prescription_value`
// ("300m", "6 cals", "1 mile"); sets only carry a bare numeric `target_reps`,
// so the unit is re-attached here instead of being dropped.

// Units that mean the step is cardio / distance / time rather than counted reps.
const CARDIO_UNIT = /^(km|mi|miles?|m|meters?|metres?|yd|yards?|ft|cals?|calories?|s|secs?|seconds?|min|mins|minutes?)\b/i;

const NUMBER_PREFIX = /^(\d[\d,]*(?:\.\d+)?)\s*(.*)$/;

function bareNumberUnit(n, prescriptionType) {
  if (prescriptionType === 'distance') return n >= 50 ? 'm' : 'km';
  if (prescriptionType === 'time') return 's';
  return null;
}

// Splits a step's target into { text, cardio }: the quantity with its unit
// ("24 reps", "300m"), and whether that unit is cardio/distance/time.
export function formatStepTarget(be, sets = []) {
  const targetReps = sets[0]?.target_reps;
  const raw = String(be?.prescription_value ?? '').trim();
  const hasTarget = targetReps !== undefined && targetReps !== null && targetReps !== '';
  const parsed = raw.match(NUMBER_PREFIX);
  const rawNumber = parsed ? parseFloat(parsed[1].replace(/,/g, '')) : null;
  const rawUnit = parsed ? parsed[2].trim() : raw;
  // The set's number wins when the two disagree (the athlete edited the sets).
  const number = hasTarget ? Number(targetReps) : rawNumber;

  if (number === null || !Number.isFinite(number)) {
    return { text: raw, cardio: CARDIO_UNIT.test(raw) };
  }

  const keepRaw = raw && rawNumber === number;
  const numText = keepRaw ? parsed[1] : String(number);

  if (rawUnit) {
    return {
      text: `${numText}${/^[a-z]/i.test(rawUnit) && rawUnit.length <= 2 ? '' : ' '}${rawUnit}`,
      cardio: CARDIO_UNIT.test(rawUnit),
    };
  }

  const unit = bareNumberUnit(number, be?.prescription_type);
  if (unit) return { text: `${numText}${unit}`, cardio: true };
  return { text: `${numText} ${number === 1 ? 'rep' : 'reps'}`, cardio: false };
}

export function formatStepPrescription(be, sets = []) {
  if (be?.step_type === 'rest') return be.prescription_value;
  const { text, cardio } = formatStepTarget(be, sets);
  const setCount = sets.length || 1;
  const load = be?.load_value ? ` · ${be.load_value}` : '';
  if (cardio && setCount === 1) return `${text}${load}`;
  return `${setCount} ${setCount === 1 ? 'set' : 'sets'} × ${text}${load}`;
}
