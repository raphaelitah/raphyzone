import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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

// Wall-clock based timer: stores an absolute phaseEndAt timestamp rather than
// decrementing a counter, so it stays accurate across setInterval throttling
// or the tab/screen being backgrounded (matches the pattern used for the
// workout session stopwatch in WorkoutExecution.jsx).
export default function useIntervalTimer(config) {
  const sequence = useMemo(() => buildSequence(config), [
    config.mode, config.durationSec, config.rounds, config.exerciseCount, config.workSec, config.restSec,
  ]);

  const [status, setStatus] = useState('idle'); // idle | running | paused | done
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

  useEffect(() => {
    if (status !== 'running') return;
    const id = setInterval(() => { catchUp(); setTick((t) => t + 1); }, 1000);
    return () => clearInterval(id);
  }, [status, catchUp]);

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') { catchUp(); setTick((t) => t + 1); } };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [catchUp]);

  const start = useCallback(() => {
    const seq = sequenceRef.current;
    phaseIndexRef.current = 0;
    phaseEndAtRef.current = Date.now() + (seq[0]?.durationSec || 0) * 1000;
    remainingMsRef.current = null;
    setPhaseIndex(0);
    setStatus('running');
  }, []);

  const pause = useCallback(() => {
    if (statusRef.current !== 'running' || phaseEndAtRef.current == null) return;
    remainingMsRef.current = Math.max(0, phaseEndAtRef.current - Date.now());
    setStatus('paused');
  }, []);

  const resume = useCallback(() => {
    if (statusRef.current !== 'paused') return;
    phaseEndAtRef.current = Date.now() + (remainingMsRef.current || 0);
    setStatus('running');
  }, []);

  const reset = useCallback(() => {
    phaseIndexRef.current = 0;
    phaseEndAtRef.current = null;
    remainingMsRef.current = null;
    setPhaseIndex(0);
    setStatus('idle');
  }, []);

  const skipPhase = useCallback(() => {
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

  const current = sequence[phaseIndex] || sequence[0];
  const remainingMs = status === 'running' && phaseEndAtRef.current != null
    ? Math.max(0, phaseEndAtRef.current - Date.now())
    : (remainingMsRef.current ?? (current?.durationSec || 0) * 1000);

  return {
    status,
    phase: current?.phase ?? null,
    round: current?.round ?? 1,
    exerciseIndex: current?.exerciseIndex ?? 0,
    totalRounds: config.mode === 'interval' ? Math.max(1, config.rounds || 1) : 1,
    remainingSec: remainingMs / 1000,
    phaseDurationSec: current?.durationSec || 0,
    start,
    pause,
    resume,
    reset,
    skipPhase,
  };
}
