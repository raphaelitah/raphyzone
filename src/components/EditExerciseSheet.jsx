import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { fetchAllTaxonomy } from '@/lib/taxonomy';
import ExerciseFormFields, { isExerciseFormComplete } from '@/components/ExerciseFormFields';
import { Loader2 } from 'lucide-react';

export default function EditExerciseSheet({ exercise, open, onOpenChange, onSaved }) {
  const { toast } = useToast();
  const [form, setForm] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [taxonomy, setTaxonomy] = useState(/** @type {Record<string, string[]>} */ ({}));

  useEffect(() => {
    if (!open || !exercise) return;
    (async () => {
      setTaxonomy(await fetchAllTaxonomy());
    })();
    const equipStr = exercise.equipment || '';
    setForm({
      name: exercise.name || '',
      video_url: exercise.video_url || '',
      equipment: equipStr ? equipStr.split(', ').map(s => s.trim()).filter(Boolean) : [],
      movement_category: exercise.movement_category || '',
      body_region: exercise.body_region || '',
      movement_pattern: exercise.movement_pattern || '',
      modality: exercise.modality || '',
      laterality: exercise.laterality || '',
      compound_isolation: exercise.compound_isolation || '',
      primary_muscle_group: exercise.primary_muscle_group || '',
      secondary_muscle_group: exercise.secondary_muscle_group || '',
      default_prescription_unit: exercise.default_prescription_unit || '',
      impact_level: exercise.impact_level || '',
      technical_difficulty: exercise.technical_difficulty ?? null,
      physical_demand: exercise.physical_demand ?? null,
      requires_load: exercise.requires_load ?? false,
      notes: exercise.notes || '',
    });
  }, [open, exercise]);

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

  const canSubmit = form && isExerciseFormComplete(form);

  const submit = async () => {
    setSubmitting(true);
    try {
      const { error } = await supabase.from('exercises').update({
        ...form,
        equipment: form.equipment.join(', '),
        requires_load: form.equipment.some(e => e !== 'Bodyweight' && e !== 'Resistance Bands'),
      }).eq('id', exercise.id);
      if (error) throw error;
      toast({ title: 'Exercise updated' });
      onOpenChange(false);
      onSaved?.();
    } finally {
      setSubmitting(false);
    }
  };

  if (!form) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl h-[90dvh] flex flex-col p-0">
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border">
          <SheetTitle className="text-left">Edit exercise</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          <ExerciseFormFields form={form} set={set} setPrimaryMuscle={setPrimaryMuscle} toggleEquipment={toggleEquipment} taxonomy={taxonomy} />
        </div>

        <div className="sticky bottom-0 px-5 py-3 border-t border-border bg-background">
          <Button onClick={submit} disabled={!canSubmit || submitting} className="w-full rounded-xl h-12">
            {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : 'Save changes'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
