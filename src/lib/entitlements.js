const DAY_MS = 24 * 60 * 60 * 1000;

// Mirrors public.can_access_workout: premium/trialing users can start anything,
// free users only workouts flagged is_free (or ones they own). The database
// enforces this on session insert; this is just so the UI can show the lock.
export function canAccessWorkout(entitlement, workout, userId) {
  if (!workout) return true;
  if (!entitlement || entitlement.is_premium) return true;
  return !!workout.is_free || (!!userId && workout.owner_id === userId);
}

export function trialDaysLeft(entitlement) {
  if (entitlement?.reason !== 'trial' || !entitlement.trial_ends_at) return null;
  return Math.max(1, Math.ceil((new Date(entitlement.trial_ends_at).getTime() - Date.now()) / DAY_MS));
}

// supabase.functions.invoke surfaces a non-2xx response as `error` with the
// Response on error.context; the AI functions answer 402 { error: 'ai_quota_exceeded' }
// once a free user's monthly quota is used up.
export async function isAiQuotaError(error) {
  if (!error?.context || error.context.status !== 402) return false;
  try {
    return (await error.context.clone().json()).error === 'ai_quota_exceeded';
  } catch {
    return false;
  }
}

const UPGRADE_EVENT = 'raphyzone:show-upgrade';

// Layout renders the single UpgradeSheet and listens for this, so any call
// site (e.g. an AI request that came back 402) can prompt an upgrade without
// owning the sheet's JSX.
export function showUpgrade(reason = 'ai') {
  window.dispatchEvent(new CustomEvent(UPGRADE_EVENT, { detail: { reason } }));
}

export function onShowUpgrade(handler) {
  const listener = (e) => handler(e.detail?.reason || 'ai');
  window.addEventListener(UPGRADE_EVENT, listener);
  return () => window.removeEventListener(UPGRADE_EVENT, listener);
}

// For `catch (err)` blocks around AI calls: returns true (and opens the
// upgrade sheet) when the failure was the free-tier quota, so callers can skip
// their generic error message.
export async function handleAiQuotaError(error) {
  if (!(await isAiQuotaError(error))) return false;
  showUpgrade('ai');
  return true;
}
