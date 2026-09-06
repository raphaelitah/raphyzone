import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { cn } from '@/lib/utils';

export const EXERCISE_MANDATORY_FIELDS = ['name', 'video_url', 'movement_category', 'body_region', 'movement_pattern', 'modality', 'laterality', 'compound_isolation', 'primary_muscle_group', 'technical_difficulty', 'physical_demand'];

export function isExerciseFormComplete(form) {
  return EXERCISE_MANDATORY_FIELDS.every(f => form[f]?.toString().trim()) && form.equipment.length > 0;
}

export function Field({ label, required = false, children }) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground">{label}{required && <span className="text-brand"> *</span>}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

export function FieldSelect({ label, required = false, value, onChange, options, disabled = false }) {
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

export function RatingButtons({ value, onChange }) {
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

export default function ExerciseFormFields({ form, set, setPrimaryMuscle, toggleEquipment, taxonomy }) {
  const secondaryMuscleOptions = (taxonomy.muscle_group || []).filter(m => m !== form.primary_muscle_group);
  const equipmentOptions = taxonomy.equipment || [];

  return (
    <>
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
    </>
  );
}
