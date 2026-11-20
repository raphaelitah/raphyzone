import { useEffect, useRef, useState } from 'react';
import { DragDropContext } from '@hello-pangea/dnd';
import { Plus, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import BlockEditor from '@/components/BlockEditor';
import EditBlockExerciseSheet from '@/components/EditBlockExerciseSheet';
import ExercisePickerSheet from '@/components/ExercisePickerSheet';
import ConfirmDeleteDialog from '@/components/ConfirmDeleteDialog';
import { useBlockExerciseCrud, reorderBlocks, persistBlockOrder } from '@/hooks/useBlockExerciseCrud';
import { recomputeAndSaveFormatLabel } from '@/lib/formatLabel';
import { recomputeAndSaveDuration, fetchOwnCustomNames } from '@/lib/customizeWorkout';
import { validateWorkoutName } from '@/lib/workoutNames';
import { roundToFive } from '@/lib/workoutStructure';
import { useAuth } from '@/lib/AuthContext';
import {
  buildBlocksByWorkout,
  buildBlockExercisesByBlock,
} from '@/lib/workoutStructure';

const newCode = (prefix) => `${prefix}-${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

/**
 * Full editor for one of the athlete's own private workouts (a customized copy
 * of a catalog workout): rename, add/remove/reorder blocks and exercises, change
 * sets, reps, load and rest. The owner RLS policies already allow every write
 * here; the shared catalog workout it was copied from is never touched.
 *
 * `onClose(dirty)` fires when the sheet closes; `dirty` is true if anything changed,
 * so the caller can refresh weights and the plan.
 */
export default function WorkoutCustomizeSheet({ workout, open, onOpenChange, onClose }) {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState(null);
  const [takenNames, setTakenNames] = useState([]); // the original's name + the athlete's other custom workouts
  const [minutes, setMinutes] = useState(null);
  const [blocks, setBlocks] = useState([]);
  const [blockExercisesByBlock, setBlockExercisesByBlock] = useState({});
  const [setsByBlockExercise, setSetsByBlockExercise] = useState({});
  const [loading, setLoading] = useState(false);
  const [deletingBlock, setDeletingBlock] = useState(null);
  const [pickerBlock, setPickerBlock] = useState(null);
  const dirtyRef = useRef(false);
  const workoutRef = useRef(workout);
  workoutRef.current = workout;

  // Every structural change re-labels the workout and re-estimates how long it takes
  // (the original's duration plus the difference the changes make).
  const markDirty = async () => {
    dirtyRef.current = true;
    await recomputeAndSaveFormatLabel(workoutRef.current);
    const m = await recomputeAndSaveDuration(workoutRef.current);
    if (m != null) setMinutes(m);
  };

  const {
    editingBe, setEditingBe, deletingBe, setDeletingBe,
    handleDeleteBe, handleSaveBe, handleDragEnd,
  } = useBlockExerciseCrud({
    blockExercisesByBlock,
    setBlockExercisesByBlock,
    setsByBlockExercise,
    setSetsByBlockExercise,
    onChanged: markDirty,
  });

  // Reorders / saves from the shared hook don't go through onChanged for every
  // path (drag, save), so wrap them to flag the change.
  const onDragEnd = async (result) => { await handleDragEnd(result); await markDirty(); };
  const onSaveBe = async (form) => { await handleSaveBe(form); await markDirty(); };

  useEffect(() => {
    if (!open || !workout?.workout_id) return;
    let cancelled = false;
    dirtyRef.current = false;
    setName(workout.name || '');
    setNameError(null);
    setMinutes(workout.est_duration_min ?? null);
    setLoading(true);
    (async () => {
      // A name can't repeat the catalog workout this was copied from, or another of the athlete's own.
      const [{ data: root }, others] = await Promise.all([
        workout.source_workout_id
          ? supabase.from('workouts').select('name').eq('workout_id', workout.source_workout_id).maybeSingle()
          : Promise.resolve({ data: null }),
        fetchOwnCustomNames(user?.id, workout.id),
      ]);
      if (!cancelled) setTakenNames([root?.name, ...others].filter(Boolean));
      const { data: blockRows } = await supabase.from('workout_blocks').select('*').eq('workout_id', workout.workout_id);
      const blockIds = (blockRows || []).map((b) => b.block_id);
      const beRows = blockIds.length
        ? (await supabase.from('block_exercises').select('*').in('block_id', blockIds)).data || []
        : [];
      const beIds = beRows.map((be) => be.block_exercise_id);
      const setRows = beIds.length
        ? (await supabase.from('prescribed_sets').select('*').in('block_exercise_id', beIds)).data || []
        : [];
      if (cancelled) return;
      const sorted = [...(buildBlocksByWorkout(blockRows || [])[workout.workout_id] || [])];
      setBlocks(sorted);
      setBlockExercisesByBlock(buildBlockExercisesByBlock(beRows));
      const bySet = {};
      beIds.forEach((id) => { bySet[id] = []; });
      setRows.forEach((s) => { bySet[s.block_exercise_id].push(s); });
      Object.values(bySet).forEach((arr) => arr.sort((a, b) => (a.set_number || 0) - (b.set_number || 0)));
      setSetsByBlockExercise(bySet);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when a different workout opens, not on every rename
  }, [open, workout?.id, workout?.workout_id]);

  const handleOpenChange = (o) => {
    if (!o) onClose?.(dirtyRef.current);
    onOpenChange(o);
  };

  const saveName = async () => {
    if (name.trim() === workout.name) { setNameError(null); return; }
    const result = validateWorkoutName(name, takenNames);
    if (result.error) { setNameError(result.error); return; }
    setNameError(null);
    const { error } = await supabase.from('workouts').update({ name: result.name }).eq('id', workout.id);
    if (error) { setNameError("Couldn't rename. Please try again."); return; }
    setName(result.name);
    dirtyRef.current = true;
  };

  const relabelBlocks = async (list) => {
    const sorted = [...list].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
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

  const handleMoveBlock = async (block, direction) => {
    const relabeled = reorderBlocks(blocks, block.id, direction);
    if (!relabeled) return;
    setBlocks(relabeled);
    await persistBlockOrder(relabeled);
    dirtyRef.current = true;
  };

  const handleUpdateBlock = async (blockId, data) => {
    await supabase.from('workout_blocks').update(data).eq('id', blockId);
    setBlocks((prev) => prev.map((b) => (b.id === blockId ? { ...b, ...data } : b)));
    await markDirty();
  };

  const handleAddBlock = async () => {
    const { data: created, error } = await supabase.from('workout_blocks').insert({
      workout_id: workout.workout_id,
      block_id: newCode('BLK'),
      order_index: blocks.length,
      block_label: String.fromCharCode(65 + blocks.length),
      block_type: 'main',
      rounds: 1,
    }).select().single();
    if (error || !created) return;
    setBlocks((prev) => [...prev, created]);
    setBlockExercisesByBlock((prev) => ({ ...prev, [created.block_id]: [] }));
    await markDirty();
  };

  const handleDeleteBlock = async () => {
    if (!deletingBlock) return;
    const blockExs = blockExercisesByBlock[deletingBlock.block_id] || [];
    const setIds = blockExs.flatMap((be) => (setsByBlockExercise[be.block_exercise_id] || []).map((s) => s.id));
    if (setIds.length) await supabase.from('prescribed_sets').delete().in('id', setIds);
    if (blockExs.length) await supabase.from('block_exercises').delete().in('id', blockExs.map((be) => be.id));
    await supabase.from('workout_blocks').delete().eq('id', deletingBlock.id);
    const relabeled = await relabelBlocks(blocks.filter((b) => b.id !== deletingBlock.id));
    setBlocks(relabeled);
    setBlockExercisesByBlock((prev) => { const next = { ...prev }; delete next[deletingBlock.block_id]; return next; });
    setDeletingBlock(null);
    await markDirty();
  };

  const handleAddExercise = async (data) => {
    const block = pickerBlock;
    if (!block) return;
    const order = (blockExercisesByBlock[block.block_id] || []).length;
    const beCode = newCode('BE');
    if (data.rest) {
      const { data: created } = await supabase.from('block_exercises').insert({
        block_exercise_id: beCode, block_id: block.block_id, step_type: 'rest',
        exercise_title_raw: 'Rest', order_in_block: order, prescription_value: `${data.duration_seconds}s`,
      }).select().single();
      if (created) setBlockExercisesByBlock((prev) => ({ ...prev, [block.block_id]: [...(prev[block.block_id] || []), created] }));
      setPickerBlock(null);
      await markDirty();
      return;
    }
    const { exercise, prescription_value, sets: setCount } = data;
    const { data: created } = await supabase.from('block_exercises').insert({
      block_exercise_id: beCode, block_id: block.block_id, step_type: 'exercise',
      exercise_id: exercise.exercise_code, exercise_title_raw: exercise.name,
      order_in_block: order, prescription_value: prescription_value || null,
    }).select().single();
    if (!created) { setPickerBlock(null); return; }
    setBlockExercisesByBlock((prev) => ({ ...prev, [block.block_id]: [...(prev[block.block_id] || []), created] }));
    const targetReps = parseInt(prescription_value, 10);
    if (setCount > 0 && !Number.isNaN(targetReps)) {
      const { data: newSets } = await supabase.from('prescribed_sets').insert(
        Array.from({ length: setCount }, (_, i) => ({
          set_id: newCode('SET'), block_exercise_id: beCode, set_number: i + 1, target_reps: targetReps,
        }))
      ).select();
      setSetsByBlockExercise((prev) => ({ ...prev, [beCode]: newSets || [] }));
    }
    setPickerBlock(null);
    await markDirty();
  };

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent side="bottom" className="rounded-t-3xl h-[92dvh] flex flex-col p-0">
          <SheetHeader className="px-5 pt-5 pb-3 border-b border-border">
            <SheetTitle className="text-left">Customize workout</SheetTitle>
            <SheetDescription className="text-left">
              Changes apply to your own copy. The original workout stays as it is.
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            <div>
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="custom-workout-name">Name</label>
                {minutes != null && <span className="text-xs text-muted-foreground">About {roundToFive(minutes) || minutes} min</span>}
              </div>
              <Input
                id="custom-workout-name"
                value={name}
                onChange={(e) => { setName(e.target.value); setNameError(null); }}
                onBlur={saveName}
                aria-invalid={!!nameError}
                className="mt-1"
              />
              {nameError && <p role="alert" className="text-xs text-destructive mt-1.5">{nameError}</p>}
            </div>
            {loading ? (
              <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 text-brand animate-spin" /></div>
            ) : (
              <DragDropContext onDragEnd={onDragEnd}>
                <div className="space-y-3">
                  {[...blocks].sort((a, b) => (a.order_index || 0) - (b.order_index || 0)).map((block, index, list) => (
                    <BlockEditor
                      key={block.id}
                      block={block}
                      exercises={(blockExercisesByBlock[block.block_id] || [])
                        .filter((be) => be.step_type === 'exercise' || be.step_type === 'rest')
                        .sort((a, b) => (a.order_in_block || 0) - (b.order_in_block || 0))}
                      setsByBlockExercise={setsByBlockExercise}
                      onUpdateBlock={handleUpdateBlock}
                      onDeleteBlock={setDeletingBlock}
                      onEditExercise={setEditingBe}
                      onDeleteExercise={setDeletingBe}
                      onAddExercise={() => setPickerBlock(block)}
                      onMoveBlock={handleMoveBlock}
                      isFirst={index === 0}
                      isLast={index === list.length - 1}
                    />
                  ))}
                </div>
                <button
                  onClick={handleAddBlock}
                  className="w-full mt-3 rounded-2xl border border-dashed border-border py-3 text-sm text-muted-foreground hover:border-foreground/20 flex items-center justify-center gap-1.5"
                >
                  <Plus className="h-4 w-4" /> Add block
                </button>
              </DragDropContext>
            )}
          </div>
          <div className="px-5 py-3 border-t border-border bg-background">
            <Button onClick={() => handleOpenChange(false)} className="w-full rounded-xl h-12 bg-brand text-brand-foreground hover:bg-brand/90">
              Done
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <ConfirmDeleteDialog
        open={!!deletingBe}
        onOpenChange={(o) => !o && setDeletingBe(null)}
        title="Remove exercise?"
        description={`Remove "${deletingBe?.exercise_title_raw}" from your copy of this workout?`}
        onConfirm={handleDeleteBe}
      />
      <ConfirmDeleteDialog
        open={!!deletingBlock}
        onOpenChange={(o) => !o && setDeletingBlock(null)}
        title="Remove block?"
        description="Remove this block and all its exercises from your copy of this workout?"
        onConfirm={handleDeleteBlock}
      />
      <EditBlockExerciseSheet
        blockExercise={editingBe}
        prescribedSets={editingBe ? setsByBlockExercise[editingBe.block_exercise_id] : []}
        open={!!editingBe}
        onOpenChange={(o) => !o && setEditingBe(null)}
        onSave={onSaveBe}
      />
      <ExercisePickerSheet open={!!pickerBlock} onOpenChange={(o) => !o && setPickerBlock(null)} onPick={handleAddExercise} />
    </>
  );
}
