import { useState, useEffect } from 'react';
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
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (blockExercise) {
      const currentReps = prescribedSets?.[0]?.target_reps?.toString() || blockExercise.prescription_value || '';
      setForm({
        set_count: prescribedSets?.length || 1,
        prescription_value: currentReps,
        load_value: blockExercise.load_value || '',
        notes: blockExercise.notes || '',
      });
    }
  }, [blockExercise, prescribedSets]);

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
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[85vh] overflow-y-auto">
        {blockExercise && (
          <>
            <SheetHeader className="px-5 pt-5">
              <SheetTitle className="text-left">Edit exercise</SheetTitle>
              <p className="text-sm text-muted-foreground text-left">{blockExercise.exercise_title_raw}</p>
            </SheetHeader>
            <div className="px-5 pb-8 space-y-4">
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
              <div>
                <Label>Load</Label>
                <Input
                  value={form.load_value}
                  onChange={(e) => setForm({ ...form, load_value: e.target.value })}
                  placeholder="e.g. 60kg, 50%"
                  className="mt-1"
                />
              </div>
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