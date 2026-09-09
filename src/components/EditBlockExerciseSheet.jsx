import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function EditBlockExerciseSheet({ blockExercise, prescribedSets, open, onOpenChange, onSave }) {
  const [form, setForm] = useState({
    set_count: 1,
    prescription_value: '',
    load_value: '',
    notes: '',
    speed: '',
    incline: '',
    is_ladder: false,
    ladder_start_reps: '',
    ladder_end_reps: '',
    ladder_step: '1',
  });
  const [saving, setSaving] = useState(false);
  const [exerciseEquipment, setExerciseEquipment] = useState(null);
  const isTreadmill = exerciseEquipment === 'Treadmill';

  useEffect(() => {
    if (blockExercise) {
      const currentReps = prescribedSets?.[0]?.target_reps?.toString() || blockExercise.prescription_value || '';
      setForm({
        set_count: prescribedSets?.length || 1,
        prescription_value: currentReps,
        load_value: blockExercise.load_value || '',
        notes: blockExercise.notes || '',
        speed: blockExercise.speed?.toString() || '',
        incline: blockExercise.incline?.toString() || '',
        is_ladder: blockExercise.ladder_start_reps != null && blockExercise.ladder_end_reps != null,
        ladder_start_reps: blockExercise.ladder_start_reps?.toString() || '',
        ladder_end_reps: blockExercise.ladder_end_reps?.toString() || '',
        ladder_step: blockExercise.ladder_step?.toString() || '1',
      });
    }
  }, [blockExercise, prescribedSets]);

  useEffect(() => {
    let cancelled = false;
    setExerciseEquipment(null);
    if (blockExercise?.exercise_id) {
      supabase.from('exercises').select('equipment').eq('exercise_code', blockExercise.exercise_id).single()
        .then(({ data }) => {
          if (!cancelled) setExerciseEquipment(data?.equipment || null);
        });
    }
    return () => { cancelled = true; };
  }, [blockExercise]);

  const handleSubmit = async () => {
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[85dvh] overflow-y-auto">
        {blockExercise && (
          <>
            <SheetHeader className="px-5 pt-5">
              <SheetTitle className="text-left">Edit exercise</SheetTitle>
              <p className="text-sm text-muted-foreground text-left">{blockExercise.exercise_title_raw}</p>
            </SheetHeader>
            <div className="px-5 pb-8 space-y-4">
              <div className="flex items-center justify-between rounded-lg border border-input px-3 py-2.5">
                <div>
                  <Label className="cursor-pointer" onClick={() => setForm({ ...form, is_ladder: !form.is_ladder })}>Ladder</Label>
                  <p className="text-xs text-muted-foreground">Reps change every round, e.g. 10-9-8...-1</p>
                </div>
                <input
                  type="checkbox"
                  checked={form.is_ladder}
                  onChange={(e) => setForm({ ...form, is_ladder: e.target.checked })}
                  className="h-4 w-4"
                />
              </div>
              {form.is_ladder ? (
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label>Start reps</Label>
                    <Input
                      type="number"
                      min="1"
                      value={form.ladder_start_reps}
                      onChange={(e) => setForm({ ...form, ladder_start_reps: e.target.value })}
                      placeholder="10"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>End reps</Label>
                    <Input
                      type="number"
                      min="0"
                      value={form.ladder_end_reps}
                      onChange={(e) => setForm({ ...form, ladder_end_reps: e.target.value })}
                      placeholder="1"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>Step</Label>
                    <Input
                      type="number"
                      min="1"
                      value={form.ladder_step}
                      onChange={(e) => setForm({ ...form, ladder_step: e.target.value })}
                      placeholder="1"
                      className="mt-1"
                    />
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <Label>Sets</Label>
                    <Input
                      type="number"
                      min="1"
                      value={form.set_count}
                      onChange={(e) => setForm({ ...form, set_count: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>Reps / Prescription</Label>
                    <Input
                      value={form.prescription_value}
                      onChange={(e) => setForm({ ...form, prescription_value: e.target.value })}
                      placeholder="e.g. 10, 30s, AMRAP"
                      className="mt-1"
                    />
                  </div>
                </>
              )}
              <div>
                <Label>Load</Label>
                <Input
                  value={form.load_value}
                  onChange={(e) => setForm({ ...form, load_value: e.target.value })}
                  placeholder="e.g. 60kg, 50%"
                  className="mt-1"
                />
              </div>
              {isTreadmill && (
                <>
                  <div>
                    <Label>Speed</Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={form.speed}
                      onChange={(e) => setForm({ ...form, speed: e.target.value })}
                      placeholder="e.g. 3.2"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>Incline</Label>
                    <Input
                      type="number"
                      step="0.5"
                      value={form.incline}
                      onChange={(e) => setForm({ ...form, incline: e.target.value })}
                      placeholder="e.g. 10"
                      className="mt-1"
                    />
                  </div>
                </>
              )}
              <div>
                <Label>Notes</Label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Optional notes…"
                  className="w-full mt-1 rounded-md border border-input bg-transparent px-3 py-2 text-sm min-h-[60px] focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <Button onClick={handleSubmit} disabled={saving} className="w-full rounded-xl h-12 bg-brand text-brand-foreground hover:bg-brand/90">
                {saving ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}