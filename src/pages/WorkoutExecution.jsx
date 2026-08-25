import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { ChevronLeft, ChevronRight, SkipForward, Check, RefreshCw, Loader2, RotateCcw, Clock } from 'lucide-react';
import { DIFFICULTY_META, mondayOf, fmtISO } from '@/lib/fitness';
import YouTubeVideo from '@/components/YouTubeVideo';
import { cn } from '@/lib/utils';
import {
  buildBlocksByWorkout,
  buildBlockExercisesByBlock,
  buildSetsByBlockExercise,
  buildExerciseMapByCode,
  buildFlatExerciseList,
} from '@/lib/workoutStructure';

function formatDuration(sec) {
  const s = Math.floor(sec || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
    : `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

export default function WorkoutExecution() {
  const { workoutId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [workout, setWorkout] = useState(null);
  const [exercises, setExercises] = useState([]);
  const [index, setIndex] = useState(0);
  const [logs, setLogs] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [subSheet, setSubSheet] = useState(false);
  const [alternatives, setAlternatives] = useState([]);
  const [loadingSubs, setLoadingSubs] = useState(false);
  const [plan, setPlan] = useState(null);
  const [session, setSession] = useState(null);
  const [sessionStartMs, setSessionStartMs] = useState(null);
  const [restartOpen, setRestartOpen] = useState(false);
  const [, setTick] = useState(0);

  const fullExerciseMapRef = useRef(null);
  const sessionIdRef = useRef(null);
  const exerciseSessionIdsRef = useRef({});
  const debounceTimers = useRef({});
  const logsRef = useRef({});
  const exercisesRef = useRef([]);
  const userRef = useRef(user);
  const workoutRef = useRef(workout);
  const indexRef = useRef(0);
  const exerciseElapsedRef = useRef({});
  const enterTimeRef = useRef(Date.now());
  const sessionStartMsRef = useRef(null);
  const loadedExerciseSessionsRef = useRef([]);

  useEffect(() => { logsRef.current = logs; }, [logs]);
  useEffect(() => { exercisesRef.current = exercises; }, [exercises]);
  useEffect(() => { userRef.current = user; }, [user]);
  useEffect(() => { workoutRef.current = workout; }, [workout]);
  useEffect(() => { indexRef.current = index; }, [index]);

  // Total timer: continue-across-break (wall-clock from first start)
  useEffect(() => {
    if (sessionStartMs == null) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [sessionStartMs]);

  // Reset per-exercise enter time whenever the active exercise changes
  useEffect(() => { enterTimeRef.current = Date.now(); }, [index]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const monday = fmtISO(mondayOf(new Date()));
        const [{ data: w }, { data: plans }, { data: existing }] = await Promise.all([
          supabase.from('workouts').select('*').eq('id', workoutId).single(),
          user ? supabase.from('weekly_plans').select('*').eq('user_id', user.id).eq('week_start_date', monday) : Promise.resolve({ data: [] }),
          user
            ? supabase.from('workout_sessions').select('*').eq('user_id', user.id).eq('workout_id', workoutId).eq('status', 'in_progress').order('created_date', { ascending: false }).limit(1)
            : Promise.resolve({ data: [] }),
        ]);
        if (!active) return;
        setWorkout(w);

        // Resume or create an in-progress session so the timer + logs persist across refresh/navigation
        let sess = existing?.[0];
        if (!sess && user) {
          const { data: created } = await supabase.from('workout_sessions').insert({
            user_id: user.id, workout_id: workoutId, workout_name: w.name,
            date: new Date().toISOString().slice(0, 10), status: 'in_progress',
            start_timestamp: new Date().toISOString(),
          }).select().single();
          sess = created;
        }
        if (!active || !sess) return;
        sessionIdRef.current = sess.id;
        setSession(sess);
        const startMs = sess.start_timestamp ? new Date(sess.start_timestamp).getTime() : Date.now();
        sessionStartMsRef.current = startMs;
        setSessionStartMs(startMs);
        enterTimeRef.current = Date.now();

        // Load any already-saved exercise sessions for hydration
        try {
          const { data } = await supabase.from('exercise_sessions').select('*').eq('workout_session_id', sess.id);
          loadedExerciseSessionsRef.current = data || [];
        } catch { loadedExerciseSessionsRef.current = []; }
        if (!active) return;

        setLoading(false);

        const currentPlan = (plans || []).find((p) => p.status === 'approved') || plans?.[0] || null;
        setPlan(currentPlan);
        const planSlot = currentPlan?.workouts?.find((s) => s.workout_id === workoutId);
        const exerciseWeights = planSlot?.exercise_weights || {};

        const { data: blocksData } = await supabase.from('workout_blocks').select('*').eq('workout_id', w.workout_id).order('order_index').limit(500);
        const blocks = blocksData || [];
        if (!active) return;
        const blockIds = blocks.map((b) => b.block_id);
        const blockExs = blockIds.length
          ? (await supabase.from('block_exercises').select('*').in('block_id', blockIds)).data || []
          : [];
        if (!active) return;
        const exerciseBlockExs = blockExs.filter((be) => be.step_type === 'exercise');
        const beIds = exerciseBlockExs.map((be) => be.block_exercise_id);
        const exerciseCodes = [...new Set(exerciseBlockExs.map((be) => be.exercise_id).filter(Boolean))];
        const [{ data: setsData }, { data: referencedExsData }] = await Promise.all([
          beIds.length ? supabase.from('prescribed_sets').select('*').in('block_exercise_id', beIds) : Promise.resolve({ data: [] }),
          exerciseCodes.length ? supabase.from('exercises').select('*').in('exercise_code', exerciseCodes) : Promise.resolve({ data: [] }),
        ]);
        const sets = setsData || [];
        const referencedExs = referencedExsData || [];
        if (!active) return;
        const blocksByWorkout = buildBlocksByWorkout(blocks);
        const blockExercisesByBlock = buildBlockExercisesByBlock(blockExs);
        const setsByBlockExercise = buildSetsByBlockExercise(sets);
        const exerciseMap = buildExerciseMapByCode(referencedExs);
        const merged = buildFlatExerciseList(w, blocksByWorkout, blockExercisesByBlock, setsByBlockExercise, exerciseMap);
        const finalExercises = merged.map((e) => ({
          ...e,
          target_weight: (e.exercise_id && exerciseWeights[e.exercise_id] != null) ? exerciseWeights[e.exercise_id] : null,
        }));
        setExercises(finalExercises);

        // Hydrate logs + per-exercise time from any previously saved exercise sessions
        const hydrated = {};
        loadedExerciseSessionsRef.current.forEach((es) => {
          const ex = finalExercises.find((e) => e.exercise_id === es.exercise_id);
          if (ex) {
            hydrated[ex.key] = {
              max_weight: es.max_weight || null,
              bodyweight: es.max_weight === 0,
              difficulty: es.difficulty,
              note: es.note,
            };
            exerciseSessionIdsRef.current[ex.key] = es.id;
            exerciseElapsedRef.current[ex.key] = es.elapsed_seconds || 0;
          }
        });
        if (Object.keys(hydrated).length) setLogs(hydrated);
      } catch {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [workoutId, user]);

  const current = exercises[index];
  const totalElapsed = sessionStartMs ? (Date.now() - sessionStartMs) / 1000 : 0;

  const updateLog = (key, patch) => {
    setLogs((l) => ({ ...l, [key]: { ...(l[key] || {}), ...patch } }));
    scheduleSave(key);
  };
  const getLog = (key) => logs[key] || {};

  const flushCurrentTime = () => {
    const cur = exercisesRef.current[indexRef.current];
    if (!cur) return;
    const delta = (Date.now() - enterTimeRef.current) / 1000;
    if (delta > 0) exerciseElapsedRef.current[cur.key] = (exerciseElapsedRef.current[cur.key] || 0) + delta;
    enterTimeRef.current = Date.now();
  };

  const saveLogToBackend = async (key) => {
    if (!userRef.current || !sessionIdRef.current) return;
    const ex = exercisesRef.current.find((e) => e.key === key);
    if (!ex) return;
    const log = logsRef.current[key];
    const existingId = exerciseSessionIdsRef.current[key];
    if (log?.skipped) {
      if (existingId) {
        try { await supabase.from('exercise_sessions').delete().eq('id', existingId); } catch {}
        delete exerciseSessionIdsRef.current[key];
      }
      return;
    }
    if (!log || (log.max_weight == null && !log.bodyweight && !log.difficulty && !log.note)) return;
    try {
      const payload = {
        user_id: userRef.current.id, workout_session_id: sessionIdRef.current, exercise_id: ex.exercise_id, exercise_name: ex.exercise_name,
        max_weight: log.bodyweight ? 0 : (log.max_weight ?? null), difficulty: log.difficulty || 'normal', note: log.note || '',
        sets: ex.effective_sets || ex.sets, reps: ex.reps, target_weight: ex.target_weight,
        elapsed_seconds: Math.round(exerciseElapsedRef.current[key] || 0),
      };
      if (existingId) {
        await supabase.from('exercise_sessions').update(payload).eq('id', existingId);
      } else {
        const { data: created } = await supabase.from('exercise_sessions').insert(payload).select().single();
        exerciseSessionIdsRef.current[key] = created.id;
      }
    } catch { /* silent */ }
  };

  const scheduleSave = (key) => {
    if (debounceTimers.current[key]) clearTimeout(debounceTimers.current[key]);
    debounceTimers.current[key] = setTimeout(() => saveLogToBackend(key), 800);
  };

  const flushSave = async (key) => {
    if (debounceTimers.current[key]) { clearTimeout(debounceTimers.current[key]); delete debounceTimers.current[key]; }
    await saveLogToBackend(key);
  };

  const goNext = async () => {
    flushCurrentTime();
    await flushSave(current.key);
    setIndex((i) => Math.min(i + 1, exercises.length - 1));
  };
  const goPrev = () => { flushCurrentTime(); setIndex((i) => Math.max(i - 1, 0)); };

  // Best-effort flush of any pending edits when leaving the screen.
  useEffect(() => {
    return () => {
      Object.values(debounceTimers.current).forEach((t) => t && clearTimeout(t));
      exercisesRef.current.forEach((e) => saveLogToBackend(e.key));
    };
  }, []);

  const restartWorkout = async () => {
    setRestartOpen(false);
    try {
      if (sessionIdRef.current) {
        await supabase.from('exercise_sessions').delete().eq('workout_session_id', sessionIdRef.current);
        await supabase.from('workout_sessions').delete().eq('id', sessionIdRef.current);
      }
    } catch { /* silent */ }
    setLogs({});
    exerciseSessionIdsRef.current = {};
    exerciseElapsedRef.current = {};
    setIndex(0);
    indexRef.current = 0;
    const dateStr = new Date().toISOString().slice(0, 10);
    const { data: s } = await supabase.from('workout_sessions').insert({
      user_id: userRef.current.id, workout_id: workoutId, workout_name: workoutRef.current?.name,
      date: dateStr, status: 'in_progress', start_timestamp: new Date().toISOString(),
    }).select().single();
    sessionIdRef.current = s.id;
    setSession(s);
    const startMs = new Date(s.start_timestamp).getTime();
    sessionStartMsRef.current = startMs;
    setSessionStartMs(startMs);
    enterTimeRef.current = Date.now();
  };

  const requestSubstitute = async () => {
    setSubSheet(true); setLoadingSubs(true); setAlternatives([]);
    try {
      const ex = current.details;
      if (!ex) { setLoadingSubs(false); return; }
      if (!fullExerciseMapRef.current) {
        const { data: allExs } = await supabase.from('exercises').select('*').order('created_date', { ascending: false }).limit(3000);
        fullExerciseMapRef.current = buildExerciseMapByCode(allExs || []);
      }
      const candidates = Object.values(fullExerciseMapRef.current).filter((e) => e.id !== ex.id);
      const ranked = candidates
        .map((c) => {
          let score = 0;
          if (c.movement_pattern === ex.movement_pattern) score += 40;
          if (c.primary_muscle_group && c.primary_muscle_group === ex.primary_muscle_group) score += 10;
          if (c.secondary_muscle_group && c.secondary_muscle_group === ex.secondary_muscle_group) score += 4;
          if (c.technical_difficulty === ex.technical_difficulty) score += 6;
          return { c, score };
        })
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);

      const { data: res } = await supabase.functions.invoke('suggestExerciseSubstitutes', {
        body: {
          exercise: {
            name: ex.name,
            movement_pattern: ex.movement_pattern,
            primary_muscle_group: ex.primary_muscle_group,
            equipment: ex.equipment,
          },
          candidates: ranked.map((x) => ({
            name: x.c.name,
            primary_muscle_group: x.c.primary_muscle_group,
            movement_pattern: x.c.movement_pattern,
            equipment: x.c.equipment,
          })),
        },
      });
      const withIds = (res?.alternatives || []).map((a) => {
        const match = ranked.find((x) => x.c.name === a.name);
        return { ...a, exercise: match?.c };
      }).filter((a) => a.exercise);
      setAlternatives(withIds);
    } catch { setAlternatives([]); }
    setLoadingSubs(false);
  };

  const [weightLoading, setWeightLoading] = useState(false);

  const persistWeight = async (exerciseCode, weight) => {
    if (!plan) return;
    const slot = plan.workouts?.find((s) => s.workout_id === workoutId);
    if (!slot) return;
    const updatedWeights = { ...(slot.exercise_weights || {}), [exerciseCode]: weight };
    const updatedWorkouts = plan.workouts.map((s) => s.workout_id === workoutId ? { ...s, exercise_weights: updatedWeights } : s);
    const updatedPlan = { ...plan, workouts: updatedWorkouts };
    setPlan(updatedPlan);
    try { await supabase.from('weekly_plans').update({ workouts: updatedWorkouts }).eq('id', plan.id); } catch { /* silent */ }
  };

  const calcWeight = async () => {
    if (!current?.exercise_id || !requiresWeight) return;
    setWeightLoading(true);
    try {
      const extraCodes = current.exercise_id ? [current.exercise_id] : [];
      const res = await supabase.functions.invoke('assignWorkoutWeights', { body: { workout_id: workoutId, extra_exercise_codes: extraCodes } });
      const ew = res.data?.exercise_weights || {};
      if (ew[current.exercise_id] != null) {
        setExercises((prev) => prev.map((e, i) => i === index ? { ...e, target_weight: ew[current.exercise_id] } : e));
        persistWeight(current.exercise_id, ew[current.exercise_id]);
      }
    } catch { /* silent */ }
    setWeightLoading(false);
  };

  const applySubstitute = async (alt) => {
    const newId = alt.exercise.exercise_code || alt.exercise.id;
    const next = [...exercises];
    next[index] = { ...next[index], exercise_id: newId, exercise_name: alt.exercise.name, details: alt.exercise, key: newId + '-sub-' + index, target_weight: null };
    setExercises(next);
    setLogs((l) => { const c = { ...l }; delete c[current.key]; return c; });
    setSubSheet(false);
    try {
      const res = await supabase.functions.invoke('assignWorkoutWeights', { body: { workout_id: workoutId, extra_exercise_codes: [alt.exercise.exercise_code].filter(Boolean) } });
      const ew = res.data?.exercise_weights || {};
      if (ew[newId] != null) {
        setExercises((prev) => prev.map((e, i) => i === index ? { ...e, target_weight: ew[newId] } : e));
        persistWeight(newId, ew[newId]);
      }
    } catch { /* silent */ }
  };

  const finish = async () => {
    setSaving(true);
    try {
      flushCurrentTime();
      await Promise.all(exercises.map((e) => flushSave(e.key)));
      const sid = sessionIdRef.current;
      const completedExercises = exercises.filter((e) => logs[e.key] && !logs[e.key].skipped);
      const overallDiff = completedExercises.length ? modeDifficulty(completedExercises.map((e) => logs[e.key].difficulty)) : 'normal';
      const total = sessionStartMsRef.current ? (Date.now() - sessionStartMsRef.current) / 1000 : 0;
      await supabase.from('workout_sessions').update({ status: 'completed', overall_difficulty: overallDiff, elapsed_seconds: Math.round(total) }).eq('id', sid);
      try { await supabase.functions.invoke('learnFromSessionFeedback', { body: { workout_session_id: sid } }); } catch {}
      navigate('/progress');
    } finally { setSaving(false); }
  };

  if (loading) return <div className="flex items-center justify-center min-h-screen"><div className="w-8 h-8 border-4 border-muted border-t-brand rounded-full animate-spin" /></div>;
  if (!workout) return <div className="p-6 text-center text-muted-foreground">Workout not found.</div>;
  if (!current) return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="px-5 pt-8 pb-3 border-b border-border">
        <div className="flex items-center gap-2">
          <button onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))} className="p-1 -ml-1"><ChevronLeft className="h-5 w-5" /></button>
          <h1 className="font-semibold truncate">{workout?.name}</h1>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-muted border-t-brand rounded-full animate-spin" />
      </div>
    </div>
  );

  const log = getLog(current.key);
  const isLast = index === exercises.length - 1;
  const requiresWeight = current.details?.requires_load !== false;
  const done = !requiresWeight || log.max_weight != null || log.bodyweight || log.skipped;
  const setsValue = current.rounds > 1 ? current.effective_sets : current.sets;
  const setsSubtext = current.rounds > 1 ? `${current.rounds} rounds` : null;
  const back = () => (window.history.length > 1 ? navigate(-1) : navigate('/'));

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="px-5 pt-8 pb-3 border-b border-border">
        <div className="flex items-center gap-2 mb-2">
          <button onClick={back} className="p-1 -ml-1"><ChevronLeft className="h-5 w-5" /></button>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground">Exercise {index + 1} of {exercises.length}</p>
            <h1 className="font-semibold truncate">{workout.name}</h1>
          </div>
          <div className="flex items-center gap-1 text-xs font-semibold text-muted-foreground tabular-nums">
            <Clock className="h-3.5 w-3.5" />
            {formatDuration(totalElapsed)}
          </div>
          <button onClick={() => setRestartOpen(true)} className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted"><RotateCcw className="h-4 w-4" /></button>
        </div>
        <div className="flex gap-1 mt-2">
          {exercises.map((e, i) => (
            <button key={e.key} onClick={() => { flushCurrentTime(); setIndex(i); }} className={cn('h-1 flex-1 rounded-full transition-colors', i === index ? 'bg-brand' : logs[e.key] ? 'bg-brand/40' : 'bg-muted')} />
          ))}
        </div>
      </header>

      <div className="flex-1 px-5 py-4 overflow-y-auto">
        <h2 className="text-xl font-semibold tracking-tight">{current.exercise_name}</h2>
        <div className="flex flex-wrap gap-2 mt-1 mb-4 text-xs text-muted-foreground">
          {current.details?.movement_pattern && <span className="capitalize">{current.details.movement_pattern}</span>}
          {current.details?.equipment && <><span>·</span><span>{current.details.equipment}</span></>}
        </div>

        {current.details?.video_url && (
          <YouTubeVideo url={current.details.video_url} title={current.exercise_name} className="mb-4" />
        )}

        <div className="grid grid-cols-4 gap-2 mb-4">
          <Spec label="Sets" value={setsValue} subtext={setsSubtext} />
          <Spec label="Reps" value={current.reps} />
          <Spec label="Weight" value={current.target_weight ? current.target_weight + 'kg' : '—'} loading={weightLoading} onClick={requiresWeight && !current.target_weight ? calcWeight : null} />
          <Spec label="Rest" value={current.rest_seconds ? current.rest_seconds + 's' : '—'} />
        </div>

        {current.coach_note && <p className="text-xs text-muted-foreground bg-muted/50 rounded-xl p-3 mb-4">Coach note: {current.coach_note}</p>}
        {current.details?.notes && <p className="text-sm leading-relaxed text-muted-foreground mb-5">{current.details.notes}</p>}

        {log.skipped ? (
          <Card className="rounded-2xl border-border p-4 text-center text-sm text-muted-foreground">Exercise skipped</Card>
        ) : (
          <div className="space-y-4">
            {requiresWeight && (
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-muted-foreground">Max weight used (kg)</label>
                  <button type="button" onClick={() => updateLog(current.key, log.bodyweight ? { bodyweight: false, max_weight: null } : { bodyweight: true, max_weight: 0 })} className={cn('text-[10px] font-semibold px-2.5 py-1 rounded-full border transition-colors', log.bodyweight ? 'bg-brand text-brand-foreground border-brand' : 'border-border text-muted-foreground')}>Bodyweight</button>
                </div>
                {log.bodyweight ? (
                  <div className="w-full mt-1 rounded-xl border border-brand/30 bg-brand/5 px-4 py-3 text-lg font-semibold text-brand text-center">Bodyweight</div>
                ) : (
                  <input type="number" inputMode="decimal" value={log.max_weight ?? ''} onChange={(e) => updateLog(current.key, { max_weight: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) })} placeholder={current.target_weight ? String(current.target_weight) : '0'} className="w-full mt-1 rounded-xl border border-border bg-background px-4 py-3 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-brand" />
                )}
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-muted-foreground">How did it feel?</label>
              <div className="grid grid-cols-4 gap-2 mt-1">
                {Object.entries(DIFFICULTY_META).map(([val, meta]) => (
                  <button key={val} onClick={() => updateLog(current.key, { difficulty: val })} className={cn('py-2.5 rounded-xl border text-xs font-medium transition-all', log.difficulty === val ? meta.color + ' border-current' : 'border-border text-muted-foreground')}>{meta.label}</button>
                ))}
              </div>
            </div>
            <textarea value={log.note || ''} onChange={(e) => updateLog(current.key, { note: e.target.value })} placeholder="Optional note…" className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm min-h-[60px] focus:outline-none focus:ring-2 focus:ring-brand" />
          </div>
        )}
      </div>

      <div className="sticky bottom-0 px-5 py-4 bg-background border-t border-border">
        <div className="flex items-center gap-2">
          <button onClick={() => { flushCurrentTime(); updateLog(current.key, { skipped: true }); }} className="flex flex-col items-center justify-center gap-0.5 w-14 h-14 rounded-xl border border-border text-muted-foreground"><SkipForward className="h-4 w-4" /><span className="text-[10px]">Skip</span></button>
          <button onClick={requestSubstitute} className="flex flex-col items-center justify-center gap-0.5 w-14 h-14 rounded-xl border border-border text-muted-foreground"><RefreshCw className="h-4 w-4" /><span className="text-[10px]">Swap</span></button>
          <Button onClick={isLast ? finish : goNext} disabled={saving || !done} className="flex-1 rounded-xl h-14 bg-brand text-brand-foreground hover:bg-brand/90">
            {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : isLast ? <><Check className="h-5 w-5 mr-2" /> Finish workout</> : <>Next <ChevronRight className="h-5 w-5 ml-1" /></>}
          </Button>
        </div>
      </div>

      <Sheet open={subSheet} onOpenChange={setSubSheet}>
        <SheetContent side="bottom" className="rounded-t-3xl max-h-[80vh] overflow-y-auto">
          <SheetHeader className="px-5 pt-5"><SheetTitle className="text-left">Substitute exercise</SheetTitle></SheetHeader>
          <div className="px-5 pb-8 space-y-3">
            {loadingSubs ? (
              <div className="flex justify-center py-10"><Loader2 className="h-7 w-7 text-brand animate-spin" /></div>
            ) : alternatives.length ? (
              alternatives.map((a, i) => (
                <Card key={i} className="rounded-2xl border-border p-4">
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-medium">{a.exercise.name}</p>
                    <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', a.confidence >= 75 ? 'bg-emerald-50 text-emerald-600' : a.confidence >= 50 ? 'bg-amber-50 text-amber-600' : 'bg-rose-50 text-rose-600')}>{a.confidence}% match</span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">{a.reason}</p>
                  <Button onClick={() => applySubstitute(a)} size="sm" className="rounded-lg bg-brand text-brand-foreground hover:bg-brand/90">Use this</Button>
                </Card>
              ))
            ) : <p className="text-center text-sm text-muted-foreground py-8">No suitable alternatives found.</p>}
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={restartOpen} onOpenChange={setRestartOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restart workout?</AlertDialogTitle>
            <AlertDialogDescription>
              This will erase all progress and time logged for this workout and start over from the first exercise. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={restartWorkout} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Restart
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Spec({ label, value, subtext, loading, onClick }) {
  return (
    <div className={cn('rounded-xl bg-muted/50 p-3 text-center', onClick && 'cursor-pointer hover:bg-muted transition-colors')} onClick={onClick || undefined}>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center justify-center gap-1">
        {label}
        {onClick && !loading && <RefreshCw className="h-2.5 w-2.5" />}
      </p>
      <p className="font-semibold text-sm mt-0.5 flex items-center justify-center gap-1">
        {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : value}
      </p>
      {subtext && <p className="text-[9px] text-muted-foreground mt-0.5 leading-none">{subtext}</p>}
    </div>
  );
}

function modeDifficulty(arr) {
  const count = {};
  arr.forEach((d) => { if (d) count[d] = (count[d] || 0) + 1; });
  return Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0] || 'normal';
}