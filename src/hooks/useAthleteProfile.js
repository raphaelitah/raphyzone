import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';

export function useAthleteProfile() {
  const { user } = useAuth();

  const { data: profile, isLoading: loading, refetch } = useQuery({
    queryKey: ['athleteProfile', user?.id],
    queryFn: async () => {
      const { data: profiles } = await supabase
        .from('athlete_profiles')
        .select('*')
        .eq('user_id', user.id);
      return profiles?.[0] || null;
    },
    enabled: !!user,
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  const reload = useCallback(async () => {
    const res = await refetch();
    return res.data;
  }, [refetch]);

  return { profile, loading, reload };
}