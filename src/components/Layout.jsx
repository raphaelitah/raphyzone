import { useEffect, useState } from 'react';
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import BottomNav from '@/components/BottomNav';

export default function Layout() {
  const { user } = useAuth();
  const location = useLocation();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!user) { setLoading(false); return; }
      try {
        const { data: profiles } = await supabase
          .from('athlete_profiles')
          .select('*')
          .eq('user_id', user.id);
        if (active) setProfile(profiles?.[0] || null);
      } catch { /* ignore */ }
      if (active) setLoading(false);
    })();
    return () => { active = false; };
  }, [user]);

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-muted border-t-brand rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const isOnboarding = location.pathname.startsWith('/onboarding');
  if (!profile?.onboarded && !isOnboarding) {
    return <Navigate to="/onboarding" replace />;
  }
  if (profile?.onboarded && isOnboarding) {
    return <Navigate to="/" replace />;
  }

  if (isOnboarding) {
    return <Outlet />;
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-md min-h-screen pb-16">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}