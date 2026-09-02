import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { fetchTaxonomyTerms } from '@/lib/taxonomy';
import { Search, Loader2, Clock, X } from 'lucide-react';

const PICK_COLUMNS = 'id, exercise_code, name, movement_pattern, equipment';

const QUICK_ADD_EXERCISES = [
  { label: 'Burpee', name: 'Burpee' },
  { label: 'Push-Up', name: 'Push-Up' },
  { label: 'Air Squat', name: 'Air Squat' },
  { label: 'Lunge', name: 'Reverse Lunge' },
  { label: 'Sit-Up', name: 'Butterfly Sit-Up' },
  { label: 'Plank', name: 'Forearm Plank' },
  { label: 'Jumping Jack', name: 'Jumping Jack' },
  { label: 'Mountain Climber', name: 'Mountain Climber' },
  { label: 'DB Snatch', name: 'Dumbbell Power Snatch' },
  { label: 'Thruster', name: 'Dumbbell Thruster' },
  { label: 'Kettlebell Swing', name: 'American Kettlebell Swing' },
  { label: 'Box Jump', name: 'Box Jump Over' },
  { label: 'Pull-Up', name: 'Chest to Bar Pull-Up' },
  { label: 'Deadlift', name: 'Deadlift' },
  { label: 'Wall Ball', name: 'Wall Ball' },
];

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
  const [patternOptions, setPatternOptions] = useState([]);
  const [activePattern, setActivePattern] = useState(null);
  const [quickAdd, setQuickAdd] = useState([]);
  const cacheRef = useRef(new Map());

  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults([]);
      setPicked(null);
      setPrescription('');
      setSets('3');
      setRestMode(false);
      setRestDuration('60');
      setActivePattern(null);
      return;
    }
    if (patternOptions.length === 0) {
      fetchTaxonomyTerms('movement_pattern').then((terms) => {
        setPatternOptions(terms.map((t) => t.value).filter(Boolean));
      });
    }
    if (quickAdd.length === 0) {
      const orFilter = QUICK_ADD_EXERCISES.map((q) => `name.ilike.${q.name}`).join(',');
      supabase
        .from('exercises')
        .select(PICK_COLUMNS)
        .not('submission_status', 'in', '(pending,rejected)')
        .or(orFilter)
        .then(({ data }) => {
          if (!data) return;
          const ordered = QUICK_ADD_EXERCISES
            .map((q) => {
              const match = data.find((ex) => ex.name.toLowerCase() === q.name.toLowerCase());
              return match ? { ...match, quickLabel: q.label } : null;
            })
            .filter(Boolean);
          setQuickAdd(ordered);
        });
    }
  }, [open, patternOptions.length, quickAdd.length]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (!q && !activePattern) {
      setResults([]);
      return;
    }
    const cacheKey = `${q}|${activePattern || ''}`;
    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      setResults(cached);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        let request = supabase
          .from('exercises')
          .select(PICK_COLUMNS)
          .not('submission_status', 'in', '(pending,rejected)')
          .order('name')
          .limit(50);
        if (q) request = request.ilike('name', `%${q}%`);
        if (activePattern) request = request.eq('movement_pattern', activePattern);
        const { data } = await request;
        cacheRef.current.set(cacheKey, data || []);
        setResults(data || []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, q ? 300 : 0);
    return () => clearTimeout(timer);
  }, [query, activePattern, open]);

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
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[85dvh] overflow-y-auto">
        <SheetHeader className="px-5 pt-5">
          <SheetTitle className="text-left">Add exercise</SheetTitle>
        </SheetHeader>
        <div className="px-5 pb-8 space-y-4">
          {!restMode && !picked && quickAdd.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Quick add</p>
              <div className="flex flex-wrap gap-1.5">
                {quickAdd.map((ex) => (
                  <button
                    key={ex.id}
                    onClick={() => setPicked(ex)}
                    className="px-3 py-1.5 rounded-full text-xs font-medium border border-border text-foreground hover:border-brand hover:text-brand bg-muted/40"
                  >
                    {ex.quickLabel}
                  </button>
                ))}
              </div>
            </div>
          )}
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
              {patternOptions.length > 0 && (
                <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-5 px-5">
                  {activePattern && (
                    <button
                      onClick={() => setActivePattern(null)}
                      className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium bg-brand text-brand-foreground"
                    >
                      {activePattern.replace(/_/g, ' ')} <X className="h-3 w-3" />
                    </button>
                  )}
                  {patternOptions.filter((p) => p !== activePattern).map((p) => (
                    <button
                      key={p}
                      onClick={() => setActivePattern(p)}
                      className="shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border border-border text-muted-foreground hover:border-foreground/20 hover:text-foreground capitalize"
                    >
                      {p.replace(/_/g, ' ')}
                    </button>
                  ))}
                </div>
              )}
              {loading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-6 w-6 text-brand animate-spin" />
                </div>
              ) : (
                <div className="space-y-2 max-h-[50dvh] overflow-y-auto">
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
                  {(query.trim() || activePattern) && !loading && results.length === 0 && (
                    <p className="text-center text-sm text-muted-foreground py-8">No exercises found.</p>
                  )}
                  {!query.trim() && !activePattern && (
                    <p className="text-center text-sm text-muted-foreground py-8">Start typing or pick a movement pattern to browse the exercise library…</p>
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