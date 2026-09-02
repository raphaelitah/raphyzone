import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { createNotification } from '@/lib/notifications';
import { fetchAllTaxonomy } from '@/lib/taxonomy';
import { findDuplicateExercise, UNIQUE_VIOLATION } from '@/lib/duplicates';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const MANDATORY = ['name', 'video_url', 'movement_category', 'body_region', 'movement_pattern', 'modality', 'laterality', 'compound_isolation', 'primary_muscle_group', 'technical_difficulty', 'physical_demand'];

const EMPTY = {
  name: '', video_url: '', equipment: [],
  movement_category: '', body_region: '', movement_pattern: '', modality: '', laterality: '', compound_isolation: '',
  primary_muscle_group: '', secondary_muscle_group: '',
  default_prescription_unit: '', impact_level: '',
  technical_difficulty: null, physical_demand: null,
  notes: '',
};

function Field({ label, required = false, children }) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground">{label}{required && <span className="text-brand"> *</span>}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function FieldSelect({ label, required = false, value, onChange, options, disabled = false }) {
  return (
    <Field label={label} required={required}>
      <Select value={value || ''} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className="rounded-xl h-11"><SelectValue placeholder={disabled ? 'Select primary first…' : 'Select…'} /></SelectTrigger>
        <SelectContent>
          {options.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
        </SelectContent>
      </Select>
    </Field>
  );
}

function RatingButtons({ value, onChange }) {
  return (
    <div className="flex gap-1.5">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={cn('flex-1 h-9 rounded-lg text-sm font-medium border transition-colors',
            value === n ? 'bg-brand text-brand-foreground border-transparent' : 'border-border text-muted-foreground hover:border-foreground/30')}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

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

  const canSubmit = MANDATORY.every(f => form[f]?.toString().trim()) && form.equipment.length > 0;
  const secondaryMuscleOptions = (taxonomy.muscle_group || []).filter(m => m !== form.primary_muscle_group);
  const equipmentOptions = taxonomy.equipment || [];

  const submit = async () => {
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
        requires_load: form.equipment.some(e => e !== 'Bodyweight'),
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
          <div className="space-y-3">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Basics</p>
            <Field label="Exercise name" required>
              <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Barbell Back Squat" className="rounded-xl h-11" />
            </Field>
            <Field label="Video URL" required>
              <Input value={form.video_url} onChange={e => set('video_url', e.target.value)} placeholder="YouTube link" className="rounded-xl h-11" />
            </Field>
            <Field label="Equipment" required>
              <div className="flex flex-wrap gap-1.5">
                {equipmentOptions.length === 0
                  ? <p className="text-xs text-muted-foreground">Loading equipment options…</p>
                  : equipmentOptions.map(opt => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => toggleEquipment(opt)}
                      className={cn('px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                        form.equipment.includes(opt) ? 'bg-brand text-brand-foreground border-transparent' : 'border-border text-muted-foreground')}
                    >
                      {opt}
                    </button>
                  ))
                }
              </div>
            </Field>
          </div>

          <div className="space-y-3">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Classification</p>
            <FieldSelect label="Movement category" required value={form.movement_category} onChange={v => set('movement_category', v)} options={taxonomy.movement_category || []} />
            <FieldSelect label="Body region" required value={form.body_region} onChange={v => set('body_region', v)} options={taxonomy.body_region || []} />
            <FieldSelect label="Movement pattern" required value={form.movement_pattern} onChange={v => set('movement_pattern', v)} options={taxonomy.movement_pattern || []} />
            <FieldSelect label="Modality" required value={form.modality} onChange={v => set('modality', v)} options={taxonomy.modality || []} />
            <FieldSelect label="Laterality" required value={form.laterality} onChange={v => set('laterality', v)} options={taxonomy.laterality || []} />
            <FieldSelect label="Compound / Isolation" required value={form.compound_isolation} onChange={v => set('compound_isolation', v)} options={taxonomy.compound_isolation || []} />
          </div>

          <div className="space-y-3">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Muscles</p>
            <FieldSelect label="Primary muscle group" required value={form.primary_muscle_group} onChange={setPrimaryMuscle} options={taxonomy.muscle_group || []} />
            <FieldSelect label="Secondary muscle group" value={form.secondary_muscle_group} onChange={v => set('secondary_muscle_group', v)} options={secondaryMuscleOptions} disabled={!form.primary_muscle_group} />
          </div>

          <div className="space-y-3">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Details</p>
            <FieldSelect label="Default prescription unit" value={form.default_prescription_unit} onChange={v => set('default_prescription_unit', v)} options={taxonomy.prescription_unit || []} />
            <FieldSelect label="Impact level" value={form.impact_level} onChange={v => set('impact_level', v)} options={taxonomy.impact_level || []} />
            <Field label="Technical difficulty" required>
              <RatingButtons value={form.technical_difficulty} onChange={v => set('technical_difficulty', v)} />
            </Field>
            <Field label="Physical demand" required>
              <RatingButtons value={form.physical_demand} onChange={v => set('physical_demand', v)} />
            </Field>
            <Field label="Notes">
              <Textarea value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Any coaching cues or notes…" className="rounded-xl" rows={3} />
            </Field>
          </div>
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