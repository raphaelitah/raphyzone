import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { FINISHER_ROUND_OPTIONS, normalizeFinisherRounds, finisherMinutes } from '@/lib/coreFinisher';

export default function ProfileCoreFinisher({ form, setForm }) {
  const enabled = form.core_finisher_enabled === true;
  const rounds = normalizeFinisherRounds(form.core_finisher_rounds);

  return (
    <div className="rounded-xl border border-border p-4 space-y-4" data-testid="core-finisher-settings">
      <div className="flex items-center justify-between">
        <div className="pr-3">
          <p className="text-sm font-medium">Core finisher</p>
          <p className="text-[11px] text-muted-foreground/70 mt-0.5">
            An optional bodyweight abs routine offered after each workout: 40s on, 20s off, ending with a 1-minute plank. It's never part of your logged session, and you can skip it every time.
          </p>
        </div>
        <Switch
          aria-label="Offer a core finisher after workouts"
          checked={enabled}
          onCheckedChange={(v) => setForm((f) => ({ ...f, core_finisher_enabled: v }))}
        />
      </div>

      {enabled && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground">Length</span>
            <span className="text-xs font-semibold text-brand">{finisherMinutes(rounds)} min</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {FINISHER_ROUND_OPTIONS.map((r) => (
              <button
                key={r}
                onClick={() => setForm((f) => ({ ...f, core_finisher_rounds: r }))}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                  rounds === r ? 'bg-brand text-brand-foreground border-brand' : 'border-border text-muted-foreground hover:bg-muted/50',
                )}
              >
                {finisherMinutes(r)} min
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground/70 mt-1.5">
            {rounds} rounds of 40s on / 20s off, plus a final 1-minute plank. The exercises rotate so it doesn't get stale.
          </p>
        </div>
      )}
    </div>
  );
}
