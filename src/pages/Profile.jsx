import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { useAthleteProfile } from '@/hooks/useAthleteProfile';
import { supabase } from '@/lib/supabaseClient';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import ProfileEditor from '@/components/ProfileEditor';
import ExerciseNotifications from '@/components/ExerciseNotifications';
import ProfileCalibrationCard from '@/components/ProfileCalibrationCard';
import { getProfileCompleteness } from '@/lib/profileGaps';
import { LogOut, Dumbbell, Target, Calendar, Settings, ChevronRight, Sparkles, Pencil, Gauge, ShieldCheck, Tags, Send, Activity } from 'lucide-react';

export default function Profile() {
  const { user, logout, refreshUser } = useAuth();
  const { profile, loading, reload } = useAthleteProfile();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);

  const toggleAutoApprove = async (checked) => {
    await supabase.from('athlete_profiles').update({ auto_approve_plans: checked }).eq('id', profile.id);
    reload();
  };

  const openNameEditor = () => {
    setNameInput(user?.full_name || '');
    setEditingName(true);
  };

  const saveName = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed === user?.full_name) { setEditingName(false); return; }
    setSavingName(true);
    const { error } = await supabase.auth.updateUser({ data: { full_name: trimmed } });
    setSavingName(false);
    if (error) return;
    await refreshUser();
    setEditingName(false);
  };

  if (loading) return <div className="flex items-center justify-center min-h-screen"><div className="w-8 h-8 border-4 border-muted border-t-brand rounded-full animate-spin" /></div>;

  const isAdmin = user?.role === 'admin';
  const { done: completeDone, total: completeTotal } = getProfileCompleteness(profile);
  const completePct = Math.round((completeDone / completeTotal) * 100);

  return (
    <div className="px-5 pt-10 pb-0">
      <header className="mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-14 w-14 rounded-full bg-brand flex items-center justify-center text-brand-foreground font-semibold text-lg">{(user?.full_name || 'A')[0].toUpperCase()}</div>
            <div>
              <button onClick={openNameEditor} className="flex items-center gap-1.5 text-xl font-semibold tracking-tight">
                {user?.full_name || 'Athlete'}
                <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
            </div>
          </div>
          <ExerciseNotifications />
        </div>
      </header>

      <Dialog open={editingName} onOpenChange={setEditingName}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle>Edit name</DialogTitle>
          </DialogHeader>
          <Input
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder="Your name"
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') saveName(); }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingName(false)}>Cancel</Button>
            <Button onClick={saveName} disabled={savingName || !nameInput.trim()}>{savingName ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Training profile</h2>
        <button onClick={() => setEditing(true)} className="flex items-center gap-1 text-xs font-medium text-brand"><Pencil className="h-3.5 w-3.5" /> Edit</button>
      </div>
      {completePct < 100 && (
        <div className="flex items-center gap-2 mb-3">
          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${completePct}%` }} />
          </div>
          <span className="text-[11px] text-muted-foreground whitespace-nowrap">{completeDone}/{completeTotal} complete</span>
        </div>
      )}
      <Card className="rounded-2xl border-border p-4 mb-5 space-y-3">
        <Row icon={Target} label="Goal" value={label(profile?.goal)} />
        <Row icon={Dumbbell} label="Experience" value={label(profile?.experience_level)} />
        <Row icon={Calendar} label="Training days" value={profile?.training_days?.length ? `${profile.training_days.length} days/week` : '—'} />
        <Row icon={Sparkles} label="Strength known" value={profile?.strength_known ? 'Yes' : 'Estimated'} />
        <div>
          <p className="text-xs text-muted-foreground mb-1.5">Equipment</p>
          <div className="flex flex-wrap gap-1.5">
            {profile?.equipment_profile === 'full_gym'
              ? <span className="text-xs px-2.5 py-1 rounded-full bg-brand/10 text-brand font-medium">Full gym</span>
              : (profile?.available_equipment || []).length
                ? (profile.available_equipment).map((e) => <span key={e} className="text-xs px-2.5 py-1 rounded-full bg-brand/10 text-brand font-medium">{e}</span>)
                : <span className="text-xs text-muted-foreground">—</span>}
          </div>
        </div>
      </Card>

      <ProfileCalibrationCard profile={profile} />

      <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Settings</h2>
      <Card className="rounded-2xl border-border p-4 mb-5">
        <div className="flex items-center justify-between">
          <div className="flex-1 pr-3">
            <p className="text-sm font-medium flex items-center gap-1.5"><Settings className="h-4 w-4 text-muted-foreground" /> Auto-approve AI plans</p>
            <p className="text-xs text-muted-foreground mt-0.5">Let the AI publish your weekly plan without manual approval.</p>
          </div>
          <Switch checked={!!profile?.auto_approve_plans} onCheckedChange={toggleAutoApprove} />
        </div>
      </Card>

      <div className="space-y-2">
        <Button onClick={() => navigate('/plan')} variant="outline" className="w-full rounded-xl h-12 justify-between font-medium">
          <span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-brand" /> Rebuild Weekly Plan</span>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button onClick={() => navigate('/calibration')} variant="outline" className="w-full rounded-xl h-12 justify-between font-medium">
          <span className="flex items-center gap-2"><Gauge className="h-4 w-4 text-brand" /> Recalibrate Strength</span>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button onClick={() => navigate('/my-submissions')} variant="outline" className="w-full rounded-xl h-12 justify-between font-medium">
          <span className="flex items-center gap-2"><Send className="h-4 w-4 text-brand" /> My Submissions</span>
          <ChevronRight className="h-4 w-4" />
        </Button>
        {isAdmin && (
          <Button onClick={() => navigate('/admin-review')} variant="outline" className="w-full rounded-xl h-12 justify-between font-medium">
            <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-brand" /> UGC For Review</span>
            <ChevronRight className="h-4 w-4" />
          </Button>
        )}
        {isAdmin && (
          <Button onClick={() => navigate('/admin-taxonomy')} variant="outline" className="w-full rounded-xl h-12 justify-between font-medium">
            <span className="flex items-center gap-2"><Tags className="h-4 w-4 text-brand" /> Taxonomy Management</span>
            <ChevronRight className="h-4 w-4" />
          </Button>
        )}
        {isAdmin && (
          <Button onClick={() => navigate('/admin-alerts')} variant="outline" className="w-full rounded-xl h-12 justify-between font-medium">
            <span className="flex items-center gap-2"><Activity className="h-4 w-4 text-brand" /> LLM Health</span>
            <ChevronRight className="h-4 w-4" />
          </Button>
        )}
        <Button onClick={() => logout('/login')} variant="ghost" className="w-full rounded-xl h-12 text-rose-600 hover:text-rose-700 hover:bg-rose-50">
          <LogOut className="h-4 w-4 mr-2" /> Sign out
        </Button>
      </div>

      <ProfileEditor profile={profile} open={editing} onOpenChange={setEditing} onSaved={reload} />
    </div>
  );
}

function Row({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground flex items-center gap-2"><Icon className="h-4 w-4" /> {label}</span>
      <span className="text-sm font-medium capitalize">{value}</span>
    </div>
  );
}

function label(v) {
  return v ? v.replace('_', ' ') : '—';
}