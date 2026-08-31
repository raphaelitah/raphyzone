import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { Card } from '@/components/ui/card';
import { ChevronLeft, ChevronRight, CheckCircle2, Clock, Dumbbell, Route, Moon, CalendarDays } from 'lucide-react';
import { mondayOf, nextMonday, fmtISO, fmtDate, parseDate, sameDay } from '@/lib/fitness';
import { buildBlocksByWorkout, buildBlockExercisesByBlock, countWorkoutExercises, roundToFive } from '@/lib/workoutStructure';
import { cn } from '@/lib/utils';
import WorkoutDetailSheet from '@/components/WorkoutDetailSheet';
import SessionDetailSheet from '@/components/SessionDetailSheet';

export default function PlanHistory() {
  const { user } = useAuth();
  const { weekStart } = useParams();
  const navigate = useNavigate();
  const currentMonday = fmtISO(mondayOf(new Date()));
  const activeWeek = weekStart || fmtISO(mondayOf(new Date(Date.now() - 7 * 86400000)));

  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [workouts, setWorkouts] = useState({});
  const [blocksByWorkout, setBlocksByWorkout] = useState({});
  const [blockExercisesByBlock, setBlockExercisesByBlock] = useState({});
  const [selectedWorkout, setSelectedWorkout] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [sessionDetail, setSessionDetail] = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!user) return;
      setLoading(true);
      const weekEnd = fmtISO(nextMonday(parseDate(activeWeek)));
      const [{ data: plans }, { data: weekSessions }] = await Promise.all([
        supabase.from('weekly_plans').select('*').eq('user_id', user.id).eq('week_start_date', activeWeek),
        supabase.from('workout_sessions').select('*').eq('user_id', user.id).gte('date', activeWeek).lt('date', weekEnd).eq('status', 'completed'),
      ]);
      if (!active) return;
      const weekPlan = (plans || []).find((p) => p.status === 'approved') || plans?.[0] || null;
      setPlan(weekPlan);
      setSessions(weekSessions || []);
      setWorkouts({});
      setBlocksByWorkout({});
      setBlockExercisesByBlock({});
      setLoading(false);

      if (weekPlan?.workouts?.length) {
        const assignedIds = new Set(weekPlan.workouts.map((w) => w.workout_id).filter(Boolean));
        if (assignedIds.size) {
          const { data: ws } = await supabase.from('workouts').select('*').in('id', [...assignedIds]);
          if (!active) return;
          setWorkouts(Object.fromEntries((ws || []).map((w) => [w.id, w])));
          const codes = [...new Set((ws || []).map((w) => w.workout_id).filter(Boolean))];
          if (codes.length) {
            const { data: blocksData } = await supabase.from('workout_blocks').select('*').in('workout_id', codes);
            const blocks = blocksData || [];
            const blockIds = blocks.map((b) => b.block_id);
            const blockExs = blockIds.length
              ? (await supabase.from('block_exercises').select('*').in('block_id', blockIds)).data || []
              : [];
            if (!active) return;
            setBlocksByWorkout(buildBlocksByWorkout(blocks));
            setBlockExercisesByBlock(buildBlockExercisesByBlock(blockExs));
          }
        }
      }
    })();
    return () => { active = false; };
  }, [user, activeWeek]);

  const goToWeek = (iso) => navigate(`/plan-history/${iso}`);
  const goPrev = () => goToWeek(fmtISO(new Date(parseDate(activeWeek).getTime() - 7 * 86400000)));
  const goNext = () => goToWeek(fmtISO(nextMonday(parseDate(activeWeek))));
  const isCurrentOrFutureWeek = activeWeek >= currentMonday;

  const weekLabel = `${fmtDate(parseDate(activeWeek), 'd MMM')} – ${fmtDate(new Date(parseDate(activeWeek).getTime() + 6 * 86400000), 'd MMM')}`;

  return (
    <div className="px-5 pt-10">
      <header className="mb-6">
        <p className="text-sm text-muted-foreground flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" /> Plan history</p>
        <h1 className="text-2xl font-semibold tracking-tight mt-0.5">Previous weeks</h1>
      </header>

      <div className="flex items-center justify-between mb-6">
        <button onClick={goPrev} className="p-2 rounded-xl border border-border hover:border-foreground/20 transition-colors" aria-label="Previous week">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="text-center">
          <p className="font-semibold">{weekLabel}</p>
          {activeWeek === currentMonday && <p className="text-xs text-muted-foreground mt-0.5">This week</p>}
        </div>
        <button
          onClick={goNext}
          disabled={isCurrentOrFutureWeek}
          className="p-2 rounded-xl border border-border hover:border-foreground/20 transition-colors disabled:opacity-30 disabled:pointer-events-none"
          aria-label="Next week"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-muted border-t-brand rounded-full animate-spin" />
        </div>
      ) : !plan ? (
        <Card className="rounded-2xl border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">No plan was built for this week.</p>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {plan.workouts?.map((slot, i) => {
            const done = !!slot.workout_id && sessions.some((s) => s.workout_id === slot.workout_id && sameDay(parseDate(s.date), parseDate(slot.date)));
            const doneSession = done ? sessions.find((s) => s.workout_id === slot.workout_id && sameDay(parseDate(s.date), parseDate(slot.date))) : null;

            if (slot.slot_type === 'rest') {
              return (
                <Card key={i} className="rounded-2xl border-border bg-muted/30 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Moon className="h-4 w-4" />
                      <p className="font-medium">Rest</p>
                    </div>
                    <span className="text-[10px] font-medium text-muted-foreground whitespace-nowrap">{slot.day.slice(0, 3)} · {fmtDate(parseDate(slot.date), 'd MMM')}</span>
                  </div>
                </Card>
              );
            }

            if (slot.slot_type === 'activity' && !slot.workout_id) {
              return (
                <Card key={i} className="rounded-2xl border border-amber-200/60 bg-amber-50/30 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate capitalize flex items-center gap-1.5">
                        <Route className="h-4 w-4 text-amber-600 shrink-0" />
                        {slot.activity || 'Activity'}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">Activity day</p>
                    </div>
                    <span className="text-[10px] font-medium text-muted-foreground whitespace-nowrap shrink-0">{slot.day.slice(0, 3)} · {fmtDate(parseDate(slot.date), 'd MMM')}</span>
                  </div>
                </Card>
              );
            }

            const wo = workouts[slot.workout_id];
            const exCount = wo ? countWorkoutExercises(wo, blocksByWorkout, blockExercisesByBlock) : 0;
            const isGuidedActivity = slot.slot_type === 'activity';
            return (
              <button
                key={i}
                onClick={() => { if (doneSession) { setSessionDetail(doneSession); } else { setSelectedWorkout(wo || null); setSelectedSlot(slot); } }}
                className="w-full text-left"
              >
                <Card className={cn('rounded-2xl border p-4 transition-colors', done ? 'border-brand/30 bg-brand/5' : isGuidedActivity ? 'border-amber-200/60 bg-amber-50/30' : 'border-border')}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {isGuidedActivity && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-700 bg-amber-100 rounded px-1.5 py-0.5 capitalize shrink-0"><Route className="h-3 w-3" />{slot.activity}</span>
                        )}
                        <p className="font-semibold truncate">{wo?.name || slot.workout_name}</p>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{slot.modality || wo?.format_label || 'Workout'}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-[10px] font-medium text-muted-foreground whitespace-nowrap">{slot.day.slice(0, 3)} · {fmtDate(parseDate(slot.date), 'd MMM')}</span>
                      {done && <CheckCircle2 className="h-4 w-4 text-brand" />}
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    <div className="flex items-center gap-4 text-xs text-muted-foreground min-w-0">
                      <span className="flex items-center gap-1 shrink-0"><Clock className="h-3.5 w-3.5" />{roundToFive(wo?.est_duration_min) || '~45'} min</span>
                      <span className="flex items-center gap-1 shrink-0"><Dumbbell className="h-3.5 w-3.5" />{exCount} {exCount === 1 ? 'Exercise' : 'Exercises'}</span>
                      {wo?.workout_category && <span className="capitalize truncate">{wo.workout_category}</span>}
                    </div>
                  </div>
                </Card>
              </button>
            );
          })}
        </div>
      )}

      <WorkoutDetailSheet
        workout={selectedWorkout}
        open={!!selectedWorkout}
        onOpenChange={(o) => { if (!o) { setSelectedWorkout(null); setSelectedSlot(null); } }}
        contextLine={selectedSlot ? `${selectedSlot.day} · ${fmtDate(parseDate(selectedSlot.date), 'd MMM')}` : null}
        reason={selectedSlot?.reason}
        startDate={selectedSlot?.date}
      />

      <SessionDetailSheet
        session={sessionDetail}
        open={!!sessionDetail}
        onOpenChange={(o) => { if (!o) setSessionDetail(null); }}
        onSaved={(updated) => {
          setSessionDetail(updated);
          setSessions((prev) => prev.map((s) => s.id === updated.id ? updated : s));
        }}
      />
    </div>
  );
}
