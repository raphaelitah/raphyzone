import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { createNotification } from '@/lib/notifications';
import { fetchAllTaxonomy } from '@/lib/taxonomy';
import { findDuplicateExercise, UNIQUE_VIOLATION } from '@/lib/duplicates';
import ExerciseFormFields, { isExerciseFormComplete } from '@/components/ExerciseFormFields';
import { Loader2 } from 'lucide-react';

const EMPTY = {
  name: '', video_url: '', equipment: [],
  movement_category: '', body_region: '', movement_pattern: '', modality: '', laterality: '', compound_isolation: '',
  primary_muscle_group: '', secondary_muscle_group: '',
  default_prescription_unit: '', impact_level: '',
  technical_difficulty: null, physical_demand: null,
  notes: '',
};

export default function AddExerciseSheet({ open, onOpenChange, onSubmitted = undefined }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [form, setForm] = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [taxonomy, setTaxonomy] = useState(/** @type {Record<string, string[]>} */ ({}));

  useEffect(() => {
    if (!open) return;
    (async () => {
      setTaxonomy(await fetchAllTaxonomy());
    })();
  }, [open]);

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const setPrimaryMuscle = (v) => {
    setForm(f => ({
      ...f,
      primary_muscle_group: v,
      secondary_muscle_group: f.secondary_muscle_group === v ? '' : f.secondary_muscle_group,
    }));
  };

  const toggleEquipment = (opt) => {
    setForm(f => ({
      ...f,
      equipment: f.equipment.includes(opt) ? f.equipment.filter(e => e !== opt) : [...f.equipment, opt],
    }));
  };

  const canSubmit = isExerciseFormComplete(form);

  const submit = async () => {
    if (!user) return;
    setSubmitting(true);
    try {
      const duplicate = await findDuplicateExercise(form.name);
      if (duplicate) {
        toast({ title: 'Exercise already exists', description: `"${duplicate.name}" is already in the library.`, variant: 'destructive' });
        return;
      }
      const { data: exercise, error } = await supabase.from('exercises').insert({
        ...form,
        equipment: form.equipment.join(', '),
        requires_load: form.equipment.some(e => e !== 'Bodyweight' && e !== 'Resistance Bands'),
        author_id: user.id,
        author_name: user.full_name || user.email,
        submission_status: 'pending',
      }).select().single();
      if (error) {
        if (error.code === UNIQUE_VIOLATION) {
          toast({ title: 'Exercise already exists', description: `An exercise named "${form.name}" is already in the library.`, variant: 'destructive' });
          return;
        }
        throw error;
      }
      await createNotification({
        userId: user.id,
        type: 'exercise_submitted',
        title: 'Exercise submitted for review',
        body: `Your exercise "${form.name}" has been submitted and is awaiting admin review.`,
        relatedId: exercise.id,
      });
      toast({ title: 'Exercise submitted', description: 'It will appear in the library once approved.' });
      onOpenChange(false);
      onSubmitted?.();
      setForm(EMPTY);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl h-[90dvh] flex flex-col p-0">
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border">
          <SheetTitle className="text-left">Add new exercise</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          <ExerciseFormFields form={form} set={set} setPrimaryMuscle={setPrimaryMuscle} toggleEquipment={toggleEquipment} taxonomy={taxonomy} />
        </div>

        <div className="sticky bottom-0 px-5 py-3 border-t border-border bg-background">
          <Button onClick={submit} disabled={!canSubmit || submitting} className="w-full rounded-xl h-12">
            {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Submitting…</> : 'Submit for review'}
          </Button>
          {!canSubmit && <p className="text-[11px] text-muted-foreground/70 text-center mt-1.5">Fill all required fields (*) to submit.</p>}
        </div>
      </SheetContent>
    </Sheet>
  );
}
