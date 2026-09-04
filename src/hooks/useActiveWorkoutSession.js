import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

// Sessions abandoned (tab closed, crash, etc.) without being explicitly ended
// shouldn't keep showing up as "resume" forever — same cutoff WorkoutExecution
// uses to mark them stale.
const STALE_MS = 6 * 60 * 60 * 1000;

// Polls for the current user's in-progress workout session so any screen can
// offer a way back into it. WorkoutExecution itself is the source of truth
// for ending/completing a session; this hook just reflects that state.
// `refreshKey` (e.g. the current route) forces an immediate refetch — e.g.
// right when the athlete navigates away from the workout screen — instead of
// waiting on the periodic poll below.
export default function useActiveWorkoutSession(user, refreshKey) {
  const [session, setSession] = useState(null);

  useEffect(() => {
    if (!user) { setSession(null); return; }
    let alive = true;
    const load = async () => {
      const { data } = await supabase
        .from('workout_sessions')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'in_progress')
        .order('created_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!alive) return;
      const stale = data && Date.now() - new Date(data.created_date).getTime() > STALE_MS;
      setSession(stale ? null : (data || null));
    };
    load();
    const id = setInterval(load, 15000);
    return () => { alive = false; clearInterval(id); };
  }, [user, refreshKey]);

  return session;
}
