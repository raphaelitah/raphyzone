import { SlidersHorizontal, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const CATEGORIES = ['Conditioning', 'Mobility', 'Resistance', 'Skill / Power'];
const REGIONS = ['Core', 'Full Body', 'Lower Body', 'Upper Body'];
const PATTERN_GROUPS = {
  Push: ['Horizontal Push', 'Vertical Push', 'Elbow Extension', 'Shoulder Isolation'],
  Pull: ['Horizontal Pull', 'Vertical Pull', 'Elbow Flexion'],
  Core: ['Core - Anti-extension', 'Core - Extension', 'Core - Flexion', 'Core - Rotation', 'Carry'],
  Power: ['Olympic / Power', 'Full Body Complex', 'Jump / Plyometric', 'Locomotion / Cardio'],
  Leg: ['Squat', 'Hinge', 'Lunge / Step', 'Hip Isolation', 'Knee / Ankle Isolation'],
  Mobility: ['Mobility'],
};

const PATTERN_KEYS = Object.keys(PATTERN_GROUPS);

export function matchesPattern(exercise, patternKey) {
  if (patternKey === 'All') return true;
  return PATTERN_GROUPS[patternKey]?.includes(exercise.movement_pattern);
}

export default function LibraryFilters({ category, setCategory, region, setRegion, pattern, setPattern, onAdd, expanded, setExpanded }) {
  const activeCount = (category !== 'All' ? 1 : 0) + (region !== 'All' ? 1 : 0) + (pattern !== 'All' ? 1 : 0);

  const chipClass = (on) => cn('px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-colors',
    on ? 'bg-brand text-brand-foreground border-brand' : 'border-border text-muted-foreground');

  const clearAll = () => { setCategory('All'); setRegion('All'); setPattern('All'); };

  return (
    <div>
      <div className="flex items-center gap-2 py-1">
        <Button variant="outline" size="sm" onClick={() => setExpanded(!expanded)} className="gap-1.5 h-8 flex-1">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filters
          {activeCount > 0 && <span className="ml-0.5 bg-brand text-brand-foreground text-[10px] rounded-full px-1.5 py-0.5 leading-none">{activeCount}</span>}
        </Button>
        {onAdd && (
          <Button size="sm" onClick={onAdd} className="gap-1.5 h-8 flex-1 bg-brand hover:bg-brand/90 text-brand-foreground">
            <Plus className="h-3.5 w-3.5" />
            Add
          </Button>
        )}
        {activeCount > 0 && (
          <button onClick={clearAll} className="text-xs text-muted-foreground hover:text-foreground">Clear all</button>
        )}
      </div>

      {expanded && (
        <div className="pb-2 space-y-2.5">
          <FilterRow label="Category" value={category} options={CATEGORIES} onChange={setCategory} chipClass={chipClass} />
          <FilterRow label="Region" value={region} options={REGIONS} onChange={setRegion} chipClass={chipClass} />
          <FilterRow label="Pattern" value={pattern} options={PATTERN_KEYS} onChange={setPattern} chipClass={chipClass} />
        </div>
      )}
    </div>
  );
}

function FilterRow({ label, value, options, onChange, chipClass }) {
  return (
    <div>
      <p className="text-[10px] font-medium text-muted-foreground/70 mb-1.5 uppercase tracking-wide">{label}</p>
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
        <button onClick={() => onChange('All')} className={chipClass(value === 'All')}>All</button>
        {options.map((o) => (
          <button key={o} onClick={() => onChange(o)} className={chipClass(value === o)}>{o}</button>
        ))}
      </div>
    </div>
  );
}