import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { Play, Loader2, ChevronDown, Flame, X } from 'lucide-react';
import { WORKOUT_DIFFICULTY_META } from '@/lib/fitness';
import { cn } from '@/lib/utils';
import {
  buildBlocksByWorkout,
  buildBlockExercisesByBlock,
  buildSetsByBlockExercise,
  roundToFive,
  isEMOMBlock,
  getWorkoutMetaLine,
} from '@/lib/workoutStructure';

export default function WorkoutDetailSheet({ workout, open, onOpenChange, contextLine = null, reason = null, selectMode = false, onSelect = null, warmup = null, startDate = null }) {
  const [blocksByWorkout, setBlocksByWorkout] = useState({});
  const [blockExercisesByBlock, setBlockExercisesByBlock] = useState({});
  const [setsByBlockExercise, setSetsByBlockExercise] = useState({});
  const [loading, setLoading] = useState(false);
  const [warmupSkipped, setWarmupSkipped] = useState(false);
  const [warmupOpen, setWarmupOpen] = useState(false);

  // Reset the local skip/collapse state whenever a different workout is opened.
  useEffect(() => {
    setWarmupSkipped(false);
    setWarmupOpen(false);
  }, [workout?.id, workout?.workout_id, open]);

  useEffect(() => {
    if (!open || !workout?.workout_id) return;
    let active = true;
    setLoading(true);
    (async () => {
      try {
        const { data: blocksData } = await supabase.from('workout_blocks').select('*').eq('workout_id', workout.workout_id);
        const blocks = blocksData || [];
        const blockIds = blocks.map((b) => b.block_id);
        const blockExs = blockIds.length
          ? (await supabase.from('block_exercises').select('*').in('block_id', blockIds)).data || []
          : [];
        const beIds = blockExs.map((be) => be.block_exercise_id);
        const sets = beIds.length
          ? (await supabase.from('prescribed_sets').select('*').in('block_exercise_id', beIds)).data || []
          : [];
        if (!active) return;
        setBlocksByWorkout(buildBlocksByWorkout(blocks));
        setBlockExercisesByBlock(buildBlockExercisesByBlock(blockExs));
        setSetsByBlockExercise(buildSetsByBlockExercise(sets));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [open, workout?.workout_id]);

  if (!workout) return null;

  const blocks = blocksByWorkout[workout.workout_id] || [];
  const duration = roundToFive(workout.est_duration_min);
  const emomBlock = blocks.find((b) => isEMOMBlock(b));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[85vh] overflow-y-auto">
        <SheetHeader className="px-5 pt-5">
          <div className="flex items-start justify-between gap-2">
            <SheetTitle className="text-xl text-left">{workout.name}</SheetTitle>
            {selectMode && (
              <Button size="sm" onClick={() => { onSelect(); onOpenChange(false); }} className="bg-brand text-brand-foreground shrink-0 mr-8">
                Select
              </Button>
            )}
          </div>
          {contextLine && <p className="text-sm text-muted-foreground text-left -mt-1">{contextLine}</p>}
        </SheetHeader>
        <div className="px-5 pb-8 space-y-4">
          <p className="text-sm text-muted-foreground">
            {emomBlock ? `${workout.format_label} x ${emomBlock.rounds} mins` : workout.format_label}
          </p>
          <div className="flex flex-wrap gap-2 text-xs">
            <Tag>{WORKOUT_DIFFICULTY_META[workout.difficulty]?.label}</Tag>
            <Tag>{duration} min</Tag>
            <Tag className="capitalize">{workout.workout_category}</Tag>
          </div>

          {warmup && !warmupSkipped && (
            <Collapsible open={warmupOpen} onOpenChange={setWarmupOpen} className="rounded-xl border border-amber-200/60 bg-amber-50/40">
              <div className="flex items-center gap-2 p-3">
                <CollapsibleTrigger className="flex-1 flex items-center gap-2 text-left">
                  <Flame className="h-4 w-4 text-amber-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-amber-900">Warm Up</p>
                    <p className="text-xs text-amber-700/80">{warmup.duration_minutes} min · not tracked</p>
                  </div>
                  <ChevronDown className={cn('h-4 w-4 text-amber-600 shrink-0 transition-transform', warmupOpen && 'rotate-180')} />
                </CollapsibleTrigger>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setWarmupSkipped(true); }}
                  className="p-1 rounded-md text-amber-700/70 hover:text-amber-900 hover:bg-amber-100 transition-colors shrink-0"
                  title="Skip warm up"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <CollapsibleContent className="px-3 pb-3 space-y-2">
                {warmup.mobility?.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-amber-800 mb-1">Mobility</p>
                    <ul className="text-sm text-amber-950/90 space-y-0.5">
                      {warmup.mobility.map((m, i) => <li key={m.exercise_id || i}>· {m.exercise_name}</li>)}
                    </ul>
                  </div>
                )}
                {warmup.cardio && (
                  <div>
                    <p className="text-xs font-medium text-amber-800 mb-1">Cardio primer</p>
                    <p className="text-sm text-amber-950/90">{warmup.cardio.machine} · {warmup.cardio.duration_minutes} min easy</p>
                  </div>
                )}
                {warmup.first_movement && (
                  <div>
                    <p className="text-xs font-medium text-amber-800 mb-1">Movement prep</p>
                    <p className="text-sm text-amber-950/90">{warmup.first_movement.exercise_name} · {warmup.first_movement.sets} light sets</p>
                  </div>
                )}
                {warmup.notes && <p className="text-xs text-amber-700/80 italic">{warmup.notes}</p>}
                <button
                  type="button"
                  onClick={() => setWarmupSkipped(true)}
                  className="text-xs font-medium text-amber-700 hover:text-amber-900 underline underline-offset-2"
                >
                  Skip warm up
                </button>
              </CollapsibleContent>
            </Collapsible>
          )}

          {reason && (
            <div className="rounded-xl border border-brand/20 bg-brand/5 p-3">
              <p className="text-xs font-medium text-brand mb-0.5">Why this workout</p>
              <p className="text-sm leading-relaxed">{reason}</p>
            </div>
          )}

          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">
              {getWorkoutMetaLine(workout, blocksByWorkout, blockExercisesByBlock)}
            </p>
            <div className="rounded-xl border border-border bg-muted/40 p-3 mb-2">
              <p className="text-xs font-medium text-muted-foreground mb-1">Notes</p>
              {workout.notes ? (
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{workout.notes}</p>
              ) : (
                <p className="text-sm text-muted-foreground/70 italic">No notes yet.</p>
              )}
            </div>

            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 text-brand animate-spin" />
              </div>
            ) : (
              <div className="space-y-4">
                {blocks
                  .filter((block) => {
                    const exs = (blockExercisesByBlock[block.block_id] || []).filter(
                      (be) => be.step_type === 'exercise' || be.step_type === 'rest'
                    );
                    return exs.length > 0;
                  })
                  .map((block) => {
                    const blockExs = (blockExercisesByBlock[block.block_id] || []).filter(
                      (be) => be.step_type === 'exercise' || be.step_type === 'rest'
                    );
                    return (
                      <div key={block.block_id}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="h-6 w-6 rounded-full bg-brand text-brand-foreground text-xs font-semibold flex items-center justify-center">
                            {block.block_label}
                          </span>
                          <span className="text-xs font-medium text-muted-foreground capitalize">
                            {block.block_type?.replace(/_/g, ' ')}
                          </span>
                          {!isEMOMBlock(block) && (
                            <>
                              {block.rounds > 1 && (
                                <span className="text-xs text-muted-foreground">· {block.rounds} rounds</span>
                              )}
                              {block.time_cap_sec > 0 && (
                                <span className="text-xs text-muted-foreground">
                                  · {Math.round(block.time_cap_sec / 60)} min cap
                                </span>
                              )}
                            </>
                          )}
                        </div>
                        <div className="relative ml-8">
                          {blockExs.length > 1 && (
                            <div className="absolute left-3 top-6 bottom-6 w-px bg-border" />
                          )}
                          {blockExs.map((be, index) => {
                            const isRest = be.step_type === 'rest';
                            const sets = setsByBlockExercise[be.block_exercise_id] || [];
                            const setCount = sets.length || 1;
                            const reps = sets[0]?.target_reps?.toString() || be.prescription_value || '';
                            const stepLabel = blockExs.length > 1 ? `${block.block_label}${index + 1}` : null;
                            return (
                              <div key={be.block_exercise_id} className="flex items-center gap-2 mb-2 last:mb-0">
                                {stepLabel && (
                                  <span className="relative z-10 shrink-0 w-6 text-center text-[10px] font-semibold text-purple-700 bg-purple-100 rounded px-1 py-0.5">{stepLabel}</span>
                                )}
                                <div className="flex-1 min-w-0 flex items-center gap-3 rounded-xl border border-border p-3">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">{isRest ? 'Rest' : be.exercise_title_raw}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {isRest ? be.prescription_value : `${setCount} ${setCount === 1 ? 'set' : 'sets'} × ${reps}${be.load_value ? ` · ${be.load_value}` : ''}`}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>

          {!selectMode && (
            <Button asChild className="w-full rounded-xl h-12 bg-brand text-brand-foreground hover:bg-brand/90">
              <Link to={`/workout/${workout.id}${startDate ? `?date=${startDate}` : ''}`} onClick={() => onOpenChange(false)}>
                <Play className="h-4 w-4 mr-2" /> Start workout
              </Link>
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Tag({ children, className = '' }) {
  return (
    <span className={cn('inline-flex items-center px-2.5 py-1 rounded-full bg-muted text-muted-foreground font-medium', className)}>
      {children}
    </span>
  );
}