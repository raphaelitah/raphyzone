import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Gauge, ChevronRight, Pencil, Check } from 'lucide-react';
import { CALIBRATION_PATTERNS } from '@/lib/fitness';
import { formatWeight, inputToKg, kgToInput } from '@/lib/units';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { useAthleteProfile } from '@/hooks/useAthleteProfile';
import { supabase } from '@/lib/supabaseClient';
import { recalcPlanWeights } from '@/lib/weightRecalc';
import { cn } from '@/lib/utils';

function EditCalibrationSheet({ entry, meta, unit, open, onOpenChange, onSaved }) {
  const { user } = useAuth();
  const [exercise, setExercise] = useState(entry?.exercise || '');
  const [customExercise, setCustomExercise] = useState('');
  const [weight, setWeight] = useState(kgToInput(entry?.weight_kg, unit));
  const [saving, setSaving] = useState(false);

  const options = meta?.options?.filter((o) => o !== "I don't perform this movement") || [];
  const isOther = exercise === 'Other' || (exercise && !options.includes(exercise));
  const finalExercise = exercise === 'Other' ? customExercise : exercise;
  const canSave = !!finalExercise && !!weight;

  const save = async () => {
    if (!canSave || !entry) return;
    setSaving(true);
    try {
      const weightKg = inputToKg(weight, unit);
      const { data: existing } = await supabase.from('athlete_profiles').select('id, strength_calibration').eq('user_id', user.id);
      const row = existing?.[0];
      if (row) {
        const updated = (row.strength_calibration || []).map((c) =>
          c.pattern === entry.pattern ? { ...c, exercise: finalExercise, weight_kg: weightKg } : c
        );
        await supabase.from('athlete_profiles').update({ strength_calibration: updated }).eq('id', row.id);
        recalcPlanWeights(user.id); // background: recalculate plan weights with new calibration
      }
      await onSaved();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl p-0">
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border">
          <SheetTitle className="text-left">{meta?.title || entry?.pattern}</SheetTitle>
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
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default function ProfileCalibrationCard({ profile }) {
  const navigate = useNavigate();
  const { reload } = useAthleteProfile();
  const unit = profile?.weight_unit || 'kg';
  const calibration = profile?.strength_calibration || [];
  const calibratedDate = profile?.calibrated_date;
  const [editingPattern, setEditingPattern] = useState(null);

  if (!calibration.length) {
    return (
      <Card className="rounded-2xl border-border p-4 mb-5">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center">
            <Gauge className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">Strength calibration</p>
            <p className="text-xs text-muted-foreground mt-0.5">No lifts recorded yet. Calibrate to personalize your plans.</p>
          </div>
        </div>
        <Button onClick={() => navigate('/calibration')} className="w-full rounded-xl h-11 mt-3 bg-brand text-brand-foreground hover:bg-brand/90">
          Calibrate strength
        </Button>
      </Card>
    );
  }

  const patternMeta = (key) => CALIBRATION_PATTERNS.find((p) => p.key === key);
  const editingEntry = editingPattern ? calibration.find((c) => c.pattern === editingPattern) : null;

  return (
    <Card className="rounded-2xl border-border p-4 mb-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Gauge className="h-4 w-4 text-brand" />
          <p className="text-sm font-medium">Strength calibration</p>
        </div>
        <button onClick={() => navigate('/calibration')} className="flex items-center gap-1 text-xs font-medium text-brand">
          Recalibrate <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
      {calibratedDate && (
        <p className="text-[11px] text-muted-foreground mb-3">Last calibrated {new Date(calibratedDate).toLocaleDateString('en-GB')}</p>
      )}
      <div className="space-y-2">
        {calibration.map((c, i) => {
          const meta = patternMeta(c.pattern);
          return (
            <button
              key={i}
              onClick={() => setEditingPattern(c.pattern)}
              className="w-full flex items-center justify-between py-1.5 border-b border-border last:border-0 text-left group"
            >
              <div className="min-w-0 pr-2">
                <p className="text-xs text-muted-foreground">{meta?.title || c.pattern}</p>
                <p className="text-sm font-medium truncate">{c.exercise}</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-right">
                  <p className="text-sm font-semibold">{formatWeight(c.weight_kg, unit)}</p>
                  <p className="text-[11px] text-muted-foreground">×{c.reps} reps</p>
                </div>
                <Pencil className="h-3.5 w-3.5 text-muted-foreground/50 group-hover:text-muted-foreground" />
              </div>
            </button>
          );
        })}
      </div>

      <EditCalibrationSheet
        key={editingPattern}
        entry={editingEntry}
        meta={editingEntry ? patternMeta(editingEntry.pattern) : null}
        unit={unit}
        open={!!editingPattern}
        onOpenChange={(v) => !v && setEditingPattern(null)}
        onSaved={reload}
      />
    </Card>
  );
}
