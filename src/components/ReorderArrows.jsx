import { ChevronUp, ChevronDown } from 'lucide-react';

export default function ReorderArrows({ index, length, onUp, onDown, disabled = false, disableUp, disableDown }) {
  const upDisabled = disabled || (disableUp ?? index === 0);
  const downDisabled = disabled || (disableDown ?? index === length - 1);
  return (
    <div className="flex items-center gap-0.5">
      <button
        onClick={(e) => { e.stopPropagation(); onUp(); }}
        disabled={upDisabled}
        className="p-1 rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-30 disabled:pointer-events-none transition-colors"
        aria-label="Move up"
      >
        <ChevronUp className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onDown(); }}
        disabled={downDisabled}
        className="p-1 rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-30 disabled:pointer-events-none transition-colors"
        aria-label="Move down"
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}