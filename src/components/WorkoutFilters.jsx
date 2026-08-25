import { SlidersHorizontal, Footprints } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { WORKOUT_CATEGORIES, WORKOUT_FORMATS } from '@/lib/fitness';

const DIFFICULTIES = ['Beginner', 'Intermediate', 'Advanced'];

// Group WORKOUT_FORMATS by label so e.g. strength_sets/superset both surface as one "Bodybuilding" chip.
const WORKOUT_TYPES = Object.values(
  WORKOUT_FORMATS.reduce((acc, { value, label }) => {
    acc[label] = acc[label] || { label, values: [] };
    acc[label].values.push(value);
    return acc;
  }, {})
);

export default function WorkoutFilters({ region, setRegion, running, setRunning, difficulty, setDifficulty, workoutType, setWorkoutType, expanded, setExpanded }) {
  const moreCount = (difficulty !== 'All' ? 1 : 0) + (workoutType !== 'All' ? 1 : 0);

  const chipClass = (on) => cn('px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-colors',
    on ? 'bg-brand text-brand-foreground border-brand' : 'border-border text-muted-foreground');

  const clearMore = () => { setDifficulty('All'); setWorkoutType('All'); };

  return (
    <div className="space-y-2">
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
        <button onClick={() => { setRegion('All'); setRunning(false); }} className={chipClass(!running && region === 'All')}>All regions</button>
        {WORKOUT_CATEGORIES.map((r) => (
          <button key={r} onClick={() => { setRegion(r); setRunning(false); }} className={chipClass(!running && region === r)}>{r}</button>
        ))}
        <button
          onClick={() => { setRunning(!running); setRegion('All'); }}
          className={cn(chipClass(running), 'flex items-center gap-1')}
        >
          <Footprints className="h-3.5 w-3.5" /> Running
        </button>
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
        <div className="pb-2 space-y-2">
          <div>
            <p className="text-[10px] font-medium text-muted-foreground/70 mb-1.5 uppercase tracking-wide">Difficulty</p>
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
              <button onClick={() => setDifficulty('All')} className={chipClass(difficulty === 'All')}>All</button>
              {DIFFICULTIES.map((d) => (
                <button key={d} onClick={() => setDifficulty(d)} className={chipClass(difficulty === d)}>{d}</button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] font-medium text-muted-foreground/70 mb-1.5 uppercase tracking-wide">Type</p>
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
              <button onClick={() => setWorkoutType('All')} className={chipClass(workoutType === 'All')}>All</button>
              {WORKOUT_TYPES.map((t) => (
                <button key={t.label} onClick={() => setWorkoutType(t.label)} className={chipClass(workoutType === t.label)}>{t.label}</button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
