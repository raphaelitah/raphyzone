import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Play, Pause, RotateCcw, SkipForward } from 'lucide-react';
import { cn } from '@/lib/utils';
import YouTubeVideo from '@/components/YouTubeVideo';
import ExerciseSpecRow from '@/components/ExerciseSpecRow';
import BlockPanel from '@/components/BlockPanel';

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
  onStart,
  onSkipBlock,
  exercises,
  displayExercise,
  isRotatingBlock,
  isPreviewExercise,
  nextUpName,
}) {
  const [workSec, setWorkSec] = useState(defaultConfig?.workSec?.toString() || '20');
  const [restSec, setRestSec] = useState(defaultConfig?.restSec?.toString() || '10');
  const [rounds, setRounds] = useState(defaultConfig?.rounds?.toString() || '8');

  const isEmom = /^E\d*MOM$/.test(blockLabel || '');
  const progressPct = armed && timer?.phaseDurationSec > 0
    ? ((timer.phaseDurationSec - timer.remainingSec) / timer.phaseDurationSec) * 100
    : 0;

  const roundLabel = armed
    ? `Round ${timer.round} of ${timer.totalRounds}`
    : `Round 1 of ${Math.max(1, parseInt(rounds, 10) || 1)}`;

  const exerciseInfo = (exercise) => (
    <>
      <p className="text-lg font-semibold text-center">{exercise?.exercise_name}</p>
      {exercise?.details?.video_url && (
        <YouTubeVideo url={exercise.details.video_url} title={exercise.exercise_name} className="w-full" />
      )}
      <div className="w-full">
        <ExerciseSpecRow exercise={exercise} />
      </div>
    </>
  );

  return (
    <BlockPanel
      label={blockLabel}
      roundLabel={roundLabel}
      exercises={isRotatingBlock ? exercises : null}
      activeKey={isRotatingBlock ? displayExercise?.key : null}
      onSkip={armed ? onSkipBlock : null}
      skipLabel={`Skip ${(blockLabel || '').toLowerCase()}`}
    >
      <div className="flex flex-col items-center gap-3 w-full">
        {!armed && (
          <>
            {!isEmom && (
              <div className="grid grid-cols-3 gap-2 w-full">
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
          </>
        )}

        {armed && (
          <>
            {timer.phase && (
              <span className={cn(
                'text-xs font-semibold uppercase tracking-wide px-3 py-1 rounded-full',
                timer.phase === 'work' ? 'bg-brand/10 text-brand' : 'bg-muted text-muted-foreground'
              )}>
                {timer.status === 'done' ? 'Done' : timer.phase}
              </span>
            )}
            <p className="text-5xl font-bold tabular-nums tracking-tight">{formatClock(timer.remainingSec)}</p>
            <Progress value={progressPct} className="w-full" />
            <div className="flex items-center gap-2 w-full">
              <button onClick={timer.restart} className="flex items-center justify-center w-11 h-11 rounded-xl border border-border text-muted-foreground">
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
          </>
        )}

        {isRotatingBlock ? (
          <>
            {isPreviewExercise && (
              <span className="inline-block text-xs font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full bg-muted text-muted-foreground">Next up</span>
            )}
            {exerciseInfo(displayExercise)}
            {nextUpName && (
              <p className="text-xs font-medium text-muted-foreground -mt-2">Next up: {nextUpName}</p>
            )}
          </>
        ) : (
          <div className="w-full space-y-3">
            {(exercises || []).map((e) => (
              <div key={e.key} className="rounded-xl border border-border p-3 flex flex-col items-center gap-3">
                {exerciseInfo(e)}
              </div>
            ))}
          </div>
        )}
      </div>
    </BlockPanel>
  );
}
