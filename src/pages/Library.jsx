import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { Card } from '@/components/ui/card';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from '@/components/ui/alert-dialog';
import { Search, Dumbbell, Loader2, Pencil, Trash2, Footprints, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import YouTubeVideo from '@/components/YouTubeVideo';
import LibraryFilters, { matchesPattern } from '@/components/LibraryFilters';
import { isRunningExercise } from '@/lib/fitness';
import AddExerciseSheet from '@/components/AddExerciseSheet';
import EditExerciseSheet from '@/components/EditExerciseSheet';
import ProfileGapPrompt from '@/components/ProfileGapPrompt';
import { useProfileGaps } from '@/hooks/useProfileGaps';

const BATCH_SIZE = 50;

export default function Library() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [exercises, setExercises] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [category, setCategory] = useState('All');
  const [region, setRegion] = useState('All');
  const [pattern, setPattern] = useState('All');
  const [selected, setSelected] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [deleteProcessing, setDeleteProcessing] = useState(false);
  const sentinelRef = useRef(null);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const lastScrollTopRef = useRef(0);
  const { gap: profileGap, profile: gapProfile, answer: answerGap, dismiss: dismissGap } = useProfileGaps('library');

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (debouncedQuery) {
        setSearching(true);
        try {
          const { data } = await supabase
            .from('exercises')
            .select('*')
            .ilike('name', `%${debouncedQuery}%`)
            .order('name')
            .limit(200);
          if (!cancelled) {
            setExercises(data || []);
            setHasMore(false);
          }
        } finally {
          if (!cancelled) setSearching(false);
        }
      } else {
        setLoading(true);
        try {
          const { data } = await supabase.from('exercises').select('*').order('name').limit(BATCH_SIZE);
          if (!cancelled) {
            setExercises(data || []);
            setHasMore((data || []).length === BATCH_SIZE);
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [debouncedQuery]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || loading || debouncedQuery) return;
    setLoadingMore(true);
    try {
      const lastExercise = exercises[exercises.length - 1];
      if (!lastExercise) { setHasMore(false); return; }
      const { data } = await supabase
        .from('exercises')
        .select('*')
        .gt('name', lastExercise.name)
        .order('name')
        .limit(BATCH_SIZE);
      const batch = data || [];
      if (batch.length === 0) {
        setHasMore(false);
      } else {
        setExercises(prev => [...prev, ...batch]);
        setHasMore(batch.length === BATCH_SIZE);
      }
    } finally {
      setLoadingMore(false);
    }
  }, [exercises, loadingMore, hasMore, loading, debouncedQuery]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { rootMargin: '700px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore]);

  const filtered = useMemo(() => exercises.filter((e) => {
    const isApproved = !e.submission_status || e.submission_status === 'approved';
    const matchesQ = !query || (e.name || '').toLowerCase().includes(query.toLowerCase());
    const matchesCat = category === 'All' || e.movement_category === category;
    const matchesReg = region === 'All' || e.body_region === region;
    const matchesPat = matchesPattern(e, pattern);
    return isApproved && matchesQ && matchesCat && matchesReg && matchesPat;
  }), [exercises, query, category, region, pattern]);

  const isSearchPending = searching || query.trim() !== debouncedQuery;

  const handleListScroll = (e) => {
    const scrollTop = e.currentTarget.scrollTop;
    if (filtersExpanded && scrollTop > lastScrollTopRef.current && scrollTop > 8) {
      setFiltersExpanded(false);
    }
    lastScrollTopRef.current = scrollTop;
  };

  const refreshExercise = async (id) => {
    try {
      const { data: updated, error } = await supabase.from('exercises').select('*').eq('id', id).single();
      if (error) throw error;
      setExercises(prev => prev.map(e => e.id === id ? updated : e));
      setSelected(updated);
    } catch { /* exercise may have been deleted */ }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteProcessing(true);
    try {
      await supabase.from('exercises').delete().eq('id', deleting.id);
      setExercises(prev => prev.filter(e => e.id !== deleting.id));
      setSelected(null);
      setDeleting(null);
    } finally {
      setDeleteProcessing(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100dvh-4rem)]">
      <div className="shrink-0 px-5 pt-10 pb-3 border-b border-border bg-background">
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Exercises Library</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Form, muscles and alternatives</p>
          </div>
          <Button size="sm" onClick={() => setShowAdd(true)} className="gap-1.5 h-8 shrink-0 bg-brand hover:bg-brand/90 text-brand-foreground">
            <Plus className="h-3.5 w-3.5" />
            Add
          </Button>
        </header>

        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search exercises…" className="pl-9 pr-9 rounded-xl h-11" />
          {isSearchPending && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>

        <LibraryFilters category={category} setCategory={setCategory} region={region} setRegion={setRegion} pattern={pattern} setPattern={setPattern} expanded={filtersExpanded} setExpanded={setFiltersExpanded} />
      </div>

      <div className="flex-1 overflow-y-auto px-5 pt-3 pb-4" onScroll={handleListScroll}>
        {loading ? (
          <div className="flex justify-center py-20"><div className="w-7 h-7 border-4 border-muted border-t-brand rounded-full animate-spin" /></div>
        ) : (
          <div className="space-y-2.5">
            {profileGap && (
              <ProfileGapPrompt gap={profileGap} profile={gapProfile} onAnswer={answerGap} onDismiss={dismissGap} />
            )}
            {filtered.map((e) => (
              <button key={e.id} onClick={() => setSelected(e)} className="w-full text-left">
                <Card className="rounded-2xl border-border p-4 flex items-center gap-3 hover:border-foreground/20 transition-colors">
                  <div className="h-11 w-11 rounded-xl bg-brand/10 flex items-center justify-center shrink-0">
                    {isRunningExercise(e) ? <Footprints className="h-5 w-5 text-brand" /> : <Dumbbell className="h-5 w-5 text-brand" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{e.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{e.movement_pattern} · {e.equipment}</p>
                  </div>
                </Card>
              </button>
            ))}
            {filtered.length === 0 && !loadingMore && !isSearchPending && (
              <p className="text-center text-sm text-muted-foreground py-16">No exercises found.</p>
            )}
            <div ref={sentinelRef} className="h-10 flex items-center justify-center">
              {loadingMore ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : !hasMore && !debouncedQuery && filtered.length > 0 ? (
                <p className="text-xs text-muted-foreground">No more exercises</p>
              ) : null}
            </div>
          </div>
        )}
      </div>

      <Sheet open={!!selected} onOpenChange={(o) => { if (!o) setSelected(null); }}>
        <SheetContent side="bottom" className="rounded-t-3xl h-[75vh] p-0 md:max-w-4xl md:mx-auto md:rounded-3xl">
          {selected && (
            <div className="flex flex-col h-full">
              <SheetHeader className="px-5 pt-5 pb-4 shrink-0">
                <SheetTitle className="text-xl text-left">{selected.name}</SheetTitle>
              </SheetHeader>
              <div className="overflow-y-auto px-5 pb-8 space-y-4">
                <div className="flex flex-col md:flex-row gap-5">
                  {selected.video_url && (
                    <div className="md:w-[45%] md:shrink-0">
                      <YouTubeVideo url={selected.video_url} title={selected.name} />
                    </div>
                  )}
                  <div className="flex-1 space-y-4">
                    <div className="flex flex-wrap gap-2 text-xs">
                      {isRunningExercise(selected) && (
                        <Tag className="flex items-center gap-1"><Footprints className="h-3 w-3" /> Running</Tag>
                      )}
                      {selected.movement_pattern && <Tag className="capitalize">{selected.movement_pattern}</Tag>}
                      {selected.body_region && <Tag>{selected.body_region}</Tag>}
                      {selected.equipment && <Tag>{selected.equipment}</Tag>}
                      {selected.technical_difficulty && <Tag>Difficulty {selected.technical_difficulty}/5</Tag>}
                    </div>

                    {selected.notes && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1.5">Notes</p>
                        <p className="text-sm leading-relaxed">{selected.notes}</p>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1.5">Primary muscle</p>
                        <div className="flex flex-wrap gap-1.5">{selected.primary_muscle_group ? <Tag>{selected.primary_muscle_group}</Tag> : <span className="text-xs text-muted-foreground">—</span>}</div>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1.5">Secondary</p>
                        <div className="flex flex-wrap gap-1.5">{selected.secondary_muscle_group ? <Tag>{selected.secondary_muscle_group}</Tag> : <span className="text-xs text-muted-foreground">—</span>}</div>
                      </div>
                    </div>
                  </div>
                </div>

                {isAdmin && (
                  <div className="flex gap-2 pt-2">
                    <Button variant="outline" className="flex-1 rounded-xl" onClick={() => { setEditing(selected); }}>
                      <Pencil className="h-4 w-4" /> Edit
                    </Button>
                    <Button variant="outline" className="flex-1 rounded-xl hover:bg-destructive/10 hover:text-destructive" onClick={() => setDeleting(selected)}>
                      <Trash2 className="h-4 w-4" /> Delete
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <AddExerciseSheet open={showAdd} onOpenChange={setShowAdd} />

      <EditExerciseSheet
        exercise={editing}
        open={!!editing}
        onOpenChange={(o) => { if (!o) setEditing(null); }}
        onSaved={() => editing && refreshExercise(editing.id)}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => { if (!o) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleting?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the exercise from the library. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleteProcessing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Tag({ children, className = '' }) {
  return <span className={cn('inline-flex items-center px-2.5 py-1 rounded-full bg-brand/10 text-brand text-xs font-medium', className)}>{children}</span>;
}