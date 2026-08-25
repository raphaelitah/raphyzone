import { useAthleteProfile } from '@/hooks/useAthleteProfile';

export const KG_TO_LBS = 2.20462;

export function kgToLbs(kg) {
  return (kg || 0) * KG_TO_LBS;
}

export function lbsToKg(lbs) {
  return (lbs || 0) / KG_TO_LBS;
}

// Stored weights are always kg. These convert for display / input in the user's unit.
export function displayWeight(kg, unit = 'kg') {
  if (kg == null || isNaN(kg)) return null;
  const v = unit === 'lbs' ? kgToLbs(kg) : kg;
  return Math.round(v);
}

export function formatWeight(kg, unit = 'kg') {
  const v = displayWeight(kg, unit);
  return v == null ? '—' : `${v} ${unit}`;
}

// Convert a value typed in the user's unit back to kg for storage.
export function inputToKg(value, unit = 'kg') {
  const n = Number(value);
  if (!n || isNaN(n)) return null;
  return unit === 'lbs' ? Math.round(lbsToKg(n) * 10) / 10 : n;
}

// Convert a stored kg value to the user's unit for showing in a number input.
export function kgToInput(kg, unit = 'kg') {
  if (kg == null || isNaN(kg)) return '';
  return unit === 'lbs' ? Math.round(kgToLbs(kg)) : Math.round(kg);
}

export function useWeightUnit() {
  const { profile } = useAthleteProfile();
  return profile?.weight_unit || 'kg';
}