import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dumbbell, Clock, Play, Pencil, Trash2, GripVertical, ChevronUp, ChevronDown, Loader2, Footprints, Search, Plus, CalendarPlus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { WORKOUT_DIFFICULTY_META, isRunningWorkout, WORKOUT_FORMATS, workoutFormatMatches } from '@/lib/fitness';
import { cn } from '@/lib/utils';
import {
  buildBlocksByWorkout,
  buildBlockExercisesByBlock,
  countWorkoutExercises,
  roundToFive,
  isEMOMBlock,
  getWorkoutMetaLine,
} from '@/lib/workoutStructure';
import { useAuth } from '@/lib/AuthContext';
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
import EditBlockExerciseSheet from '@/components/EditBlockExerciseSheet';
import WorkoutEditorSheet from '@/components/WorkoutEditorSheet';
import CreateWorkoutSheet from '@/components/CreateWorkoutSheet';
import WorkoutFilters from '@/components/WorkoutFilters';
import AddToPlanSheet from '@/components/AddToPlanSheet';

const BATCH_SIZE = 20;

export default function Workouts() {
  const [workouts, setWorkouts] = useState([]);
  const [blocksByWorkout, setBlocksByWorkout] = useState({});
  const [blockExercisesByBlock, setBlockExercisesByBlock] = useState({});
  const [setsByBlockExercise, setSetsByBlockExercise] = useState({});
  const [loading, setLoading] = useState(true);
  const [region, setRegion] = useState('All');
  const [running, setRunning] = useState(false);
  const [difficulty, setDifficulty] = useState('All');
  const [workoutType, setWorkoutType] = useState('All');
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [editingBe, setEditingBe] = useState(null);
  const [deletingBe, setDeletingBe] = useState(null);
  const [editingWorkout, setEditingWorkout] = useState(null);
  const [creatingWorkout, setCreatingWorkout] = useState(false);
  const [addingToPlan, setAddingToPlan] = useState(null);
  const [structureLoading, setStructureLoading] = useState(false);
  const [loadedSetsFor, setLoadedSetsFor] = useState(new Set());
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [searchResults, setSearchResults] = useState(null); // null = not searching; array = server-matched results
  const [searchLoading, setSearchLoading] = useState(false);
  const sentinelRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const lastScrollTopRef = useRef(0);

  const loadWorkouts = async () => {
    try {
      setStructureLoading(true);
      const { data } = await supabase
        .from('workouts')
        .select('*')
        .eq('ownership_type', 'official')
        .eq('status', 'approved')
        .order('name')
        .limit(BATCH_SIZE);
      const batch = data || [];
      setWorkouts(batch);
      setHasMore(batch.length === BATCH_SIZE);
      if (selected) {
        const updated = batch.find((w) => w.id === selected.id);
        if (updated) setSelected(updated);
      }
      await loadStructureData(batch);
    } finally {
      setLoading(false);
      setStructureLoading(false);
    }
  };

  const loadStructureData = async (ws) => {
    const workoutIds = (ws || workouts).map((w) => w.workout_id).filter(Boolean);
    if (!workoutIds.length) return;
    // Fetch only blocks + block exercises for the given workouts (merge into existing maps)
    const { data: blocksData } = await supabase.from('workout_blocks').select('*').in('workout_id', workoutIds);
    const blocks = blocksData || [];
    const blockIds = blocks.map((b) => b.block_id);
    const blockExs = blockIds.length
      ? (await supabase.from('block_exercises').select('*').in('block_id', blockIds)).data || []
      : [];
    setBlocksByWorkout((prev) => ({ ...prev, ...buildBlocksByWorkout(blocks) }));
    setBlockExercisesByBlock((prev) => ({ ...prev, ...buildBlockExercisesByBlock(blockExs) }));
  };

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || loading || searchResults !== null) return;
    setLoadingMore(true);
    try {
      const lastWorkout = workouts[workouts.length - 1];
      if (!lastWorkout) { setHasMore(false); return; }
      const { data } = await supabase
        .from('workouts')
        .select('*')
        .eq('ownership_type', 'official')
        .eq('status', 'approved')
        .gt('name', lastWorkout.name)
        .order('name')
        .limit(BATCH_SIZE);
      const batch = data || [];
      if (batch.length === 0) {
        setHasMore(false);
      } else {
        setWorkouts((prev) => [...prev, ...batch]);
        setHasMore(batch.length === BATCH_SIZE);
        await loadStructureData(batch);
      }
    } finally {
      setLoadingMore(false);
    }
  }, [workouts, loadingMore, hasMore, loading, searchResults]);

  const loadWorkoutSets = async (workout) => {
    if (!workout || loadedSetsFor.has(workout.workout_id)) return;
    setLoadedSetsFor((prev) => new Set([...prev, workout.workout_id]));
    const blocks = blocksByWorkout[workout.workout_id] || [];
    const blockIds = blocks.map((b) => b.block_id);
    const blockExs = blockIds.flatMap((bid) => blockExercisesByBlock[bid] || []);
    const beIds = blockExs.map((be) => be.block_exercise_id);
    if (beIds.length === 0) return;
    const { data } = await supabase.from('prescribed_sets').select('*').in('block_exercise_id', beIds);
    const sets = data || [];
    setSetsByBlockExercise((prev) => {
      const next = { ...prev };
      sets.forEach((s) => {
        if (!next[s.block_exercise_id]) next[s.block_exercise_id] = [];
        next[s.block_exercise_id].push(s);
      });
      Object.values(next).forEach((arr) => arr.sort((a, b) => (a.set_number || 0) - (b.set_number || 0)));
      return next;
    });
  };

  const refreshData = async () => {
    setLoading(true);
    setBlocksByWorkout({});
    setBlockExercisesByBlock({});
    setLoadedSetsFor(new Set());
    await loadWorkouts();
    if (selected) {
      setLoadedSetsFor((prev) => {
        const next = new Set(prev);
        next.delete(selected.workout_id);
        return next;
      });
    }
  };

  useEffect(() => {
    loadWorkouts();
  }, []);

  // The paginated `workouts` list only holds whatever's been scrolled into
  // view so far, so filtering it client-side made the search box silently
  // miss anything not yet loaded — with the "no results" list empty, the
  // infinite-scroll sentinel sat visible with nothing above it, kept firing
  // loadMore, and the UI never settled on a "no results" state. A non-empty
  // query now searches the whole table server-side instead.
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setSearchResults(null);
      return;
    }
    let cancelled = false;
    setSearchLoading(true);
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('workouts')
        .select('*')
        .eq('ownership_type', 'official')
        .eq('status', 'approved')
        .ilike('name', `%${trimmed}%`)
        .order('name')
        .limit(100);
      if (cancelled) return;
      const results = data || [];
      setSearchResults(results);
      await loadStructureData(results);
      if (!cancelled) setSearchLoading(false);
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { root: scrollContainerRef.current, rootMargin: '700px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore]);

  useEffect(() => {
    if (selected && !structureLoading && !loadedSetsFor.has(selected.workout_id) && blocksByWorkout[selected.workout_id]) {
      loadWorkoutSets(selected);
    }
  }, [selected, structureLoading, loadedSetsFor, blocksByWorkout]);

  const filtered = useMemo(() => (searchResults ?? workouts).filter((w) => {
    const matchesRegion = running ? isRunningWorkout(w) : (region === 'All' || w.workout_category === region);
    const matchesDifficulty = difficulty === 'All' || w.difficulty === difficulty.toLowerCase();
    const matchesType = workoutType === 'All' || WORKOUT_FORMATS
      .filter((f) => f.label === workoutType)
      .some((f) => workoutFormatMatches(w.workout_format, f.value));
    return matchesRegion && matchesDifficulty && matchesType;
  }), [workouts, searchResults, region, running, difficulty, workoutType]);

  const handleListScroll = (e) => {
    const scrollTop = e.currentTarget.scrollTop;
    if (filtersExpanded && scrollTop > lastScrollTopRef.current && scrollTop > 8) {
      setFiltersExpanded(false);
    }
    lastScrollTopRef.current = scrollTop;
  };

  const getExerciseCount = (w) => countWorkoutExercises(w, blocksByWorkout, blockExercisesByBlock);
  const getDuration = (w) => roundToFive(w.est_duration_min);

  const handleMoveBlock = async (block, direction) => {
    const workoutBlocks = [...(blocksByWorkout[selected.workout_id] || [])].sort(
      (a, b) => (a.order_index || 0) - (b.order_index || 0)
    );
    const currentIndex = workoutBlocks.findIndex((b) => b.block_id === block.block_id);
    const swapIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (swapIndex < 0 || swapIndex >= workoutBlocks.length) return;
    [workoutBlocks[currentIndex], workoutBlocks[swapIndex]] = [workoutBlocks[swapIndex], workoutBlocks[currentIndex]];
    const relabeled = workoutBlocks.map((b, i) => ({ ...b, block_label: String.fromCharCode(65 + i), order_index: i }));
    setBlocksByWorkout((prev) => ({ ...prev, [selected.workout_id]: relabeled }));
    await Promise.all(
      relabeled.map((b) => supabase.from('workout_blocks').update({ block_label: b.block_label, order_index: b.order_index }).eq('id', b.id))
    );
  };

  const handleDeleteBe = async () => {
    if (!deletingBe) return;
    const sets = setsByBlockExercise[deletingBe.block_exercise_id] || [];
    if (sets.length) {
      await supabase.from('prescribed_sets').delete().in('id', sets.map((s) => s.id));
    }
    await supabase.from('block_exercises').delete().eq('id', deletingBe.id);
    setBlockExercisesByBlock((prev) => {
      const next = { ...prev };
      next[deletingBe.block_id] = (next[deletingBe.block_id] || []).filter(
        (be) => be.block_exercise_id !== deletingBe.block_exercise_id
      );
      return next;
    });
    setSetsByBlockExercise((prev) => {
      const next = { ...prev };
      delete next[deletingBe.block_exercise_id];
      return next;
    });
    setDeletingBe(null);
  };

  const handleSaveBe = async (formData) => {
    const { data: fresh } = await supabase.from('block_exercises').update({
      prescription_value: formData.prescription_value,
      load_value: formData.load_value,
      notes: formData.notes,
    }).eq('id', editingBe.id).select().single();
    let sets = (setsByBlockExercise[editingBe.block_exercise_id] || []).slice().sort(
      (a, b) => (a.set_number || 0) - (b.set_number || 0)
    );
    const targetReps = parseInt(formData.prescription_value, 10);
    const targetCount = Math.max(1, formData.set_count || sets.length || 1);

    // Update reps on existing sets when prescription is numeric
    if (sets.length && !isNaN(targetReps)) {
      await Promise.all(sets.map((s) => supabase.from('prescribed_sets').update({ target_reps: targetReps }).eq('id', s.id)));
      sets = sets.map((s) => ({ ...s, target_reps: targetReps }));
    }

    // Reconcile set count: add or remove PrescribedSet records
    if (targetCount > sets.length) {
      const newSets = [];
      for (let i = sets.length; i < targetCount; i++) {
        newSets.push({
          set_id: `${editingBe.block_exercise_id}-S${i + 1}`,
          block_exercise_id: editingBe.block_exercise_id,
          set_number: i + 1,
          target_reps: !isNaN(targetReps) ? targetReps : (sets[0]?.target_reps ?? 8),
        });
      }
      const { data: created } = await supabase.from('prescribed_sets').insert(newSets).select();
      sets = [...sets, ...(created || [])];
    } else if (targetCount < sets.length) {
      const toDelete = sets.slice(targetCount);
      await Promise.all(toDelete.map((s) => supabase.from('prescribed_sets').delete().eq('id', s.id)));
      sets = sets.slice(0, targetCount);
    }

    setSetsByBlockExercise((prev) => {
      const next = { ...prev };
      next[editingBe.block_exercise_id] = sets;
      return next;
    });
    setBlockExercisesByBlock((prev) => {
      const next = { ...prev };
      next[editingBe.block_id] = (next[editingBe.block_id] || []).map((be) =>
        be.block_exercise_id === fresh.block_exercise_id ? { ...be, ...fresh } : be
      );
      return next;
    });
    setEditingBe(null);
  };

  const handleDragEnd = async (result) => {
    if (!result.destination) return;
    const { source, destination } = result;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    const sourceBlockId = source.droppableId;
    const destBlockId = destination.droppableId;

    const sourceExs = [...(blockExercisesByBlock[sourceBlockId] || []).filter((be) => be.step_type === 'exercise' || be.step_type === 'rest')];
    const [moved] = sourceExs.splice(source.index, 1);

    let destExs;
    if (sourceBlockId === destBlockId) {
      destExs = sourceExs;
    } else {
      destExs = [...(blockExercisesByBlock[destBlockId] || []).filter((be) => be.step_type === 'exercise' || be.step_type === 'rest')];
    }
    destExs.splice(destination.index, 0, moved);

    const newBeMap = { ...blockExercisesByBlock };
    if (sourceBlockId === destBlockId) {
      newBeMap[sourceBlockId] = destExs;
    } else {
      newBeMap[sourceBlockId] = sourceExs;
      newBeMap[destBlockId] = destExs;
    }
    setBlockExercisesByBlock(newBeMap);

    const updates = [];
    const movedUpdate = { order_in_block: destination.index };
    if (sourceBlockId !== destBlockId) movedUpdate.block_id = destBlockId;
    updates.push(supabase.from('block_exercises').update(movedUpdate).eq('id', moved.id));

    if (sourceBlockId !== destBlockId) {
      sourceExs.forEach((be, i) => {
        if (be.order_in_block !== i) updates.push(supabase.from('block_exercises').update({ order_in_block: i }).eq('id', be.id));
      });
    }
    destExs.forEach((be, i) => {
      if (be.id === moved.id) return;
      if (be.order_in_block !== i) updates.push(supabase.from('block_exercises').update({ order_in_block: i }).eq('id', be.id));
    });
    await Promise.all(updates);
  };

  return (
    <div className="flex flex-col h-[calc(100dvh-4rem)]">
      <div className="shrink-0 px-5 pt-10 pb-3 border-b border-border bg-background">
        <header className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Workout Library</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Curated training sessions</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setCreatingWorkout(true)} className="rounded-xl shrink-0">
            <Plus className="h-4 w-4 mr-1" /> New
          </Button>
        </header>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search workouts…" className="pl-9 rounded-xl h-11" />
        </div>

        <WorkoutFilters
          region={region}
          setRegion={setRegion}
          running={running}
          setRunning={setRunning}
          difficulty={difficulty}
          setDifficulty={setDifficulty}
          workoutType={workoutType}
          setWorkoutType={setWorkoutType}
          expanded={filtersExpanded}
          setExpanded={setFiltersExpanded}
        />
      </div>

      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-5 pt-3 pb-4" onScroll={handleListScroll}>
      {loading || (searchLoading && searchResults === null) ? (
        <div className="flex justify-center py-20">
          <div className="w-7 h-7 border-4 border-muted border-t-brand rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((w) => (
            <button key={w.id} onClick={() => setSelected(w)} className="w-full text-left">
              <Card className="rounded-2xl border-border p-4 hover:border-foreground/20 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{w.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                      {(() => {
                        const emomBlock = (blocksByWorkout[w.workout_id] || []).find((b) => isEMOMBlock(b));
                        return emomBlock ? `${w.format_label} x ${emomBlock.rounds} mins` : w.format_label;
                      })()}
                    </p>
                  </div>
                  <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded-full', WORKOUT_DIFFICULTY_META[w.difficulty]?.color)}>
                    {WORKOUT_DIFFICULTY_META[w.difficulty]?.label}
                  </span>
                </div>
                <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {getDuration(w)} min
                  </span>
                  <span className="flex items-center gap-1">
                    <Dumbbell className="h-3.5 w-3.5" />
                    {blocksByWorkout[w.workout_id] ? `${getExerciseCount(w)} ${getExerciseCount(w) === 1 ? 'Exercise' : 'Exercises'}` : '—'}
                  </span>
                  {isRunningWorkout(w) && (
                    <span className="flex items-center gap-1 text-brand">
                      <Footprints className="h-3.5 w-3.5" />
                      Running
                    </span>
                  )}
                  <span className="capitalize">{w.workout_category}</span>
                </div>
              </Card>
            </button>
          ))}
          {filtered.length === 0 && !loadingMore && !searchLoading && (
            <p className="text-center text-sm text-muted-foreground py-16">No workouts found.</p>
          )}
          <div ref={sentinelRef} className="h-10 flex items-center justify-center">
            {searchResults !== null ? (
              searchLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : null
            ) : loadingMore ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : !hasMore && filtered.length > 0 ? (
              <p className="text-xs text-muted-foreground">No more workouts</p>
            ) : null}
          </div>
        </div>
      )}
      </div>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent side="bottom" className="rounded-t-3xl max-h-[85vh] overflow-y-auto">
          {selected && (
            <>
              <SheetHeader className="px-5 pt-5">
                <SheetTitle className="text-xl text-left">{selected.name}</SheetTitle>
              </SheetHeader>
              <div className="px-5 pb-8 space-y-4">
                {(() => {
                  const emomBlock = (blocksByWorkout[selected.workout_id] || []).find((b) => isEMOMBlock(b));
                  const base = selected.format_label;
                  return emomBlock
                    ? <p className="text-sm text-muted-foreground">{base} x {emomBlock.rounds} mins</p>
                    : <p className="text-sm text-muted-foreground">{base}</p>;
                })()}
                <div className="flex flex-wrap gap-2 text-xs">
                  <Tag>{WORKOUT_DIFFICULTY_META[selected.difficulty]?.label}</Tag>
                  <Tag>{getDuration(selected)} min</Tag>
                  {isRunningWorkout(selected) && (
                    <Tag className="flex items-center gap-1 bg-brand/10 text-brand"><Footprints className="h-3 w-3" /> Running</Tag>
                  )}
                  <Tag className="capitalize">{selected.workout_category}</Tag>
                </div>

                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">
                    {getWorkoutMetaLine(selected, blocksByWorkout, blockExercisesByBlock)}
                  </p>
                  <div className="rounded-xl border border-border bg-muted/40 p-3 mb-2">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Notes</p>
                    {selected.notes ? (
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">{selected.notes}</p>
                    ) : (
                      <p className="text-sm text-muted-foreground/70 italic">No notes yet.</p>
                    )}
                  </div>
                  <DragDropContext onDragEnd={handleDragEnd}>
                  <div className="space-y-4">
                    {(blocksByWorkout[selected.workout_id] || [])
                      .filter((block) => {
                        const blockExs = (blockExercisesByBlock[block.block_id] || []).filter(
                          (be) => be.step_type === 'exercise' || be.step_type === 'rest'
                        );
                        return blockExs.length > 0;
                      })
                      .map((block, index, visibleBlocks) => {
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
                            {isAdmin && (
                              <div className="ml-auto flex items-center gap-0.5">
                                <button onClick={() => handleMoveBlock(block, 'up')} disabled={index === 0} className="p-1 rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-30 disabled:pointer-events-none">
                                  <ChevronUp className="h-3.5 w-3.5" />
                                </button>
                                <button onClick={() => handleMoveBlock(block, 'down')} disabled={index === visibleBlocks.length - 1} className="p-1 rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-30 disabled:pointer-events-none">
                                  <ChevronDown className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            )}
                          </div>
                          <Droppable droppableId={block.block_id} type="exercise">
                            {(provided) => (
                              <div ref={provided.innerRef} {...provided.droppableProps} className="relative ml-8">
                                {blockExs.length > 1 && (
                                  <div className="absolute left-3 top-6 bottom-6 w-px bg-border" />
                                )}
                                {blockExs.map((be, index) => {
                                  const isRest = be.step_type === 'rest';
                                  const sets = setsByBlockExercise[be.block_exercise_id] || [];
                                  const setCount = sets.length || 1;
                                  const reps =
                                    sets[0]?.target_reps?.toString() || be.prescription_value || '';
                                  const stepLabel = blockExs.length > 1 ? `${block.block_label}${index + 1}` : null;
                                  if (isAdmin) {
                                    return (
                                      <Draggable key={be.block_exercise_id} draggableId={be.block_exercise_id} index={index}>
                                        {(p) => (
                                          <div ref={p.innerRef} {...p.draggableProps} className="flex items-center gap-2 mb-2 last:mb-0">
                                            {stepLabel && (
                                              <span className="relative z-10 shrink-0 w-6 text-center text-[10px] font-semibold text-purple-700 bg-purple-100 rounded px-1 py-0.5">{stepLabel}</span>
                                            )}
                                            <div className="flex-1 min-w-0 flex items-center gap-2 rounded-xl border border-border p-3 bg-card">
                                              <span {...p.dragHandleProps} className="cursor-grab text-muted-foreground touch-none shrink-0">
                                                <GripVertical className="h-4 w-4" />
                                              </span>
                                              <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium truncate">{isRest ? 'Rest' : be.exercise_title_raw}</p>
                                                <p className="text-xs text-muted-foreground">
                                                  {isRest ? be.prescription_value : `${setCount} ${setCount === 1 ? 'set' : 'sets'} × ${reps}${be.load_value ? ` · ${be.load_value}` : ''}`}
                                                </p>
                                              </div>
                                              <div className="flex items-center gap-1">
                                                <button onClick={() => setEditingBe(be)} className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted">
                                                  <Pencil className="h-3.5 w-3.5" />
                                                </button>
                                                <button onClick={() => setDeletingBe(be)} className="p-1.5 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                                                  <Trash2 className="h-3.5 w-3.5" />
                                                </button>
                                              </div>
                                            </div>
                                          </div>
                                        )}
                                      </Draggable>
                                    );
                                  }
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
                                {provided.placeholder}
                              </div>
                            )}
                          </Droppable>
                        </div>
                      );
                    })}
                  </div>
                  </DragDropContext>
                </div>

                {isAdmin && (
                  <Button
                    variant="outline"
                    onClick={() => setEditingWorkout(selected)}
                    className="w-full rounded-xl h-12"
                  >
                    <Pencil className="h-4 w-4 mr-2" /> Edit workout
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => setAddingToPlan(selected)}
                  className="w-full rounded-xl h-12"
                >
                  <CalendarPlus className="h-4 w-4 mr-2" /> Add to weekly plan
                </Button>
                <Button
                  asChild
                  className="w-full rounded-xl h-12 bg-brand text-brand-foreground hover:bg-brand/90"
                >
                  <Link to={`/workout/${selected.id}`} onClick={() => setSelected(null)}>
                    <Play className="h-4 w-4 mr-2" /> Start workout
                  </Link>
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!deletingBe} onOpenChange={(o) => !o && setDeletingBe(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete exercise?</AlertDialogTitle>
            <AlertDialogDescription>
              Remove "{deletingBe?.exercise_title_raw}" from this workout? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteBe} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <EditBlockExerciseSheet
        blockExercise={editingBe}
        prescribedSets={editingBe ? setsByBlockExercise[editingBe.block_exercise_id] : []}
        open={!!editingBe}
        onOpenChange={(o) => !o && setEditingBe(null)}
        onSave={handleSaveBe}
      />

      <WorkoutEditorSheet
        workout={editingWorkout}
        open={!!editingWorkout}
        onOpenChange={(o) => !o && setEditingWorkout(null)}
        onChanged={refreshData}
      />

      <CreateWorkoutSheet
        open={creatingWorkout}
        onOpenChange={setCreatingWorkout}
        onSubmitted={refreshData}
      />

      <AddToPlanSheet
        workout={addingToPlan}
        open={!!addingToPlan}
        onOpenChange={(o) => !o && setAddingToPlan(null)}
      />
    </div>
  );
}

function Tag({ children, className = '' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-1 rounded-full bg-muted text-muted-foreground font-medium',
        className
      )}
    >
      {children}
    </span>
  );
}