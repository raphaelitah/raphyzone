import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Plus, X } from 'lucide-react';
import { DESIRED_ACTIVITY_OPTIONS } from '@/lib/fitness';
import { cn } from '@/lib/utils';

export default function ProfileDesiredActivities({ form, setForm }) {
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState({ day: '', activity: '' });

  const activities = form.desired_activities || [];
  const trainingDays = form.training_days || [];

  const chipClass = (on) =>
    cn('px-3 py-2 rounded-full text-xs font-medium border transition-colors',
      on ? 'bg-brand text-brand-foreground border-transparent' : 'border-border text-muted-foreground');

  const addActivity = () => {
    if (!draft.day || !draft.activity) return;
    setForm((f) => ({
      ...f,
      desired_activities: [...(f.desired_activities || []), { day: draft.day, activity: draft.activity }],
    }));
    setDraft({ day: '', activity: '' });
    setShowForm(false);
  };

  const removeActivity = (i) =>
    setForm((f) => ({
      ...f,
      desired_activities: (f.desired_activities || []).filter((_, idx) => idx !== i),
    }));

  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground">Desired activities</label>
      <p className="text-[11px] text-muted-foreground/70 mb-2">Tell us what type of workout you'd like on each training day.</p>

      {activities.length > 0 && (
        <div className="space-y-1.5 mb-3">
          {activities.map((a, i) => (
            <div key={i} className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2">
              <div className="text-xs">
                <span className="font-medium text-brand">{a.activity}</span>
                <span className="text-muted-foreground"> · {a.day.slice(0, 3)}</span>
              </div>
              <button onClick={() => removeActivity(i)} className="text-muted-foreground hover:text-destructive">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {showForm ? (
        <div className="rounded-xl border border-border p-3 space-y-3 bg-card">
          {trainingDays.length === 0 ? (
            <p className="text-[11px] text-muted-foreground/70">Select training days above first.</p>
          ) : (
            <>
              <div>
                <p className="text-[11px] text-muted-foreground mb-1.5">Day</p>
                <div className="flex flex-wrap gap-1.5">
                  {trainingDays.map((d) => (
                    <button key={d} onClick={() => setDraft((s) => ({ ...s, day: d }))} className={chipClass(draft.day === d)}>
                      {d.slice(0, 3)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground mb-1.5">Activity</p>
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                  {DESIRED_ACTIVITY_OPTIONS.map((a) => (
                    <button key={a} onClick={() => setDraft((s) => ({ ...s, activity: a }))} className={chipClass(draft.activity === a)}>
                      {a}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={addActivity} disabled={!draft.day || !draft.activity} className="flex-1">Add activity</Button>
            <Button variant="ghost" size="sm" onClick={() => { setShowForm(false); setDraft({ day: '', activity: '' }); }}>Cancel</Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setShowForm(true)} className="w-full">
          <Plus className="h-4 w-4" /> Add a desired activity
        </Button>
      )}
    </div>
  );
}