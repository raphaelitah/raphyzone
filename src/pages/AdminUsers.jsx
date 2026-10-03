import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Loader2, Send, Crown, ShieldCheck, Clock, User, Dumbbell, CalendarPlus, Sparkles, Timer, SlidersHorizontal, Mail, LogIn, Users } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/use-toast';

const DAY_MS = 24 * 60 * 60 * 1000;

function formatLastActive(iso) {
  if (!iso) return 'Never';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS);
  if (days < 1) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

const BADGE_STYLES = {
  admin: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
  premium: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  trial: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  free: 'bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300',
};

function accessInfo(u) {
  if (u.role === 'admin') return { tier: 'admin', label: 'Admin', Icon: ShieldCheck };
  if (u.premium_override) return { tier: 'premium', label: 'Premium', note: 'Granted', Icon: Crown };
  if (u.premium_until && new Date(u.premium_until) > new Date()) return { tier: 'premium', label: 'Premium', Icon: Crown };
  if (u.trial_ends_at && new Date(u.trial_ends_at) > new Date()) {
    const days = Math.ceil((new Date(u.trial_ends_at).getTime() - Date.now()) / DAY_MS);
    return { tier: 'trial', label: 'Trial', note: `${days}d left`, Icon: Clock };
  }
  return { tier: 'free', label: 'Free', Icon: User };
}

function AccessBadge({ info }) {
  const { tier, label, note, Icon } = info;
  return (
    <span data-testid="user-access" className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${BADGE_STYLES[tier]}`}>
      <Icon className="h-3 w-3" />
      {label}
      {note && <span className="font-normal opacity-80">· {note}</span>}
    </span>
  );
}

// Supabase's functions client puts the function's JSON body in error.context.
async function invokeError(error) {
  try { return (await error.context.json()).error || error.message; } catch { return error.message; }
}

export default function AdminUsers() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [email, setEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [settings, setSettings] = useState({ trial_days: '', free_ai_actions_per_month: '' });
  const [savingSettings, setSavingSettings] = useState(false);
  const [paywallEnabled, setPaywallEnabled] = useState(true);

  useEffect(() => {
    if (!user) return;
    if (user.role !== 'admin') { navigate('/'); return; }
    load();
    loadSettings();
    // Depend on identity, not the user object: Supabase re-emits the session
    // (new object) whenever the tab regains focus, which would reload the page.
  }, [user?.id, user?.role]);

  const load = async () => {
    setLoadError('');
    const { data, error } = await supabase.functions.invoke('adminUsers', { body: { action: 'list' } });
    if (error) setLoadError(await invokeError(error));
    else setUsers([...data.users].sort((a, b) => (b.last_active_at || '').localeCompare(a.last_active_at || '')));
    setLoading(false);
  };

  const loadSettings = async () => {
    const { data } = await supabase.from('app_settings').select('key, value');
    const byKey = Object.fromEntries((data || []).map((r) => [r.key, r.value]));
    setPaywallEnabled(byKey.paywall_enabled !== false);
    setSettings({
      trial_days: String(byKey.trial_days ?? 14),
      free_ai_actions_per_month: String(byKey.free_ai_actions_per_month ?? 1),
    });
  };

  // Master switch: when off, is_premium() is true for everyone in the database,
  // so every free-tier lock and the AI quota open at once.
  const togglePaywall = async (enabled) => {
    setPaywallEnabled(enabled);
    const { error } = await supabase.from('app_settings').upsert(
      { key: 'paywall_enabled', value: enabled, updated_date: new Date().toISOString() },
      { onConflict: 'key' },
    );
    if (error) {
      setPaywallEnabled(!enabled);
      toast({ title: 'Could not update', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: enabled ? 'Free/paid plans are on' : 'Free/paid plans are off — everyone has full access' });
  };

  const saveSettings = async (e) => {
    e.preventDefault();
    const rows = Object.entries(settings).map(([key, v]) => ({ key, value: Math.max(0, parseInt(v, 10) || 0), updated_date: new Date().toISOString() }));
    setSavingSettings(true);
    const { error } = await supabase.from('app_settings').upsert(rows, { onConflict: 'key' });
    setSavingSettings(false);
    if (error) toast({ title: 'Could not save limits', description: error.message, variant: 'destructive' });
    else toast({ title: 'Limits saved' });
  };

  const setAccess = async (u, body, message) => {
    const { error } = await supabase.functions.invoke('adminUsers', { body: { action: 'set_access', user_id: u.id, ...body } });
    if (error) {
      toast({ title: 'Update failed', description: await invokeError(error), variant: 'destructive' });
      return;
    }
    toast({ title: message, description: u.email });
    load();
  };

  const invite = async (e) => {
    e.preventDefault();
    setInviting(true);
    const { error } = await supabase.functions.invoke('adminUsers', {
      body: { action: 'invite', email, redirectTo: `${window.location.origin}/reset-password` },
    });
    setInviting(false);
    if (error) {
      toast({ title: 'Invite failed', description: await invokeError(error), variant: 'destructive' });
      return;
    }
    toast({ title: 'Invite sent', description: email.trim() });
    setEmail('');
    load();
  };

  const totalWorkouts = users.reduce((sum, u) => sum + u.completed_workouts, 0);

  return (
    <div className="px-5 pt-10 pb-8">
      <button onClick={() => navigate('/admin')} className="flex items-center gap-1 text-sm text-muted-foreground mb-4 hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to admin
      </button>
      <h1 className="text-2xl font-semibold tracking-tight mb-1">Users</h1>
      <p className="text-sm text-muted-foreground mb-5 flex items-center gap-3">
        {loading ? 'Loading…' : (
          <>
            <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" />{users.length} users</span>
            <span className="inline-flex items-center gap-1"><Dumbbell className="h-3.5 w-3.5" />{totalWorkouts} workouts</span>
          </>
        )}
      </p>

      <form onSubmit={invite} className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Invite by email…"
            aria-label="Invite email"
            className="rounded-xl h-11 pl-9"
          />
        </div>
        <Button type="submit" disabled={inviting || !email.trim()} className="rounded-xl h-11">
          {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
          Invite
        </Button>
      </form>

      <form onSubmit={saveSettings} className="rounded-2xl border border-border bg-card p-4 mb-6 space-y-4" data-testid="limits-form">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
              <Crown className="h-4 w-4" />
            </span>
            <div>
              <Label htmlFor="setting-paywall" className="text-sm font-semibold">Free / paid plans</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Off = everyone gets full access, no locks or AI limits.</p>
            </div>
          </div>
          <Switch id="setting-paywall" checked={paywallEnabled} onCheckedChange={togglePaywall} />
        </div>

        <div className="border-t border-border pt-4 space-y-3">
          <p className="text-sm font-semibold flex items-center gap-2"><SlidersHorizontal className="h-4 w-4 text-muted-foreground" />Plans &amp; limits</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="setting-trial-days" className="text-xs text-muted-foreground flex items-center gap-1"><Timer className="h-3 w-3" />Trial length (days)</Label>
              <Input id="setting-trial-days" type="number" min="0" value={settings.trial_days} onChange={(e) => setSettings({ ...settings, trial_days: e.target.value })} className="mt-1.5 h-10 rounded-lg" />
            </div>
            <div>
              <Label htmlFor="setting-ai-quota" className="text-xs text-muted-foreground flex items-center gap-1"><Sparkles className="h-3 w-3" />Free AI actions / month</Label>
              <Input id="setting-ai-quota" type="number" min="0" value={settings.free_ai_actions_per_month} onChange={(e) => setSettings({ ...settings, free_ai_actions_per_month: e.target.value })} className="mt-1.5 h-10 rounded-lg" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Trial length applies to new signups. Mark which workouts are free from the workout library.</p>
          <Button type="submit" size="sm" disabled={savingSettings || settings.trial_days === ''} className="rounded-lg">{savingSettings ? 'Saving…' : 'Save limits'}</Button>
        </div>
      </form>

      {loading && users.length === 0 ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-muted border-t-brand rounded-full animate-spin" /></div>
      ) : loadError ? (
        <p className="text-center text-sm text-rose-600 py-10">{loadError}</p>
      ) : (
        <div className="space-y-3">
          {users.map((u) => {
            const info = accessInfo(u);
            const initial = (u.full_name || u.email || '?').trim()[0].toUpperCase();
            return (
              <Card key={u.id} className="rounded-2xl border-border p-4" data-testid="user-row">
                <div className="flex items-start gap-3">
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${BADGE_STYLES[info.tier]}`}>{initial}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold truncate">{u.full_name || u.email}</p>
                      <AccessBadge info={info} />
                    </div>
                    {u.full_name && <p className="text-xs text-muted-foreground truncate">{u.email}</p>}
                    <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><Dumbbell className="h-3.5 w-3.5" />{u.completed_workouts} <span>workouts</span></span>
                      <span className="inline-flex items-center gap-1">
                        <LogIn className="h-3.5 w-3.5" />
                        {u.confirmed ? `Last active: ${formatLastActive(u.last_active_at)}` : 'Invited · not accepted'}
                      </span>
                    </div>
                  </div>
                </div>
                {u.role !== 'admin' && (
                  <div className="flex gap-2 mt-3 pt-3 border-t border-border">
                    <Button size="sm" variant="outline" className="h-8 rounded-lg text-xs" onClick={() => setAccess(u, { extend_trial_days: 14 }, 'Trial extended by 14 days')}>
                      <CalendarPlus className="h-3.5 w-3.5 mr-1.5" />+14d trial
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 rounded-lg text-xs" onClick={() => setAccess(u, { premium_override: !u.premium_override }, u.premium_override ? 'Premium revoked' : 'Premium granted')}>
                      <Crown className="h-3.5 w-3.5 mr-1.5" />
                      {u.premium_override ? 'Revoke premium' : 'Grant premium'}
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
