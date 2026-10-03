import React, { createContext, useState, useContext, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { flushAttribution } from '@/lib/attribution';

// Record that the user actually used the app (sign-in time alone goes stale for
// persistent sessions). Throttled client-side; the RPC throttles again server-side.
let lastTouch = 0;
function touchLastActive() {
  if (Date.now() - lastTouch < 15 * 60 * 1000) return;
  lastTouch = Date.now();
  supabase.rpc('touch_last_active').then(() => {}, () => {});
}

const AuthContext = createContext(/** @type {any} */ (undefined));

// Supabase's auth user has no `role` or `full_name` — role lives in the
// `profiles` table (set by the handle_new_user trigger) and full_name in
// user_metadata. Consumers across the app (admin gating, greetings) expect
// both directly on `user`, so merge them here once instead of in every page.
async function enrichUser(authUser) {
  if (!authUser) return null;
  flushAttribution();
  touchLastActive();
  const { data: profileRow } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', authUser.id)
    .maybeSingle();
  return {
    ...authUser,
    full_name: authUser.user_metadata?.full_name,
    role: profileRow?.role || 'athlete',
  };
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [appPublicSettings, setAppPublicSettings] = useState(null);

  useEffect(() => {
    checkAppState();

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setUser(await enrichUser(session?.user ?? null));
      setIsAuthenticated(!!session?.user);
    });

    const onVisible = () => {
      if (document.visibilityState === 'visible') touchLastActive();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      listener.subscription.unsubscribe();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const checkAppState = async () => {
    setIsLoadingPublicSettings(true);
    setAuthError(null);
    // No app-level public settings gate under Supabase Auth; app is always reachable.
    setAppPublicSettings(null);
    setIsLoadingPublicSettings(false);
    await checkUserAuth();
  };

  const checkUserAuth = async () => {
    try {
      setIsLoadingAuth(true);
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;

      const session = data.session;
      setUser(await enrichUser(session?.user ?? null));
      setIsAuthenticated(!!session?.user);
      setIsLoadingAuth(false);
      setAuthChecked(true);
    } catch (error) {
      console.error('User auth check failed:', error);
      setUser(null);
      setIsAuthenticated(false);
      setIsLoadingAuth(false);
      setAuthChecked(true);
      setAuthError({
        type: 'unknown',
        message: error.message || 'Failed to check authentication',
      });
    }
  };

  const refreshUser = async () => {
    const { data } = await supabase.auth.getUser();
    setUser(await enrichUser(data?.user ?? null));
  };

  const logout = async (shouldRedirect = true) => {
    await supabase.auth.signOut();
    setUser(null);
    setIsAuthenticated(false);

    if (shouldRedirect) {
      window.location.href = '/login';
    }
  };

  const navigateToLogin = () => {
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      appPublicSettings,
      authChecked,
      refreshUser,
      logout,
      navigateToLogin,
      checkUserAuth,
      checkAppState
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
