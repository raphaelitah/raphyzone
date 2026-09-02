import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import ConfirmDeleteDialog from '@/components/ConfirmDeleteDialog';
import { Plus, Loader2, ChevronDown } from 'lucide-react';
import { DragDropContext } from '@hello-pangea/dnd';
import { cn } from '@/lib/utils';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { WORKOUT_DIFFICULTY_META, WORKOUT_CATEGORIES } from '@/lib/fitness';
import { recomputeAndSaveFormatLabel } from '@/lib/formatLabel';
import BlockEditor from '@/components/BlockEditor';
import ExercisePickerSheet from '@/components/ExercisePickerSheet';
import EditBlockExerciseSheet from '@/components/EditBlockExerciseSheet';
import { useBlockExerciseCrud, reorderBlocks, persistBlockOrder } from '@/hooks/useBlockExerciseCrud';

export default function WorkoutEditorSheet({ workout, open, onOpenChange, onChanged }) {
  const [blocks, setBlocks] = useState([]);
  const [blockExercisesByBlock, setBlockExercisesByBlock] = useState({});
  const [setsByBlockExercise, setSetsByBlockExercise] = useState({});
  const [loading, setLoading] = useState(false);

  const [wForm, setWForm] = useState({ name: '', difficulty: '', workout_category: '', est_duration_min: '', description: '', notes: '' });
  const [showWorkoutEdit, setShowWorkoutEdit] = useState(false);
  const [savingWorkout, setSavingWorkout] = useState(false);

  const [deletingBlock, setDeletingBlock] = useState(null);
  const [pickerBlock, setPickerBlock] = useState(null);

  const {
    editingBe, setEditingBe, deletingBe, setDeletingBe,
    handleDeleteBe, handleSaveBe, handleDragEnd,
  } = useBlockExerciseCrud({
    blockExercisesByBlock,
    setBlockExercisesByBlock,
    setsByBlockExercise,
    setSetsByBlockExercise,
    onChanged: () => recomputeAndSaveFormatLabel(workout),
  });

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
    const relabeled = reorderBlocks(blocks, block.id, direction);
    if (!relabeled) return;
    setBlocks(relabeled);
    await persistBlockOrder(relabeled);
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

  return (
    <>
      <Sheet open={open} onOpenChange={(o) => { if (!o) { onChanged(); onOpenChange(false); } }}>
        <SheetContent side="bottom" className="rounded-t-3xl max-h-[90dvh] overflow-y-auto">
          {workout && (
            <>
              <SheetHeader className="px-5 pt-5">
                <SheetTitle className="text-xl text-left">Edit workout</SheetTitle>
                <SheetDescription className="text-left">{workout.name}</SheetDescription>
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

      <ConfirmDeleteDialog
        open={!!deletingBe}
        onOpenChange={(o) => !o && setDeletingBe(null)}
        title="Delete exercise?"
        description={`Remove "${deletingBe?.exercise_title_raw}" from this block? This cannot be undone.`}
        onConfirm={handleDeleteBe}
      />

      <ConfirmDeleteDialog
        open={!!deletingBlock}
        onOpenChange={(o) => !o && setDeletingBlock(null)}
        title="Delete block?"
        description="Delete this block and all its exercises? This cannot be undone."
        onConfirm={handleDeleteBlock}
      />
    </>
  );
}