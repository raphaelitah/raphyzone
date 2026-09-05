import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Check } from 'lucide-react';
import { CALIBRATION_PATTERNS } from '@/lib/fitness';
import { inputToKg } from '@/lib/units';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import { recalcPlanWeights } from '@/lib/weightRecalc';
import { cn } from '@/lib/utils';

// One-question calibration prompt shown mid-workout when a suggested weight is
// missing because the athlete has never calibrated this movement pattern.
// Appends a new entry to strength_calibration rather than editing an existing one.
export default function QuickCalibrationSheet({ patternKey, unit = 'kg', open, onOpenChange, onSaved }) {
  const { user } = useAuth();
  const [exercise, setExercise] = useState('');
  const [customExercise, setCustomExercise] = useState('');
  const [weight, setWeight] = useState('');
  const [saving, setSaving] = useState(false);

  const meta = CALIBRATION_PATTERNS.find((p) => p.key === patternKey);
  const options = meta?.options?.filter((o) => o !== "I don't perform this movement") || [];
  const finalExercise = exercise === 'Other' ? customExercise : exercise;
  const canSave = !!finalExercise && !!weight;

  const reset = () => { setExercise(''); setCustomExercise(''); setWeight(''); };

  const save = async () => {
    if (!canSave || !meta) return;
    setSaving(true);
    try {
      const weightKg = inputToKg(weight, unit);
      const { data: existing } = await supabase.from('athlete_profiles').select('id, strength_calibration').eq('user_id', user.id);
      const row = existing?.[0];
      if (row) {
        const current = row.strength_calibration || [];
        const updated = [
          ...current.filter((c) => c.pattern !== meta.key),
          { pattern: meta.key, exercise: finalExercise, weight_kg: weightKg, reps: 8 },
        ];
        await supabase.from('athlete_profiles').update({ strength_calibration: updated }).eq('id', row.id);
        recalcPlanWeights(user.id); // background: recalculate plan weights with new calibration
      }
      reset();
      await onSaved();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  if (!meta) return null;

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <SheetContent side="bottom" className="rounded-t-3xl p-0">
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border">
          <SheetTitle className="text-left">{meta.title}</SheetTitle>
          <SheetDescription className="text-left">{meta.question}</SheetDescription>
        </SheetHeader>
        <div className="px-5 py-4 space-y-4">
          <div className="space-y-2">
            {options.map((o) => {
              const selected = exercise === o;
              return (
                <button
                  key={o}
                  onClick={() => setExercise(o)}
                  className={cn('w-full rounded-xl border px-4 py-3 text-left transition-all flex items-center justify-between', selected ? 'border-brand bg-brand/5' : 'border-border')}
                >
                  <span className="font-medium text-sm">{o}</span>
                  {selected && <Check className="h-4 w-4 text-brand" />}
                </button>
              );
            })}
          </div>
          {exercise === 'Other' && (
            <input
              type="text"
              value={customExercise}
              onChange={(e) => setCustomExercise(e.target.value)}
              placeholder="Exercise name"
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
          )}
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Total Weight ({unit})</p>
            <input
              type="number"
              inputMode="decimal"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder="e.g. 60"
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          <Button onClick={save} disabled={saving || !canSave} className="w-full rounded-xl h-11 bg-brand text-brand-foreground hover:bg-brand/90">
            {saving ? 'Saving…' : 'Save & get suggested weight'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
