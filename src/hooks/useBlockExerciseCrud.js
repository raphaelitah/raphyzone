import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

/**
 * Shared block/exercise CRUD used by both WorkoutEditorSheet and Workouts.jsx.
 * Operates on the caller's blockExercisesByBlock / setsByBlockExercise state
 * (both keyed the same way: { [block_id]: [...] } and { [block_exercise_id]: [...] }).
 */
export function useBlockExerciseCrud({
  blockExercisesByBlock,
  setBlockExercisesByBlock,
  setsByBlockExercise,
  setSetsByBlockExercise,
  onChanged,
}) {
  const [editingBe, setEditingBe] = useState(null);
  const [deletingBe, setDeletingBe] = useState(null);

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
    if (onChanged) await onChanged();
    setDeletingBe(null);
  };

  const handleSaveBe = async (formData) => {
    const { data: fresh } = await supabase.from('block_exercises').update({
      prescription_value: formData.prescription_value,
      load_value: formData.load_value,
      notes: formData.notes,
      speed: formData.speed === '' ? null : formData.speed,
      incline: formData.incline === '' ? null : formData.incline,
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

  return { editingBe, setEditingBe, deletingBe, setDeletingBe, handleDeleteBe, handleSaveBe, handleDragEnd };
}

/** Swap a block with its up/down neighbor and return the relabeled array, or null if there's no neighbor to swap with. */
export function reorderBlocks(blocks, blockId, direction) {
  const sorted = [...blocks].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
  const currentIndex = sorted.findIndex((b) => b.id === blockId);
  const swapIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
  if (currentIndex < 0 || swapIndex < 0 || swapIndex >= sorted.length) return null;
  const newBlocks = [...sorted];
  [newBlocks[currentIndex], newBlocks[swapIndex]] = [newBlocks[swapIndex], newBlocks[currentIndex]];
  return newBlocks.map((b, i) => ({ ...b, block_label: String.fromCharCode(65 + i), order_index: i }));
}

/** Persist relabeled block order/labels to Supabase. */
export async function persistBlockOrder(relabeledBlocks) {
  await Promise.all(
    relabeledBlocks.map((b) => supabase.from('workout_blocks').update({ block_label: b.block_label, order_index: b.order_index }).eq('id', b.id))
  );
}
