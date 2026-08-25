import { Sparkles, Search } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';

export default function RestToWorkoutChoiceSheet({ open, onOpenChange, onAiSuggest, onChooseSelf, dayLabel }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl p-0">
        <SheetHeader className="px-5 pt-5 pb-3">
          <SheetTitle className="text-left">Add a workout{dayLabel ? ` · ${dayLabel}` : ''}</SheetTitle>
          <SheetDescription className="text-left">Choose how to fill this rest day.</SheetDescription>
        </SheetHeader>
        <div className="px-5 pb-8 space-y-3">
          <button
            onClick={onAiSuggest}
            className="w-full flex items-center gap-3 rounded-2xl border border-brand/20 bg-brand/5 p-4 text-left hover:bg-brand/10 transition-colors"
          >
            <div className="h-10 w-10 rounded-xl bg-brand/10 flex items-center justify-center shrink-0">
              <Sparkles className="h-5 w-5 text-brand" />
            </div>
            <div className="flex-1">
              <p className="font-medium">AI suggest</p>
              <p className="text-xs text-muted-foreground mt-0.5">Get 2–3 fitting workouts to pick from.</p>
            </div>
          </button>
          <button
            onClick={onChooseSelf}
            className="w-full flex items-center gap-3 rounded-2xl border border-border p-4 text-left hover:border-foreground/20 transition-colors"
          >
            <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center shrink-0">
              <Search className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <p className="font-medium">Choose myself</p>
              <p className="text-xs text-muted-foreground mt-0.5">Search the workout library.</p>
            </div>
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}