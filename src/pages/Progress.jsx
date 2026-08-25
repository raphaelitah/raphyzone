import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useAthleteProfile } from '@/hooks/useAthleteProfile';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { Dumbbell, Flame, CheckCircle2, X, TrendingUp, Sparkles, Trophy, Loader2 } from 'lucide-react';
import { fmtDate, parseDate, mondayOf, fmtISO, DIFFICULTY_META } from '@/lib/fitness';
import { cn } from '@/lib/utils';
import { recalcPlanWeights } from '@/lib/weightRecalc';
import SessionDetailSheet from '@/components/SessionDetailSheet';

export default function Progress() {
  const { user } = useAuth();
  const { profile, reload } = useAthleteProfile();
  const [sessions, setSessions] = useState([]);
  const [exerciseSessions, setExerciseSessions] = useState([]);
  const [recs, setRecs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [detailSession, setDetailSession] = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!user) return;
      const [ws, es, rs] = await Promise.all([
        base44.entities.WorkoutSession.filter({ user_id: user.id }, '-created_date', 100),
        base44.entities.ExerciseSession.filter({ user_id: user.id }, '-created_date', 200),
        base44.entities.ProgressionRecommendation.filter({ user_id: user.id, status: 'pending' }),
      ]);
      if (!active) return;
      setSessions(ws);
      setExerciseSessions(es);
      setRecs(rs);
      setLoading(false);

      // Background: learn from session feedback, then refresh recommendations
      setAnalyzing(true);
      try {
        await base44.functions.invoke('learnFromSessionFeedback', {});
        const fresh = await base44.entities.ProgressionRecommendation.filter({ user_id: user.id, status: 'pending' });
        if (active) setRecs(fresh);
      } catch { /* ignore */ }
      if (active) setAnalyzing(false);
    })();
    return () => { active = false; };
  }, [user]);

  const resolveRec = async (rec, approved) => {
    await base44.entities.ProgressionRecommendation.update(rec.id, { status: approved ? 'approved' : 'rejected' });
    if (approved && profile) {
      try {
        if (rec.adjustment_type === 'pattern_baseline' && rec.pattern) {
          const cal = [...(profile.strength_calibration || [])];
          const idx = cal.findIndex((c) => c.pattern === rec.pattern);
          const entry = {
            pattern: rec.pattern,
            exercise: rec.exercise_name || (idx >= 0 ? cal[idx].exercise : rec.pattern),
            weight_kg: rec.new_weight_kg ?? rec.suggested_weight ?? (idx >= 0 ? cal[idx].weight_kg : null),
            reps: rec.reps ?? (idx >= 0 ? cal[idx].reps : 8),
          };
          if (idx >= 0) cal[idx] = entry; else cal.push(entry);
          await base44.entities.AthleteProfile.update(profile.id, { strength_calibration: cal });
        } else if (rec.adjustment_type !== 'pattern_baseline') {
          const overrides = [...(profile.exercise_weight_overrides || [])];
          const idx = overrides.findIndex((o) => o.exercise_id === rec.exercise_id);
          const entry = {
            exercise_id: rec.exercise_id,
            exercise_name: rec.exercise_name || '',
            weight_kg: rec.new_weight_kg ?? rec.suggested_weight ?? null,
            reps: rec.reps ?? null,
            updated_date: new Date().toISOString().slice(0, 10),
          };
          if (idx >= 0) overrides[idx] = entry; else overrides.push(entry);
          await base44.entities.AthleteProfile.update(profile.id, { exercise_weight_overrides: overrides });
        }
        await reload();
        recalcPlanWeights(user.id); // background: recalculate plan weights with updated calibration
      } catch { /* ignore apply error */ }
    }
    setRecs((r) => r.filter((x) => x.id !== rec.id));
  };

  if (loading) return <div className="flex items-center justify-center min-h-screen"><div className="w-8 h-8 border-4 border-muted border-t-brand rounded-full animate-spin" /></div>;

  const completed = sessions.filter((s) => s.status === 'completed');
  const sessionDates = new Set(completed.filter((s) => s.date).map((s) => s.date));
  const today = new Date();
  let streak = 0; let cursor = new Date(today);
  if (!sessionDates.has(fmtISO(cursor))) cursor = new Date(today.getTime() - 86400000);
  while (sessionDates.has(fmtISO(cursor))) { streak++; cursor = new Date(cursor.getTime() - 86400000); }
  const thisWeek = completed.filter((s) => s.date && parseDate(s.date) >= mondayOf(today)).length;

  // PRs: max weight per exercise
  const prMap = {};
  exerciseSessions.forEach((s) => {
    if (!s.exercise_id || !s.max_weight) return;
    if (!prMap[s.exercise_id] || s.max_weight > prMap[s.exercise_id].max_weight) prMap[s.exercise_id] = s;
  });
  const prs = Object.values(prMap).sort((a, b) => b.max_weight - a.max_weight);

  // working weight trend for top PR exercise
  const trendExercise = prs[0]?.exercise_id;
  const trendData = trendExercise
    ? exerciseSessions.filter((s) => s.exercise_id === trendExercise && s.max_weight).reverse().map((s) => ({ date: fmtDate(parseDate(s.created_date || s.date), 'd MMM'), weight: s.max_weight }))
    : [];

  return (
    <div className="px-5 pt-10">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight">Progress</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Your training history and records</p>
      </header>

      <div className="grid grid-cols-3 gap-2.5 mb-5">
        <Stat icon={Dumbbell} value={completed.length} label="Workouts" />
        <Stat icon={Flame} value={streak} label="Day streak" accent />
        <Stat icon={CheckCircle2} value={thisWeek} label="This week" />
      </div>

      {analyzing && (
        <div className="mb-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Analyzing your sessions…
        </div>
      )}

      {recs.length > 0 && (
        <div className="mb-5">
          <h2 className="font-semibold mb-2 flex items-center gap-1.5"><Sparkles className="h-4 w-4 text-brand" /> Recommendations</h2>
          <div className="space-y-2.5">
            {recs.map((r) => (
              <Card key={r.id} className="rounded-2xl border-brand/20 bg-brand/5 p-4">
                <div className="flex items-center justify-between mb-1">
                  <div className="min-w-0 pr-2">
                    <p className="font-medium truncate">{r.exercise_name}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{r.adjustment_type === 'pattern_baseline' ? `Pattern baseline${r.pattern ? ' · ' + r.pattern : ''}` : 'Per-exercise override'}</p>
                  </div>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-brand/10 text-brand shrink-0">{r.confidence}%</span>
                </div>
                <p className="text-xs text-muted-foreground mb-1">{r.reason}</p>
                <p className="text-sm font-medium mb-3">{r.current_weight != null ? `${r.current_weight}kg → ` : ''}<span className="text-brand">{r.new_weight_kg ?? r.suggested_weight}kg</span></p>
                <div className="flex gap-2">
                  <Button onClick={() => resolveRec(r, true)} size="sm" className="flex-1 rounded-lg bg-brand text-brand-foreground hover:bg-brand/90 h-9">Accept</Button>
                  <Button onClick={() => resolveRec(r, false)} size="sm" variant="outline" className="flex-1 rounded-lg h-9">Reject</Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {trendData.length >= 2 && (
        <Card className="rounded-2xl border-border p-4 mb-5">
          <div className="flex items-center gap-1.5 mb-3"><TrendingUp className="h-4 w-4 text-brand" /><p className="text-sm font-medium">{prs[0].exercise_name} working weight</p></div>
          <div className="h-36 -ml-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} width={32} domain={['dataMin - 5', 'dataMax + 5']} />
                <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid hsl(var(--border))', fontSize: 12 }} />
                <Line type="monotone" dataKey="weight" stroke="hsl(var(--brand))" strokeWidth={2.5} dot={{ r: 3, fill: 'hsl(var(--brand))' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      <h2 className="font-semibold mb-2 flex items-center gap-1.5"><Trophy className="h-4 w-4 text-amber-500" /> Personal records</h2>
      <div className="space-y-2 mb-6">
        {prs.length ? prs.map((p) => (
          <Card key={p.id} className="rounded-xl border-border p-3 flex items-center justify-between">
            <span className="text-sm font-medium truncate">{p.exercise_name}</span>
            <span className="text-sm font-semibold">{p.max_weight}kg</span>
          </Card>
        )) : <p className="text-sm text-muted-foreground text-center py-6">No records yet. Log a workout to start tracking.</p>}
      </div>

      <h2 className="font-semibold mb-2">Recent workouts</h2>
      <div className="space-y-2">
        {completed.slice(0, 10).map((s) => (
          <button key={s.id} onClick={() => setDetailSession(s)} className="w-full text-left">
            <Card className="rounded-xl border-border p-3 flex items-center justify-between hover:border-foreground/20 transition-colors">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{s.workout_name}</p>
                <p className="text-xs text-muted-foreground">{s.date ? fmtDate(parseDate(s.date), 'd MMM') : ''}</p>
              </div>
              {s.overall_difficulty && <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded-full', DIFFICULTY_META[s.overall_difficulty]?.color)}>{DIFFICULTY_META[s.overall_difficulty]?.label}</span>}
            </Card>
          </button>
        ))}
        {completed.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">No workouts logged yet.</p>}
      </div>

      <SessionDetailSheet session={detailSession} open={!!detailSession} onOpenChange={(o) => !o && setDetailSession(null)} />
    </div>
  );
}

function Stat({ icon: Icon, value, label, accent }) {
  return (
    <Card className={cn('rounded-2xl border-border p-3 text-center', accent && 'bg-brand text-brand-foreground border-transparent')}>
      <Icon className={cn('h-4 w-4 mx-auto mb-1', accent ? 'text-brand-foreground/80' : 'text-muted-foreground')} />
      <p className="text-xl font-semibold">{value}</p>
      <p className={cn('text-[10px]', accent ? 'text-brand-foreground/70' : 'text-muted-foreground')}>{label}</p>
    </Card>
  );
}