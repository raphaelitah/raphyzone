import { ChevronUp, ChevronDown } from 'lucide-react';

export default function ReorderArrows({ index, length, onUp, onDown, disabled = false }) {
  return (
    <div className="flex items-center gap-0.5">
      <button
        onClick={(e) => { e.stopPropagation(); onUp(); }}
        disabled={disabled || index === 0}
        className="p-1 rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-30 disabled:pointer-events-none transition-colors"
        aria-label="Move up"
      >
        <ChevronUp className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onDown(); }}
        disabled={disabled || index === length - 1}
        className="p-1 rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-30 disabled:pointer-events-none transition-colors"
        aria-label="Move down"
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}