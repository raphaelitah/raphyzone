import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Play, Pause, RotateCcw, SkipForward } from 'lucide-react';
import { cn } from '@/lib/utils';

function formatClock(sec) {
  const s = Math.max(0, Math.ceil(sec || 0));
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

// Inline (non-modal) card for running a block-scoped EMOM/Tabata interval timer.
// Purely presentational for the running state — WorkoutExecution owns the
// useIntervalTimer instance so it survives navigation within the block and
// so the main exercise card can react to phase/exerciseIndex changes too.
export default function WorkoutTimerPanel({
  blockLabel,
  defaultConfig,
  armed,
  timer,
  exerciseNames,
  onStart,
  onSkipBlock,
}) {
  const [workSec, setWorkSec] = useState(defaultConfig?.workSec?.toString() || '20');
  const [restSec, setRestSec] = useState(defaultConfig?.restSec?.toString() || '10');
  const [rounds, setRounds] = useState(defaultConfig?.rounds?.toString() || '8');

  const isEmom = blockLabel === 'EMOM';
  const nextName = timer?.nextExerciseIndex != null ? exerciseNames?.[timer.nextExerciseIndex] : null;
  const progressPct = armed && timer?.phaseDurationSec > 0
    ? ((timer.phaseDurationSec - timer.remainingSec) / timer.phaseDurationSec) * 100
    : 0;

  return (
    <div className="rounded-2xl border border-border p-4 mb-4 bg-card">
      {!armed ? (
        <div className="space-y-3">
          <p className="text-sm font-semibold">{blockLabel}</p>
          {!isEmom && (
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Work (s)</label>
                <Input type="number" value={workSec} onChange={(e) => setWorkSec(e.target.value)} className="mt-0.5" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Rest (s)</label>
                <Input type="number" value={restSec} onChange={(e) => setRestSec(e.target.value)} className="mt-0.5" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Rounds</label>
                <Input type="number" value={rounds} onChange={(e) => setRounds(e.target.value)} className="mt-0.5" />
              </div>
            </div>
          )}
          <Button
            onClick={() => onStart({
              workSec: Math.max(0, parseInt(workSec, 10) || 0),
              restSec: Math.max(0, parseInt(restSec, 10) || 0),
              rounds: Math.max(1, parseInt(rounds, 10) || 1),
            })}
            className="w-full rounded-xl h-11 bg-brand text-brand-foreground hover:bg-brand/90"
          >
            <Play className="h-4 w-4 mr-2" /> Start {blockLabel}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          {timer.phase && (
            <span className={cn(
              'text-xs font-semibold uppercase tracking-wide px-3 py-1 rounded-full',
              timer.phase === 'work' ? 'bg-brand/10 text-brand' : 'bg-muted text-muted-foreground'
            )}>
              {timer.status === 'done' ? 'Done' : timer.phase}
            </span>
          )}
          <p className="text-5xl font-bold tabular-nums tracking-tight">{formatClock(timer.remainingSec)}</p>
          <p className="text-xs text-muted-foreground">Round {timer.round} of {timer.totalRounds}</p>
          {isEmom && nextName && timer.status !== 'done' && (
            <p className="text-xs font-medium text-muted-foreground">Next up: {nextName}</p>
          )}
          <Progress value={progressPct} className="w-full" />
          <div className="flex items-center gap-2 w-full">
            <button onClick={timer.reset} className="flex items-center justify-center w-11 h-11 rounded-xl border border-border text-muted-foreground">
              <RotateCcw className="h-4 w-4" />
            </button>
            <Button
              onClick={timer.status === 'running' ? timer.pause : timer.resume}
              disabled={timer.status === 'done'}
              className="flex-1 rounded-xl h-11 bg-brand text-brand-foreground hover:bg-brand/90"
            >
              {timer.status === 'running' ? <><Pause className="h-4 w-4 mr-2" /> Pause</> : <><Play className="h-4 w-4 mr-2" /> Resume</>}
            </Button>
            <button onClick={timer.skipPhase} disabled={timer.status === 'done'} className="flex items-center justify-center w-11 h-11 rounded-xl border border-border text-muted-foreground disabled:opacity-30">
              <SkipForward className="h-4 w-4" />
            </button>
          </div>
          <button onClick={onSkipBlock} className="text-xs text-muted-foreground underline">Skip {blockLabel.toLowerCase()}</button>
        </div>
      )}
    </div>
  );
}
