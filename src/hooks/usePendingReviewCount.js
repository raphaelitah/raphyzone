import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';

// Number of user-submitted exercises + workouts awaiting admin review.
// Admin-only; returns 0 for everyone else. Refreshes on navigation, tab focus
// and every minute.
export function usePendingReviewCount() {
  const { user } = useAuth();
  const location = useLocation();
  const isAdmin = user?.role === 'admin';
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!isAdmin) { setCount(0); return; }
    try {
      const [ex, wk] = await Promise.all([
        supabase.from('exercises').select('id', { count: 'exact', head: true }).eq('submission_status', 'pending'),
        supabase.from('workouts').select('id', { count: 'exact', head: true }).eq('ownership_type', 'personal').eq('status', 'pending'),
      ]);
      setCount((ex.count || 0) + (wk.count || 0));
    } catch { /* ignore */ }
  }, [isAdmin]);

  useEffect(() => { refresh(); }, [refresh, location.pathname]);

  useEffect(() => {
    if (!isAdmin) return undefined;
    const id = setInterval(refresh, 60000);
    window.addEventListener('focus', refresh);
    return () => { clearInterval(id); window.removeEventListener('focus', refresh); };
  }, [isAdmin, refresh]);

  return count;
}
