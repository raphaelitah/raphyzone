import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import DurationInput from '@/components/DurationInput';
import { Loader2, ChevronLeft } from 'lucide-react';
import { DIFFICULTY_META, isRunningExercise, fmtISO } from '@/lib/fitness';
import { cn } from '@/lib/utils';
import {
  buildBlocksByWorkout,
  buildBlockExercisesByBlock,
  buildSetsByBlockExercise,
  buildExerciseMapByCode,
  buildFlatExerciseList,
} from '@/lib/workoutStructure';

const FIELD = 'w-full mt-1 rounded-xl border border-border bg-background px-4 h-10 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand';

const modeDifficulty = (values) => {
  const counts = {};
  values.forEach((v) => { counts[v] = (counts[v] || 0) + 1; });
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'normal';
};

// Logs a finished workout after the fact (no timer, no step-by-step execution):
// the athlete did it away from their phone and just wants the result on record.
export default function RecordResultForm({ workout, date, onBack, onRecorded }) {
  const { user } = useAuth();
  const [exercises, setExercises] = useState([]);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState({});
  const [totalSeconds, setTotalSeconds] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data: blocksData } = await supabase.from('workout_blocks').select('*').eq('workout_id', workout.workout_id);
        const blocks = blocksData || [];
        const blockIds = blocks.map((b) => b.block_id);
        const blockExs = blockIds.length ? (await supabase.from('block_exercises').select('*').in('block_id', blockIds)).data || [] : [];
        const exBlockExs = blockExs.filter((be) => be.step_type === 'exercise');
        const beIds = exBlockExs.map((be) => be.block_exercise_id);
        const codes = [...new Set(exBlockExs.map((be) => be.exercise_id).filter(Boolean))];
        const [{ data: sets }, { data: exs }] = await Promise.all([
          beIds.length ? supabase.from('prescribed_sets').select('*').in('block_exercise_id', beIds) : Promise.resolve({ data: [] }),
          codes.length ? supabase.from('exercises').select('*').in('exercise_code', codes) : Promise.resolve({ data: [] }),
        ]);
        if (!active) return;
        const list = buildFlatExerciseList(
          workout,
          buildBlocksByWorkout(blocks),
          buildBlockExercisesByBlock(blockExs),
          buildSetsByBlockExercise(sets || []),
          buildExerciseMapByCode(exs || []),
        );
        setExercises(list.map((e, i) => ({ ...e, key: `${e.exercise_id || 'ex'}-${i}` })));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [workout]);

  const update = (key, patch) => setLogs((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));

  const activeExercises = useMemo(() => exercises.filter((e) => !logs[e.key]?.skipped), [exercises, logs]);

  const save = async () => {
    if (!user || saving) return;
    setSaving(true);
    setError('');
    try {
      const entered = activeExercises.map((e) => logs[e.key] || {});
      const sumDuration = entered.reduce((acc, l) => acc + (l.duration_seconds || 0), 0);
      const difficulties = entered.map((l) => l.difficulty).filter(Boolean);
      const { data: session, error: sessErr } = await supabase.from('workout_sessions').insert({
        user_id: user.id, workout_id: workout.id, workout_name: workout.name,
        date: date || fmtISO(new Date()), status: 'completed',
        overall_difficulty: difficulties.length ? modeDifficulty(difficulties) : 'normal',
        elapsed_seconds: Math.round(totalSeconds ?? sumDuration),
      }).select().single();
      if (sessErr || !session) throw sessErr || new Error('Could not save');

      const rows = activeExercises.map((e) => {
        const log = logs[e.key] || {};
        return {
          user_id: user.id, workout_session_id: session.id, exercise_id: e.exercise_id, exercise_name: e.exercise_name,
          max_weight: log.bodyweight ? 0 : (log.max_weight ?? null), difficulty: log.difficulty || 'normal', note: log.note || '',
          sets: e.effective_sets ?? e.sets, reps: e.reps, target_weight: e.target_weight,
          distance_km: log.distance_km ?? null, duration_seconds: log.duration_seconds ?? null,
          elapsed_seconds: Math.round(log.duration_seconds || 0), order_index: e.order ?? null,
        };
      });
      if (rows.length) {
        const { error: exErr } = await supabase.from('exercise_sessions').insert(rows);
        if (exErr) {
          await supabase.from('workout_sessions').delete().eq('id', session.id);
          throw exErr;
        }
      }
      try { await supabase.functions.invoke('learnFromSessionFeedback', { body: { workout_session_id: session.id } }); } catch { /* best effort */ }
      onRecorded(session);
    } catch {
      setError('Could not save your result. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="px-5 pb-8 space-y-4">
      <button type="button" onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground -ml-1">
        <ChevronLeft className="h-4 w-4" /> Back
      </button>
      <p className="text-sm text-muted-foreground">Log what you did — no timer needed.</p>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 text-brand animate-spin" /></div>
      ) : (
        <>
          {exercises.map((e) => {
            const log = logs[e.key] || {};
            const running = isRunningExercise(e.details);
            const requiresWeight = !running && e.details?.requires_load !== false;
            return (
              <div key={e.key} className={cn('rounded-2xl border border-border p-4', log.skipped && 'opacity-60')}>
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-sm">{e.exercise_name}</p>
                  <button type="button" onClick={() => update(e.key, { skipped: !log.skipped })} className="text-xs font-medium text-brand shrink-0">
                    {log.skipped ? 'Include' : "Didn't do this"}
                  </button>
                </div>
                {!log.skipped && (
                  <div className="mt-3 space-y-3">
                    {running ? (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Distance (km)</label>
                          <input type="number" inputMode="decimal" value={log.distance_km ?? ''} placeholder="0" className={FIELD}
                            onChange={(ev) => update(e.key, { distance_km: ev.target.value === '' ? null : Math.max(0, Number(ev.target.value)) })} />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Time</label>
                          <DurationInput valueSeconds={log.duration_seconds} onChange={(sec) => update(e.key, { duration_seconds: sec })} />
                        </div>
                      </div>
                    ) : requiresWeight && (
                      <div>
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-medium text-muted-foreground">Max weight used (kg)</label>
                          <button type="button" onClick={() => update(e.key, log.bodyweight ? { bodyweight: false, max_weight: null } : { bodyweight: true, max_weight: 0 })}
                            className={cn('text-[10px] font-semibold px-2.5 py-1 rounded-full border transition-colors', log.bodyweight ? 'bg-brand text-brand-foreground border-brand' : 'border-border text-muted-foreground')}>
                            Bodyweight
                          </button>
                        </div>
                        {log.bodyweight ? (
                          <div className="w-full mt-1 rounded-xl border border-brand/30 bg-brand/5 px-4 py-2 text-sm font-semibold text-brand text-center">Bodyweight</div>
                        ) : (
                          <input type="number" inputMode="decimal" value={log.max_weight ?? ''} placeholder={e.target_weight ? String(e.target_weight) : '0'} className={FIELD}
                            onChange={(ev) => update(e.key, { max_weight: ev.target.value === '' ? null : Math.max(0, Number(ev.target.value)) })} />
                        )}
                      </div>
                    )}
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">How did it feel?</label>
                      <div className="grid grid-cols-4 gap-2 mt-1">
                        {Object.entries(DIFFICULTY_META).map(([val, meta]) => (
                          <button key={val} type="button" onClick={() => update(e.key, { difficulty: val })}
                            className={cn('h-10 rounded-xl border text-xs font-medium transition-all', log.difficulty === val ? meta.color + ' border-current' : 'border-border text-muted-foreground')}>
                            {meta.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <textarea value={log.note || ''} onChange={(ev) => update(e.key, { note: ev.target.value })} placeholder="Optional note…"
                      className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm min-h-[60px] focus:outline-none focus:ring-2 focus:ring-brand" />
                  </div>
                )}
              </div>
            );
          })}

          {!exercises.every((e) => isRunningExercise(e.details)) && (
            <div className="rounded-2xl border border-border p-4">
              <label className="text-xs font-medium text-muted-foreground">Total workout time (optional)</label>
              <DurationInput valueSeconds={totalSeconds} onChange={setTotalSeconds} />
            </div>
          )}

          {error && <p className="text-sm text-rose-600">{error}</p>}
          <Button onClick={save} disabled={saving} className="w-full rounded-xl h-12 bg-brand text-brand-foreground hover:bg-brand/90">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save result'}
          </Button>
        </>
      )}
    </div>
  );
}
