import { useEffect, useState } from 'react';
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import BottomNav from '@/components/BottomNav';
import ActiveWorkoutBanner from '@/components/ActiveWorkoutBanner';
import UpgradeSheet from '@/components/UpgradeSheet';
import { useEntitlement } from '@/hooks/useEntitlement';
import { onShowUpgrade } from '@/lib/entitlements';
import { toast } from '@/components/ui/use-toast';

export default function Layout() {
  const { user } = useAuth();
  const location = useLocation();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [upgrade, setUpgrade] = useState({ open: false, reason: 'ai' });
  const { entitlement, trialDaysLeft, refresh: refreshEntitlement } = useEntitlement();

  // Back from Stripe Checkout. The webhook confirms the subscription a moment
  // after the redirect, so re-check the entitlement a few times.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('checkout');
    if (!result) return undefined;
    window.history.replaceState({}, '', window.location.pathname);
    if (result !== 'success') return undefined;
    toast({ title: 'Payment received', description: 'Unlocking Premium…' });
    const timers = [1500, 4000, 8000].map((ms) => setTimeout(refreshEntitlement, ms));
    return () => timers.forEach(clearTimeout);
  }, [refreshEntitlement]);

  useEffect(() => onShowUpgrade((reason) => {
    setUpgrade({ open: true, reason });
    refreshEntitlement();
  }), [refreshEntitlement]);

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
        <ActiveWorkoutBanner />
        {entitlement && !isOnboarding && (trialDaysLeft != null || entitlement.reason === 'free') && (
          <button
            onClick={() => setUpgrade({ open: true, reason: 'general' })}
            data-testid="plan-banner"
            className="w-full flex items-center gap-2 text-xs font-medium text-white bg-gradient-to-r from-violet-600 to-purple-500 px-5 py-2.5 text-left shadow-sm"
          >
            <Sparkles className="h-3.5 w-3.5 shrink-0 opacity-90" />
            {trialDaysLeft != null
              ? `Premium trial · ${trialDaysLeft} ${trialDaysLeft === 1 ? 'day' : 'days'} left`
              : `Free plan · ${entitlement.ai_remaining} AI ${entitlement.ai_remaining === 1 ? 'action' : 'actions'} left this month`}
          </button>
        )}
        <Outlet />
      </main>
      <UpgradeSheet open={upgrade.open} onOpenChange={(open) => setUpgrade((u) => ({ ...u, open }))} reason={upgrade.reason} />
      <BottomNav />
    </div>
  );
}