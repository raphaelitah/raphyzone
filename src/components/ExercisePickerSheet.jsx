import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Loader2, Clock } from 'lucide-react';

export default function ExercisePickerSheet({ open, onOpenChange, onPick }) {
  const [results, setResults] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState(null);
  const [prescription, setPrescription] = useState('');
  const [sets, setSets] = useState('3');
  const [saving, setSaving] = useState(false);
  const [restMode, setRestMode] = useState(false);
  const [restDuration, setRestDuration] = useState('60');

  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults([]);
      setPicked(null);
      setPrescription('');
      setSets('3');
      setRestMode(false);
      setRestDuration('60');
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const { data } = await supabase
          .from('exercises')
          .select('*')
          .not('submission_status', 'in', '(pending,rejected)')
          .ilike('name', `%${q}%`)
          .order('name')
          .limit(50);
        setResults(data || []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, open]);

  const handleConfirmRest = async () => {
    setSaving(true);
    try {
      await onPick({
        rest: true,
        duration_seconds: parseInt(restDuration, 10) || 60,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleConfirm = async () => {
    setSaving(true);
    try {
      await onPick({
        exercise: picked,
        prescription_value: prescription,
        sets: parseInt(sets, 10) || 1,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[85vh] overflow-y-auto">
        <SheetHeader className="px-5 pt-5">
          <SheetTitle className="text-left">Add exercise</SheetTitle>
        </SheetHeader>
        <div className="px-5 pb-8 space-y-4">
          {restMode ? (
            <>
              <div className="rounded-xl border border-border p-3">
                <p className="text-sm font-medium">Rest</p>
                <p className="text-xs text-muted-foreground">Timed rest period</p>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Duration (seconds)</label>
                <Input type="number" value={restDuration} onChange={(e) => setRestDuration(e.target.value)} className="mt-1" />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setRestMode(false)} className="flex-1 rounded-xl h-12">Back</Button>
                <Button onClick={handleConfirmRest} disabled={saving} className="flex-1 rounded-xl h-12 bg-brand text-brand-foreground hover:bg-brand/90">
                  {saving ? 'Adding…' : 'Add to block'}
                </Button>
              </div>
            </>
          ) : !picked ? (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search exercises…"
                  className="pl-9"
                  autoFocus
                />
              </div>
              <button onClick={() => setRestMode(true)} className="w-full rounded-xl border border-dashed border-border py-2.5 text-sm text-muted-foreground hover:border-foreground/20 hover:text-foreground flex items-center justify-center gap-1.5">
                <Clock className="h-3.5 w-3.5" /> Add rest
              </button>
              {loading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-6 w-6 text-brand animate-spin" />
                </div>
              ) : (
                <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                  {results.map((ex) => (
                    <button
                      key={ex.id}
                      onClick={() => setPicked(ex)}
                      className="w-full text-left rounded-xl border border-border p-3 hover:border-foreground/20"
                    >
                      <p className="text-sm font-medium truncate">{ex.name}</p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {ex.movement_pattern ? ex.movement_pattern.replace(/_/g, ' ') : ''}
                        {ex.equipment ? ` · ${ex.equipment}` : ''}
                      </p>
                    </button>
                  ))}
                  {query.trim() && !loading && results.length === 0 && (
                    <p className="text-center text-sm text-muted-foreground py-8">No exercises found.</p>
                  )}
                  {!query.trim() && (
                    <p className="text-center text-sm text-muted-foreground py-8">Start typing to search the exercise library…</p>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="rounded-xl border border-border p-3">
                <p className="text-sm font-medium">{picked.name}</p>
                <p className="text-xs text-muted-foreground capitalize">
                  {picked.movement_pattern ? picked.movement_pattern.replace(/_/g, ' ') : ''}
                  {picked.equipment ? ` · ${picked.equipment}` : ''}
                </p>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Reps / Prescription</label>
                <Input
                  value={prescription}
                  onChange={(e) => setPrescription(e.target.value)}
                  placeholder="e.g. 10, 30s, AMRAP"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Sets</label>
                <Input type="number" value={sets} onChange={(e) => setSets(e.target.value)} className="mt-1" />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setPicked(null)} className="flex-1 rounded-xl h-12">
                  Back
                </Button>
                <Button onClick={handleConfirm} disabled={saving} className="flex-1 rounded-xl h-12 bg-brand text-brand-foreground hover:bg-brand/90">
                  {saving ? 'Adding…' : 'Add to block'}
                </Button>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}