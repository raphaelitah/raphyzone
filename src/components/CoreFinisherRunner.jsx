import { useEffect } from 'react';
import { Pause, Play, SkipForward, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import useIntervalTimer from '@/hooks/useIntervalTimer';
import { useWakeLock } from '@/hooks/useWakeLock';

function formatClock(sec) {
  const s = Math.max(0, Math.ceil(sec || 0));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

// Full-screen timer for the core finisher. Starts itself (the timer's built-in
// 10s lead-in gives time to get down on the floor). The finisher is separate
// from the logged session, so nothing here is saved.
export default function CoreFinisherRunner({ finisher, onDone }) {
  const timer = useIntervalTimer(finisher.timerConfig);
  useWakeLock();

  useEffect(() => {
    timer.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { exercises } = finisher;
  const done = timer.status === 'done';
  const isLeadIn = timer.phase === 'leadin';
  const isRest = timer.phase === 'rest';
  const paused = timer.status === 'paused' || timer.status === 'pausedLeadin';

  // During lead-in and rest the athlete is about to do the *next* move, so show it.
  const shownIndex = isLeadIn ? 0 : (isRest ? (timer.nextExerciseIndex ?? timer.exerciseIndex) : timer.exerciseIndex);
  const shown = exercises[Math.min(shownIndex, exercises.length - 1)];
  const isPlank = shownIndex >= exercises.length - 1;

  const label = isLeadIn ? 'Get ready' : (isRest ? 'Rest — up next' : (isPlank ? 'Hold' : 'Work'));
  const progress = timer.phaseDurationSec > 0
    ? Math.min(100, Math.max(0, (1 - timer.remainingSec / timer.phaseDurationSec) * 100))
    : 0;
  const lapLabel = isPlank || done ? 'Final plank' : `Lap ${Math.min(finisher.laps, Math.ceil(timer.round))} of ${finisher.laps}`;

  if (done) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 px-6 text-center">
        <CheckCircle2 className="h-14 w-14 text-emerald-500" />
        <h1 className="text-xl font-semibold">Core finisher done</h1>
        <p className="text-sm text-muted-foreground">{finisher.minutes} minutes of core work. Nice.</p>
        <Button onClick={onDone} className="mt-2 rounded-xl bg-brand text-brand-foreground hover:bg-brand/90 h-12 px-8">Continue</Button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'min-h-screen flex flex-col items-center justify-between px-6 py-10 text-center transition-colors',
        isRest || isLeadIn ? 'bg-amber-50' : 'bg-emerald-50',
      )}
      data-testid="core-finisher-runner"
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Core finisher</p>
        <p className="text-xs text-muted-foreground mt-0.5">{lapLabel}</p>
      </div>

      <div className="w-full max-w-sm space-y-4">
        <p className="text-sm font-semibold uppercase tracking-wide">{label}</p>
        <p className="text-6xl font-bold tabular-nums" aria-label="Time remaining">{formatClock(timer.remainingSec)}</p>
        <Progress value={progress} className="h-2" />
        <h1 className="text-2xl font-semibold pt-2">{shown?.name}</h1>
        <p className="text-sm text-muted-foreground">{shown?.cue}</p>
      </div>

      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          onClick={paused ? timer.resume : timer.pause}
          className="rounded-xl h-12 px-6"
        >
          {paused ? <><Play className="h-4 w-4 mr-2" />Resume</> : <><Pause className="h-4 w-4 mr-2" />Pause</>}
        </Button>
        <Button variant="ghost" onClick={onDone} className="rounded-xl h-12 text-muted-foreground">
          <SkipForward className="h-4 w-4 mr-2" />End finisher
        </Button>
      </div>
    </div>
  );
}
