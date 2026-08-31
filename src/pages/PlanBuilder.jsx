import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { useAthleteProfile } from '@/hooks/useAthleteProfile';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sparkles, RefreshCw, Lock, Unlock, Check, ArrowLeftRight, Loader2, Wand2, Route, Moon, Plus, CheckCircle2 } from 'lucide-react';
import { mondayOf, fmtISO, fmtDate, parseDate, ALL_EQUIPMENT } from '@/lib/fitness';
import { cn } from '@/lib/utils';
import SwapShortlistSheet from '@/components/SwapShortlistSheet';
import WorkoutDetailSheet from '@/components/WorkoutDetailSheet';
import WorkoutSearchSheet from '@/components/WorkoutSearchSheet';
import RestToWorkoutChoiceSheet from '@/components/RestToWorkoutChoiceSheet';

const CONTEXT_OPTIONS = [
  { value: 'normal', label: 'Normal week', desc: 'Nothing unusual' },
  { value: 'travelling', label: 'Travelling', desc: 'Different gym or setup' },
  { value: 'less_equipment', label: 'Less equipment', desc: 'Limited gear available' },
  { value: 'less_time', label: 'Less time', desc: 'Tighter schedule' },
  { value: 'recovery', label: 'Recovery issue', desc: 'Niggles or fatigue' },
  { value: 'schedule', label: 'Schedule change', desc: 'Days shifted' },
];

const FOLLOWUP_LABEL = {
  travelling: 'What equipment will you have access to?',
  less_equipment: 'What equipment is available?',
  less_time: 'How much time per session?',
  recovery: 'What needs extra care?',
  schedule: 'What does your new schedule look like?',
};

const FOLLOWUP_PLACEHOLDER = {
  travelling: 'e.g. Hotel gym with dumbbells only',
  less_equipment: 'e.g. Only barbell and plates',
  less_time: 'e.g. 30 minutes max',
  recovery: 'e.g. Lower back is fatigued',
  schedule: 'e.g. Can only train Tue/Thu/Sat',
};

// These two contexts change what equipment is available for the week — captured
// as a structured multi-select (not free text) so generation and "find an
// alternative" can both enforce it reliably instead of parsing prose.
const EQUIPMENT_CONTEXTS = new Set(['travelling', 'less_equipment']);

const BUILDING_MESSAGES = [
  'Analyzing your training history…',
  'Balancing volume across muscle groups…',
  'Sequencing your workout days…',
  'Applying progressive overload…',
  'Checking recovery between sessions…',
  'Matching exercises to your equipment…',
  'Fine-tuning sets and reps…',
  'Optimizing your split…',
  'Cross-checking exercise history…',
];
const BUILDING_FINAL_MESSAGE = 'Putting the final touches on your plan…';

/** @returns {[string, React.Dispatch<React.SetStateAction<string>>]} */
function useRotatingLoadingText(active) {
  const [text, setText] = useState(BUILDING_MESSAGES[0]);
  useEffect(() => {
    if (!active) return;
    setText(BUILDING_MESSAGES[Math.floor(Math.random() * BUILDING_MESSAGES.length)]);
    const interval = setInterval(() => {
      setText((prev) => {
        const options = BUILDING_MESSAGES.filter((m) => m !== prev);
        return options[Math.floor(Math.random() * options.length)];
      });
    }, 2200);
    return () => clearInterval(interval);
  }, [active]);
  return [text, setText];
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default function PlanBuilder() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { profile } = useAthleteProfile();
  const [phase, setPhase] = useState('context');
  const [context, setContext] = useState('');
  const [followup, setFollowup] = useState('');
  const [setupEquipment, setSetupEquipment] = useState([]);
  const [plan, setPlan] = useState(null);
  const [planId, setPlanId] = useState(null);
  const [summary, setSummary] = useState('');
  const [error, setError] = useState('');
  const [regenerating, setRegenerating] = useState(false);
  const [buildingText, setBuildingText] = useRotatingLoadingText(phase === 'building');
  const [swapFor, setSwapFor] = useState(null);
  const [swapLoading, setSwapLoading] = useState(false);
  const [alternatives, setAlternatives] = useState([]);
  const [swapFrom, setSwapFrom] = useState(null);
  const [suggestFor, setSuggestFor] = useState(null);
  const [workouts, setWorkouts] = useState({});
  const [selectedWorkout, setSelectedWorkout] = useState(null);
  const [selectedSlotIdx, setSelectedSlotIdx] = useState(null);
  const [selectMode, setSelectMode] = useState(false);
  const [detailAlt, setDetailAlt] = useState(null);
  const [restChoiceFor, setRestChoiceFor] = useState(null);
  const [searchFor, setSearchFor] = useState(null);

  const weekStart = fmtISO(mondayOf(new Date()));

  useEffect(() => {
    (async () => {
      const { data: existing } = await supabase.from('weekly_plans').select('*').eq('user_id', user.id).eq('week_start_date', weekStart);
      if (existing?.[0]) {
        setPlanId(existing[0].id);
        setContext(existing[0].context_answer || '');
        setFollowup(existing[0].context_notes || '');
        setSetupEquipment(existing[0].setup_equipment || []);
        if (existing[0].workouts?.length) {
          setPlan({ workouts: existing[0].workouts, regenerations_used: existing[0].regenerations_used || 0 });
          setPhase('review');
          const ids = new Set(existing[0].workouts.flatMap((w) => [w.workout_id, ...(w.suggested_workout_ids || [])]).filter(Boolean));
          if (ids.size) {
            const { data: ws } = await supabase.from('workouts').select('*');
            setWorkouts(Object.fromEntries((ws || []).filter((w) => ids.has(w.id)).map((w) => [w.id, w])));
          }
        }
      }
    })();
  }, [user, weekStart]);

  useEffect(() => {
    if (phase !== 'auto_approved') return;
    const timer = setTimeout(() => navigate('/'), 3000);
    return () => clearTimeout(timer);
  }, [phase, navigate]);

  const generate = async () => {
    setPhase('building'); setError('');
    try {
      const res = await supabase.functions.invoke('generateWeeklyPlan', {
        body: { week_start_date: weekStart, context_answer: context, context_notes: followup, setup_equipment: EQUIPMENT_CONTEXTS.has(context) ? setupEquipment : null },
      });
      if (res.error) throw res.error;
      setPlan({ workouts: res.data.plan.workouts, regenerations_used: res.data.plan.regenerations_used || 0 });
      setPlanId(res.data.plan.id);
      setSummary(res.data.summary || '');
      const ids = new Set(res.data.plan.workouts.flatMap((w) => [w.workout_id, ...(w.suggested_workout_ids || [])]).filter(Boolean));
      if (ids.size) {
        const { data: ws } = await supabase.from('workouts').select('*');
        setWorkouts(Object.fromEntries((ws || []).filter((w) => ids.has(w.id)).map((w) => [w.id, w])));
      }
      try {
        const wres = await supabase.functions.invoke('assignWorkoutWeights', { body: { weekly_plan_id: res.data.plan.id } });
        if (wres.data?.plan?.workouts) setPlan({ workouts: wres.data.plan.workouts, regenerations_used: wres.data.plan.regenerations_used || res.data.plan.regenerations_used || 0 });
      } catch {}
      setBuildingText(BUILDING_FINAL_MESSAGE);
      await sleep(700);
      setPhase(profile?.auto_approve_plans ? 'auto_approved' : 'review');
    } catch {
      setError('Could not generate the plan. Please try again.'); setPhase('context');
    }
  };

  const regenerate = async () => {
    if ((plan?.regenerations_used || 0) >= 3) return;
    setRegenerating(true); setError('');
    try {
      const res = await supabase.functions.invoke('generateWeeklyPlan', {
        body: { week_start_date: weekStart, context_answer: context, context_notes: followup, setup_equipment: EQUIPMENT_CONTEXTS.has(context) ? setupEquipment : null, regenerate: true },
      });
      if (res.error) throw res.error;
      setPlan({ workouts: res.data.plan.workouts, regenerations_used: res.data.plan.regenerations_used || 0 });
      setSummary(res.data.summary || '');
      const ids = new Set(res.data.plan.workouts.flatMap((w) => [w.workout_id, ...(w.suggested_workout_ids || [])]).filter(Boolean));
      if (ids.size) {
        const { data: ws } = await supabase.from('workouts').select('*');
        setWorkouts(Object.fromEntries((ws || []).filter((w) => ids.has(w.id)).map((w) => [w.id, w])));
      }
      try {
        const wres = await supabase.functions.invoke('assignWorkoutWeights', { body: { weekly_plan_id: res.data.plan.id } });
        if (wres.data?.plan?.workouts) setPlan({ workouts: wres.data.plan.workouts, regenerations_used: res.data.plan.regenerations_used || 0 });
      } catch {}
    } catch {
      setError('Regeneration failed.');
    }
    setRegenerating(false);
  };

  const findAlternative = async (idx) => {
    const slot = plan.workouts[idx];
    setSwapFor(idx);
    setSwapLoading(true); setAlternatives([]);
    try {
      const otherDays = plan.workouts.filter((_, i) => i !== idx).filter((w) => w.workout_id).map((w) => `${w.day}: ${w.workout_name}`).join('; ');
      const res = await supabase.functions.invoke('swapWorkout', {
        body: {
          current_workout_id: slot.workout_id || undefined,
          day: slot.day,
          focus: slot.focus,
          slot_type: slot.slot_type,
          activity: slot.activity,
          modality: slot.modality,
          other_days: otherDays,
          week_start_date: weekStart,
        },
      });
      if (res.error) throw res.error;
      setAlternatives(res.data.alternatives || []);
    } catch {
      setError('Could not find alternatives.');
    }
    setSwapLoading(false);
  };

  const pickAlternative = async (alt) => {
    const idx = swapFor;
    setSwapLoading(true);
    await pickAlternativeAt(idx, alt);
    setSwapFor(null); setAlternatives([]);
    setSwapLoading(false);
  };

  const assignWorkoutToSlot = async (idx, workoutId, workoutName, reason) => {
    const updated = plan.workouts.map((w, i) => i === idx
      ? { ...w, slot_type: 'train', workout_id: workoutId, workout_name: workoutName, reason: reason || 'Your pick', locked: false }
      : w);
    setPlan({ ...plan, workouts: updated });
    try {
      await supabase.from('weekly_plans').update({ workouts: updated }).eq('id', planId);
    } catch {
      setError('Could not save that change.');
    }
    if (!workouts[workoutId]) {
      try {
        const { data: wo } = await supabase.from('workouts').select('*').eq('id', workoutId).single();
        if (wo) setWorkouts((prev) => ({ ...prev, [wo.id]: wo }));
      } catch { /* ignore */ }
    }
  };

  const viewSwapDetails = async (alt) => {
    const idx = swapFor;
    if (idx === null) return;
    setSwapFor(null); setAlternatives([]);
    setDetailAlt(alt);
    try {
      const { data: wo, error } = await supabase.from('workouts').select('*').eq('id', alt.workout_id).single();
      if (error) throw error;
      setSelectedWorkout(wo);
      setSelectedSlotIdx(idx);
      setSelectMode(true);
    } catch {
      setDetailAlt(null);
    }
  };

  const selectFromDetail = () => {
    if (selectedSlotIdx === null || !selectedWorkout) return;
    if (detailAlt) {
      pickAlternativeAt(selectedSlotIdx, detailAlt);
    } else {
      assignWorkoutToSlot(selectedSlotIdx, selectedWorkout.id, selectedWorkout.name, 'Your pick');
    }
    setSelectedWorkout(null); setSelectedSlotIdx(null); setSelectMode(false); setDetailAlt(null);
  };

  const pickAlternativeAt = async (idx, alt) => {
    const slot = plan.workouts[idx];
    if (!slot) return;
    if (slot.workout_id) {
      try {
        const res = await supabase.functions.invoke('applySwap', {
          body: {
            weekly_plan_id: planId,
            day: slot.day,
            old_workout_id: slot.workout_id,
            new_workout_id: alt.workout_id,
            reason: alt.reason,
          },
        });
        if (res.error) throw res.error;
        setPlan({ ...plan, workouts: res.data.plan.workouts });
        const ids = new Set(res.data.plan.workouts.flatMap((w) => [w.workout_id, ...(w.suggested_workout_ids || [])]).filter(Boolean));
        if (ids.size) {
          const { data: ws } = await supabase.from('workouts').select('*').in('id', [...ids]);
          setWorkouts((prev) => ({ ...prev, ...Object.fromEntries((ws || []).map((w) => [w.id, w])) }));
        }
      } catch {
        setError('Could not apply that swap.');
      }
    } else {
      await assignWorkoutToSlot(idx, alt.workout_id, alt.workout_name, alt.reason);
    }
  };

  const pickFromSearch = async (wo) => {
    const idx = searchFor;
    setSearchFor(null);
    if (idx === null) return;
    await assignWorkoutToSlot(idx, wo.id, wo.name, 'Your pick');
  };

  const useSuggestion = async (alt) => {
    const idx = suggestFor;
    const updated = plan.workouts.map((w, i) => i === idx
      ? { ...w, slot_type: 'train', workout_id: alt.workout_id, workout_name: alt.workout_name, reason: alt.reason || 'Guided session', locked: false }
      : w);
    setPlan({ ...plan, workouts: updated });
    try {
      await supabase.from('weekly_plans').update({ workouts: updated }).eq('id', planId);
    } catch {
      setError('Could not save that change.');
    }
    setSuggestFor(null);
  };

  const toggleLock = (idx) => {
    const next = [...plan.workouts];
    next[idx] = { ...next[idx], locked: !next[idx].locked };
    setPlan({ ...plan, workouts: next });
  };

  const doSwap = (idx) => {
    if (plan.workouts[idx].slot_type !== 'train') return;
    setSwapFor(null);
    if (!swapFrom) { setSwapFrom(idx); return; }
    if (swapFrom === idx) { setSwapFrom(null); return; }
    const next = [...plan.workouts];
    const a = next[swapFrom], b = next[idx];
    next[swapFrom] = { ...b, day: a.day, date: a.date };
    next[idx] = { ...a, day: b.day, date: b.date };
    setPlan({ ...plan, workouts: next });
    setSwapFrom(null);
  };

  const approve = async () => { navigate('/'); };

  const suggestAlternatives = (() => {
    if (suggestFor === null) return [];
    const slot = plan?.workouts[suggestFor];
    if (!slot) return [];
    return (slot.suggested_workout_ids || [])
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

  return (
    <div className="min-h-screen bg-background px-5 pt-10 pb-32">
      <header className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <div className="h-8 w-8 rounded-lg bg-brand flex items-center justify-center"><Sparkles className="h-4 w-4 text-brand-foreground" /></div>
          <h1 className="text-xl font-semibold tracking-tight">Weekly Plan Builder</h1>
        </div>
        <p className="text-sm text-muted-foreground">Week of {fmtDate(mondayOf(new Date()), 'd MMM')}</p>
      </header>

      {error && <div className="mb-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3">{error}</div>}

      {(phase === 'context' || phase === 'followup') && (
        <div className="animate-in fade-in duration-300">
          <h2 className="text-lg font-semibold mb-1">Is next week a normal week?</h2>
          <p className="text-sm text-muted-foreground mb-4">We'll only ask what's changed.</p>
          <div className="space-y-2.5 mb-6">
            {CONTEXT_OPTIONS.map((o) => (
              <button key={o.value} onClick={() => { setContext(o.value); setFollowup(''); setSetupEquipment([]); setPhase('followup'); }} className={cn('w-full rounded-xl border px-4 py-3.5 text-left transition-all', context === o.value ? 'border-brand bg-brand/5' : 'border-border')}>
                <div className="flex items-center justify-between"><div><p className="font-medium">{o.label}</p><p className="text-xs text-muted-foreground mt-0.5">{o.desc}</p></div>{context === o.value && <Check className="h-5 w-5 text-brand" />}</div>
              </button>
            ))}
          </div>
          {phase === 'followup' && context !== 'normal' && EQUIPMENT_CONTEXTS.has(context) && (
            <div className="animate-in slide-in-from-bottom-2 duration-300 mb-6">
              <h3 className="font-medium mb-2">{FOLLOWUP_LABEL[context]}</h3>
              <p className="text-xs text-muted-foreground mb-3">Select everything you'll have access to — this replaces your usual equipment for this week only. Leave everything unselected for bodyweight/running only.</p>
              <div className="flex flex-wrap gap-2">
                {ALL_EQUIPMENT.map((eq) => {
                  const on = setupEquipment.includes(eq);
                  return (
                    <button
                      key={eq}
                      onClick={() => setSetupEquipment((prev) => (prev.includes(eq) ? prev.filter((e) => e !== eq) : [...prev, eq]))}
                      className={cn('px-3 py-2 rounded-full text-xs font-medium border transition-colors', on ? 'bg-brand text-brand-foreground border-transparent' : 'border-border text-muted-foreground')}
                    >
                      {eq}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {phase === 'followup' && context !== 'normal' && !EQUIPMENT_CONTEXTS.has(context) && (
            <div className="animate-in slide-in-from-bottom-2 duration-300">
              <h3 className="font-medium mb-2">{FOLLOWUP_LABEL[context]}</h3>
              <textarea value={followup} onChange={(e) => setFollowup(e.target.value)} placeholder={FOLLOWUP_PLACEHOLDER[context]} className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm min-h-[80px] focus:outline-none focus:ring-2 focus:ring-brand mb-6" />
            </div>
          )}
          <Button onClick={generate} disabled={!context} className="w-full rounded-xl h-12 bg-brand text-brand-foreground hover:bg-brand/90">
            <Wand2 className="h-4 w-4 mr-2" /> Generate my week
          </Button>
        </div>
      )}

      {phase === 'building' && (
        <div className="flex flex-col items-center justify-center py-24">
          <Loader2 className="h-10 w-10 text-brand animate-spin mb-4" />
          <p key={buildingText} className="text-sm font-medium animate-in fade-in duration-300">{buildingText}</p>
        </div>
      )}

      {phase === 'auto_approved' && (
        <div className="flex flex-col items-center justify-center py-24 text-center animate-in fade-in duration-300">
          <div className="h-14 w-14 rounded-full bg-brand/10 flex items-center justify-center mb-4">
            <CheckCircle2 className="h-8 w-8 text-brand" />
          </div>
          <p className="text-lg font-semibold">Plan auto-approved</p>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-xs leading-relaxed">
            Auto-approve AI plans is on, so this week went live without review. Turn it off in Settings anytime to review plans yourself.
          </p>
          <Button onClick={() => navigate('/')} variant="outline" className="rounded-xl h-11 px-6 mt-6">
            Go to today
          </Button>
        </div>
      )}

      {phase === 'review' && plan && (
        <div className="animate-in fade-in duration-300">
          {summary && <p className="text-sm text-muted-foreground bg-muted/50 rounded-xl p-3 mb-4 leading-relaxed">{summary}</p>}
          <div className="space-y-3 mb-4">
            {plan.workouts.map((w, i) => {
              const isActivity = w.slot_type === 'activity';
              if (isActivity && !w.workout_id) {
                return (
                  <Card key={i} className="rounded-2xl border border-amber-200/60 bg-amber-50/30 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-muted-foreground font-medium">{w.day} · {fmtDate(parseDate(w.date), 'd MMM')}</p>
                        <p className="font-semibold mt-0.5 capitalize flex items-center gap-1.5"><Route className="h-4 w-4 text-amber-600" /> {w.activity || 'Activity'}</p>
                      </div>
                    </div>
                    {(w.suggested_workout_ids?.length > 0) && (
                      <button onClick={() => setSuggestFor(i)} className="mt-3 text-xs font-medium text-amber-700 flex items-center gap-1">
                        <Sparkles className="h-3.5 w-3.5" /> {w.suggested_workout_ids.length} guided suggestions
                      </button>
                    )}
                  </Card>
                );
              }
              if (w.slot_type === 'rest') {
                return (
                  <Card key={i} className="rounded-2xl border border-border bg-muted/30 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Moon className="h-4 w-4" />
                        <p className="text-xs font-medium">{w.day} · {fmtDate(parseDate(w.date), 'd MMM')}</p>
                        <p className="font-medium ml-2">Rest</p>
                      </div>
                      <button onClick={() => setRestChoiceFor(i)} className="p-1.5 rounded-lg text-muted-foreground hover:text-brand hover:bg-brand/5 transition-colors" title="Add workout">
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </Card>
                );
              }
              const wo = workouts[w.workout_id];
              return (
                <Card key={i} className={cn('rounded-2xl border p-4 transition-all', swapFrom === i ? 'border-brand ring-2 ring-brand/20' : isActivity ? 'border-amber-200/60 bg-amber-50/30' : 'border-border', w.locked && 'bg-brand/[0.03]')}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground font-medium">{w.day} · {fmtDate(parseDate(w.date), 'd MMM')}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {isActivity && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-700 bg-amber-100 rounded px-1.5 py-0.5 capitalize shrink-0"><Route className="h-3 w-3" />{w.activity}</span>
                        )}
                        <p className="font-semibold truncate">{wo?.name || w.workout_name}</p>
                      </div>
                      {w.modality && !isActivity && <p className="text-xs text-muted-foreground mt-0.5">{w.modality}{w.focus ? ' · ' + w.focus : ''}</p>}
                    </div>
                    <button onClick={() => toggleLock(i)} title={w.locked ? 'Locked — this workout stays fixed and will be skipped when regenerating or finding alternatives' : 'Unlocked — this workout can be swapped or replaced'} className={cn('p-1.5 rounded-lg', w.locked ? 'text-brand' : 'text-muted-foreground')}>
                      {w.locked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                    </button>
                  </div>
                  {w.reason && <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{w.reason}</p>}
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => doSwap(i)} className={cn('flex-1 flex items-center justify-center gap-1 text-xs font-medium py-2 rounded-lg border', swapFrom === i ? 'border-brand text-brand bg-brand/5' : 'border-border text-muted-foreground')}>
                      <ArrowLeftRight className="h-3.5 w-3.5" /> {swapFrom === i ? 'Tap another day' : 'Swap days'}
                    </button>
                    <button onClick={() => findAlternative(i)} disabled={w.locked} className="flex-1 flex items-center justify-center gap-1 text-xs font-medium py-2 rounded-lg border border-border text-brand disabled:opacity-50">
                      <RefreshCw className="h-3.5 w-3.5" /> Find alternative
                    </button>
                  </div>
                </Card>
              );
            })}
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
            <span>Regenerations: {plan.regenerations_used}/3</span>
            <button onClick={regenerate} disabled={plan.regenerations_used >= 3 || regenerating} className="flex items-center gap-1 font-medium text-brand disabled:opacity-40">
              {regenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Rebuild plan
            </button>
          </div>
          <div className="fixed bottom-0 inset-x-0 max-w-md mx-auto px-5 py-4 bg-background border-t border-border">
            <Button onClick={approve} className="w-full rounded-xl h-12 bg-brand text-brand-foreground hover:bg-brand/90">
              <Check className="h-4 w-4 mr-2" /> Done
            </Button>
          </div>
        </div>
      )}

      <SwapShortlistSheet
        open={swapFor !== null}
        onOpenChange={(o) => { if (!o) { setSwapFor(null); setAlternatives([]); } }}
        loading={swapLoading}
        alternatives={alternatives}
        currentName={swapFor !== null ? (plan?.workouts[swapFor]?.workout_name || 'this day') : ''}
        onPick={pickAlternative}
        onViewDetails={viewSwapDetails}
        onSearchLibrary={() => { const idx = swapFor; setSwapFor(null); setAlternatives([]); setSearchFor(idx); }}
      />

      <SwapShortlistSheet
        open={suggestFor !== null}
        onOpenChange={(o) => { if (!o) setSuggestFor(null); }}
        loading={false}
        alternatives={suggestAlternatives}
        currentName={suggestFor !== null ? plan?.workouts[suggestFor]?.activity || 'your activity' : ''}
        onPick={useSuggestion}
      />

      <WorkoutDetailSheet
        workout={selectedWorkout}
        open={!!selectedWorkout}
        onOpenChange={(o) => { if (!o) { setSelectedWorkout(null); setSelectedSlotIdx(null); setSelectMode(false); setDetailAlt(null); } }}
        contextLine={selectedSlotIdx !== null ? `${plan?.workouts[selectedSlotIdx]?.day} · ${fmtDate(parseDate(plan?.workouts[selectedSlotIdx]?.date), 'd MMM')}` : null}
        reason={detailAlt?.reason}
        selectMode={selectMode}
        onSelect={selectFromDetail}
      />

      <RestToWorkoutChoiceSheet
        open={restChoiceFor !== null}
        onOpenChange={(o) => { if (!o) setRestChoiceFor(null); }}
        dayLabel={restChoiceFor !== null ? plan?.workouts[restChoiceFor]?.day : ''}
        onAiSuggest={() => { const idx = restChoiceFor; setRestChoiceFor(null); findAlternative(idx); }}
        onChooseSelf={() => { const idx = restChoiceFor; setRestChoiceFor(null); setSearchFor(idx); }}
      />

      <WorkoutSearchSheet
        open={searchFor !== null}
        onOpenChange={(o) => { if (!o) setSearchFor(null); }}
        onPick={pickFromSearch}
        dayLabel={searchFor !== null ? plan?.workouts[searchFor]?.day : ''}
      />
    </div>
  );
}