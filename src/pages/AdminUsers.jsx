import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Loader2, Send } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';

const DAY_MS = 24 * 60 * 60 * 1000;

function formatLastLogin(iso) {
  if (!iso) return 'Never';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS);
  if (days < 1) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function accessLabel(u) {
  if (u.role === 'admin') return 'Admin';
  if (u.premium_override) return 'Premium (granted)';
  if (u.premium_until && new Date(u.premium_until) > new Date()) return 'Premium';
  if (u.trial_ends_at && new Date(u.trial_ends_at) > new Date()) {
    const days = Math.ceil((new Date(u.trial_ends_at).getTime() - Date.now()) / DAY_MS);
    return `Trial · ${days}d left`;
  }
  return 'Free';
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

  useEffect(() => {
    if (!user) return;
    if (user.role !== 'admin') { navigate('/'); return; }
    load();
    loadSettings();
  }, [user]);

  const load = async () => {
    setLoading(true);
    setLoadError('');
    const { data, error } = await supabase.functions.invoke('adminUsers', { body: { action: 'list' } });
    if (error) setLoadError(await invokeError(error));
    else setUsers([...data.users].sort((a, b) => (b.last_sign_in_at || '').localeCompare(a.last_sign_in_at || '')));
    setLoading(false);
  };

  const loadSettings = async () => {
    const { data } = await supabase.from('app_settings').select('key, value');
    const byKey = Object.fromEntries((data || []).map((r) => [r.key, r.value]));
    setSettings({
      trial_days: String(byKey.trial_days ?? 14),
      free_ai_actions_per_month: String(byKey.free_ai_actions_per_month ?? 1),
    });
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
      <button onClick={() => navigate('/profile')} className="flex items-center gap-1 text-sm text-muted-foreground mb-4 hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to profile
      </button>
      <h1 className="text-2xl font-semibold tracking-tight mb-1">Users</h1>
      <p className="text-sm text-muted-foreground mb-5">
        {loading ? 'Loading…' : `${users.length} users · ${totalWorkouts} completed workouts`}
      </p>

      <form onSubmit={invite} className="flex gap-2 mb-5">
        <Input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Invite by email…"
          aria-label="Invite email"
          className="rounded-xl h-11"
        />
        <Button type="submit" disabled={inviting || !email.trim()} className="rounded-xl h-11">
          {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
          Invite
        </Button>
      </form>

      <form onSubmit={saveSettings} className="rounded-xl border border-border p-3 mb-5 space-y-3" data-testid="limits-form">
        <p className="text-sm font-medium">Plans & limits</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="setting-trial-days" className="text-xs">Trial length (days)</Label>
            <Input id="setting-trial-days" type="number" min="0" value={settings.trial_days} onChange={(e) => setSettings({ ...settings, trial_days: e.target.value })} className="mt-1 h-10 rounded-lg" />
          </div>
          <div>
            <Label htmlFor="setting-ai-quota" className="text-xs">Free AI actions / month</Label>
            <Input id="setting-ai-quota" type="number" min="0" value={settings.free_ai_actions_per_month} onChange={(e) => setSettings({ ...settings, free_ai_actions_per_month: e.target.value })} className="mt-1 h-10 rounded-lg" />
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">Trial length applies to new signups. Mark which workouts are free from the workout library.</p>
        <Button type="submit" size="sm" disabled={savingSettings || settings.trial_days === ''} className="rounded-lg">{savingSettings ? 'Saving…' : 'Save limits'}</Button>
      </form>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-muted border-t-brand rounded-full animate-spin" /></div>
      ) : loadError ? (
        <p className="text-center text-sm text-rose-600 py-10">{loadError}</p>
      ) : (
        <div className="space-y-2">
          {users.map((u) => (
            <Card key={u.id} className="rounded-xl border-border p-3" data-testid="user-row">
             <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  {u.full_name || u.email}
                  {u.role === 'admin' && <span className="ml-2 text-[10px] uppercase tracking-wide text-brand">Admin</span>}
                </p>
                {u.full_name && <p className="text-xs text-muted-foreground truncate">{u.email}</p>}
                <p className="text-[11px] text-brand mt-0.5" data-testid="user-access">{accessLabel(u)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {u.confirmed ? `Last login: ${formatLastLogin(u.last_sign_in_at)}` : 'Invited · not accepted yet'}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-lg font-semibold leading-none">{u.completed_workouts}</p>
                <p className="text-[11px] text-muted-foreground mt-1">workouts</p>
              </div>
             </div>
             {u.role !== 'admin' && (
              <div className="flex gap-2 mt-2">
                <Button size="sm" variant="outline" className="h-8 rounded-lg text-xs" onClick={() => setAccess(u, { extend_trial_days: 14 }, 'Trial extended by 14 days')}>+14d trial</Button>
                <Button size="sm" variant="outline" className="h-8 rounded-lg text-xs" onClick={() => setAccess(u, { premium_override: !u.premium_override }, u.premium_override ? 'Premium revoked' : 'Premium granted')}>
                  {u.premium_override ? 'Revoke premium' : 'Grant premium'}
                </Button>
              </div>
             )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
