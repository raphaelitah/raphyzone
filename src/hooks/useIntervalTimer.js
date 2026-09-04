import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { playCountdownBeep, playGoBeep, primeTimerAudio } from '@/lib/timerSounds';

// Builds the flat phase sequence for a given config.
// Countdown: a single phase with no work/rest label.
// Interval: for each round, for each exercise in the block, a work phase then a rest phase.
function buildSequence(config) {
  if (config.mode === 'countdown') {
    return [{ round: 1, exerciseIndex: 0, phase: null, durationSec: Math.max(0, config.durationSec || 0) }];
  }
  const rounds = Math.max(1, config.rounds || 1);
  const exerciseCount = Math.max(1, config.exerciseCount || 1);
  const workSec = Math.max(0, config.workSec || 0);
  const restSec = Math.max(0, config.restSec || 0);
  const seq = [];
  for (let round = 1; round <= rounds; round++) {
    for (let exerciseIndex = 0; exerciseIndex < exerciseCount; exerciseIndex++) {
      if (workSec > 0) seq.push({ round, exerciseIndex, phase: 'work', durationSec: workSec });
      if (restSec > 0) seq.push({ round, exerciseIndex, phase: 'rest', durationSec: restSec });
    }
  }
  return seq.length ? seq : [{ round: 1, exerciseIndex: 0, phase: 'work', durationSec: 0 }];
}

// Lead-in given before the first phase of a freshly-armed block, so the user
// has time to put the phone down before the clock actually starts running.
const LEAD_IN_SEC = 10;

// Wall-clock based timer: stores an absolute phaseEndAt timestamp rather than
// decrementing a counter, so it stays accurate across setInterval throttling
// or the tab/screen being backgrounded (matches the pattern used for the
// workout session stopwatch in WorkoutExecution.jsx).
export default function useIntervalTimer(config) {
  const sequence = useMemo(() => buildSequence(config), [
    config.mode, config.durationSec, config.rounds, config.exerciseCount, config.workSec, config.restSec,
  ]);

  const [status, setStatus] = useState('idle'); // idle | leadin | running | pausedLeadin | paused | done
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [, setTick] = useState(0);

  const phaseEndAtRef = useRef(null);
  const remainingMsRef = useRef(null);
  const phaseIndexRef = useRef(0);
  const sequenceRef = useRef(sequence);
  const statusRef = useRef('idle');

  useEffect(() => { sequenceRef.current = sequence; }, [sequence]);
  useEffect(() => { phaseIndexRef.current = phaseIndex; }, [phaseIndex]);
  useEffect(() => { statusRef.current = status; }, [status]);

  // Advances phaseIndex as many times as needed to catch up with elapsed wall-clock
  // time (e.g. after the phone was locked through one or more phases).
  const catchUp = useCallback(() => {
    if (statusRef.current === 'leadin') {
      if (phaseEndAtRef.current != null && Date.now() >= phaseEndAtRef.current) {
        const seq = sequenceRef.current;
        phaseEndAtRef.current = Date.now() + (seq[0]?.durationSec || 0) * 1000;
        statusRef.current = 'running';
        setStatus('running');
      }
      return;
    }
    if (statusRef.current !== 'running') return;
    let idx = phaseIndexRef.current;
    let endAt = phaseEndAtRef.current;
    const seq = sequenceRef.current;
    while (endAt != null && Date.now() >= endAt) {
      idx += 1;
      if (idx >= seq.length) {
        phaseIndexRef.current = seq.length - 1;
        phaseEndAtRef.current = null;
        setPhaseIndex(seq.length - 1);
        setStatus('done');
        statusRef.current = 'done';
        return;
      }
      endAt = endAt + seq[idx].durationSec * 1000;
    }
    phaseIndexRef.current = idx;
    phaseEndAtRef.current = endAt;
    setPhaseIndex(idx);
  }, []);

  // Plays the 3-2-1 countdown beep near the end of the phase that was just
  // active, or the "go" beep the instant a new phase starts (end of lead-in,
  // end of work, end of rest). Compares status/phaseIndex before and after a
  // catchUp() call, so a multi-phase catch-up (e.g. after being backgrounded)
  // still only fires one "go" beep rather than one per skipped phase.
  const playPhaseSounds = useCallback((prevStatus, prevPhaseIdx) => {
    const newStatus = statusRef.current;
    const newPhaseIdx = phaseIndexRef.current;
    const transitioned = (prevStatus === 'leadin' && newStatus === 'running')
      || (prevStatus === 'running' && newStatus === 'running' && newPhaseIdx !== prevPhaseIdx);
    if (transitioned) {
      playGoBeep();
      return;
    }
    if ((newStatus !== 'running' && newStatus !== 'leadin') || phaseEndAtRef.current == null) return;
    const remaining = Math.round((phaseEndAtRef.current - Date.now()) / 1000);
    if (remaining === 3 || remaining === 2 || remaining === 1) {
      playCountdownBeep();
    }
  }, []);

  useEffect(() => {
    if (status !== 'running' && status !== 'leadin') return;
    const id = setInterval(() => {
      const prevStatus = statusRef.current;
      const prevPhaseIdx = phaseIndexRef.current;
      catchUp();
      playPhaseSounds(prevStatus, prevPhaseIdx);
      setTick((t) => t + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [status, catchUp, playPhaseSounds]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        const prevStatus = statusRef.current;
        const prevPhaseIdx = phaseIndexRef.current;
        catchUp();
        playPhaseSounds(prevStatus, prevPhaseIdx);
        setTick((t) => t + 1);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [catchUp, playPhaseSounds]);

  // Starts a block's timer with a 10s lead-in first, so the user has time to
  // set the phone down before the first phase actually starts counting down.
  const start = useCallback(() => {
    primeTimerAudio();
    phaseIndexRef.current = 0;
    phaseEndAtRef.current = Date.now() + LEAD_IN_SEC * 1000;
    remainingMsRef.current = null;
    setPhaseIndex(0);
    setStatus('leadin');
  }, []);

  const pause = useCallback(() => {
    const current = statusRef.current;
    if ((current !== 'running' && current !== 'leadin') || phaseEndAtRef.current == null) return;
    remainingMsRef.current = Math.max(0, phaseEndAtRef.current - Date.now());
    setStatus(current === 'leadin' ? 'pausedLeadin' : 'paused');
  }, []);

  const resume = useCallback(() => {
    const current = statusRef.current;
    if (current !== 'paused' && current !== 'pausedLeadin') return;
    primeTimerAudio();
    phaseEndAtRef.current = Date.now() + (remainingMsRef.current || 0);
    setStatus(current === 'pausedLeadin' ? 'leadin' : 'running');
  }, []);

  const reset = useCallback(() => {
    phaseIndexRef.current = 0;
    phaseEndAtRef.current = null;
    remainingMsRef.current = null;
    setPhaseIndex(0);
    setStatus('idle');
  }, []);

  // Rewinds to the start of the sequence but leaves it paused (not idle), so
  // the Resume control keeps working — unlike reset(), which is used
  // internally to prep an armed-but-not-yet-started timer for the next block.
  const restart = useCallback(() => {
    const seq = sequenceRef.current;
    phaseIndexRef.current = 0;
    phaseEndAtRef.current = null;
    remainingMsRef.current = (seq[0]?.durationSec || 0) * 1000;
    setPhaseIndex(0);
    setStatus('paused');
  }, []);

  const skipPhase = useCallback(() => {
    if (statusRef.current === 'leadin' || statusRef.current === 'pausedLeadin') {
      const seq = sequenceRef.current;
      phaseEndAtRef.current = Date.now() + (seq[0]?.durationSec || 0) * 1000;
      setStatus('running');
      return;
    }
    const seq = sequenceRef.current;
    const idx = phaseIndexRef.current;
    if (idx >= seq.length - 1) {
      reset();
      setStatus('done');
      return;
    }
    const nextIdx = idx + 1;
    phaseIndexRef.current = nextIdx;
    setPhaseIndex(nextIdx);
    if (statusRef.current === 'running') {
      phaseEndAtRef.current = Date.now() + seq[nextIdx].durationSec * 1000;
    } else {
      remainingMsRef.current = seq[nextIdx].durationSec * 1000;
    }
  }, [reset]);

  // Adjusts the current rest phase's remaining time and, so the user doesn't
  // have to repeat it every round, bumps every later rest phase in the
  // sequence by the same amount too (mutated in place — safe since the
  // sequence array reference is stable for as long as config doesn't change).
  const adjustRest = useCallback((delta) => {
    const seq = sequenceRef.current;
    const idx = phaseIndexRef.current;
    for (let i = idx; i < seq.length; i++) {
      if (seq[i].phase === 'rest') {
        seq[i] = { ...seq[i], durationSec: Math.max(0, seq[i].durationSec + delta) };
      }
    }
    if (seq[idx]?.phase !== 'rest') return;
    if (statusRef.current === 'running' && phaseEndAtRef.current != null) {
      phaseEndAtRef.current = Math.max(Date.now(), phaseEndAtRef.current + delta * 1000);
    } else if (remainingMsRef.current != null) {
      remainingMsRef.current = Math.max(0, remainingMsRef.current + delta * 1000);
    }
    setTick((t) => t + 1);
  }, []);

  const isLeadIn = status === 'leadin' || status === 'pausedLeadin';
  const current = sequence[phaseIndex] || sequence[0];
  const next = sequence[phaseIndex + 1] || null;
  const remainingMs = (status === 'running' || status === 'leadin') && phaseEndAtRef.current != null
    ? Math.max(0, phaseEndAtRef.current - Date.now())
    : (remainingMsRef.current ?? (current?.durationSec || 0) * 1000);

  return {
    status,
    phase: isLeadIn ? 'leadin' : (current?.phase ?? null),
    round: current?.round ?? 1,
    exerciseIndex: current?.exerciseIndex ?? 0,
    nextExerciseIndex: next?.exerciseIndex ?? null,
    nextRound: next?.round ?? null,
    totalRounds: config.mode === 'interval' ? Math.max(1, config.rounds || 1) : 1,
    remainingSec: remainingMs / 1000,
    phaseDurationSec: isLeadIn ? LEAD_IN_SEC : (current?.durationSec || 0),
    start,
    pause,
    resume,
    reset,
    restart,
    skipPhase,
    adjustRest,
  };
}
