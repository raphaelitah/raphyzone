import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Play, Check, SkipForward } from 'lucide-react';
import { cn } from '@/lib/utils';

function formatClock(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

// Inline card for running a superset block: exercises are done back to back
// (tap to start/stop each one, tracking its own time), then a rest period
// after every full round through the group, repeated for the block's round count.
export default function SupersetPanel({
  exercises,
  rounds,
  restSec,
  onExerciseElapsed,
  onFinish,
  onSkip,
}) {
  const [round, setRound] = useState(1);
  const [exIndex, setExIndex] = useState(0);
  const [phase, setPhase] = useState('ready'); // ready | running | resting
  const [, setTick] = useState(0);

  const startAtRef = useRef(null);
  const roundElapsedRef = useRef(0);
  const restEndAtRef = useRef(null);

  useEffect(() => {
    if (phase !== 'running' && phase !== 'resting') return;
    const id = setInterval(() => {
      if (phase === 'resting' && restEndAtRef.current != null && Date.now() >= restEndAtRef.current) {
        restEndAtRef.current = null;
        setRound((r) => r + 1);
        setExIndex(0);
        roundElapsedRef.current = 0;
        setPhase('ready');
        return;
      }
      setTick((t) => t + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [phase]);

  const totalExercises = exercises.length;
  const current = exercises[exIndex] || exercises[0];
  const isLastInRound = exIndex >= totalExercises - 1;
  const isLastRound = round >= rounds;

  const runningElapsed = phase === 'running' && startAtRef.current != null
    ? (Date.now() - startAtRef.current) / 1000
    : 0;
  const roundTotal = roundElapsedRef.current + runningElapsed;
  const restRemaining = phase === 'resting' && restEndAtRef.current != null
    ? Math.max(0, (restEndAtRef.current - Date.now()) / 1000)
    : 0;

  const startSet = () => {
    startAtRef.current = Date.now();
    setPhase('running');
  };

  const finishSet = () => {
    const delta = startAtRef.current != null ? (Date.now() - startAtRef.current) / 1000 : 0;
    startAtRef.current = null;
    roundElapsedRef.current += delta;
    onExerciseElapsed?.(current.key, delta);

    if (isLastInRound) {
      if (isLastRound) {
        onFinish?.();
        return;
      }
      if (restSec > 0) {
        restEndAtRef.current = Date.now() + restSec * 1000;
        setPhase('resting');
      } else {
        setRound((r) => r + 1);
        setExIndex(0);
        roundElapsedRef.current = 0;
        setPhase('ready');
      }
    } else {
      setExIndex((i) => i + 1);
      setPhase('ready');
    }
  };

  const skipRest = () => {
    restEndAtRef.current = null;
    setRound((r) => r + 1);
    setExIndex(0);
    roundElapsedRef.current = 0;
    setPhase('ready');
  };

  return (
    <div className="rounded-2xl border border-border p-4 mb-4 bg-card">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold">Superset</p>
        <p className="text-xs text-muted-foreground">Round {round} of {rounds}</p>
      </div>

      {phase === 'resting' ? (
        <div className="flex flex-col items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-wide px-3 py-1 rounded-full bg-muted text-muted-foreground">Rest</span>
          <p className="text-5xl font-bold tabular-nums tracking-tight">{formatClock(restRemaining)}</p>
          <p className="text-xs text-muted-foreground">Round {round} total: {formatClock(roundTotal)}</p>
          <button onClick={skipRest} className="text-xs text-muted-foreground underline">Skip rest</button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <div className="flex flex-wrap justify-center gap-1.5">
            {exercises.map((e, i) => (
              <span
                key={e.key}
                className={cn(
                  'text-[10px] font-medium px-2 py-0.5 rounded-full border',
                  i === exIndex ? 'bg-brand text-brand-foreground border-brand' : i < exIndex ? 'border-border text-muted-foreground line-through' : 'border-border text-muted-foreground'
                )}
              >
                {e.exercise_name}
              </span>
            ))}
          </div>
          <p className="text-lg font-semibold text-center">{current?.exercise_name}</p>
          {phase === 'running' ? (
            <>
              <p className="text-5xl font-bold tabular-nums tracking-tight">{formatClock(runningElapsed)}</p>
              <Button onClick={finishSet} className="w-full rounded-xl h-14 bg-brand text-brand-foreground hover:bg-brand/90">
                <Check className="h-5 w-5 mr-2" /> Done
              </Button>
            </>
          ) : (
            <Button onClick={startSet} className="w-full rounded-xl h-14 bg-brand text-brand-foreground hover:bg-brand/90">
              <Play className="h-5 w-5 mr-2" /> Start set
            </Button>
          )}
          <p className="text-xs text-muted-foreground">Round {round} total: {formatClock(roundTotal)}</p>
        </div>
      )}

      <button onClick={onSkip} className="w-full text-center mt-3 text-xs text-muted-foreground underline flex items-center justify-center gap-1">
        <SkipForward className="h-3 w-3" /> Skip superset
      </button>
    </div>
  );
}
