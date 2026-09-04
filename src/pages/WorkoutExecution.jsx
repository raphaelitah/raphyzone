import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import YouTubeVideo from '@/components/YouTubeVideo';
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
import { ChevronLeft, ChevronRight, SkipForward, RefreshCw, Loader2, RotateCcw, Clock, Play, Pause, XCircle, Search, Dumbbell, Footprints } from 'lucide-react';
import { DIFFICULTY_META, mondayOf, fmtISO, parseDate, isRunningExercise } from '@/lib/fitness';
import WorkoutTimerPanel from '@/components/WorkoutTimerPanel';
import SupersetPanel from '@/components/SupersetPanel';
import useIntervalTimer from '@/hooks/useIntervalTimer';
import { cn } from '@/lib/utils';
import { playCountdownBeep, playGoBeep } from '@/lib/timerSounds';
import {
  buildBlocksByWorkout,
  buildBlockExercisesByBlock,
  buildSetsByBlockExercise,
  buildExerciseMapByCode,
  buildFlatExerciseList,
  deriveBlockTimerConfig,
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
  const [searchParams] = useSearchParams();
  const targetDate = searchParams.get('date') || fmtISO(new Date());
  const [workout, setWorkout] = useState(null);
  const [exercises, setExercises] = useState([]);
  const [index, setIndex] = useState(0);
  const [logs, setLogs] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [subSheet, setSubSheet] = useState(false);
  const [alternatives, setAlternatives] = useState([]);
  const [loadingSubs, setLoadingSubs] = useState(false);
  const [subTarget, setSubTarget] = useState(null); // the exercise (with .key) currently being swapped
  const [manualQuery, setManualQuery] = useState('');
  const [debouncedManualQuery, setDebouncedManualQuery] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedManualQuery(manualQuery.trim()), 250);
    return () => clearTimeout(t);
  }, [manualQuery]);
  const [plan, setPlan] = useState(null);
  const [, setSession] = useState(null);
  const [sessionStartMs, setSessionStartMs] = useState(null);
  const [timerStarted, setTimerStarted] = useState(false);
  const [restartOpen, setRestartOpen] = useState(false);
  const [stopOpen, setStopOpen] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [conflictSession, setConflictSession] = useState(null);
  const [endingConflict, setEndingConflict] = useState(false);
  const [completedBlockTimers, setCompletedBlockTimers] = useState(() => new Set());
  const [restOverrides, setRestOverrides] = useState({}); // block_id -> rest seconds, sticky for the rest of the session
  const [armedTimerConfig, setArmedTimerConfig] = useState(null);
  // Rest owed between the block that just finished and the next one — runs on
  // wall-clock time so it keeps ticking through the log/tracking screen
  // instead of pausing while the athlete logs their performance.
  const [blockRestUntil, setBlockRestUntil] = useState(null);
  const blockRestUntilRef = useRef(null);
  useEffect(() => { blockRestUntilRef.current = blockRestUntil; }, [blockRestUntil]);
  const [blockRestFromId, setBlockRestFromId] = useState(null);
  const [pendingTabataStart, setPendingTabataStart] = useState(null); // Tabata start values held while confirming an early start during rest
  const [logPrompt, setLogPrompt] = useState(null); // { keys: string[], blockId: string|null }
  const [blockLogEntries, setBlockLogEntries] = useState({});
  const [, setTick] = useState(0);
  const [workoutPaused, setWorkoutPaused] = useState(false);

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
  const sessionCreatedMsRef = useRef(null); // fallback for elapsed-time if the clock never got an explicit start
  const loadedExerciseSessionsRef = useRef([]);
  const pausedAtRef = useRef(null);
  const blockTimerWasRunningRef = useRef(false);
  const progressHydratedRef = useRef(false); // guards the progress-persist effect until initial load/resume has set index

  useEffect(() => { logsRef.current = logs; }, [logs]);
  useEffect(() => { exercisesRef.current = exercises; }, [exercises]);
  useEffect(() => { userRef.current = user; }, [user]);
  useEffect(() => { workoutRef.current = workout; }, [workout]);
  useEffect(() => { indexRef.current = index; }, [index]);

  // Total timer: continue-across-break (wall-clock from first start)
  useEffect(() => {
    if (sessionStartMs == null) return;
    const id = setInterval(() => {
      setTick((t) => t + 1);
      const until = blockRestUntilRef.current;
      if (until == null) return;
      const remaining = Math.round((until - Date.now()) / 1000);
      if (remaining <= 0) {
        playGoBeep();
      } else if (remaining === 3 || remaining === 2 || remaining === 1) {
        playCountdownBeep();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [sessionStartMs]);

  // Reset per-exercise enter time whenever the active exercise changes
  useEffect(() => { enterTimeRef.current = Date.now(); }, [index]);

  // Clears the inter-block rest once its wall-clock deadline passes, checked
  // on every 1s tick (above) so it expires whether or not the log/tracking
  // screen for the finished block is still open.
  useEffect(() => {
    if (blockRestUntil != null && Date.now() >= blockRestUntil) {
      setBlockRestUntil(null);
      setBlockRestFromId(null);
    }
  });

  // Persist exactly where the athlete currently is (including which blocks
  // they've skipped past, which never gets an exercise_sessions row of its
  // own) so leaving and resuming lands them back here instead of exercise 1.
  useEffect(() => {
    if (!progressHydratedRef.current || !sessionIdRef.current) return;
    supabase.from('workout_sessions')
      .update({ progress: { index, completedBlockIds: [...completedBlockTimers] } })
      .eq('id', sessionIdRef.current)
      .then(() => {});
  }, [index, completedBlockTimers]);

  const pendingLoadRef = useRef(null);

  // A unique index on workout_sessions(user_id) where status='in_progress' is the
  // real guard against two in-progress sessions (the app-level checks above can
  // both pass in a race — e.g. two tabs starting a workout at once). If our insert
  // loses that race, fetch whichever session won: if it's for the same workout+date
  // we were starting, just adopt it; otherwise surface it as the usual conflict.
  const insertInProgressSession = async (payload) => {
    const { data, error } = await supabase.from('workout_sessions').insert(payload).select().single();
    if (!error) return { session: data, conflict: null };
    if (error.code === '23505') {
      const { data: winner } = await supabase.from('workout_sessions').select('*').eq('user_id', payload.user_id).eq('status', 'in_progress').maybeSingle();
      if (winner && winner.workout_id === payload.workout_id && winner.date === payload.date) {
        return { session: winner, conflict: null };
      }
      return { session: null, conflict: winner || null };
    }
    throw error;
  };

  // `sessionExisted` means this session was found already sitting in the
  // database (as opposed to one we just inserted) — the athlete may have left
  // and come back. That's distinct from "the clock was already started":
  // skipping past exercises never requires starting the block/set timer, so
  // progress can exist on a session whose start_timestamp is still null.
  const finishLoadingWorkout = async (sess, w, plans, active, sessionExisted) => {
    sessionIdRef.current = sess.id;
    sessionCreatedMsRef.current = sess.created_date ? new Date(sess.created_date).getTime() : Date.now();
    setSession(sess);
    if (sessionExisted && sess.start_timestamp) {
      // The user already started this session's clock earlier — keep it running across the resume.
      const startMs = new Date(sess.start_timestamp).getTime();
      sessionStartMsRef.current = startMs;
      setSessionStartMs(startMs);
      setTimerStarted(true);
    }
    enterTimeRef.current = Date.now();

    // Load any already-saved exercise sessions for hydration, in parallel with the workout's blocks
    const [exerciseSessionsResult, blocksResult] = await Promise.allSettled([
      supabase.from('exercise_sessions').select('*').eq('workout_session_id', sess.id),
      supabase.from('workout_blocks').select('*').eq('workout_id', w.workout_id).order('order_index').limit(500),
    ]);
    loadedExerciseSessionsRef.current = (exerciseSessionsResult.status === 'fulfilled' ? exerciseSessionsResult.value.data : null) || [];
    if (!active()) return;

    setLoading(false);

    const currentPlan = (plans || []).find((p) => p.status === 'approved') || plans?.[0] || null;
    setPlan(currentPlan);
    const planSlot = currentPlan?.workouts?.find((s) => s.workout_id === workoutId);
    const exerciseWeights = planSlot?.exercise_weights || {};

    const blocks = (blocksResult.status === 'fulfilled' ? blocksResult.value.data : null) || [];
    if (!active()) return;
    const blockIds = blocks.map((b) => b.block_id);
    const blockExs = blockIds.length
      ? (await supabase.from('block_exercises').select('*').in('block_id', blockIds)).data || []
      : [];
    if (!active()) return;
    const exerciseBlockExs = blockExs.filter((be) => be.step_type === 'exercise');
    const beIds = exerciseBlockExs.map((be) => be.block_exercise_id);
    const exerciseCodes = [...new Set(exerciseBlockExs.map((be) => be.exercise_id).filter(Boolean))];
    const [{ data: setsData }, { data: referencedExsData }] = await Promise.all([
      beIds.length ? supabase.from('prescribed_sets').select('*').in('block_exercise_id', beIds) : Promise.resolve({ data: [] }),
      exerciseCodes.length ? supabase.from('exercises').select('*').in('exercise_code', exerciseCodes) : Promise.resolve({ data: [] }),
    ]);
    const sets = setsData || [];
    const referencedExs = referencedExsData || [];
    if (!active()) return;
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
          distance_km: es.distance_km ?? null,
          duration_seconds: es.duration_seconds ?? null,
          difficulty: es.difficulty,
          note: es.note,
        };
        exerciseSessionIdsRef.current[ex.key] = es.id;
        exerciseElapsedRef.current[ex.key] = es.elapsed_seconds || 0;
      }
    });
    if (Object.keys(hydrated).length) setLogs(hydrated);

    if (sessionExisted) {
      // Land back where the athlete left off. The `progress` column is the
      // precise record of this (it also covers skipped exercises, which
      // intentionally never get an exercise_sessions row); fall back to
      // deriving it from logged exercises for older sessions saved before
      // that column existed.
      const savedProgress = sess.progress;
      let completed = new Set(Array.isArray(savedProgress?.completedBlockIds) ? savedProgress.completedBlockIds : []);
      let resumeIdx = Number.isInteger(savedProgress?.index) ? savedProgress.index : null;

      if (resumeIdx == null) {
        // Mark any block whose exercises are all already logged as done, then
        // jump to the first exercise (in or outside a block) that isn't yet
        // logged — completed work stays a milestone instead of forcing a
        // restart from exercise 1.
        const blockIds = [...new Set(finalExercises.map((e) => e.block_id).filter(Boolean))];
        completed = new Set();
        blockIds.forEach((bid) => {
          const blockExs = finalExercises.filter((e) => e.block_id === bid);
          if (blockExs.length && blockExs.every((e) => hydrated[e.key])) completed.add(bid);
        });
        resumeIdx = finalExercises.findIndex((e) => !hydrated[e.key] && !(e.block_id && completed.has(e.block_id)));
      }
      if (resumeIdx === -1 || resumeIdx == null) resumeIdx = 0;
      resumeIdx = Math.min(Math.max(0, resumeIdx), Math.max(0, finalExercises.length - 1));

      if (completed.size) setCompletedBlockTimers(completed);
      setIndex(resumeIdx);
      indexRef.current = resumeIdx;
    }
    progressHydratedRef.current = true;
  };

  useEffect(() => {
    let alive = true;
    const active = () => alive;
    setConflictSession(null);
    pendingLoadRef.current = null;
    (async () => {
      try {
        const monday = fmtISO(mondayOf(parseDate(targetDate)));
        const [{ data: w }, { data: plans }] = await Promise.all([
          supabase.from('workouts').select('*').eq('id', workoutId).single(),
          user ? supabase.from('weekly_plans').select('*').eq('user_id', user.id).eq('week_start_date', monday) : Promise.resolve({ data: [] }),
        ]);
        if (!active()) return;
        setWorkout(w);

        if (!user) { setLoading(false); return; }

        const { data: inProgress } = await supabase.from('workout_sessions').select('*').eq('user_id', user.id).eq('status', 'in_progress').order('created_date', { ascending: false });
        if (!active()) return;
        const STALE_MS = 6 * 60 * 60 * 1000; // sessions abandoned (tab closed, crash, etc.) without being explicitly ended
        const isStale = (s) => Date.now() - new Date(s.created_date).getTime() > STALE_MS;
        const allSessions = inProgress || [];
        const staleSessions = allSessions.filter(isStale);
        if (staleSessions.length) {
          supabase.from('workout_sessions').update({ status: 'skipped' }).in('id', staleSessions.map((s) => s.id)).then(() => {});
        }
        const sessions = allSessions.filter((s) => !isStale(s));
        let sess = sessions.find((s) => s.workout_id === workoutId && s.date === targetDate);
        const other = sessions.find((s) => s.id !== sess?.id);

        if (other) {
          // Another workout is already in progress — hold off (even if this one already
          // has its own matching session to resume) until the user decides, so there's
          // never more than one in-progress session at a time.
          pendingLoadRef.current = { w, plans, sess };
          setLoading(false);
          setConflictSession(other);
          return;
        }

        const sessionExisted = !!sess;
        if (!sess) {
          const { session, conflict } = await insertInProgressSession({
            user_id: user.id, workout_id: workoutId, workout_name: w.name,
            date: targetDate, status: 'in_progress',
          });
          if (conflict) {
            if (!active()) return;
            pendingLoadRef.current = { w, plans };
            setLoading(false);
            setConflictSession(conflict);
            return;
          }
          sess = session;
        }
        if (!active() || !sess) return;
        await finishLoadingWorkout(sess, w, plans, active, sessionExisted);
      } catch {
        if (active()) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [workoutId, user, targetDate]);

  const endConflictAndStart = async () => {
    if (!conflictSession || !user) return;
    setEndingConflict(true);
    try {
      await supabase.from('workout_sessions').update({ status: 'skipped' }).eq('id', conflictSession.id);
      const { w, plans, sess: existingSess } = pendingLoadRef.current || {};
      let sess = existingSess;
      const sessionExisted = !!sess;
      if (!sess) {
        const { session, conflict } = await insertInProgressSession({
          user_id: user.id, workout_id: workoutId, workout_name: w?.name,
          date: targetDate, status: 'in_progress',
        });
        if (conflict) {
          // Lost the race to yet another session started elsewhere — show that one instead.
          setConflictSession(conflict);
          return;
        }
        sess = session;
      }
      setConflictSession(null);
      pendingLoadRef.current = null;
      setLoading(true);
      await finishLoadingWorkout(sess, w, plans, () => true, sessionExisted);
    } finally {
      setEndingConflict(false);
    }
  };

  const current = exercises[index];
  const totalElapsed = sessionStartMs
    ? ((workoutPaused && pausedAtRef.current ? pausedAtRef.current : Date.now()) - sessionStartMs) / 1000
    : 0;

  const currentBlockExercises = current ? exercises.filter((e) => e.block_id === current.block_id) : [];
  const blockTimerMeta = current
    ? deriveBlockTimerConfig(
        {
          block_type: current.block_type,
          workout_format: current.workout_format,
          work_seconds: current.work_seconds,
          rest_seconds: current.block_rest_seconds,
          rounds: current.block_rounds,
          time_cap_sec: current.time_cap_sec,
        },
        currentBlockExercises.length
      )
    : null;
  const blockLabel = blockTimerMeta?.blockLabel ?? null;
  const isEmomFamily = blockTimerMeta?.isEmomFamily ?? false;
  const isAlternatingEmom = blockTimerMeta?.isAlternatingEmom ?? false;
  const isSuperset = blockTimerMeta?.isSuperset ?? false;
  const timerDefaultConfig = blockTimerMeta?.timerDefaultConfig ?? null;
  const adjustRest = (blockId, baseSec, delta) => {
    setRestOverrides((prev) => ({ ...prev, [blockId]: Math.max(0, (prev[blockId] ?? baseSec) + delta) }));
  };
  const isBlockActive = !!(current && blockLabel && !completedBlockTimers.has(current.block_id) && !(logPrompt && logPrompt.keys.includes(current.key)));
  const timerArmed = !!(armedTimerConfig && current && armedTimerConfig.blockId === current.block_id);

  const timer = useIntervalTimer(armedTimerConfig || { mode: 'countdown', durationSec: 0 });

  useEffect(() => {
    if (armedTimerConfig && timer.status === 'idle') timer.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armedTimerConfig]);

  // Pausing freezes the session stopwatch (by shifting sessionStartMs forward
  // by however long the pause lasted, once resumed) and, if a block timer
  // (EMOM/Tabata/interval) is mid-run, pauses that too so it doesn't keep
  // counting down behind the overlay.
  const togglePause = () => {
    if (workoutPaused) {
      const pausedMs = pausedAtRef.current ? Date.now() - pausedAtRef.current : 0;
      pausedAtRef.current = null;
      if (sessionStartMsRef.current != null) {
        sessionStartMsRef.current += pausedMs;
        setSessionStartMs(sessionStartMsRef.current);
      }
      if (blockTimerWasRunningRef.current && (timer.status === 'paused' || timer.status === 'pausedLeadin')) timer.resume();
      blockTimerWasRunningRef.current = false;
      setWorkoutPaused(false);
    } else {
      pausedAtRef.current = Date.now();
      blockTimerWasRunningRef.current = timer.status === 'running' || timer.status === 'leadin';
      if (timer.status === 'running' || timer.status === 'leadin') timer.pause();
      setWorkoutPaused(true);
    }
  };

  // Moves past every exercise in a finished/skipped block in one step, landing
  // on whatever comes next in the workout (not back into the block itself).
  // Returns true when advancing past this block would land past the end of
  // the workout, i.e. it's the last block/exercise — the caller should
  // finish() instead of calling advancePastBlock (which clamps back onto
  // the same index and would otherwise strand the athlete on it forever).
  const isLastBlock = (blockId) => {
    let lastIdx = -1;
    exercises.forEach((e, i) => { if (e.block_id === blockId) lastIdx = i; });
    return lastIdx === exercises.length - 1;
  };

  const advancePastBlock = (blockId) => {
    setCompletedBlockTimers((prev) => {
      if (prev.has(blockId)) return prev;
      const next = new Set(prev);
      next.add(blockId);
      return next;
    });
    let lastIdx = -1;
    exercises.forEach((e, i) => { if (e.block_id === blockId) lastIdx = i; });
    const nextIdx = Math.min(lastIdx + 1, exercises.length - 1);
    flushCurrentTime();
    setIndex(nextIdx);
  };

  // Starts the wall-clock rest owed after finishing `blockId`, if it isn't
  // the last block and has a configured rest_seconds. Tracking performance
  // on the log screen afterward doesn't add extra rest — it just runs
  // concurrently with this same countdown.
  const startInterBlockRest = (blockId) => {
    if (!blockId || isLastBlock(blockId)) return;
    const restSec = exercises.find((e) => e.block_id === blockId)?.rest_seconds || 0;
    if (restSec <= 0) return;
    setBlockRestUntil(Date.now() + restSec * 1000);
    setBlockRestFromId(blockId);
  };

  useEffect(() => {
    if (!armedTimerConfig || timer.status !== 'done') return;
    const blockId = armedTimerConfig.blockId;
    timer.reset(); // otherwise the next block's timer starts already "done"
    setArmedTimerConfig(null);
    startInterBlockRest(blockId);
    openLogPrompt(exercises.filter((e) => e.block_id === blockId).map((e) => e.key), blockId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timer.status, armedTimerConfig]);

  const handleStartBlockTimer = (values) => {
    if (!current || !blockLabel) return;
    // Starting mid-rest is allowed, but confirmed first — rest keeps running
    // underneath so the athlete can browse the upcoming block while resting,
    // and jumping in early is a deliberate choice, not an accident.
    if (restingBeforeNextBlock) {
      setPendingTabataStart(values);
      return;
    }
    startTimer();
    setArmedTimerConfig({
      mode: 'interval',
      workSec: values.workSec,
      restSec: values.restSec,
      rounds: values.rounds,
      exerciseCount: (isEmomFamily && !isAlternatingEmom) ? 1 : currentBlockExercises.length,
      blockId: current.block_id,
    });
  };

  const confirmStartWhileResting = () => {
    if (!pendingTabataStart || !current) return;
    const values = pendingTabataStart;
    setPendingTabataStart(null);
    skipInterBlockRest();
    startTimer();
    setArmedTimerConfig({
      mode: 'interval',
      workSec: values.workSec,
      restSec: values.restSec,
      rounds: values.rounds,
      exerciseCount: (isEmomFamily && !isAlternatingEmom) ? 1 : currentBlockExercises.length,
      blockId: current.block_id,
    });
  };

  // Bailing out mid-timer skips straight past the block with no log, same as
  // skipping a single exercise — there's nothing to record for work not done.
  const handleSkipBlock = () => {
    if (!armedTimerConfig) return;
    const blockId = armedTimerConfig.blockId;
    timer.reset();
    setArmedTimerConfig(null);
    advancePastBlock(blockId);
  };

  // Accumulates the time spent on one superset exercise's set (tracked by
  // SupersetPanel via tap-to-start/stop) into that exercise's saved elapsed time.
  const handleSupersetExerciseElapsed = (key, deltaSeconds) => {
    if (!deltaSeconds || deltaSeconds <= 0) return;
    exerciseElapsedRef.current[key] = (exerciseElapsedRef.current[key] || 0) + deltaSeconds;
    scheduleSave(key);
  };

  // Seeds one editable entry per exercise so the completion screen can
  // capture max weight/distance-time/difficulty/note per exercise — for a
  // real block (blockId set) that's every exercise in it; for a solo
  // exercise it's just the one.
  const openLogPrompt = (keys, blockId = null, review = false) => {
    const entries = {};
    keys.forEach((key) => {
      const existing = logs[key] || {};
      entries[key] = {
        difficulty: existing.difficulty || null,
        note: existing.note || '',
        max_weight: existing.max_weight ?? null,
        bodyweight: !!existing.bodyweight,
        distance_km: existing.distance_km ?? null,
        duration_seconds: existing.duration_seconds ?? null,
      };
    });
    setBlockLogEntries(entries);
    setLogPrompt({ keys, blockId, review });
  };

  // Jumping to an exercise (or a member of a block) that's already been
  // logged opens it straight on the completion/edit screen instead of
  // making the athlete redo the sets — completed means completed.
  const goToExercise = (i) => {
    flushCurrentTime();
    setIndex(i);
    const target = exercises[i];
    if (!target) { setLogPrompt(null); return; }
    if (target.block_id && completedBlockTimers.has(target.block_id)) {
      openLogPrompt(exercises.filter((e) => e.block_id === target.block_id).map((e) => e.key), target.block_id, true);
    } else if (logs[target.key] && !logs[target.key].skipped) {
      openLogPrompt([target.key], null, true);
    } else {
      setLogPrompt(null);
    }
  };

  const updateBlockLogEntry = (key, patch) => {
    setBlockLogEntries((prev) => ({ ...prev, [key]: { ...(prev[key] || {}), ...patch } }));
  };

  const handleSupersetFinish = () => {
    if (!current) return;
    startInterBlockRest(current.block_id);
    openLogPrompt(exercises.filter((e) => e.block_id === current.block_id).map((e) => e.key), current.block_id);
  };

  const handleSupersetSkip = () => {
    if (!current) return;
    if (isLastBlock(current.block_id)) {
      setCompletedBlockTimers((prev) => new Set(prev).add(current.block_id));
      finish();
    } else {
      advancePastBlock(current.block_id);
    }
  };

  // A standalone exercise is tracked the same way as a one-exercise block:
  // tap-to-start/stop each set with rest in between, then log max weight (or
  // distance/time) once all sets are done.
  const handleSoloFinish = () => {
    if (!current) return;
    startInterBlockRest(current.block_id);
    openLogPrompt([current.key], null);
  };

  const handleSoloSkip = () => {
    if (!current) return;
    flushCurrentTime();
    updateLog(current.key, { skipped: true });
    if (isLast) finish(); else goNext();
  };

  const handleSaveLogPrompt = () => {
    if (!logPrompt || saving) return;
    const { keys, blockId, review } = logPrompt;
    keys.forEach((key) => {
      const entry = blockLogEntries[key] || {};
      updateLog(key, {
        difficulty: entry.difficulty || 'normal',
        note: entry.note || '',
        max_weight: entry.bodyweight ? 0 : (entry.max_weight ?? null),
        bodyweight: !!entry.bodyweight,
        distance_km: entry.distance_km ?? null,
        duration_seconds: entry.duration_seconds ?? null,
      });
    });
    // Editing something already completed: keep the same edit screen open
    // (with what was just saved) instead of clearing it — landing back here
    // is driven by completion state, not this one-shot prompt, so clearing
    // it would just fall through to a fresh "Set 1" panel.
    if (review) return;
    setBlockLogEntries({});
    setLogPrompt(null);
    if (blockId) {
      if (isLastBlock(blockId)) {
        setCompletedBlockTimers((prev) => new Set(prev).add(blockId));
        finish();
      } else {
        advancePastBlock(blockId);
      }
    } else if (isLast) {
      finish();
    } else {
      goNext();
    }
  };

  // A block either rotates through its exercises one at a time (Tabata, and an
  // "alternating" EMOM) or runs them all together every round (default EMOM).
  const isRotatingBlock = !isEmomFamily || isAlternatingEmom;
  let displayExercise = current;
  let isPreviewExercise = false;
  let nextUpName = null;
  if (isBlockActive && isRotatingBlock && timerArmed) {
    if (blockLabel === 'Tabata' && timer.phase === 'rest' && timer.nextExerciseIndex != null) {
      displayExercise = currentBlockExercises[timer.nextExerciseIndex] || current;
      isPreviewExercise = true;
    } else {
      displayExercise = currentBlockExercises[timer.exerciseIndex] || current;
      if (isAlternatingEmom && timer.nextExerciseIndex != null) {
        nextUpName = currentBlockExercises[timer.nextExerciseIndex]?.exercise_name || null;
      }
    }
  } else if (isBlockActive && isRotatingBlock) {
    displayExercise = currentBlockExercises[0] || current;
  }

  const startTimer = async () => {
    if (timerStarted) return;
    const startMs = Date.now();
    sessionStartMsRef.current = startMs;
    setSessionStartMs(startMs);
    setTimerStarted(true);
    enterTimeRef.current = startMs;
    if (sessionIdRef.current) {
      await supabase.from('workout_sessions').update({ start_timestamp: new Date(startMs).toISOString() }).eq('id', sessionIdRef.current);
    }
  };

  const updateLog = (key, patch) => {
    setLogs((l) => {
      const next = { ...l, [key]: { ...(l[key] || {}), ...patch } };
      logsRef.current = next; // keep in sync immediately — callers may flushSave() in the same tick
      return next;
    });
    scheduleSave(key);
  };
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
    if (!log || (log.max_weight == null && !log.bodyweight && log.distance_km == null && log.duration_seconds == null && !log.difficulty && !log.note)) return;
    try {
      const payload = {
        user_id: userRef.current.id, workout_session_id: sessionIdRef.current, exercise_id: ex.exercise_id, exercise_name: ex.exercise_name,
        max_weight: log.bodyweight ? 0 : (log.max_weight ?? null), difficulty: log.difficulty || 'normal', note: log.note || '',
        sets: ex.effective_sets ?? ex.sets, reps: ex.reps, target_weight: ex.target_weight,
        distance_km: log.distance_km ?? null, duration_seconds: log.duration_seconds ?? null,
        elapsed_seconds: Math.round(exerciseElapsedRef.current[key] || 0),
        order_index: ex.order ?? null,
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

  // Best-effort flush of any pending edits when leaving the screen.
  useEffect(() => {
    return () => {
      Object.values(debounceTimers.current).forEach((t) => t && clearTimeout(t));
      exercisesRef.current.forEach((e) => saveLogToBackend(e.key));
    };
  }, []);

  const restartWorkout = async () => {
    setRestartOpen(false);
    progressHydratedRef.current = false; // pause progress-persist until the new session id is in place
    try {
      if (sessionIdRef.current) {
        await supabase.from('exercise_sessions').delete().eq('workout_session_id', sessionIdRef.current);
        await supabase.from('workout_sessions').delete().eq('id', sessionIdRef.current);
      }
    } catch { /* silent */ }
    setLogs({});
    setRestOverrides({});
    setCompletedBlockTimers(new Set());
    exerciseSessionIdsRef.current = {};
    exerciseElapsedRef.current = {};
    setIndex(0);
    indexRef.current = 0;
    let s;
    try {
      const { session, conflict } = await insertInProgressSession({
        user_id: userRef.current.id, workout_id: workoutId, workout_name: workoutRef.current?.name,
        date: targetDate, status: 'in_progress', start_timestamp: new Date().toISOString(),
        progress: { index: 0, completedBlockIds: [] },
      });
      if (!session) {
        // Lost the race to another in-progress session — surface the usual conflict dialog
        // instead of crashing; the athlete's prior progress here is already gone, so send
        // them back rather than leaving them on a sessionless screen.
        setConflictSession(conflict);
        sessionIdRef.current = null;
        progressHydratedRef.current = false;
        return;
      }
      s = session;
    } catch {
      window.history.length > 1 ? navigate(-1) : navigate('/');
      return;
    }
    sessionIdRef.current = s.id;
    progressHydratedRef.current = true;
    sessionCreatedMsRef.current = new Date(s.created_date || s.start_timestamp).getTime();
    setSession(s);
    const startMs = new Date(s.start_timestamp).getTime();
    sessionStartMsRef.current = startMs;
    setSessionStartMs(startMs);
    setTimerStarted(true);
    enterTimeRef.current = Date.now();
  };

  // Unlike restart (which deletes and immediately begins a fresh session),
  // stop deletes all progress for this session and leaves the workout —
  // there is no replacement session to keep the clock/index in sync with.
  const stopWorkout = async () => {
    setStopping(true);
    try {
      if (sessionIdRef.current) {
        await supabase.from('exercise_sessions').delete().eq('workout_session_id', sessionIdRef.current);
        await supabase.from('workout_sessions').delete().eq('id', sessionIdRef.current);
      }
    } catch { /* silent */ }
    setStopping(false);
    setStopOpen(false);
    window.history.length > 1 ? navigate(-1) : navigate('/');
  };

  const requestSubstitute = async (target) => {
    const targetExercise = target || current;
    setSubTarget(targetExercise);
    setSubSheet(true); setLoadingSubs(true); setAlternatives([]);
    try {
      const ex = targetExercise?.details;
      if (!ex) { setLoadingSubs(false); return; }
      if (!fullExerciseMapRef.current) {
        const { data: allExs } = await supabase.from('exercises')
          .select('id, exercise_code, name, movement_pattern, primary_muscle_group, secondary_muscle_group, technical_difficulty, equipment, video_url')
          .order('created_date', { ascending: false })
          .limit(3000);
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
      }).filter((a) => a.exercise)
        .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
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
    const requiresWeight = current && !isRunningExercise(current.details) && current.details?.requires_load !== false;
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
    const targetKey = subTarget?.key ?? current.key;
    const targetIdx = exercises.findIndex((e) => e.key === targetKey);
    if (targetIdx === -1) { setSubSheet(false); return; }
    const newId = alt.exercise.exercise_code || alt.exercise.id;
    const next = [...exercises];
    next[targetIdx] = { ...next[targetIdx], exercise_id: newId, exercise_name: alt.exercise.name, details: alt.exercise, key: newId + '-sub-' + targetIdx, target_weight: null };
    setExercises(next);
    setLogs((l) => { const c = { ...l }; delete c[targetKey]; return c; });
    setSubSheet(false);
    setSubTarget(null);
    try {
      const res = await supabase.functions.invoke('assignWorkoutWeights', { body: { workout_id: workoutId, extra_exercise_codes: [alt.exercise.exercise_code].filter(Boolean) } });
      const ew = res.data?.exercise_weights || {};
      if (ew[newId] != null) {
        setExercises((prev) => prev.map((e, i) => i === targetIdx ? { ...e, target_weight: ew[newId] } : e));
        persistWeight(newId, ew[newId]);
      }
    } catch { /* silent */ }
  };

  // Shared card for both AI-suggested and manually-searched substitute candidates,
  // so the two lists in the swap sheet read as one consistent UI.
  const renderSubstituteCard = (exercise, { key, confidence = null, reason = null, onUse }) => (
    <Card key={key} className="rounded-2xl border-border p-4">
      <div className="flex items-center gap-3 mb-1">
        <div className="h-9 w-9 rounded-xl bg-brand/10 flex items-center justify-center shrink-0">
          {isRunningExercise(exercise) ? <Footprints className="h-4 w-4 text-brand" /> : <Dumbbell className="h-4 w-4 text-brand" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium truncate">{exercise.name}</p>
          <p className="text-xs text-muted-foreground capitalize truncate">{exercise.movement_pattern || 'n/a'} · {exercise.equipment || 'n/a'}</p>
        </div>
        {confidence != null && (
          <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0', confidence >= 75 ? 'bg-emerald-50 text-emerald-600' : confidence >= 50 ? 'bg-amber-50 text-amber-600' : 'bg-rose-50 text-rose-600')}>{confidence}% match</span>
        )}
      </div>
      {reason && <p className="text-xs text-muted-foreground mb-3">{reason}</p>}
      {exercise.video_url && (
        <YouTubeVideo url={exercise.video_url} title={exercise.name} className={cn(reason ? '' : 'mt-3', 'mb-3')} />
      )}
      <Button onClick={onUse} size="sm" className="rounded-lg bg-brand text-brand-foreground hover:bg-brand/90">Use this</Button>
    </Card>
  );

  const finish = async () => {
    setSaving(true);
    try {
      flushCurrentTime();
      await Promise.all(exercises.map((e) => flushSave(e.key)));
      const sid = sessionIdRef.current;
      const completedExercises = exercises.filter((e) => logs[e.key] && !logs[e.key].skipped);
      const overallDiff = completedExercises.length ? modeDifficulty(completedExercises.map((e) => logs[e.key].difficulty)) : 'normal';
      const clockStartMs = sessionStartMsRef.current ?? sessionCreatedMsRef.current;
      const total = clockStartMs ? (Date.now() - clockStartMs) / 1000 : 0;
      await supabase.from('workout_sessions').update({ status: 'completed', overall_difficulty: overallDiff, elapsed_seconds: Math.round(total) }).eq('id', sid);
      try { await supabase.functions.invoke('learnFromSessionFeedback', { body: { workout_session_id: sid } }); } catch {}
      navigate('/progress');
    } finally { setSaving(false); }
  };

  if (conflictSession) {
    return (
      <AlertDialog open>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Workout already in progress</AlertDialogTitle>
            <AlertDialogDescription>
              You still have &quot;{conflictSession.workout_name}&quot; in progress. End it before starting a new workout, or go back and finish it first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => navigate(`/workout/${conflictSession.workout_id}?date=${conflictSession.date}`)}>
              Resume it instead
            </AlertDialogCancel>
            <AlertDialogAction disabled={endingConflict} onClick={endConflictAndStart}>
              {endingConflict ? 'Ending…' : 'End it & start this one'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  if (loading) return <div className="flex items-center justify-center min-h-screen"><div className="w-8 h-8 border-4 border-muted border-t-brand rounded-full animate-spin" /></div>;
  if (!workout) return <div className="p-6 text-center text-muted-foreground">Workout not found.</div>;
  const backNoExercises = () => {
    const sid = sessionIdRef.current;
    if (sid) supabase.from('workout_sessions').update({ status: 'skipped' }).eq('id', sid).eq('status', 'in_progress').then(() => {});
    window.history.length > 1 ? navigate(-1) : navigate('/');
  };
  if (!current) return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="px-5 pt-8 pb-3 border-b border-border">
        <div className="flex items-center gap-2">
          <button onClick={backNoExercises} className="p-1 -ml-1"><ChevronLeft className="h-5 w-5" /></button>
          <h1 className="font-semibold truncate">{workout?.name}</h1>
        </div>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-sm text-muted-foreground">This workout doesn't have any exercises set up yet.</p>
        <button onClick={backNoExercises} className="mt-2 text-sm font-medium text-brand underline">Go back</button>
      </div>
    </div>
  );

  const isLast = index === exercises.length - 1;
  // Leaving the screen (back chevron, bottom nav, etc.) doesn't end the
  // session — it stays in_progress so the athlete resumes exactly where they
  // left off. Only "Stop workout" or "Restart" actually give up progress.
  const back = () => {
    window.history.length > 1 ? navigate(-1) : navigate('/');
  };
  const showLogPrompt = logPrompt != null && logPrompt.keys.includes(current.key);
  const restRemainingSec = blockRestUntil != null ? Math.max(0, Math.ceil((blockRestUntil - Date.now()) / 1000)) : 0;
  const restingOnLogPrompt = showLogPrompt && restRemainingSec > 0 && blockRestFromId === logPrompt.blockId;
  const restingBeforeNextBlock = !showLogPrompt && restRemainingSec > 0 && blockRestFromId != null && blockRestFromId !== current.block_id;
  const skipInterBlockRest = () => { setBlockRestUntil(null); setBlockRestFromId(null); };
  const blockLogExercises = showLogPrompt ? exercises.filter((e) => logPrompt.keys.includes(e.key)) : [];
  const soloRounds = Math.max(1, (current.rounds > 1 ? current.effective_sets : current.sets) || 1);
  const isManualSearchPending = manualQuery.trim() !== debouncedManualQuery;
  const manualResults = debouncedManualQuery && fullExerciseMapRef.current
    ? Object.values(fullExerciseMapRef.current)
        .filter((c) => c.id !== subTarget?.details?.id && c.name?.toLowerCase().includes(debouncedManualQuery.toLowerCase()))
        .slice(0, 20)
    : [];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="px-5 pt-8 pb-3 border-b border-border">
        <div className="flex items-center gap-2 mb-2">
          <button onClick={back} className="p-1 -ml-1"><ChevronLeft className="h-5 w-5" /></button>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground">Exercise {index + 1} of {exercises.length}</p>
            <h1 className="font-semibold truncate">{workout.name}</h1>
          </div>
          {timerStarted ? (
            <div className="flex items-center gap-1 text-xs font-semibold text-muted-foreground tabular-nums">
              <Clock className="h-3.5 w-3.5" />
              {formatDuration(totalElapsed)}
            </div>
          ) : (
            <button onClick={startTimer} className="flex items-center gap-1 text-xs font-semibold text-brand tabular-nums">
              <Play className="h-3.5 w-3.5" />
              Start
            </button>
          )}
          {timerStarted && (
            <button onClick={togglePause} className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted">
              {workoutPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
            </button>
          )}
          <button onClick={() => setRestartOpen(true)} className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted"><RotateCcw className="h-4 w-4" /></button>
          <button onClick={() => setStopOpen(true)} className="p-1.5 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><XCircle className="h-4 w-4" /></button>
        </div>
        <div className="flex gap-1 mt-2">
          {exercises.map((e, i) => (
            <button key={e.key} onClick={() => goToExercise(i)} className={cn('h-1 flex-1 rounded-full transition-colors', i === index ? 'bg-brand' : logs[e.key] ? 'bg-brand/40' : 'bg-muted')} />
          ))}
        </div>
      </header>

      <div className="relative flex-1 flex flex-col min-h-0">
      {workoutPaused && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background/95 backdrop-blur-sm">
          <Pause className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium text-muted-foreground">Workout paused</p>
          <Button onClick={togglePause} className="rounded-xl h-12 px-8 bg-brand text-brand-foreground hover:bg-brand/90">
            <Play className="h-4 w-4 mr-2" /> Resume
          </Button>
        </div>
      )}
      <div className={cn('px-5 py-4 overflow-y-auto', showLogPrompt ? 'flex-none' : 'flex-1')}>
        {showLogPrompt ? (
          <>
            {restingOnLogPrompt && (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/50 px-4 py-2.5 mb-4">
                <span className="text-sm font-medium text-muted-foreground">Rest before next block</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold tabular-nums">{formatDuration(restRemainingSec)}</span>
                  <button onClick={skipInterBlockRest} className="text-xs font-medium text-brand">Skip</button>
                </div>
              </div>
            )}
            <h2 className="text-xl font-semibold tracking-tight">
              {logPrompt.review ? 'Edit ' : ''}
              {logPrompt.blockId ? blockLabel : (blockLogExercises[0]?.exercise_name || 'Exercise')}
              {logPrompt.review ? '' : ' complete'}
            </h2>
            {logPrompt.blockId && <p className="text-sm text-muted-foreground mt-1 mb-4">{blockLogExercises.map((e) => e.exercise_name).join(', ')}</p>}
            <div className={cn('space-y-4', !logPrompt.blockId && 'mt-4')}>
              {blockLogExercises.map((e) => {
                const entry = blockLogEntries[e.key] || {};
                const exRunning = isRunningExercise(e.details);
                const exRequiresWeight = !exRunning && e.details?.requires_load !== false;
                return (
                  <div key={e.key} className="rounded-2xl border border-border p-4">
                    {logPrompt.blockId && <p className="font-semibold text-sm mb-3">{e.exercise_name}</p>}
                    {exRunning ? (
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Distance (km)</label>
                          <input type="number" inputMode="decimal" value={entry.distance_km ?? ''} onChange={(ev) => updateBlockLogEntry(e.key, { distance_km: ev.target.value === '' ? null : Math.max(0, Number(ev.target.value)) })} placeholder="0" className="w-full mt-1 rounded-xl border border-border bg-background px-4 py-3 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-brand" />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Time (min)</label>
                          <input type="number" inputMode="decimal" value={entry.duration_seconds != null ? entry.duration_seconds / 60 : ''} onChange={(ev) => updateBlockLogEntry(e.key, { duration_seconds: ev.target.value === '' ? null : Math.max(0, Number(ev.target.value)) * 60 })} placeholder="0" className="w-full mt-1 rounded-xl border border-border bg-background px-4 py-3 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-brand" />
                        </div>
                      </div>
                    ) : exRequiresWeight && (
                      <div className="mb-3">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-medium text-muted-foreground">Max weight used (kg)</label>
                          <button type="button" onClick={() => updateBlockLogEntry(e.key, entry.bodyweight ? { bodyweight: false, max_weight: null } : { bodyweight: true, max_weight: 0 })} className={cn('text-[10px] font-semibold px-2.5 py-1 rounded-full border transition-colors', entry.bodyweight ? 'bg-brand text-brand-foreground border-brand' : 'border-border text-muted-foreground')}>Bodyweight</button>
                        </div>
                        {entry.bodyweight ? (
                          <div className="w-full mt-1 rounded-xl border border-brand/30 bg-brand/5 px-4 py-3 text-lg font-semibold text-brand text-center">Bodyweight</div>
                        ) : (
                          <input type="number" inputMode="decimal" value={entry.max_weight ?? ''} onChange={(ev) => updateBlockLogEntry(e.key, { max_weight: ev.target.value === '' ? null : Math.max(0, Number(ev.target.value)) })} placeholder={e.target_weight ? String(e.target_weight) : '0'} className="w-full mt-1 rounded-xl border border-border bg-background px-4 py-3 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-brand" />
                        )}
                      </div>
                    )}
                    <label className="text-xs font-medium text-muted-foreground">How did it feel?</label>
                    <div className="grid grid-cols-4 gap-2 mt-1 mb-3">
                      {Object.entries(DIFFICULTY_META).map(([val, meta]) => (
                        <button key={val} onClick={() => updateBlockLogEntry(e.key, { difficulty: val })} className={cn('py-2.5 rounded-xl border text-xs font-medium transition-all', entry.difficulty === val ? meta.color + ' border-current' : 'border-border text-muted-foreground')}>{meta.label}</button>
                      ))}
                    </div>
                    <textarea value={entry.note || ''} onChange={(ev) => updateBlockLogEntry(e.key, { note: ev.target.value })} placeholder="Optional note…" className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm min-h-[60px] focus:outline-none focus:ring-2 focus:ring-brand" />
                  </div>
                );
              })}
            </div>
            {exercises[index + 1] && (
              <div className="mt-6 rounded-2xl border border-dashed border-border p-4">
                <p className="text-xs font-medium text-muted-foreground mb-1">Up next</p>
                <p className="font-semibold text-sm">{exercises[index + 1].exercise_name}</p>
              </div>
            )}
          </>
        ) : (
          <>
            {restingBeforeNextBlock && (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/50 px-4 py-2.5 mb-4">
                <span className="text-sm font-medium text-muted-foreground">Resting</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold tabular-nums">{formatDuration(restRemainingSec)}</span>
                  <button onClick={skipInterBlockRest} className="text-xs font-medium text-brand">Skip</button>
                </div>
              </div>
            )}
            {isBlockActive && isSuperset ? (
              <SupersetPanel
                key={current.block_id}
                exercises={currentBlockExercises}
                rounds={timerDefaultConfig?.rounds || 1}
                restSec={restOverrides[current.block_id] ?? (timerDefaultConfig?.restSec ?? 0)}
                onExerciseElapsed={handleSupersetExerciseElapsed}
                onFinish={handleSupersetFinish}
                onSkip={handleSupersetSkip}
                onStartTimer={startTimer}
                onAdjustRest={(delta) => adjustRest(current.block_id, timerDefaultConfig?.restSec ?? 0, delta)}
                onSwap={requestSubstitute}
              />
            ) : isBlockActive ? (
              <WorkoutTimerPanel
                key={current.block_id}
                blockLabel={blockLabel}
                defaultConfig={timerDefaultConfig}
                armed={timerArmed}
                timer={timerArmed ? timer : null}
                onStart={handleStartBlockTimer}
                onSkipBlock={handleSkipBlock}
                exercises={currentBlockExercises}
                displayExercise={displayExercise}
                isRotatingBlock={isRotatingBlock}
                isPreviewExercise={isPreviewExercise}
                nextUpName={nextUpName}
                onSwap={requestSubstitute}
              />
            ) : (
              <SupersetPanel
                key={current.key}
                label={null}
                unitLabel="Set"
                exercises={[current]}
                rounds={soloRounds}
                restSec={restOverrides[current.block_id] ?? (current.rest_seconds || 0)}
                onExerciseElapsed={handleSupersetExerciseElapsed}
                onFinish={handleSoloFinish}
                onStartTimer={startTimer}
                onAdjustRest={(delta) => adjustRest(current.block_id, current.rest_seconds || 0, delta)}
                weightLoading={weightLoading}
                onWeightClick={calcWeight}
              />
            )}
          </>
        )}
      </div>

      {showLogPrompt ? (
        <div className="sticky bottom-0 px-5 py-4 bg-background border-t border-border">
          <Button onClick={handleSaveLogPrompt} disabled={saving} className="w-full rounded-xl h-14 bg-brand text-brand-foreground hover:bg-brand/90">
            {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : logPrompt.review ? 'Save' : <>Save &amp; Continue <ChevronRight className="h-5 w-5 ml-1" /></>}
          </Button>
        </div>
      ) : !isBlockActive && (
        <div className="sticky bottom-0 px-5 py-4 bg-background border-t border-border">
          <div className="flex items-center gap-2">
            <button onClick={handleSoloSkip} className="flex-1 flex items-center justify-center gap-1.5 h-14 rounded-xl border border-border text-muted-foreground"><SkipForward className="h-4 w-4" /> Skip</button>
            <button onClick={() => requestSubstitute()} className="flex-1 flex items-center justify-center gap-1.5 h-14 rounded-xl border border-border text-muted-foreground"><RefreshCw className="h-4 w-4" /> Swap</button>
          </div>
        </div>
      )}
      </div>

      <Sheet open={subSheet} onOpenChange={(o) => { setSubSheet(o); if (!o) { setManualQuery(''); setSubTarget(null); } }}>
        <SheetContent side="bottom" className="rounded-t-3xl max-h-[80vh] overflow-y-auto">
          <SheetHeader className="px-5 pt-5"><SheetTitle className="text-left">Substitute exercise</SheetTitle></SheetHeader>
          <div className="px-5 pb-8 space-y-3">
            {loadingSubs ? (
              <div className="flex justify-center py-10"><Loader2 className="h-7 w-7 text-brand animate-spin" /></div>
            ) : alternatives.length ? (
              alternatives.map((a, i) => renderSubstituteCard(a.exercise, {
                key: i,
                confidence: a.confidence,
                reason: a.reason,
                onUse: () => applySubstitute(a),
              }))
            ) : <p className="text-center text-sm text-muted-foreground py-8">No suitable alternatives found.</p>}

            <div className="pt-3 border-t border-border">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Or pick manually</p>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input value={manualQuery} onChange={(e) => setManualQuery(e.target.value)} placeholder="Search exercise library…" className="pl-9 pr-9 rounded-xl h-11" />
                {isManualSearchPending && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </div>
              {debouncedManualQuery && !isManualSearchPending && (
                <div className="space-y-3 mt-3">
                  {manualResults.length
                    ? manualResults.map((c) => renderSubstituteCard(c, { key: c.id, onUse: () => applySubstitute({ exercise: c }) }))
                    : <p className="text-xs text-muted-foreground text-center py-4">No matches.</p>}
                </div>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={pendingTabataStart != null} onOpenChange={(open) => { if (!open) setPendingTabataStart(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Still resting</AlertDialogTitle>
            <AlertDialogDescription>
              There's {formatDuration(restRemainingSec)} of rest left before this block. Start now anyway?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingTabataStart(null)}>Keep resting</AlertDialogCancel>
            <AlertDialogAction onClick={confirmStartWhileResting}>Start now</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

      <AlertDialog open={stopOpen} onOpenChange={setStopOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stop workout?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete all progress and time logged for this workout and take you back. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={stopping} onClick={stopWorkout} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {stopping ? 'Stopping…' : 'Stop workout'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function modeDifficulty(arr) {
  const count = {};
  arr.forEach((d) => { if (d) count[d] = (count[d] || 0) + 1; });
  return Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0] || 'normal';
}