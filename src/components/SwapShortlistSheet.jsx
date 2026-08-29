import { Loader2, Check, Clock, Dumbbell, Search } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export default function SwapShortlistSheet({ open, onOpenChange, loading, alternatives, currentName, onPick, onViewDetails = null, keepLabel = null, onSearchLibrary = null }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl h-[70vh] flex flex-col p-0">
        <SheetHeader className="px-5 pt-5 pb-3 shrink-0">
          <SheetTitle className="text-left">Find an alternative</SheetTitle>
          <SheetDescription className="text-left">
            {loading ? 'Finding workouts that fit…' : `Alternatives to ${currentName || 'this workout'}`}
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-5 pb-8 space-y-3">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Loader2 className="h-8 w-8 text-brand animate-spin mb-3" />
              <p className="text-sm text-muted-foreground">Ranking compatible workouts…</p>
            </div>
          ) : alternatives.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-16">No alternatives found. Try rebuilding the whole plan instead.</p>
          ) : (
            alternatives.map((a) => (
              <Card key={a.workout_id} className="rounded-2xl border-border p-4 hover:border-brand/40 hover:bg-brand/[0.03] transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold">{a.workout_name}</p>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      {a.format_label && <span className="inline-flex items-center gap-1"><Dumbbell className="h-3 w-3" /> {a.format_label}</span>}
                      {a.est_duration_min && <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {a.est_duration_min} min</span>}
                    </div>
                  </div>
                  {!onViewDetails && (
                    <div className="h-7 w-7 rounded-full bg-brand/10 flex items-center justify-center shrink-0">
                      <Check className="h-4 w-4 text-brand" />
                    </div>
                  )}
                </div>
                {a.reason && <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{a.reason}</p>}
                {onViewDetails ? (
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => onPick(a)} className="flex-1 flex items-center justify-center gap-1 text-xs font-medium py-2 rounded-lg bg-brand text-brand-foreground">
                      <Check className="h-3.5 w-3.5" /> Use this
                    </button>
                    <button onClick={() => onViewDetails(a)} className="flex-1 flex items-center justify-center gap-1 text-xs font-medium py-2 rounded-lg border border-border text-muted-foreground">
                      Details
                    </button>
                  </div>
                ) : (
                  <button onClick={() => onPick(a)} className="w-full flex items-center justify-center gap-1 text-xs font-medium py-2 rounded-lg border border-border text-brand mt-3">
                    <Check className="h-3.5 w-3.5" /> Select
                  </button>
                )}
              </Card>
            ))
          )}
          {onSearchLibrary && (
            <button onClick={onSearchLibrary} className="w-full flex items-center justify-center gap-1.5 text-sm font-medium py-2.5 rounded-lg border border-brand/30 text-brand hover:bg-brand/5 transition-colors">
              <Search className="h-4 w-4" /> Search the workout library
            </button>
          )}
          <button onClick={() => onOpenChange(false)} className={cn('w-full text-center text-sm font-medium text-muted-foreground py-3')}>
            {keepLabel || 'Keep current workout'}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}