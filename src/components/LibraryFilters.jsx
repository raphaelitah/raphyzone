import { SlidersHorizontal } from 'lucide-react';
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

export default function LibraryFilters({ category, setCategory, region, setRegion, pattern, setPattern, expanded, setExpanded }) {
  const moreCount = (category !== 'All' ? 1 : 0) + (pattern !== 'All' ? 1 : 0);

  const chipClass = (on) => cn('px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-colors',
    on ? 'bg-brand text-brand-foreground border-brand' : 'border-border text-muted-foreground');

  const clearMore = () => { setCategory('All'); setPattern('All'); };

  return (
    <div className="space-y-2">
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
        <button onClick={() => setRegion('All')} className={chipClass(region === 'All')}>All regions</button>
        {REGIONS.map((r) => (
          <button key={r} onClick={() => setRegion(r)} className={chipClass(region === r)}>{r}</button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setExpanded(!expanded)} className="gap-1.5 h-8">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          {expanded ? 'Less filters' : 'More filters'}
          {moreCount > 0 && <span className="ml-0.5 bg-brand text-brand-foreground text-[10px] rounded-full px-1.5 py-0.5 leading-none">{moreCount}</span>}
        </Button>
        {moreCount > 0 && (
          <button onClick={clearMore} className="text-xs text-muted-foreground hover:text-foreground">Clear</button>
        )}
      </div>

      {expanded && (
        <div className="pb-2 space-y-2.5">
          <FilterRow label="Category" value={category} options={CATEGORIES} onChange={setCategory} chipClass={chipClass} />
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
