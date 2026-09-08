import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Dumbbell, Clock, Play, ChevronDown, Loader2, Footprints, Search, Plus, CalendarPlus, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { DragDropContext } from '@hello-pangea/dnd';
import { WORKOUT_DIFFICULTY_META, WORKOUT_CATEGORIES, isRunningWorkout, WORKOUT_FORMATS, workoutFormatMatches } from '@/lib/fitness';
import { cn } from '@/lib/utils';
import {
  buildBlocksByWorkout,
  buildBlockExercisesByBlock,
  countWorkoutExercises,
  roundToFive,
  isEMOMBlock,
  isAMRAPBlock,
  getWorkoutMetaLine,
} from '@/lib/workoutStructure';
import { useAuth } from '@/lib/AuthContext';
import ConfirmDeleteDialog from '@/components/ConfirmDeleteDialog';
import EditBlockExerciseSheet from '@/components/EditBlockExerciseSheet';
import ExercisePickerSheet from '@/components/ExercisePickerSheet';
import BlockEditor from '@/components/BlockEditor';
import CreateWorkoutSheet from '@/components/CreateWorkoutSheet';
import WorkoutFilters from '@/components/WorkoutFilters';
import AddToPlanSheet from '@/components/AddToPlanSheet';
import { useBlockExerciseCrud, reorderBlocks, persistBlockOrder } from '@/hooks/useBlockExerciseCrud';
import { recomputeAndSaveFormatLabel } from '@/lib/formatLabel';

const BATCH_SIZE = 20;
const SEARCH_STORAGE_KEY = 'raphyzone:workouts-search-query';

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
  const [query, setQuery] = useState(() => {
    try {
      return sessionStorage.getItem(SEARCH_STORAGE_KEY) || '';
    } catch {
      return '';
    }
  });
  const [selected, setSelected] = useState(null);
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [creatingWorkout, setCreatingWorkout] = useState(false);
  const [addingToPlan, setAddingToPlan] = useState(null);
  const [wForm, setWForm] = useState({ name: '', difficulty: '', workout_category: '', est_duration_min: '', description: '', notes: '' });
  const [showWorkoutEdit, setShowWorkoutEdit] = useState(false);
  const [savingWorkout, setSavingWorkout] = useState(false);
  const [deletingBlock, setDeletingBlock] = useState(null);
  const [pickerBlock, setPickerBlock] = useState(null);
  const [structureLoading, setStructureLoading] = useState(false);
  const [loadedSetsFor, setLoadedSetsFor] = useState(new Set());
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [searchResults, setSearchResults] = useState(null); // null = not searching; array = server-matched results
  const [searchLoading, setSearchLoading] = useState(false);
  const sentinelRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const lastScrollTopRef = useRef(0);

  const {
    editingBe, setEditingBe, deletingBe, setDeletingBe,
    handleDeleteBe, handleSaveBe, handleDragEnd,
  } = useBlockExerciseCrud({
    blockExercisesByBlock,
    setBlockExercisesByBlock,
    setsByBlockExercise,
    setSetsByBlockExercise,
    onChanged: () => recomputeAndSaveFormatLabel(selected),
  });

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
      beIds.forEach((beId) => { next[beId] = []; });
      sets.forEach((s) => {
        next[s.block_exercise_id].push(s);
      });
      Object.values(next).forEach((arr) => arr.sort((a, b) => (a.set_number || 0) - (b.set_number || 0)));
      return next;
    });
  };

  const refreshData = async () => {
    setLoading(true);
    setLoadedSetsFor(new Set());
    if (selected) {
      // loadWorkouts() below only refetches the paginated base list, which
      // doesn't include search-result rows — patch the edited workout into
      // both places directly so an active search reflects the save too.
      const { data: freshWorkout } = await supabase.from('workouts').select('*').eq('id', selected.id).single();
      if (freshWorkout) {
        setSelected(freshWorkout);
        setWorkouts((prev) => prev.map((w) => (w.id === freshWorkout.id ? freshWorkout : w)));
        setSearchResults((prev) => (prev ? prev.map((w) => (w.id === freshWorkout.id ? freshWorkout : w)) : prev));
      }
    }
    await loadWorkouts();
    if (selected) {
      await loadStructureData([selected]);
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

  useEffect(() => {
    if (selected) {
      setWForm({
        name: selected.name || '',
        difficulty: selected.difficulty || '',
        workout_category: selected.workout_category || '',
        est_duration_min: selected.est_duration_min?.toString() || '',
        description: selected.description || '',
        notes: selected.notes || '',
      });
      setShowWorkoutEdit(false);
    }
    // Only re-sync the form when a *different* workout is opened — refreshData()
    // patches `selected` with fresh rows in the background, and re-running this
    // off that would blow away whatever the admin is mid-typing.
  }, [selected?.id]);

  // The paginated `workouts` list only holds whatever's been scrolled into
  // view so far, so filtering it client-side made the search box silently
  // miss anything not yet loaded — with the "no results" list empty, the
  // infinite-scroll sentinel sat visible with nothing above it, kept firing
  // loadMore, and the UI never settled on a "no results" state. A non-empty
  // query now searches the whole table server-side instead.
  useEffect(() => {
    try {
      if (query) sessionStorage.setItem(SEARCH_STORAGE_KEY, query);
      else sessionStorage.removeItem(SEARCH_STORAGE_KEY);
    } catch {
      // sessionStorage unavailable (private mode, etc.) — search just won't persist
    }
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
      .some((f) => workoutFormatMatches(w.workout_format, f.value)
        // Falls back to the workout's own blocks in case the top-level
        // workout_format wasn't rolled up to include a format one of its
        // blocks actually uses (e.g. a "superset" workout with tabata timing).
        || (blocksByWorkout[w.workout_id] || []).some((b) => b.workout_format === f.value));
    return matchesRegion && matchesDifficulty && matchesType;
  }), [workouts, searchResults, region, running, difficulty, workoutType, blocksByWorkout]);

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
    const workoutBlocks = blocksByWorkout[selected.workout_id] || [];
    const relabeled = reorderBlocks(workoutBlocks, block.id, direction);
    if (!relabeled) return;
    setBlocksByWorkout((prev) => ({ ...prev, [selected.workout_id]: relabeled }));
    await persistBlockOrder(relabeled);
  };

  const handleSaveWorkout = async () => {
    setSavingWorkout(true);
    try {
      const { data: updated } = await supabase.from('workouts').update({
        name: wForm.name,
        difficulty: wForm.difficulty || null,
        workout_category: wForm.workout_category || null,
        est_duration_min: wForm.est_duration_min ? parseInt(wForm.est_duration_min, 10) : null,
        description: wForm.description || null,
        notes: wForm.notes || null,
      }).eq('id', selected.id).select().single();
      if (updated) {
        setSelected(updated);
        setWorkouts((prev) => prev.map((w) => (w.id === updated.id ? updated : w)));
        setSearchResults((prev) => (prev ? prev.map((w) => (w.id === updated.id ? updated : w)) : prev));
      }
      setShowWorkoutEdit(false);
    } finally {
      setSavingWorkout(false);
    }
  };

  const relabelBlocks = async (blockList) => {
    const sorted = [...blockList].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
    const updates = [];
    const relabeled = sorted.map((block, i) => {
      const label = String.fromCharCode(65 + i);
      if (block.block_label !== label || block.order_index !== i) {
        updates.push(supabase.from('workout_blocks').update({ block_label: label, order_index: i }).eq('id', block.id));
      }
      return { ...block, block_label: label, order_index: i };
    });
    await Promise.all(updates);
    return relabeled;
  };

  const handleUpdateBlock = async (blockId, data) => {
    await supabase.from('workout_blocks').update(data).eq('id', blockId);
    setBlocksByWorkout((prev) => ({
      ...prev,
      [selected.workout_id]: (prev[selected.workout_id] || []).map((b) => (b.id === blockId ? { ...b, ...data } : b)),
    }));
  };

  const handleAddBlock = async () => {
    const blocks = blocksByWorkout[selected.workout_id] || [];
    const { data: newBlock, error } = await supabase.from('workout_blocks').insert({
      workout_id: selected.workout_id,
      block_id: `BLK-${Date.now()}`,
      order_index: blocks.length,
      block_label: 'ZZ',
      block_type: 'main',
      rounds: 1,
    }).select().single();
    if (error || !newBlock) return;
    const relabeled = await relabelBlocks([...blocks, newBlock]);
    setBlocksByWorkout((prev) => ({ ...prev, [selected.workout_id]: relabeled }));
    setBlockExercisesByBlock((prev) => ({ ...prev, [newBlock.block_id]: [] }));
  };

  const handleDeleteBlock = async () => {
    if (!deletingBlock) return;
    const blockExs = blockExercisesByBlock[deletingBlock.block_id] || [];
    const setIds = blockExs.flatMap((be) => (setsByBlockExercise[be.block_exercise_id] || []).map((s) => s.id));
    if (setIds.length) await supabase.from('prescribed_sets').delete().in('id', setIds);
    if (blockExs.length) await supabase.from('block_exercises').delete().in('id', blockExs.map((be) => be.id));
    await supabase.from('workout_blocks').delete().eq('id', deletingBlock.id);
    const remaining = (blocksByWorkout[selected.workout_id] || []).filter((b) => b.id !== deletingBlock.id);
    const relabeled = await relabelBlocks(remaining);
    setBlocksByWorkout((prev) => ({ ...prev, [selected.workout_id]: relabeled }));
    setBlockExercisesByBlock((prev) => {
      const next = { ...prev };
      delete next[deletingBlock.block_id];
      return next;
    });
    await recomputeAndSaveFormatLabel(selected);
    setDeletingBlock(null);
  };

  const handleAddExercise = async (data) => {
    const block = pickerBlock;
    const existingExs = blockExercisesByBlock[block.block_id] || [];
    const orderInBlock = existingExs.length;
    const beId = `BE-${Date.now()}`;

    if (data.rest) {
      const { data: newBe } = await supabase.from('block_exercises').insert({
        block_exercise_id: beId,
        block_id: block.block_id,
        step_type: 'rest',
        exercise_title_raw: 'Rest',
        order_in_block: orderInBlock,
        prescription_value: `${data.duration_seconds}s`,
      }).select().single();
      setBlockExercisesByBlock((prev) => ({
        ...prev,
        [block.block_id]: [...(prev[block.block_id] || []), newBe],
      }));
      setPickerBlock(null);
      return;
    }

    const { exercise, prescription_value, sets: setCount } = data;
    const { data: newBe } = await supabase.from('block_exercises').insert({
      block_exercise_id: beId,
      block_id: block.block_id,
      step_type: 'exercise',
      exercise_id: exercise.exercise_code,
      exercise_title_raw: exercise.name,
      order_in_block: orderInBlock,
      prescription_value: prescription_value || null,
    }).select().single();
    setBlockExercisesByBlock((prev) => ({
      ...prev,
      [block.block_id]: [...(prev[block.block_id] || []), newBe],
    }));
    if (setCount > 0 && prescription_value) {
      const targetReps = parseInt(prescription_value, 10);
      if (!isNaN(targetReps)) {
        const { data: newSets } = await supabase.from('prescribed_sets').insert(
          Array.from({ length: setCount }, (_, i) => ({
            set_id: `SET-${Date.now()}-${i}`,
            block_exercise_id: beId,
            set_number: i + 1,
            target_reps: targetReps,
          }))
        ).select();
        setSetsByBlockExercise((prev) => ({ ...prev, [beId]: newSets || [] }));
      }
    }
    await recomputeAndSaveFormatLabel(selected);
    setPickerBlock(null);
  };

  return (
    <div className="flex flex-col h-[calc(100dvh-4rem)]">
      <div className="shrink-0 px-5 pt-10 pb-3 border-b border-border bg-background">
        <header className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Workout Library</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Curated training sessions</p>
          </div>
          <Button size="sm" onClick={() => setCreatingWorkout(true)} className="gap-1.5 h-8 shrink-0 bg-brand hover:bg-brand/90 text-brand-foreground">
            <Plus className="h-3.5 w-3.5" />
            Add
          </Button>
        </header>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search workouts…" className="pl-9 pr-9 rounded-xl h-11" />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
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
                      {w.format_label}
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
                <SheetDescription className="text-left">
                  {selected.format_label}
                </SheetDescription>
              </SheetHeader>
              <div className="px-5 pb-8 space-y-4">
                <div className="flex flex-wrap gap-2 text-xs">
                  <Tag>{WORKOUT_DIFFICULTY_META[selected.difficulty]?.label}</Tag>
                  <Tag>{getDuration(selected)} min</Tag>
                  {isRunningWorkout(selected) && (
                    <Tag className="flex items-center gap-1 bg-brand/10 text-brand"><Footprints className="h-3 w-3" /> Running</Tag>
                  )}
                  <Tag className="capitalize">{selected.workout_category}</Tag>
                </div>

                {isAdmin && (
                  <div className="rounded-2xl border border-border">
                    <button onClick={() => setShowWorkoutEdit(!showWorkoutEdit)} className="w-full flex items-center justify-between p-3">
                      <span className="text-sm font-medium">Workout details</span>
                      <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', showWorkoutEdit && 'rotate-180')} />
                    </button>
                    {showWorkoutEdit && (
                      <div className="p-3 pt-0 space-y-3">
                        <div>
                          <Label>Name</Label>
                          <Input value={wForm.name} onChange={(e) => setWForm({ ...wForm, name: e.target.value })} className="mt-1" />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label>Difficulty</Label>
                            <Select value={wForm.difficulty || undefined} onValueChange={(v) => setWForm({ ...wForm, difficulty: v })}>
                              <SelectTrigger className="mt-1">
                                <SelectValue placeholder="Select…" />
                              </SelectTrigger>
                              <SelectContent>
                                {Object.entries(WORKOUT_DIFFICULTY_META).map(([value, meta]) => (
                                  <SelectItem key={value} value={value}>{meta.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label>Category</Label>
                            <Select value={wForm.workout_category || undefined} onValueChange={(v) => setWForm({ ...wForm, workout_category: v })}>
                              <SelectTrigger className="mt-1">
                                <SelectValue placeholder="Select…" />
                              </SelectTrigger>
                              <SelectContent>
                                {WORKOUT_CATEGORIES.map((cat) => (
                                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div>
                          <Label>Duration (min)</Label>
                          <Input type="number" value={wForm.est_duration_min} onChange={(e) => setWForm({ ...wForm, est_duration_min: e.target.value })} className="mt-1" />
                        </div>
                        <div>
                          <Label>Description</Label>
                          <textarea value={wForm.description} onChange={(e) => setWForm({ ...wForm, description: e.target.value })} className="w-full mt-1 rounded-md border border-input bg-transparent px-3 py-2 text-sm min-h-[60px] focus:outline-none focus:ring-1 focus:ring-ring" />
                        </div>
                        <div>
                          <Label>Notes</Label>
                          <textarea value={wForm.notes} onChange={(e) => setWForm({ ...wForm, notes: e.target.value })} placeholder="Coach notes, cues, or reminders…" className="w-full mt-1 rounded-md border border-input bg-transparent px-3 py-2 text-sm min-h-[60px] focus:outline-none focus:ring-1 focus:ring-ring" />
                        </div>
                        <Button onClick={handleSaveWorkout} disabled={savingWorkout} size="sm" className="w-full rounded-lg bg-brand text-brand-foreground hover:bg-brand/90">
                          {savingWorkout ? 'Saving…' : 'Save details'}
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">
                    {getWorkoutMetaLine(selected, blocksByWorkout, blockExercisesByBlock)}
                  </p>
                  {!isAdmin && (
                    <div className="rounded-xl border border-border bg-muted/40 p-3 mb-2">
                      <p className="text-xs font-medium text-muted-foreground mb-1">Notes</p>
                      {selected.notes ? (
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{selected.notes}</p>
                      ) : (
                        <p className="text-sm text-muted-foreground/70 italic">No notes yet.</p>
                      )}
                    </div>
                  )}
                  {isAdmin ? (
                    <DragDropContext onDragEnd={handleDragEnd}>
                      <div className="space-y-3">
                        {(blocksByWorkout[selected.workout_id] || []).map((block, index, blocks) => (
                          <BlockEditor
                            key={block.id}
                            block={block}
                            exercises={(blockExercisesByBlock[block.block_id] || []).filter((be) => be.step_type === 'exercise' || be.step_type === 'rest')}
                            setsByBlockExercise={setsByBlockExercise}
                            onUpdateBlock={handleUpdateBlock}
                            onDeleteBlock={setDeletingBlock}
                            onEditExercise={setEditingBe}
                            onDeleteExercise={setDeletingBe}
                            onAddExercise={() => setPickerBlock(block)}
                            onMoveBlock={handleMoveBlock}
                            isFirst={index === 0}
                            isLast={index === blocks.length - 1}
                          />
                        ))}
                      </div>
                      <button onClick={handleAddBlock} className="w-full mt-3 rounded-2xl border border-dashed border-border py-3 text-sm text-muted-foreground hover:border-foreground/20 flex items-center justify-center gap-1.5">
                        <Plus className="h-4 w-4" /> Add block
                      </button>
                    </DragDropContext>
                  ) : (
                    <div className="space-y-4">
                      {(blocksByWorkout[selected.workout_id] || [])
                        .filter((block) => {
                          const blockExs = (blockExercisesByBlock[block.block_id] || []).filter(
                            (be) => be.step_type === 'exercise' || be.step_type === 'rest'
                          );
                          return blockExs.length > 0;
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
                                {isAMRAPBlock(block) ? 'AMRAP' : block.block_type?.replace(/_/g, ' ')}
                              </span>
                              {!isEMOMBlock(block) && (
                                <>
                                  {block.rounds > 1 && !isAMRAPBlock(block) && (
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
                                const reps =
                                  sets[0]?.target_reps?.toString() || be.prescription_value || '';
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

      <ConfirmDeleteDialog
        open={!!deletingBe}
        onOpenChange={(o) => !o && setDeletingBe(null)}
        title="Delete exercise?"
        description={`Remove "${deletingBe?.exercise_title_raw}" from this workout? This cannot be undone.`}
        onConfirm={handleDeleteBe}
      />

      <EditBlockExerciseSheet
        blockExercise={editingBe}
        prescribedSets={editingBe ? setsByBlockExercise[editingBe.block_exercise_id] : []}
        open={!!editingBe}
        onOpenChange={(o) => !o && setEditingBe(null)}
        onSave={handleSaveBe}
      />

      <ConfirmDeleteDialog
        open={!!deletingBlock}
        onOpenChange={(o) => !o && setDeletingBlock(null)}
        title="Delete block?"
        description="Delete this block and all its exercises? This cannot be undone."
        onConfirm={handleDeleteBlock}
      />

      <ExercisePickerSheet open={!!pickerBlock} onOpenChange={(o) => !o && setPickerBlock(null)} onPick={handleAddExercise} />

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