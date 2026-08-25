import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Search, Loader2, Clock } from 'lucide-react';
import { roundToFive } from '@/lib/workoutStructure';

const BATCH_SIZE = 30;

export default function WorkoutSearchSheet({ open, onOpenChange, onPick, dayLabel }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const debounceRef = useRef(null);
  const sentinelRef = useRef(null);

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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl h-[80vh] flex flex-col p-0">
        <SheetHeader className="px-5 pt-5 pb-3 shrink-0">
          <SheetTitle className="text-left">Choose a workout{dayLabel ? ` · ${dayLabel}` : ''}</SheetTitle>
          <SheetDescription className="text-left">Search the workout library to fill this day.</SheetDescription>
        </SheetHeader>
        <div className="px-5 pb-3 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search workouts…" className="pl-9 rounded-xl h-11" autoFocus />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-8 space-y-2.5">
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 text-brand animate-spin" /></div>
          ) : (
            <>
              {results.map((w) => (
                <button key={w.id} onClick={() => onPick(w)} className="w-full text-left">
                  <Card className="rounded-2xl border-border p-4 hover:border-brand/40 hover:bg-brand/[0.03] transition-colors">
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
                  </Card>
                </button>
              ))}
              {results.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-16">{query.trim() ? 'No workouts found.' : 'No workouts available.'}</p>
              )}
              <div ref={sentinelRef} className="h-10 flex items-center justify-center">
                {loadingMore ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : null}
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}