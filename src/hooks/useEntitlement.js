import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { canAccessWorkout, trialDaysLeft } from '@/lib/entitlements';

// The caller's free/premium status (public.my_entitlement). Until it loads —
// or if it fails — treat the user as premium so a hiccup never locks anyone
// out; the database still enforces the real rules.
export function useEntitlement() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: entitlement, isLoading: loading } = useQuery({
    queryKey: ['entitlement', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_entitlement');
      if (error) throw error;
      return data;
    },
    enabled: !!user,
    staleTime: 60 * 1000,
  });

  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ['entitlement'] }),
    [queryClient],
  );

  return {
    entitlement,
    loading,
    refresh,
    isPremium: entitlement ? !!entitlement.is_premium : true,
    trialDaysLeft: trialDaysLeft(entitlement),
    canAccess: (workout) => canAccessWorkout(entitlement, workout, user?.id),
  };
}
