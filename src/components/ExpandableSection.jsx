import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ExpandableSection({ title, expanded, onToggle, canToggle, moreCount, children }) {
  return (
    <div>
      <button
        onClick={() => canToggle && onToggle()}
        className={cn('w-full flex items-center justify-between mb-2', canToggle && 'cursor-pointer group')}
        data-state={expanded ? 'open' : 'closed'}
        disabled={!canToggle}
      >
        {title}
        {canToggle && (
          <span className="flex items-center gap-1 text-xs font-medium text-brand">
            {expanded ? 'See less' : `See more (${moreCount})`}
            <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
          </span>
        )}
      </button>
      {children}
    </div>
  );
}
