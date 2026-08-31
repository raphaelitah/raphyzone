import { useEffect, useState } from 'react';
import { Loader2, Moon, Route, Check } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { mondayOf, fmtISO, fmtDate, parseDate } from '@/lib/fitness';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

export default function AddToPlanSheet({ workout, open, onOpenChange }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState(null);
  const [savingDay, setSavingDay] = useState(null);

  useEffect(() => {
    if (!open || !user) return;
    let active = true;
    setLoading(true);
    setPlan(null);
    (async () => {
      const monday = fmtISO(mondayOf(new Date()));
      const { data: plans } = await supabase
        .from('weekly_plans')
        .select('*')
        .eq('user_id', user.id)
        .eq('week_start_date', monday);
      if (!active) return;
      const currentPlan = (plans || []).find((p) => p.status === 'approved') || plans?.[0] || null;
      setPlan(currentPlan);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [open, user]);

  const addToDay = async (slot) => {
    if (!plan || !workout || savingDay) return;
    setSavingDay(slot.day);
    const updated = plan.workouts.map((w) => w.day === slot.day ? {
      ...w,
      slot_type: 'train',
      workout_id: workout.id,
      workout_name: workout.name,
      reason: 'Added from Workout Library',
      locked: false,
    } : w);
    try {
      await supabase.from('weekly_plans').update({ workouts: updated }).eq('id', plan.id);
      setPlan({ ...plan, workouts: updated });
      toast({ title: 'Added to your plan', description: `${workout.name} scheduled for ${slot.day}.` });
      onOpenChange(false);
    } catch {
      toast({ title: 'Something went wrong', description: 'Could not update your weekly plan.', variant: 'destructive' });
    } finally {
      setSavingDay(null);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl p-0 max-h-[85vh] overflow-y-auto">
        <SheetHeader className="px-5 pt-5 pb-3">
          <SheetTitle className="text-left">Add to weekly plan</SheetTitle>
          <SheetDescription className="text-left">
            {workout ? `Choose a day for "${workout.name}".` : 'Choose a day.'}
          </SheetDescription>
        </SheetHeader>
        <div className="px-5 pb-8">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !plan ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              You don't have a weekly plan yet. Build one first from the Home tab.
            </p>
          ) : (
            <div className="space-y-2">
              {(plan.workouts || []).map((slot) => {
                const isRest = slot.slot_type === 'rest';
                const isActivity = slot.slot_type === 'activity' && !slot.workout_id;
                const label = isRest ? 'Rest' : isActivity ? (slot.activity || 'Activity') : (slot.workout_name || 'Workout');
                const isCurrent = slot.workout_id === workout?.id && slot.slot_type === 'train';
                const saving = savingDay === slot.day;
                return (
                  <button
                    key={slot.day}
                    onClick={() => addToDay(slot)}
                    disabled={!!savingDay || isCurrent}
                    className={cn(
                      'w-full flex items-center gap-3 rounded-2xl border p-4 text-left transition-colors disabled:opacity-60',
                      isCurrent ? 'border-brand/40 bg-brand/5' : 'border-border hover:border-foreground/20'
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground">{slot.day} · {fmtDate(parseDate(slot.date), 'd MMM')}</p>
                      <p className="font-medium truncate flex items-center gap-1.5 mt-0.5">
                        {isRest && <Moon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                        {isActivity && <Route className="h-3.5 w-3.5 text-amber-600 shrink-0" />}
                        <span className="capitalize truncate">{label}</span>
                      </p>
                    </div>
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
                    ) : isCurrent ? (
                      <Check className="h-4 w-4 text-brand shrink-0" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
