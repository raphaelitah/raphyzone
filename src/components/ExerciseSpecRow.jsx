import { RefreshCw, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isRunningExercise } from '@/lib/fitness';

export function Spec({ label, value, subtext = null, loading = false, onClick = null }) {
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

// Sets/Reps/Weight/Rest tile row shared by standalone exercises and block
// (superset/EMOM/Tabata) exercises so the tracking experience is consistent.
export default function ExerciseSpecRow({ exercise, distanceKm = null, durationSeconds = null, weightLoading = false, onWeightClick = null }) {
  if (!exercise) return null;
  const isRunning = isRunningExercise(exercise.details);
  const setsValue = exercise.rounds > 1 ? exercise.effective_sets : exercise.sets;
  const setsSubtext = exercise.rounds > 1 ? `${exercise.rounds} rounds` : null;
  const requiresWeight = !isRunning && exercise.details?.requires_load !== false;
  return (
    <div className="grid grid-cols-4 gap-2 mb-4">
      <Spec label="Sets" value={setsValue} subtext={setsSubtext} />
      <Spec label="Reps" value={exercise.reps} />
      {isRunning ? (
        <Spec label="Pace" value={distanceKm && durationSeconds ? `${(durationSeconds / 60 / distanceKm).toFixed(1)}/km` : '—'} />
      ) : (
        <Spec
          label="Weight"
          value={!requiresWeight ? 'Bodyweight' : exercise.target_weight ? exercise.target_weight + 'kg' : '—'}
          loading={weightLoading}
          onClick={requiresWeight && !exercise.target_weight ? onWeightClick : null}
        />
      )}
      <Spec label="Rest" value={exercise.rest_seconds ? exercise.rest_seconds + 's' : '—'} />
    </div>
  );
}
