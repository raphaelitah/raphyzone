import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Search, Loader2, Clock } from 'lucide-react';
import { roundToFive } from '@/lib/workoutStructure';
import { isRunningWorkout, WORKOUT_FORMATS, workoutFormatMatches } from '@/lib/fitness';
import WorkoutFilters from '@/components/WorkoutFilters';
import WorkoutDetailSheet from '@/components/WorkoutDetailSheet';
import ProfileGapPrompt from '@/components/ProfileGapPrompt';
import { useProfileGaps } from '@/hooks/useProfileGaps';
import { useAuth } from '@/lib/AuthContext';
import { matchActivityFromText, categoryFromWorkout, recordPickAndDetectRepeat, repeatedActivityInterest } from '@/lib/activityInterest';

const BATCH_SIZE = 30;

export default function WorkoutSearchSheet({ open, onOpenChange, onPick, dayLabel }) {
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [region, setRegion] = useState('All');
  const [running, setRunning] = useState(false);
  const [difficulty, setDifficulty] = useState('All');
  const [workoutType, setWorkoutType] = useState('All');
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [detailWorkout, setDetailWorkout] = useState(null);
  const debounceRef = useRef(null);
  const sentinelRef = useRef(null);
  // Same detection whether the user typed the activity name or has simply kept picking
  // the same category of workout (e.g. several Bodybuilding-format sessions in a row).
  const matchedActivity = useMemo(
    () => matchActivityFromText(query) || (open ? repeatedActivityInterest(user?.id) : null),
    [query, open, user?.id]
  );
  const { gap: profileGap, profile: gapProfile, context: gapContext, answer: answerGap, dismiss: dismissGap } = useProfileGaps('workout-search', { activity: matchedActivity, day: dayLabel });

  const runSearch = useCallback(async (q) => {
    setLoading(true);
    try {
      let query = supabase
        .from('workouts')
        .select('*')
        .eq('status', 'approved')
        .eq('ownership_type', 'official');
      if (q) query = query.ilike('name', `%${q}%`);
      const { data } = await query.order('name').limit(BATCH_SIZE);
      const batch = data || [];
      setResults(batch);
      setHasMore(!q && batch.length === BATCH_SIZE);
    } catch {
      setResults([]);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setQuery('');
      setRegion('All');
      setRunning(false);
      setDifficulty('All');
      setWorkoutType('All');
      setFiltersExpanded(false);
      runSearch('');
    }
  }, [open, runSearch]);

  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(query.trim()), 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, open, runSearch]);

  const loadMore = useCallback(async () => {
    if (loadingMore || loading || !hasMore || query.trim() || results.length === 0) return;
    setLoadingMore(true);
    try {
      const last = results[results.length - 1];
      const { data } = await supabase
        .from('workouts')
        .select('*')
        .eq('status', 'approved')
        .eq('ownership_type', 'official')
        .gt('name', last.name)
        .order('name')
        .limit(BATCH_SIZE);
      const batch = data || [];
      if (batch.length === 0) {
        setHasMore(false);
      } else {
        setResults((prev) => [...prev, ...batch]);
        setHasMore(batch.length === BATCH_SIZE);
      }
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, loading, hasMore, query, results]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMore(); },
      { rootMargin: '600px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore]);

  const filtered = useMemo(() => results.filter((w) => {
    const matchesRegion = running ? isRunningWorkout(w) : (region === 'All' || w.workout_category === region);
    const matchesDifficulty = difficulty === 'All' || w.difficulty === difficulty.toLowerCase();
    const matchesType = workoutType === 'All' || WORKOUT_FORMATS
      .filter((f) => f.label === workoutType)
      .some((f) => workoutFormatMatches(w.workout_format, f.value));
    return matchesRegion && matchesDifficulty && matchesType;
  }), [results, region, running, difficulty, workoutType]);

  const pickAndClose = (w) => {
    setDetailWorkout(null);
    recordPickAndDetectRepeat(user?.id, categoryFromWorkout(w));
    onPick(w);
  };

  return (
    <>
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl h-[85dvh] flex flex-col p-0">
        <SheetHeader className="px-5 pt-5 pb-3 shrink-0">
          <SheetTitle className="text-left">Choose a workout{dayLabel ? ` · ${dayLabel}` : ''}</SheetTitle>
          <SheetDescription className="text-left">Search the workout library to fill this day.</SheetDescription>
        </SheetHeader>
        <div className="px-5 pb-3 shrink-0 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search workouts…" className="pl-9 rounded-xl h-11" autoFocus />
          </div>
          <WorkoutFilters
            region={region} setRegion={setRegion}
            running={running} setRunning={setRunning}
            difficulty={difficulty} setDifficulty={setDifficulty}
            workoutType={workoutType} setWorkoutType={setWorkoutType}
            expanded={filtersExpanded} setExpanded={setFiltersExpanded}
          />
          {profileGap && (
            <ProfileGapPrompt gap={profileGap} profile={gapProfile} context={gapContext} onAnswer={answerGap} onDismiss={dismissGap} />
          )}
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-8 space-y-2.5">
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 text-brand animate-spin" /></div>
          ) : (
            <>
              {filtered.map((w) => (
                <Card key={w.id} className="rounded-2xl border-border p-4">
                  <button onClick={() => setDetailWorkout(w)} className="w-full text-left">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate">{w.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{w.format_label || w.workout_format || 'Workout'}</p>
                      </div>
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground capitalize shrink-0">{w.workout_category}</span>
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{roundToFive(w.est_duration_min) || '~45'} min</span>
                      <span className="capitalize">{w.goal}</span>
                    </div>
                  </button>
                  <div className="flex gap-2 mt-3">
                    <Button variant="outline" size="sm" className="flex-1 rounded-lg" onClick={() => setDetailWorkout(w)}>Details</Button>
                    <Button size="sm" className="flex-1 rounded-lg bg-brand text-brand-foreground hover:bg-brand/90" onClick={() => pickAndClose(w)}>Select</Button>
                  </div>
                </Card>
              ))}
              {filtered.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-16">{query.trim() ? 'No workouts found.' : 'No workouts match these filters.'}</p>
              )}
              <div ref={sentinelRef} className="h-10 flex items-center justify-center">
                {loadingMore ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : null}
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>

    <WorkoutDetailSheet
      workout={detailWorkout}
      open={!!detailWorkout}
      onOpenChange={(o) => { if (!o) setDetailWorkout(null); }}
      selectMode
      onSelect={() => pickAndClose(detailWorkout)}
    />
    </>
  );
}