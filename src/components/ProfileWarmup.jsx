import { useState, useEffect, useMemo } from 'react';
import { Plus, X, Search, Loader2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/supabaseClient';
import { cn } from '@/lib/utils';

export const CARDIO_OPTIONS = ['Skierg', 'Rower', 'Assault bike'];

const DEFAULT_SEARCH_NAMES = ['air squat', 'inch worm', 'jumping jack', 'arm circle', 'world greatest stretch'];

export default function ProfileWarmup({ form, setForm }) {
  const [showAdd, setShowAdd] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [allExercises, setAllExercises] = useState(null);
  const [loading, setLoading] = useState(false);

  const duration = form.warmup_duration_minutes ?? 10;
  const includeMobility = form.warmup_include_mobility ?? true;
  const includeCardio = form.warmup_include_cardio ?? true;
  const includeFirstMovement = form.warmup_include_first_movement ?? true;
  const mobilityList = form.warmup_mobility_exercises ?? [];
  const cardioSelected = form.warmup_cardio_options ?? [];
  const firstMovementSets = form.warmup_first_movement_sets ?? 2;
  const notes = form.warmup_notes ?? '';

  const selectedIds = useMemo(() => new Set(mobilityList.map((e) => e.exercise_id)), [mobilityList]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from('exercises')
          .select('id, name')
          .or(DEFAULT_SEARCH_NAMES.map((name) => `name.ilike.%${name}%`).join(','))
          .limit(50);
        if (cancelled || (form.warmup_mobility_exercises || []).length > 0) return;
        const exercises = data || [];
        const defaults = DEFAULT_SEARCH_NAMES.map((name) => {
          const match = exercises.find((e) => e.name?.toLowerCase().includes(name));
          return match ? { exercise_id: match.id, exercise_name: match.name } : null;
        }).filter(Boolean);
        if (defaults.length) {
          setForm((f) => (((f.warmup_mobility_exercises || []).length > 0) ? f : { ...f, warmup_mobility_exercises: defaults }));
        }
      } catch {
        // best-effort default seeding; ignore failures
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Lazily load the exercise library only once the user opens the picker,
  // and only fetch the columns the picker actually renders/filters on.
  useEffect(() => {
    if (!showAdd || allExercises !== null) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data } = await supabase
          .from('exercises')
          .select('id, name, movement_pattern')
          .order('name')
          .limit(1000);
        if (!cancelled) setAllExercises(data || []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [showAdd, allExercises]);

  const filteredResults = useMemo(() => {
    if (!allExercises) return [];
    const q = searchQuery.toLowerCase().trim();
    const available = allExercises.filter((e) => !selectedIds.has(e.id));
    if (!q) return available.slice(0, 30);
    return available.filter((e) => e.name?.toLowerCase().includes(q)).slice(0, 30);
  }, [allExercises, searchQuery, selectedIds]);

  const chipClass = (on) => cn('px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
    on ? 'bg-brand text-brand-foreground border-transparent' : 'border-border text-muted-foreground');

  const addExercise = (exercise) => {
    setForm((f) => ({
      ...f,
      warmup_mobility_exercises: [...(f.warmup_mobility_exercises || []), { exercise_id: exercise.id, exercise_name: exercise.name }],
    }));
    setSearchQuery('');
    setShowAdd(false);
  };

  const removeExercise = (i) => {
    setForm((f) => ({ ...f, warmup_mobility_exercises: (f.warmup_mobility_exercises || []).filter((_, idx) => idx !== i) }));
  };

  const toggleCardio = (opt) => {
    setForm((f) => {
      const current = f.warmup_cardio_options || [];
      return { ...f, warmup_cardio_options: current.includes(opt) ? current.filter((c) => c !== opt) : [...current, opt] };
    });
  };

  return (
    <div className="rounded-xl border border-border p-4 space-y-4">
      <div>
        <p className="text-sm font-medium">Warm Up</p>
        <p className="text-[11px] text-muted-foreground/70 mt-0.5">Pre-workout prep the AI applies to every session.</p>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-muted-foreground">Duration</span>
          <span className="text-xs font-semibold text-brand">{duration} min</span>
        </div>
        <Slider value={[duration]} min={0} max={20} step={1} onValueChange={([v]) => setForm((f) => ({ ...f, warmup_duration_minutes: v }))} />
        <div className="flex justify-between mt-1.5">
          <span className="text-[10px] text-muted-foreground/60">0</span>
          <span className="text-[10px] text-muted-foreground/60">20</span>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="pr-3">
            <p className="text-xs font-medium">Mobility exercises</p>
            <p className="text-[10px] text-muted-foreground/70">Dynamic movements to prep joints and muscles.</p>
          </div>
          <Switch checked={includeMobility} onCheckedChange={(v) => setForm((f) => ({ ...f, warmup_include_mobility: v }))} />
        </div>
        {includeMobility && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {mobilityList.map((ex, i) => (
                <span key={ex.exercise_id || i} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-muted text-foreground">
                  {ex.exercise_name}
                  <button onClick={() => removeExercise(i)} className="text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
                </span>
              ))}
              {mobilityList.length === 0 && !loading && (
                <p className="text-[11px] text-muted-foreground/70">No exercises selected yet.</p>
              )}
            </div>
            {showAdd ? (
              <div className="rounded-lg border border-border bg-card overflow-hidden">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search exercise library…"
                    className="pl-8 border-0 rounded-none h-9 text-sm focus-visible:ring-0"
                    autoFocus
                  />
                </div>
                <div className="max-h-44 overflow-y-auto border-t border-border">
                  {loading ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  ) : filteredResults.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground/70 px-3 py-3 text-center">No exercises found.</p>
                  ) : (
                    filteredResults.map((ex) => (
                      <button
                        key={ex.id}
                        onClick={() => addExercise(ex)}
                        className="block w-full text-left px-3 py-2 text-sm hover:bg-accent border-b border-border/50 last:border-0"
                      >
                        <span className="font-medium">{ex.name}</span>
                        {ex.movement_pattern && <span className="text-[10px] text-muted-foreground ml-1.5">{ex.movement_pattern}</span>}
                      </button>
                    ))
                  )}
                </div>
                <button onClick={() => { setShowAdd(false); setSearchQuery(''); }} className="w-full text-xs text-muted-foreground py-2 hover:bg-accent border-t border-border">Cancel</button>
              </div>
            ) : (
              <button onClick={() => setShowAdd(true)} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <Plus className="h-3 w-3" /> Add from library
              </button>
            )}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="pr-3">
            <p className="text-xs font-medium">Cardio prep</p>
            <p className="text-[10px] text-muted-foreground/70">Machine warm-up — used only if equipment is available.</p>
          </div>
          <Switch checked={includeCardio} onCheckedChange={(v) => setForm((f) => ({ ...f, warmup_include_cardio: v }))} />
        </div>
        {includeCardio && (
          <div className="flex flex-wrap gap-1.5">
            {CARDIO_OPTIONS.map((opt) => (
              <button key={opt} onClick={() => toggleCardio(opt)} className={chipClass(cardioSelected.includes(opt))}>{opt}</button>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="pr-3">
            <p className="text-xs font-medium">First movement prep</p>
            <p className="text-[10px] text-muted-foreground/70">Lighter sets of the first exercise on strength days.</p>
          </div>
          <Switch checked={includeFirstMovement} onCheckedChange={(v) => setForm((f) => ({ ...f, warmup_include_first_movement: v }))} />
        </div>
        {includeFirstMovement && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Prep sets</span>
            <div className="flex gap-1">
              {[1, 2, 3].map((n) => (
                <button key={n} onClick={() => setForm((f) => ({ ...f, warmup_first_movement_sets: n }))} className={chipClass(firstMovementSets === n)}>{n}</button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div>
        <p className="text-xs font-medium text-muted-foreground mb-1.5">Notes <span className="text-muted-foreground/60">(optional)</span></p>
        <Input value={notes} onChange={(e) => setForm((f) => ({ ...f, warmup_notes: e.target.value }))} placeholder="Any specific warm-up preferences…" className="h-9 text-sm" />
      </div>
    </div>
  );
}