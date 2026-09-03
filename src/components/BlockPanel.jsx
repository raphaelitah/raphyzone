import { SkipForward } from 'lucide-react';
import { cn } from '@/lib/utils';

// Shared card shell for superset/EMOM/tabata block tracking: a header (block
// label + round counter), a pill row listing every exercise in the block
// with the active one highlighted, caller-supplied body (the part that
// actually differs between block types — tap-to-start vs. countdown timer),
// and an optional "skip this block" link.
export default function BlockPanel({ label, roundLabel, exercises, activeKey, onSkip, skipLabel, children }) {
  return (
    <div className="rounded-2xl border border-border p-4 mb-4 bg-card">
      {(label || roundLabel) && (
        <div className={cn('flex items-center mb-3', label ? 'justify-between' : 'justify-end')}>
          {label && <p className="text-sm font-semibold">{label}</p>}
          {roundLabel && <p className="text-xs text-muted-foreground">{roundLabel}</p>}
        </div>
      )}

      {exercises && exercises.length > 1 && (
        <div className="flex flex-wrap justify-center gap-1.5 mb-3">
          {exercises.map((e) => (
            <span
              key={e.key}
              className={cn(
                'text-[10px] font-medium px-2 py-0.5 rounded-full border',
                e.key === activeKey ? 'bg-brand text-brand-foreground border-brand' : 'border-border text-muted-foreground'
              )}
            >
              {e.exercise_name}
            </span>
          ))}
        </div>
      )}

      {children}

      {onSkip && (
        <button onClick={onSkip} className="w-full text-center mt-3 text-xs text-muted-foreground underline flex items-center justify-center gap-1">
          <SkipForward className="h-3 w-3" /> {skipLabel}
        </button>
      )}
    </div>
  );
}
