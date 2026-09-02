import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
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
import { Plus, Trash2, Loader2, GripVertical } from 'lucide-react';
import { WORKOUT_DIFFICULTY_META, WORKOUT_CATEGORIES } from '@/lib/fitness';
import { findSimilarWorkouts, describeSimilarity, WORKOUT_SIMILARITY_THRESHOLD } from '@/lib/duplicates';
import { createNotification } from '@/lib/notifications';
import ExercisePickerSheet from '@/components/ExercisePickerSheet';

const EMPTY = { name: '', workout_category: '', difficulty: '', est_duration_min: '', notes: '' };

export default function CreateWorkoutSheet({ open, onOpenChange, onSubmitted }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [form, setForm] = useState(EMPTY);
  const [items, setItems] = useState([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [similarMatch, setSimilarMatch] = useState(null);

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const reset = () => {
    setForm(EMPTY);
    setItems([]);
    setSimilarMatch(null);
  };

  const handlePick = async (data) => {
    if (data.rest) {
      setItems(prev => [...prev, { tempId: `t${Date.now()}`, step_type: 'rest', label: 'Rest', prescription_value: `${data.duration_seconds}s` }]);
    } else {
      setItems(prev => [...prev, {
        tempId: `t${Date.now()}`,
        step_type: 'exercise',
        exercise_id: data.exercise.exercise_code,
        label: data.exercise.name,
        prescription_value: data.prescription_value,
        sets: data.sets,
      }]);
    }
    setPickerOpen(false);
  };

  const removeItem = (tempId) => setItems(prev => prev.filter(i => i.tempId !== tempId));

  const exerciseCount = items.filter(i => i.step_type === 'exercise').length;
  const canSubmit = form.name.trim().length > 0 && exerciseCount >= 1;

  const insertWorkout = async (similarity) => {
    const workoutId = `WK-${Date.now()}`;
    const { data: workout, error } = await supabase.from('workouts').insert({
      workout_id: workoutId,
      name: form.name.trim(),
      workout_category: form.workout_category || null,
      difficulty: form.difficulty || null,
      est_duration_min: form.est_duration_min ? parseInt(form.est_duration_min, 10) : null,
      notes: form.notes || null,
      ownership_type: 'personal',
      status: 'pending',
      owner_id: user.id,
      author_id: user.id,
      author_name: user.full_name || user.email,
      similarity_score: similarity ? similarity.score : null,
      similarity_note: similarity ? describeSimilarity(similarity) : null,
    }).select().single();
    if (error) throw error;

    const blockId = `BLK-${Date.now()}`;
    await supabase.from('workout_blocks').insert({
      workout_id: workoutId,
      block_id: blockId,
      order_index: 0,
      block_label: 'A',
      block_type: 'main',
      rounds: 1,
    });

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const beId = `BE-${Date.now()}-${i}`;
      await supabase.from('block_exercises').insert({
        block_exercise_id: beId,
        block_id: blockId,
        step_type: item.step_type,
        exercise_id: item.step_type === 'exercise' ? item.exercise_id : null,
        exercise_title_raw: item.label,
        order_in_block: i,
        prescription_value: item.prescription_value || null,
      });
      const targetReps = parseInt(item.prescription_value, 10);
      if (item.step_type === 'exercise' && item.sets > 0 && !isNaN(targetReps)) {
        await supabase.from('prescribed_sets').insert(
          Array.from({ length: item.sets }, (_, s) => ({
            set_id: `${beId}-S${s + 1}`,
            block_exercise_id: beId,
            set_number: s + 1,
            target_reps: targetReps,
          }))
        );
      }
    }

    await createNotification({
      userId: user.id,
      type: 'workout_submitted',
      title: 'Workout submitted for review',
      body: `Your workout "${form.name.trim()}" has been submitted and is awaiting admin review.`,
      relatedId: workout.id,
    });

    toast({ title: 'Workout submitted', description: 'It will appear in the library once approved.' });
    reset();
    onOpenChange(false);
    onSubmitted?.();
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      const matches = await findSimilarWorkouts(items);
      const top = matches[0];
      if (top && top.score >= WORKOUT_SIMILARITY_THRESHOLD) {
        setSimilarMatch(top);
        return;
      }
      await insertWorkout(null);
    } finally {
      setSubmitting(false);
    }
  };

  const confirmSubmitAnyway = async () => {
    const match = similarMatch;
    setSimilarMatch(null);
    setSubmitting(true);
    try {
      await insertWorkout(match);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
        <SheetContent side="bottom" className="rounded-t-3xl h-[90dvh] flex flex-col p-0">
          <SheetHeader className="px-5 pt-5 pb-3 border-b border-border">
            <SheetTitle className="text-left">New workout</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
            <div className="space-y-3">
              <div>
                <Label>Name *</Label>
                <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Push Day Blast" className="mt-1" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Category</Label>
                  <Select value={form.workout_category || undefined} onValueChange={v => set('workout_category', v)}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Select…" /></SelectTrigger>
                    <SelectContent>
                      {WORKOUT_CATEGORIES.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Difficulty</Label>
                  <Select value={form.difficulty || undefined} onValueChange={v => set('difficulty', v)}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Select…" /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(WORKOUT_DIFFICULTY_META).map(([value, meta]) => (
                        <SelectItem key={value} value={value}>{meta.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Duration (min)</Label>
                <Input type="number" value={form.est_duration_min} onChange={e => set('est_duration_min', e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Coaching cues or reminders…" className="mt-1" rows={2} />
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Exercises</p>
              {items.map((item) => (
                <div key={item.tempId} className="flex items-center gap-2 rounded-xl border border-border p-3">
                  <GripVertical className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.label}</p>
                    {item.step_type === 'exercise' && (
                      <p className="text-xs text-muted-foreground">{item.sets} × {item.prescription_value || '—'}</p>
                    )}
                  </div>
                  <button onClick={() => removeItem(item.tempId)} className="text-muted-foreground hover:text-destructive shrink-0">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <button onClick={() => setPickerOpen(true)} className="w-full rounded-2xl border border-dashed border-border py-3 text-sm text-muted-foreground hover:border-foreground/20 flex items-center justify-center gap-1.5">
                <Plus className="h-4 w-4" /> Add exercise
              </button>
            </div>
          </div>

          <div className="sticky bottom-0 px-5 py-3 border-t border-border bg-background">
            <Button onClick={submit} disabled={!canSubmit || submitting} className="w-full rounded-xl h-12">
              {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Submitting…</> : 'Submit for review'}
            </Button>
            {!canSubmit && <p className="text-[11px] text-muted-foreground/70 text-center mt-1.5">Add a name and at least one exercise to submit.</p>}
          </div>
        </SheetContent>
      </Sheet>

      <ExercisePickerSheet open={pickerOpen} onOpenChange={setPickerOpen} onPick={handlePick} />

      <AlertDialog open={!!similarMatch} onOpenChange={(o) => !o && setSimilarMatch(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Similar workout found</AlertDialogTitle>
            <AlertDialogDescription>
              {similarMatch && describeSimilarity(similarMatch)} You can still submit it — an admin will take a closer look during review.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSubmitAnyway}>Submit anyway</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
