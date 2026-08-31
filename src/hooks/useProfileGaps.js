import { useCallback, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAthleteProfile } from '@/hooks/useAthleteProfile';
import { PROFILE_GAPS } from '@/lib/profileGaps';

function storageKey(userId) {
  return `profileGapsDismissed:${userId}`;
}

function readDismissed(userId) {
  try {
    return new Set(JSON.parse(localStorage.getItem(storageKey(userId)) || '[]'));
  } catch {
    return new Set();
  }
}

function addDismissed(userId, id) {
  const set = readDismissed(userId);
  set.add(id);
  try { localStorage.setItem(storageKey(userId), JSON.stringify([...set])); } catch { /* ignore */ }
}

/**
 * Surfaces at most one missing-profile-field prompt for a given screen ("location"),
 * e.g. useProfileGaps('library') or useProfileGaps('workout-search', { activity: 'Running' }).
 */
export function useProfileGaps(location, context = {}) {
  const { profile, reload } = useAthleteProfile();
  const [dismissedVersion, setDismissedVersion] = useState(0);
  const userId = profile?.user_id;
  const activityKey = context.activity;
  const dayKey = context.day;

  const idFor = (g) => (g.key === 'desired_activity' && activityKey ? `${g.key}:${activityKey.toLowerCase()}:${dayKey || ''}` : g.key);

  const gap = useMemo(() => {
    if (!profile) return null;
    const dismissed = userId ? readDismissed(userId) : new Set();
    return PROFILE_GAPS.find((g) => {
      if (!g.locations.includes(location)) return false;
      if (dismissed.has(idFor(g))) return false;
      return g.isMissing(profile, context);
    }) || null;
  }, [profile, userId, location, activityKey, dayKey, dismissedVersion]);

  const gapId = gap ? idFor(gap) : null;

  const answer = useCallback(async (value) => {
    if (!gap || !profile) return;
    const patch = gap.buildPatch(value, profile, context);
    if (patch) {
      await supabase.from('athlete_profiles').update(patch).eq('id', profile.id);
      await reload();
    }
    if (userId && gapId) addDismissed(userId, gapId);
    setDismissedVersion((v) => v + 1);
  }, [gap, gapId, profile, context, reload, userId]);

  const dismiss = useCallback(() => {
    if (userId && gapId) addDismissed(userId, gapId);
    setDismissedVersion((v) => v + 1);
  }, [userId, gapId]);

  return { gap, profile, context, answer, dismiss };
}
