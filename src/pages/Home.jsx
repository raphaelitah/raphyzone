import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { useAthleteProfile } from '@/hooks/useAthleteProfile';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Play, Calendar, CalendarClock, Flame, Trophy, Sparkles, ChevronRight, CheckCircle2, Dumbbell, Clock, Route, Moon, RefreshCw, ArrowLeftRight, Loader2, Plus } from 'lucide-react';
import { mondayOf, fmtISO, fmtDate, parseDate, sameDay } from '@/lib/fitness';
import { formatWeight } from '@/lib/units';
import { buildBlocksByWorkout, buildBlockExercisesByBlock, countWorkoutExercises, roundToFive } from '@/lib/workoutStructure';
import { cn } from '@/lib/utils';
import WorkoutDetailSheet from '@/components/WorkoutDetailSheet';
import SessionDetailSheet from '@/components/SessionDetailSheet';
import SwapShortlistSheet from '@/components/SwapShortlistSheet';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from '@/components/ui/alert-dialog';
import ReorderArrows from '@/components/ReorderArrows';
import RestToWorkoutChoiceSheet from '@/components/RestToWorkoutChoiceSheet';
import WorkoutSearchSheet from '@/components/WorkoutSearchSheet';
import ProfileGapPrompt from '@/components/ProfileGapPrompt';
import { useProfileGaps } from '@/hooks/useProfileGaps';

const REGENERATING_MESSAGES = [
  'Analyzing history…',
  'Balancing volume…',
  'Sequencing days…',
  'Applying overload…',
  'Checking recovery…',
  'Matching equipment…',
  'Fine-tuning sets…',
  'Optimizing split…',
];

function useRotatingLabel(active, messages, intervalMs = 1400) {
  const [text, setText] = useState(messages[0]);
  useEffect(() => {
    if (!active) return;
    setText(messages[Math.floor(Math.random() * messages.length)]);
    const interval = setInterval(() => {
      setText((prev) => {
        const options = messages.filter((m) => m !== prev);
        return options[Math.floor(Math.random() * options.length)];
      });
    }, intervalMs);
    return () => clearInterval(interval);
  }, [active]);
  return text;
}

export default function Home() {
  const { user } = useAuth();
  const { profile } = useAthleteProfile();
  const unit = profile?.weight_unit || 'kg';
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [prExercise, setPrExercise] = useState(null);
  const [pendingRec, setPendingRec] = useState(null);
  const [workouts, setWorkouts] = useState({});
  const [blocksByWorkout, setBlocksByWorkout] = useState({});
  const [blockExercisesByBlock, setBlockExercisesByBlock] = useState({});
  const [selectedWorkout, setSelectedWorkout] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [selectMode, setSelectMode] = useState(false);
  const [suggestFor, setSuggestFor] = useState(null);
  const [regenerating, setRegenerating] = useState(false);
  const regeneratingLabel = useRotatingLabel(regenerating, REGENERATING_MESSAGES);
  const [swapFor, setSwapFor] = useState(null);
  const [swapLoading, setSwapLoading] = useState(false);
  const [swapAlternatives, setSwapAlternatives] = useState([]);
  const [sessionDetail, setSessionDetail] = useState(null);
  const [detailAlt, setDetailAlt] = useState(null);
  const [restConfirmFor, setRestConfirmFor] = useState(null);
  const [restChoiceFor, setRestChoiceFor] = useState(null);
  const [restAiFor, setRestAiFor] = useState(null);
  const [restAiLoading, setRestAiLoading] = useState(false);
  const [restAiAlternatives, setRestAiAlternatives] = useState([]);
  const [searchFor, setSearchFor] = useState(null);
  const { gap: profileGap, profile: gapProfile, answer: answerGap, dismiss: dismissGap } = useProfileGaps('home');

  useEffect(() => {
    let active = true;
    (async () => {
      if (!user) return;
      const monday = fmtISO(mondayOf(new Date()));
      // Phase 1: fetch plan, sessions, and recommendations in parallel
      const [{ data: plans }, { data: allSessions }, { data: recs }] = await Promise.all([
        supabase.from('weekly_plans').select('*').eq('user_id', user.id).eq('week_start_date', monday),
        supabase.from('workout_sessions').select('*').eq('user_id', user.id).order('created_date', { ascending: false }).limit(100),
        supabase.from('progression_recommendations').select('*').eq('user_id', user.id).eq('status', 'pending'),
      ]);
      if (!active) return;
      const currentPlan = (plans || []).find((p) => p.status === 'approved') || plans?.[0] || null;
      setPlan(currentPlan);
      setSessions(allSessions || []);
      setPendingRec(recs?.[0] || null);
      if (allSessions?.length) {
        const best = allSessions.reduce((acc, s) => (s.max_weight && (!acc || s.max_weight > acc.max_weight) ? s : acc), null);
        if (best) setPrExercise(best);
      }
      // Render immediately with plan + sessions (progressive reveal)
      setLoading(false);

      // Phase 2: fetch only the workouts referenced in the plan (scoped, not all 108)
      if (currentPlan?.workouts?.length) {
        const assignedIds = new Set(currentPlan.workouts.map((w) => w.workout_id).filter(Boolean));
        const suggestIds = new Set(currentPlan.workouts.flatMap((w) => w.suggested_workout_ids || []));
        const allIds = [...new Set([...assignedIds, ...suggestIds])];
        let ws = [];
        if (allIds.length) {
          const { data } = await supabase.from('workouts').select('*').in('id', allIds);
          ws = data || [];
          if (active) setWorkouts(Object.fromEntries(ws.map((w) => [w.id, w])));
        }
        // Phase 3: fetch blocks + block exercises using workout SOURCE CODES (e.g. W00001), not entity UUIDs
        const planWorkoutCodes = [...new Set(ws.map((w) => w.workout_id).filter(Boolean))];
        if (planWorkoutCodes.length) {
          const { data: blocksData } = await supabase.from('workout_blocks').select('*').in('workout_id', planWorkoutCodes);
          const blocks = blocksData || [];
          const blockIds = blocks.map((b) => b.block_id);
          const blockExs = blockIds.length
            ? (await supabase.from('block_exercises').select('*').in('block_id', blockIds)).data || []
            : [];
          if (active) {
            setBlocksByWorkout(buildBlocksByWorkout(blocks));
            setBlockExercisesByBlock(buildBlockExercisesByBlock(blockExs));
          }
        }
      }
    })();
    return () => { active = false; };
  }, [user]);

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen"><div className="w-8 h-8 border-4 border-muted border-t-brand rounded-full animate-spin" /></div>;
  }

  const today = new Date();
  const todayISO = fmtISO(today);
  const weekSessions = sessions.filter((s) => s.date && mondayOf(parseDate(s.date))?.getTime() === mondayOf(today).getTime() && s.status === 'completed');

  const sessionDates = new Set(sessions.filter((s) => s.status === 'completed' && s.date).map((s) => s.date));
  let streak = 0;
  let cursor = new Date(today);
  if (!sessionDates.has(fmtISO(cursor))) cursor = new Date(today.getTime() - 86400000);
  while (sessionDates.has(fmtISO(cursor))) { streak++; cursor = new Date(cursor.getTime() - 86400000); }

  const todaySlot = plan?.workouts?.find((w) => w.date === todayISO);
  const todayWorkout = todaySlot?.workout_id ? workouts[todaySlot.workout_id] : null;
  const todayDone = !!todaySlot?.workout_id && weekSessions.some((s) => s.workout_id === todaySlot.workout_id);
  const nextWorkoutSlot = plan?.workouts?.find((w) => w.date > todayISO && w.workout_id && !weekSessions.some((s) => s.workout_id === w.workout_id));

  const countedSlots = plan?.workouts?.filter((w) => w.workout_id || w.slot_type === 'activity') || [];
  const totalCount = countedSlots.length;
  const completedCount = countedSlots.filter((s) => s.workout_id && weekSessions.some((sess) => sess.workout_id === s.workout_id)).length;

  const suggestAlternatives = (() => {
    if (!suggestFor) return [];
    return (suggestFor.suggested_workout_ids || [])
      .map((id) => workouts[id])
      .filter(Boolean)
      .map((w) => ({
        workout_id: w.id,
        workout_name: w.name,
        format_label: w.format_label || w.workout_format || '',
        est_duration_min: w.est_duration_min || w.duration_minutes || null,
        reason: 'Optional guided conditioning session',
      }));
  })();

  const regenerate = async () => {
    if (!plan) return;
    setRegenerating(true);
    try {
      const res = await supabase.functions.invoke('generateWeeklyPlan', {
        body: {
          week_start_date: plan.week_start_date,
          context_answer: plan.context_answer || '',
          context_notes: plan.context_notes || '',
          regenerate: true,
        },
      });
      if (res.error) throw res.error;
      setPlan(res.data.plan);
      const ids = [...new Set(res.data.plan.workouts.flatMap((w) => [w.workout_id, ...(w.suggested_workout_ids || [])]).filter(Boolean))];
      if (ids.length) {
        const { data: ws } = await supabase.from('workouts').select('*').in('id', ids);
        setWorkouts(Object.fromEntries((ws || []).map((w) => [w.id, w])));
      }
      try {
        const wres = await supabase.functions.invoke('assignWorkoutWeights', { body: { weekly_plan_id: res.data.plan.id } });
        if (wres.data?.plan) setPlan(wres.data.plan);
      } catch {}
    } catch { /* ignore */ }
    setRegenerating(false);
  };

  const findAlternative = async (slot) => {
    setSwapFor(slot);
    setSwapLoading(true); setSwapAlternatives([]);
    try {
      const otherDays = (plan.workouts || []).filter((w) => w.workout_id && w.day !== slot.day).map((w) => `${w.day}: ${w.workout_name}`).join('; ');
      const res = await supabase.functions.invoke('swapWorkout', {
        body: {
          current_workout_id: slot.workout_id,
          day: slot.day,
          focus: slot.focus,
          slot_type: slot.slot_type,
          activity: slot.activity,
          other_days: otherDays,
        },
      });
      if (res.error) throw res.error;
      setSwapAlternatives(res.data.alternatives || []);
    } catch { /* ignore */ }
    setSwapLoading(false);
  };

  const applySwapToSlot = async (alt, slot) => {
    if (!slot) return;
    setSwapLoading(true);
    try {
      const res = await supabase.functions.invoke('applySwap', {
        body: {
          weekly_plan_id: plan.id,
          day: slot.day,
          old_workout_id: slot.workout_id,
          new_workout_id: alt.workout_id,
          reason: alt.reason,
        },
      });
      if (res.error) throw res.error;
      setPlan(res.data.plan);
      const ids = [...new Set(res.data.plan.workouts.flatMap((w) => [w.workout_id, ...(w.suggested_workout_ids || [])]).filter(Boolean))];
      if (ids.length) {
        const { data: ws } = await supabase.from('workouts').select('*').in('id', ids);
        setWorkouts(Object.fromEntries((ws || []).map((w) => [w.id, w])));
        const codes = [...new Set((ws || []).map((w) => w.workout_id).filter(Boolean))];
        if (codes.length) {
          const { data: blocksData } = await supabase.from('workout_blocks').select('*').in('workout_id', codes);
          const blocks = blocksData || [];
          const blockIds = blocks.map((b) => b.block_id);
          const blockExs = blockIds.length
            ? (await supabase.from('block_exercises').select('*').in('block_id', blockIds)).data || []
            : [];
          setBlocksByWorkout((prev) => ({ ...prev, ...buildBlocksByWorkout(blocks) }));
          setBlockExercisesByBlock((prev) => ({ ...prev, ...buildBlockExercisesByBlock(blockExs) }));
        }
      }
    } catch { /* ignore */ }
    setSwapLoading(false);
    setSwapFor(null); setSwapAlternatives([]);
  };

  const pickAlternative = (alt) => applySwapToSlot(alt, swapFor);

  const assignWorkoutToSlot = async (workoutId, workoutName, reason, slot) => {
    if (!slot || !plan) return;
    const updated = plan.workouts.map((w) => w.day === slot.day
      ? { ...w, workout_id: workoutId, workout_name: workoutName, reason: reason || 'Guided session', locked: false }
      : w);
    setPlan({ ...plan, workouts: updated });
    try {
      await supabase.from('weekly_plans').update({ workouts: updated }).eq('id', plan.id);
    } catch { /* ignore */ }
    if (!workouts[workoutId]) {
      try {
        const { data: wo } = await supabase.from('workouts').select('*').eq('id', workoutId).single();
        if (wo) await ensureWorkoutLoaded(wo);
      } catch { /* ignore */ }
    }
  };

  const persistPlan = async (updated) => {
    setPlan({ ...plan, workouts: updated });
    try { await supabase.from('weekly_plans').update({ workouts: updated }).eq('id', plan.id); } catch { /* ignore */ }
  };

  const moveSlot = async (index, dir) => {
    if (!plan?.workouts) return;
    const newIndex = index + dir;
    if (newIndex < 0 || newIndex >= plan.workouts.length) return;
    const updated = [...plan.workouts];
    const a = updated[index];
    const b = updated[newIndex];
    updated[index] = { ...b, day: a.day, date: a.date };
    updated[newIndex] = { ...a, day: b.day, date: b.date };
    await persistPlan(updated);
  };

  const makeRest = async (slot) => {
    if (!slot) return;
    const updated = plan.workouts.map((w) => w.day === slot.day ? {
      ...w,
      slot_type: 'rest',
      workout_id: undefined,
      workout_name: undefined,
      focus: undefined,
      modality: undefined,
      reason: undefined,
      activity: undefined,
      exercise_weights: undefined,
      suggested_workout_ids: undefined,
      locked: false,
    } : w);
    await persistPlan(updated);
    setRestConfirmFor(null);
  };

  const ensureWorkoutLoaded = async (wo) => {
    if (!wo || workouts[wo.id]) return;
    setWorkouts((prev) => ({ ...prev, [wo.id]: wo }));
    if (wo.workout_id) {
      try {
        const { data: blocksData } = await supabase.from('workout_blocks').select('*').eq('workout_id', wo.workout_id);
        const blocks = blocksData || [];
        const blockIds = blocks.map((b) => b.block_id);
        const blockExs = blockIds.length ? (await supabase.from('block_exercises').select('*').in('block_id', blockIds)).data || [] : [];
        setBlocksByWorkout((prev) => ({ ...prev, ...buildBlocksByWorkout(blocks) }));
        setBlockExercisesByBlock((prev) => ({ ...prev, ...buildBlockExercisesByBlock(blockExs) }));
      } catch { /* ignore */ }
    }
  };

  const assignWorkoutToRestDay = async (workoutId, workoutName, reason, slot) => {
    if (!slot || !plan) return;
    const updated = plan.workouts.map((w) => w.day === slot.day ? {
      ...w,
      slot_type: 'train',
      workout_id: workoutId,
      workout_name: workoutName,
      reason: reason || 'Your pick',
      locked: false,
    } : w);
    await persistPlan(updated);
    if (!workouts[workoutId]) {
      try {
        const { data: wo } = await supabase.from('workouts').select('*').eq('id', workoutId).single();
        if (wo) await ensureWorkoutLoaded(wo);
      } catch { /* ignore */ }
    }
  };

  const aiSuggestForRest = async (slot) => {
    if (!slot) return;
    setRestChoiceFor(null);
    setRestAiFor(slot);
    setRestAiLoading(true);
    setRestAiAlternatives([]);
    try {
      const otherDays = (plan.workouts || []).filter((w) => w.workout_id && w.day !== slot.day).map((w) => `${w.day}: ${w.workout_name}`).join('; ');
      const res = await supabase.functions.invoke('swapWorkout', { body: { day: slot.day, slot_type: 'train', other_days: otherDays } });
      if (res.error) throw res.error;
      setRestAiAlternatives(res.data.alternatives || []);
    } catch { /* ignore */ }
    setRestAiLoading(false);
  };

  const pickForRestDay = async (alt, slot) => {
    if (!slot || !alt) return;
    setRestAiFor(null);
    setRestAiAlternatives([]);
    await assignWorkoutToRestDay(alt.workout_id, alt.workout_name, alt.reason, slot);
    try {
      const wo = workouts[alt.workout_id] || (await supabase.from('workouts').select('*').eq('id', alt.workout_id).single()).data;
      await ensureWorkoutLoaded(wo);
    } catch { /* ignore */ }
  };

  const pickFromSearch = async (wo, slot) => {
    if (!slot || !wo) return;
    setSearchFor(null);
    await assignWorkoutToRestDay(wo.id, wo.name, 'Your pick', slot);
    await ensureWorkoutLoaded(wo);
  };

  const viewSuggestionDetails = (alt) => {
    const slot = suggestFor;
    const wo = workouts[alt.workout_id];
    if (!wo || !slot) return;
    setSuggestFor(null);
    setSelectedWorkout(wo);
    setSelectedSlot(slot);
    setSelectMode(true);
    setDetailAlt(null);
  };

  const viewSwapDetails = async (alt) => {
    const slot = swapFor;
    if (!slot) return;
    setSwapFor(null); setSwapAlternatives([]);
    setDetailAlt(alt);
    try {
      const { data: wo, error } = await supabase.from('workouts').select('*').eq('id', alt.workout_id).single();
      if (error) throw error;
      setSelectedWorkout(wo);
      setSelectedSlot(slot);
      setSelectMode(true);
    } catch { setDetailAlt(null); }
  };

  const selectFromDetail = () => {
    if (!selectedSlot || !selectedWorkout) return;
    if (detailAlt) {
      applySwapToSlot(detailAlt, selectedSlot);
    } else {
      assignWorkoutToSlot(selectedWorkout.id, selectedWorkout.name, 'Guided session', selectedSlot);
    }
    setSelectedWorkout(null); setSelectedSlot(null); setSelectMode(false); setDetailAlt(null);
  };

  return (
    <div className="px-5 pt-10">
      <header className="mb-6">
        <p className="text-sm text-muted-foreground">{fmtDate(today, 'EEEE, d MMMM')}</p>
        <h1 className="text-2xl font-semibold tracking-tight mt-0.5">Let's train, {user?.full_name?.split(' ')[0] || 'athlete'}.</h1>
      </header>

      {profileGap && (
        <ProfileGapPrompt gap={profileGap} profile={gapProfile} onAnswer={answerGap} onDismiss={dismissGap} className="mb-5" />
      )}

      {!plan && (
        <Card className="rounded-2xl border border-brand/20 bg-gradient-to-br from-brand/5 to-transparent p-5 mb-5">
          <Sparkles className="h-6 w-6 text-brand mb-2" />
          <h2 className="font-semibold text-lg">Build your week</h2>
          <p className="text-sm text-muted-foreground mt-1 mb-4">No plan yet. Let the AI build your next training week from the workout library.</p>
          <Button onClick={() => navigate(profile?.calibrated ? '/plan' : '/calibration')} className="w-full rounded-xl h-11 bg-brand text-brand-foreground hover:bg-brand/90">Build weekly plan</Button>
        </Card>
      )}

      {todaySlot?.workout_id && !todayDone && (
        <Card className="rounded-2xl overflow-hidden mb-5 border-border">
          <div className="bg-brand p-5 text-brand-foreground">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wide opacity-80">{todaySlot.slot_type === 'activity' ? "Today's activity" : "Today's workout"}</span>
              <span className="text-xs opacity-80">{roundToFive(todayWorkout?.est_duration_min) || '~45'} min</span>
            </div>
            <h2 className="text-xl font-semibold mt-1.5">{todayWorkout?.name || todaySlot.workout_name}</h2>
            {todaySlot.slot_type === 'activity' && (
              <p className="text-xs opacity-80 mt-1 capitalize flex items-center gap-1"><Route className="h-3 w-3" /> {todaySlot.activity}</p>
            )}
            {todayWorkout && (
              <p className="text-xs opacity-80 mt-1">
                {todaySlot.modality ? todaySlot.modality + ' · ' : ''}{countWorkoutExercises(todayWorkout, blocksByWorkout, blockExercisesByBlock)} exercises · {todayWorkout.split || todayWorkout.goal}
              </p>
            )}
          </div>
          <div className="p-4">
            {todaySlot.reason && <p className="text-xs text-muted-foreground mb-3 leading-relaxed">{todaySlot.reason}</p>}
            <Button asChild className="w-full rounded-xl h-12 bg-brand text-brand-foreground hover:bg-brand/90">
              <Link to={`/workout/${todaySlot.workout_id}`}><Play className="h-4 w-4 mr-2" /> Start workout</Link>
            </Button>
          </div>
        </Card>
      )}

      {todaySlot && todaySlot.slot_type === 'activity' && !todaySlot.workout_id && (
        <Card className="rounded-2xl border border-amber-200 bg-amber-50 p-5 mb-5">
          <div className="flex items-center gap-2 text-amber-700">
            <Route className="h-5 w-5" />
            <span className="font-medium">Today's activity</span>
          </div>
          <p className="text-lg font-semibold mt-1 capitalize">{todaySlot.activity || 'Activity'}</p>
          {(todaySlot.suggested_workout_ids?.length > 0) && (
            <button onClick={() => setSuggestFor(todaySlot)} className="mt-3 text-xs font-medium text-amber-700 underline">
              View {todaySlot.suggested_workout_ids.length} guided suggestions
            </button>
          )}
        </Card>
      )}

      {todaySlot && todaySlot.slot_type === 'rest' && (
        <Card className="rounded-2xl border-border bg-muted/40 p-5 mb-5">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Moon className="h-5 w-5" />
            <span className="font-medium">Rest day</span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">Recover and recharge. Back at it tomorrow.</p>
        </Card>
      )}

      {todaySlot?.workout_id && todayDone && (
        <Card className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 mb-5">
          <div className="flex items-center gap-2 text-emerald-700">
            <CheckCircle2 className="h-5 w-5" />
            <span className="font-medium">Today's workout complete</span>
          </div>
          <p className="text-sm text-emerald-700/80 mt-1">{todayWorkout?.name || todaySlot.workout_name} — nice work.</p>
          <button onClick={() => setSessionDetail(weekSessions.find((s) => s.workout_id === todaySlot.workout_id) || null)} className="mt-2 text-xs font-medium text-emerald-700 underline">View results</button>
          {nextWorkoutSlot && (
            <div className="mt-4 pt-4 border-t border-emerald-200">
              <p className="text-xs text-emerald-700/70 mb-1">Next up · {fmtDate(parseDate(nextWorkoutSlot.date))}</p>
              <Link to={`/workout/${nextWorkoutSlot.workout_id}`} className="font-medium text-emerald-800 flex items-center gap-1">
                {nextWorkoutSlot.workout_name} <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          )}
        </Card>
      )}

      {!todaySlot?.workout_id && nextWorkoutSlot && (
        <Card className="rounded-2xl border-border p-5 mb-5">
          <p className="text-xs text-muted-foreground mb-1">Next workout · {fmtDate(parseDate(nextWorkoutSlot.date))}</p>
          <Link to={`/workout/${nextWorkoutSlot.workout_id}`} className="font-semibold flex items-center gap-1">{nextWorkoutSlot.workout_name} <ChevronRight className="h-4 w-4" /></Link>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 mb-5">
        <StatCard icon={Calendar} label="This week" value={plan ? `${completedCount}/${totalCount}` : '—'} sub="workouts done" />
        <StatCard icon={Flame} label="Streak" value={streak} sub={streak === 1 ? 'day' : 'days'} accent />
      </div>

      <div className="space-y-3">
        {prExercise && (
          <Link to="/progress" className="block">
            <Card className="rounded-2xl border-border p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-amber-50 flex items-center justify-center"><Trophy className="h-5 w-5 text-amber-600" /></div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">Latest PR</p>
                <p className="font-medium truncate">{prExercise.exercise_name} · {formatWeight(prExercise.max_weight, unit)}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Card>
          </Link>
        )}
        {pendingRec && (
          <Link to="/progress" className="block">
            <Card className="rounded-2xl border-brand/20 bg-brand/5 p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-brand/10 flex items-center justify-center"><Sparkles className="h-5 w-5 text-brand" /></div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-brand/80 font-medium">AI recommendation</p>
                <p className="font-medium truncate">{pendingRec.exercise_name} → {formatWeight(pendingRec.suggested_weight, unit)}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Card>
          </Link>
        )}
      </div>

      {plan && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">This week</h3>
            <div className="flex items-center gap-3">
              <Link to="/plan-history" className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-brand transition-colors">
                <Calendar className="h-3.5 w-3.5" /> Past weeks
              </Link>
              <button onClick={regenerate} disabled={regenerating} className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-brand disabled:opacity-40 transition-colors">
                {regenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                {regenerating ? <span key={regeneratingLabel} className="animate-in fade-in duration-200">{regeneratingLabel}</span> : 'Regenerate plan'}
              </button>
            </div>
          </div>
          <div className="space-y-2.5">
            {plan.workouts?.map((slot, i) => {
              const isToday = slot.date === todayISO;
              const done = !!slot.workout_id && weekSessions.some((s) => s.workout_id === slot.workout_id && sameDay(parseDate(s.date), parseDate(slot.date)));
              const scheduledForDay = (profile?.scheduled_activities || []).filter((a) => a.day === slot.day);
              const hasScheduled = scheduledForDay.length > 0;

              const scheduledCards = scheduledForDay.map((sa, j) => (
                <Card key={`sched-${i}-${j}`} className="rounded-2xl border border-violet-200/60 bg-violet-50/40 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <CalendarClock className="h-4 w-4 text-violet-600 shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium truncate capitalize">{sa.activity || 'Scheduled activity'}</p>
                        {sa.time_of_day && <p className="text-xs text-violet-700/70 capitalize">{sa.time_of_day}</p>}
                      </div>
                    </div>
                    <span className="text-[10px] font-medium text-violet-700 bg-violet-100 rounded px-1.5 py-0.5 shrink-0">Scheduled</span>
                  </div>
                </Card>
              ));

              const wrap = (card) => hasScheduled ? (
                <div key={i} className="rounded-2xl ring-1 ring-violet-200/70 bg-violet-50/10 p-1.5 space-y-2">
                  <p className="text-[10px] font-medium text-violet-700 px-1.5 flex items-center gap-1">
                    <CalendarClock className="h-3 w-3" /> {slot.day} · {1 + scheduledForDay.length} activities
                  </p>
                  {card}
                  {scheduledCards}
                </div>
              ) : card;

              if (slot.slot_type === 'activity' && !slot.workout_id) {
                return wrap(
                  <Card key={hasScheduled ? undefined : i} className={cn('rounded-2xl border p-4', isToday ? 'border-amber-300 bg-amber-50/50' : 'border-amber-200/60 bg-amber-50/30')}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate capitalize flex items-center gap-1.5">
                          <Route className="h-4 w-4 text-amber-600 shrink-0" />
                          {slot.activity || 'Activity'}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">Activity day</p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] font-medium text-muted-foreground whitespace-nowrap">{slot.day.slice(0, 3)} · {fmtDate(parseDate(slot.date), 'd MMM')}{isToday && ' · Today'}</span>
                          <button onClick={() => setRestConfirmFor(slot)} className="p-1 rounded-md text-muted-foreground hover:text-brand hover:bg-brand/5 transition-colors" title="Make rest day">
                            <Moon className="h-3.5 w-3.5" />
                          </button>
                          <ReorderArrows index={i} length={plan.workouts.length} onUp={() => moveSlot(i, -1)} onDown={() => moveSlot(i, 1)} />
                        </div>
                      </div>
                    </div>
                    {(slot.suggested_workout_ids?.length > 0) && (
                      <button onClick={() => setSuggestFor(slot)} className="mt-3 text-xs font-medium text-amber-700 flex items-center gap-1">
                        <Sparkles className="h-3.5 w-3.5" /> {slot.suggested_workout_ids.length} guided suggestions
                      </button>
                    )}
                  </Card>
                );
              }

              if (slot.slot_type === 'rest') {
                return wrap(
                  <Card key={hasScheduled ? undefined : i} className={cn('rounded-2xl border p-4 bg-muted/30', isToday ? 'border-border' : 'border-border/60')}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Moon className="h-4 w-4" />
                        <p className="font-medium">Rest</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] font-medium text-muted-foreground whitespace-nowrap">{slot.day.slice(0, 3)} · {fmtDate(parseDate(slot.date), 'd MMM')}{isToday && ' · Today'}</span>
                        <button onClick={() => setRestChoiceFor(slot)} className="p-1 rounded-md text-muted-foreground hover:text-brand hover:bg-brand/5 transition-colors" title="Add workout">
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                        <ReorderArrows index={i} length={plan.workouts.length} onUp={() => moveSlot(i, -1)} onDown={() => moveSlot(i, 1)} />
                      </div>
                    </div>
                  </Card>
                );
              }

              const wo = workouts[slot.workout_id];
              const exCount = wo ? countWorkoutExercises(wo, blocksByWorkout, blockExercisesByBlock) : 0;
              const isGuidedActivity = slot.slot_type === 'activity';
              const doneSession = done ? weekSessions.find((s) => s.workout_id === slot.workout_id && sameDay(parseDate(s.date), parseDate(slot.date))) : null;
              return wrap(
                <button key={hasScheduled ? undefined : i} onClick={() => { if (doneSession) { setSessionDetail(doneSession); } else { setSelectedWorkout(wo || null); setSelectedSlot(slot); } }} className="w-full text-left">
                  <Card className={cn('rounded-2xl border p-4 transition-colors', done ? 'border-brand/30 bg-brand/5' : isToday ? 'border-brand' : isGuidedActivity ? 'border-amber-200/60 bg-amber-50/30 hover:border-amber-300' : 'border-border hover:border-foreground/20')}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          {isGuidedActivity && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-700 bg-amber-100 rounded px-1.5 py-0.5 capitalize shrink-0"><Route className="h-3 w-3" />{slot.activity}</span>
                          )}
                          <p className="font-semibold truncate">{wo?.name || slot.workout_name}</p>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{slot.modality || wo?.format_label || 'Workout'}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] font-medium text-muted-foreground whitespace-nowrap">{slot.day.slice(0, 3)} · {fmtDate(parseDate(slot.date), 'd MMM')}{isToday && ' · Today'}</span>
                          {!done && (
                            <button onClick={(e) => { e.stopPropagation(); findAlternative(slot); }} className="p-1 rounded-md text-muted-foreground hover:text-brand hover:bg-brand/5 transition-colors">
                              <ArrowLeftRight className="h-3 w-3" />
                            </button>
                          )}
                          <button onClick={(e) => { e.stopPropagation(); setRestConfirmFor(slot); }} className="p-1 rounded-md text-muted-foreground hover:text-brand hover:bg-brand/5 transition-colors" title="Make rest day">
                            <Moon className="h-3.5 w-3.5" />
                          </button>
                          <ReorderArrows index={i} length={plan.workouts.length} onUp={() => moveSlot(i, -1)} onDown={() => moveSlot(i, 1)} />
                        </div>
                        {done ? <CheckCircle2 className="h-4 w-4 text-brand" /> : isToday ? <span className="h-2 w-2 rounded-full bg-brand" /> : null}
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-3">
                      <div className="flex items-center gap-4 text-xs text-muted-foreground min-w-0">
                        <span className="flex items-center gap-1 shrink-0"><Clock className="h-3.5 w-3.5" />{roundToFive(wo?.est_duration_min) || '~45'} min</span>
                        <span className="flex items-center gap-1 shrink-0"><Dumbbell className="h-3.5 w-3.5" />{exCount} {exCount === 1 ? 'Exercise' : 'Exercises'}</span>
                        {wo?.workout_category && <span className="capitalize truncate">{wo.workout_category}</span>}
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    </div>
                  </Card>
                </button>
              );
            })}
            {(() => {
              const scheduledDays = new Set((plan.workouts || []).map((s) => s.day));
              const orphanScheduled = (profile?.scheduled_activities || []).filter((a) => !scheduledDays.has(a.day));
              return orphanScheduled.map((sa, j) => (
                <Card key={`sched-orphan-${j}`} className="rounded-2xl border border-violet-200/60 bg-violet-50/40 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <CalendarClock className="h-4 w-4 text-violet-600 shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium truncate capitalize">{sa.activity || 'Scheduled activity'}</p>
                        {sa.time_of_day && <p className="text-xs text-violet-700/70 capitalize">{sa.time_of_day}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[10px] font-medium text-muted-foreground">{sa.day?.slice(0, 3)}</span>
                      <span className="text-[10px] font-medium text-violet-700 bg-violet-100 rounded px-1.5 py-0.5">Scheduled</span>
                    </div>
                  </div>
                </Card>
              ));
            })()}
          </div>
        </div>
      )}

      <WorkoutDetailSheet
        workout={selectedWorkout}
        open={!!selectedWorkout}
        onOpenChange={(o) => { if (!o) { setSelectedWorkout(null); setSelectedSlot(null); setSelectMode(false); setDetailAlt(null); } }}
        contextLine={selectedSlot ? `${selectedSlot.day} · ${fmtDate(parseDate(selectedSlot.date), 'd MMM')}` : null}
        reason={selectedSlot?.reason}
        selectMode={selectMode}
        onSelect={selectFromDetail}
        warmup={selectedSlot?.warmup}
      />

      <SessionDetailSheet
        session={sessionDetail}
        open={!!sessionDetail}
        onOpenChange={(o) => { if (!o) setSessionDetail(null); }}
        editable
        onSaved={(updated) => {
          setSessionDetail(updated);
          setSessions((prev) => prev.map((s) => s.id === updated.id ? updated : s));
        }}
      />

      <SwapShortlistSheet
        open={!!suggestFor}
        onOpenChange={(o) => { if (!o) setSuggestFor(null); }}
        loading={false}
        alternatives={suggestAlternatives}
        currentName={suggestFor?.activity || 'your activity'}
        onPick={(alt) => { assignWorkoutToSlot(alt.workout_id, alt.workout_name, alt.reason, suggestFor); setSuggestFor(null); }}
        onViewDetails={viewSuggestionDetails}
        keepLabel="Keep my activity"
      />

      <SwapShortlistSheet
        open={!!swapFor}
        onOpenChange={(o) => { if (!o) { setSwapFor(null); setSwapAlternatives([]); } }}
        loading={swapLoading}
        alternatives={swapAlternatives}
        currentName={swapFor?.workout_name || 'this workout'}
        onPick={pickAlternative}
        onViewDetails={viewSwapDetails}
        onSearchLibrary={() => { const s = swapFor; setSwapFor(null); setSwapAlternatives([]); setSearchFor(s); }}
      />

      <RestToWorkoutChoiceSheet
        open={!!restChoiceFor}
        onOpenChange={(o) => { if (!o) setRestChoiceFor(null); }}
        dayLabel={restChoiceFor?.day}
        onAiSuggest={() => aiSuggestForRest(restChoiceFor)}
        onChooseSelf={() => { const s = restChoiceFor; setRestChoiceFor(null); setSearchFor(s); }}
      />

      <SwapShortlistSheet
        open={!!restAiFor}
        onOpenChange={(o) => { if (!o) { setRestAiFor(null); setRestAiAlternatives([]); } }}
        loading={restAiLoading}
        alternatives={restAiAlternatives}
        currentName={restAiFor ? `${restAiFor.day} · rest day` : 'this day'}
        onPick={(alt) => pickForRestDay(alt, restAiFor)}
        onSearchLibrary={() => { const s = restAiFor; setRestAiFor(null); setRestAiAlternatives([]); setSearchFor(s); }}
        keepLabel="Keep as rest"
      />

      <WorkoutSearchSheet
        open={!!searchFor}
        onOpenChange={(o) => { if (!o) setSearchFor(null); }}
        onPick={(wo) => pickFromSearch(wo, searchFor)}
        dayLabel={searchFor?.day}
      />

      <AlertDialog open={!!restConfirmFor} onOpenChange={(o) => { if (!o) setRestConfirmFor(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Turn this day into rest?</AlertDialogTitle>
            <AlertDialogDescription>
              {restConfirmFor?.workout_name ? `"${restConfirmFor.workout_name}" on ` : ''}{restConfirmFor?.day} will be cleared and marked as a rest day. You can add a workout back later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => makeRest(restConfirmFor)} className="bg-brand text-brand-foreground hover:bg-brand/90">
              Make rest day
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, accent = false }) {
  return (
    <Card className={cn('rounded-2xl border-border p-4', accent && 'bg-brand text-brand-foreground border-transparent')}>
      <Icon className={cn('h-4 w-4 mb-2', accent ? 'text-brand-foreground/80' : 'text-muted-foreground')} />
      <p className={cn('text-2xl font-semibold', !accent && 'tracking-tight')}>{value}</p>
      <p className={cn('text-xs', accent ? 'text-brand-foreground/70' : 'text-muted-foreground')}>{label} · {sub}</p>
    </Card>
  );
}