import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Loader2, Send } from 'lucide-react';
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

  useEffect(() => {
    if (!user) return;
    if (user.role !== 'admin') { navigate('/'); return; }
    load();
  }, [user]);

  const load = async () => {
    setLoading(true);
    setLoadError('');
    const { data, error } = await supabase.functions.invoke('adminUsers', { body: { action: 'list' } });
    if (error) setLoadError(await invokeError(error));
    else setUsers([...data.users].sort((a, b) => (b.last_sign_in_at || '').localeCompare(a.last_sign_in_at || '')));
    setLoading(false);
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

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-muted border-t-brand rounded-full animate-spin" /></div>
      ) : loadError ? (
        <p className="text-center text-sm text-rose-600 py-10">{loadError}</p>
      ) : (
        <div className="space-y-2">
          {users.map((u) => (
            <Card key={u.id} className="rounded-xl border-border p-3 flex items-center justify-between gap-3" data-testid="user-row">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  {u.full_name || u.email}
                  {u.role === 'admin' && <span className="ml-2 text-[10px] uppercase tracking-wide text-brand">Admin</span>}
                </p>
                {u.full_name && <p className="text-xs text-muted-foreground truncate">{u.email}</p>}
                <p className="text-xs text-muted-foreground mt-0.5">
                  {u.confirmed ? `Last login: ${formatLastLogin(u.last_sign_in_at)}` : 'Invited · not accepted yet'}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-lg font-semibold leading-none">{u.completed_workouts}</p>
                <p className="text-[11px] text-muted-foreground mt-1">workouts</p>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
