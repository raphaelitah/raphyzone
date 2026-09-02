import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Plus, Loader2, ChevronDown } from 'lucide-react';
import { DragDropContext } from '@hello-pangea/dnd';
import { cn } from '@/lib/utils';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { WORKOUT_DIFFICULTY_META, WORKOUT_CATEGORIES } from '@/lib/fitness';
import { recomputeAndSaveFormatLabel } from '@/lib/formatLabel';
import BlockEditor from '@/components/BlockEditor';
import ExercisePickerSheet from '@/components/ExercisePickerSheet';
import EditBlockExerciseSheet from '@/components/EditBlockExerciseSheet';

export default function WorkoutEditorSheet({ workout, open, onOpenChange, onChanged }) {
  const [blocks, setBlocks] = useState([]);
  const [blockExercisesByBlock, setBlockExercisesByBlock] = useState({});
  const [setsByBlockExercise, setSetsByBlockExercise] = useState({});
  const [loading, setLoading] = useState(false);

  const [wForm, setWForm] = useState({ name: '', difficulty: '', workout_category: '', est_duration_min: '', description: '', notes: '' });
  const [showWorkoutEdit, setShowWorkoutEdit] = useState(false);
  const [savingWorkout, setSavingWorkout] = useState(false);

  const [editingBe, setEditingBe] = useState(null);
  const [deletingBe, setDeletingBe] = useState(null);
  const [deletingBlock, setDeletingBlock] = useState(null);
  const [pickerBlock, setPickerBlock] = useState(null);

  const loadData = async () => {
    if (!workout) return;
    setLoading(true);
    try {
      const [{ data: blksData }, { data: allBlockExsData }, { data: allSetsData }] = await Promise.all([
        supabase.from('workout_blocks').select('*').eq('workout_id', workout.workout_id),
        supabase.from('block_exercises').select('*').order('created_date', { ascending: false }).limit(700),
        supabase.from('prescribed_sets').select('*').order('created_date', { ascending: false }).limit(500),
      ]);
      const blks = blksData || [];
      const allBlockExs = allBlockExsData || [];
      const allSets = allSetsData || [];
      blks.sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
      setBlocks(blks);
      const blockIds = new Set(blks.map((b) => b.block_id));
      const beMap = {};
      allBlockExs.filter((be) => blockIds.has(be.block_id)).forEach((be) => {
        if (!beMap[be.block_id]) beMap[be.block_id] = [];
        beMap[be.block_id].push(be);
      });
      Object.values(beMap).forEach((arr) => arr.sort((a, b) => (a.order_in_block || 0) - (b.order_in_block || 0)));
      setBlockExercisesByBlock(beMap);
      const beIds = new Set(Object.values(beMap).flat().map((be) => be.block_exercise_id));
      const setMap = {};
      allSets.filter((s) => beIds.has(s.block_exercise_id)).forEach((ps) => {
        if (!setMap[ps.block_exercise_id]) setMap[ps.block_exercise_id] = [];
        setMap[ps.block_exercise_id].push(ps);
      });
      Object.values(setMap).forEach((arr) => arr.sort((a, b) => (a.set_number || 0) - (b.set_number || 0)));
      setSetsByBlockExercise(setMap);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && workout) {
      setWForm({
        name: workout.name || '',
        difficulty: workout.difficulty || '',
        workout_category: workout.workout_category || '',
        est_duration_min: workout.est_duration_min?.toString() || '',
        description: workout.description || '',
        notes: workout.notes || '',
      });
      loadData();
    }
  }, [open, workout?.id]);

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

  const handleSaveWorkout = async () => {
    setSavingWorkout(true);
    try {
      await supabase.from('workouts').update({
        name: wForm.name,
        difficulty: wForm.difficulty || null,
        workout_category: wForm.workout_category || null,
        est_duration_min: wForm.est_duration_min ? parseInt(wForm.est_duration_min, 10) : null,
        description: wForm.description || null,
        notes: wForm.notes || null,
      }).eq('id', workout.id);
      setShowWorkoutEdit(false);
    } finally {
      setSavingWorkout(false);
    }
  };

  const handleUpdateBlock = async (blockId, data) => {
    await supabase.from('workout_blocks').update(data).eq('id', blockId);
    setBlocks((prev) => prev.map((b) => (b.id === blockId ? { ...b, ...data } : b)));
  };

  const handleAddBlock = async () => {
    const orderIndex = blocks.length;
    const { data: newBlock } = await supabase.from('workout_blocks').insert({
      workout_id: workout.workout_id,
      block_id: `BLK-${Date.now()}`,
      order_index: orderIndex,
      block_label: 'ZZ',
      block_type: 'main',
      rounds: 1,
    }).select().single();
    const relabeled = await relabelBlocks([...blocks, newBlock]);
    setBlocks(relabeled);
    setBlockExercisesByBlock((prev) => ({ ...prev, [newBlock.block_id]: [] }));
  };

  const handleMoveBlock = async (block, direction) => {
    const sorted = [...blocks].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
    const currentIndex = sorted.findIndex((b) => b.id === block.id);
    const swapIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (swapIndex < 0 || swapIndex >= sorted.length) return;
    const newBlocks = [...sorted];
    [newBlocks[currentIndex], newBlocks[swapIndex]] = [newBlocks[swapIndex], newBlocks[currentIndex]];
    const relabeled = newBlocks.map((b, i) => ({ ...b, block_label: String.fromCharCode(65 + i), order_index: i }));
    setBlocks(relabeled);
    await Promise.all(
      relabeled.map((b) => supabase.from('workout_blocks').update({ block_label: b.block_label, order_index: b.order_index }).eq('id', b.id))
    );
  };

  const handleDeleteBlock = async () => {
    if (!deletingBlock) return;
    const blockExs = blockExercisesByBlock[deletingBlock.block_id] || [];
    for (const be of blockExs) {
      const sets = setsByBlockExercise[be.block_exercise_id] || [];
      if (sets.length) {
        await supabase.from('prescribed_sets').delete().in('id', sets.map((s) => s.id));
      }
      await supabase.from('block_exercises').delete().eq('id', be.id);
    }
    await supabase.from('workout_blocks').delete().eq('id', deletingBlock.id);
    const remaining = blocks.filter((b) => b.id !== deletingBlock.id);
    const relabeled = await relabelBlocks(remaining);
    setBlocks(relabeled);
    setBlockExercisesByBlock((prev) => {
      const next = { ...prev };
      delete next[deletingBlock.block_id];
      return next;
    });
    await recomputeAndSaveFormatLabel(workout);
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
    await recomputeAndSaveFormatLabel(workout);
    setPickerBlock(null);
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
    await recomputeAndSaveFormatLabel(workout);
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

    if (sets.length && !isNaN(targetReps)) {
      await Promise.all(sets.map((s) => supabase.from('prescribed_sets').update({ target_reps: targetReps }).eq('id', s.id)));
      sets = sets.map((s) => ({ ...s, target_reps: targetReps }));
    }

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

    const sourceExs = [...(blockExercisesByBlock[sourceBlockId] || [])];
    const [moved] = sourceExs.splice(source.index, 1);

    let destExs;
    if (sourceBlockId === destBlockId) {
      destExs = sourceExs;
    } else {
      destExs = [...(blockExercisesByBlock[destBlockId] || [])];
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
    <>
      <Sheet open={open} onOpenChange={(o) => { if (!o) { onChanged(); onOpenChange(false); } }}>
        <SheetContent side="bottom" className="rounded-t-3xl max-h-[92vh] overflow-y-auto">
          {workout && (
            <>
              <SheetHeader className="px-5 pt-5">
                <SheetTitle className="text-xl text-left">Edit workout</SheetTitle>
                <p className="text-sm text-muted-foreground text-left">{workout.name}</p>
              </SheetHeader>
              <div className="px-5 pb-8 space-y-4">
                {loading ? (
                  <div className="flex justify-center py-10">
                    <Loader2 className="h-6 w-6 text-brand animate-spin" />
                  </div>
                ) : (
                  <>
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

                    <DragDropContext onDragEnd={handleDragEnd}>
                    {blocks.map((block, index) => (
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

                    <button onClick={handleAddBlock} className="w-full rounded-2xl border border-dashed border-border py-3 text-sm text-muted-foreground hover:border-foreground/20 flex items-center justify-center gap-1.5">
                      <Plus className="h-4 w-4" /> Add block
                    </button>
                    </DragDropContext>
                  </>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <ExercisePickerSheet open={!!pickerBlock} onOpenChange={(o) => !o && setPickerBlock(null)} onPick={handleAddExercise} />

      <EditBlockExerciseSheet
        blockExercise={editingBe}
        prescribedSets={editingBe ? setsByBlockExercise[editingBe.block_exercise_id] : []}
        open={!!editingBe}
        onOpenChange={(o) => !o && setEditingBe(null)}
        onSave={handleSaveBe}
      />

      <AlertDialog open={!!deletingBe} onOpenChange={(o) => !o && setDeletingBe(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete exercise?</AlertDialogTitle>
            <AlertDialogDescription>
              Remove "{deletingBe?.exercise_title_raw}" from this block? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteBe} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deletingBlock} onOpenChange={(o) => !o && setDeletingBlock(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete block?</AlertDialogTitle>
            <AlertDialogDescription>
              Delete this block and all its exercises? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteBlock} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}