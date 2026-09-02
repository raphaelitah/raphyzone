import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { Clock, Loader2, Pencil, Save } from 'lucide-react';
import { parseISO, format } from 'date-fns';
import { DIFFICULTY_META } from '@/lib/fitness';
import { cn } from '@/lib/utils';
import { buildBlocksByWorkout, buildBlockExercisesByBlock } from '@/lib/workoutStructure';

const CHART_COLORS = ['hsl(var(--brand))', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#ef4444'];

function fmtDateDDMM(iso) {
  try { return format(parseISO(iso), 'dd/MM/yyyy'); } catch { return iso || ''; }
}
function fmtDuration(sec) {
  const s = Math.floor(sec || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${m}:${String(ss).padStart(2, '0')}`;
}
function sessionDurationSeconds(exerciseSessions) {
  const total = (exerciseSessions || []).reduce((sum, es) => sum + (es.duration_seconds ?? es.elapsed_seconds ?? 0), 0);
  return total > 0 ? total : null;
}
function modeDifficulty(arr) {
  const count = {};
  arr.forEach((d) => { if (d) count[d] = (count[d] || 0) + 1; });
  return Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0] || 'normal';
}

export default function SessionDetailSheet({ session, open, onOpenChange, editable = false, onSaved = null }) {
  const [loading, setLoading] = useState(false);
  const [exerciseSessions, setExerciseSessions] = useState([]);
  const [history, setHistory] = useState([]);
  const [chartData, setChartData] = useState([]);
  const [chartKeys, setChartKeys] = useState([]);
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState({});
  const [saving, setSaving] = useState(false);
  const [blocks, setBlocks] = useState([]);
  const [blockExercisesByBlock, setBlockExercisesByBlock] = useState({});

  useEffect(() => {
    if (!open) { setEditing(false); setDrafts({}); }
  }, [open]);

  useEffect(() => {
    if (!open || !session) return;
    let active = true;
    setLoading(true);
    setExerciseSessions([]);
    setHistory([]);
    setChartData([]);
    setChartKeys([]);
    setBlocks([]);
    setBlockExercisesByBlock({});
    (async () => {
      try {
        const [{ data: thisEsData }, { data: workoutRow }] = await Promise.all([
          supabase.from('exercise_sessions').select('*').eq('workout_session_id', session.id),
          supabase.from('workouts').select('workout_id').eq('id', session.workout_id).maybeSingle(),
        ]);
        const thisEs = (thisEsData || []).slice().sort((a, b) => {
          if (a.order_index == null && b.order_index == null) return 0;
          if (a.order_index == null) return 1;
          if (b.order_index == null) return -1;
          return a.order_index - b.order_index;
        });
        if (!active) return;
        setExerciseSessions(thisEs);

        const textWorkoutId = workoutRow?.workout_id || null;
        if (textWorkoutId) {
          const { data: blocksData } = await supabase.from('workout_blocks').select('*').eq('workout_id', textWorkoutId);
          const blocksList = blocksData || [];
          const blockIds = blocksList.map((b) => b.block_id);
          const blockExsData = blockIds.length
            ? (await supabase.from('block_exercises').select('*').in('block_id', blockIds)).data || []
            : [];
          if (!active) return;
          setBlocks((buildBlocksByWorkout(blocksList))[textWorkoutId] || []);
          setBlockExercisesByBlock(buildBlockExercisesByBlock(blockExsData));
        }

        const { data: allSessionsData } = await supabase
          .from('workout_sessions')
          .select('*')
          .eq('user_id', session.user_id)
          .eq('workout_id', session.workout_id)
          .eq('status', 'completed')
          .order('date')
          .limit(200);
        const allSessions = allSessionsData || [];
        if (!active) return;
        const sessionIds = allSessions.map((s) => s.id);
        const allEs = sessionIds.length
          ? (await supabase.from('exercise_sessions').select('*').in('workout_session_id', sessionIds)).data || []
          : [];
        if (!active) return;

        const esBySession = {};
        allEs.forEach((es) => {
          (esBySession[es.workout_session_id] = esBySession[es.workout_session_id] || []).push(es);
        });
        const sortedSessions = allSessions.slice().sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        setHistory(sortedSessions.map((s) => ({ session: s, exerciseSessions: esBySession[s.id] || [] })));

        const exerciseMap = {};
        allEs.forEach((es) => {
          if (!exerciseMap[es.exercise_id]) exerciseMap[es.exercise_id] = { id: es.exercise_id, name: es.exercise_name, metric: 'time' };
          if (es.max_weight > 0) exerciseMap[es.exercise_id].metric = 'weight';
          else if (es.distance_km > 0 && exerciseMap[es.exercise_id].metric !== 'weight') exerciseMap[es.exercise_id].metric = 'distance';
        });
        const keys = Object.values(exerciseMap);
        setChartKeys(keys);

        const data = sortedSessions.map((s) => {
          const row = { date: fmtDateDDMM(s.date) };
          const sessEs = esBySession[s.id] || [];
          keys.forEach((k) => {
            const es = sessEs.find((e) => e.exercise_id === k.id);
            if (!es) return;
            if (k.metric === 'weight') row[k.name] = es.max_weight || 0;
            else if (k.metric === 'distance') row[k.name] = es.distance_km || 0;
            else row[k.name] = Math.round(((es.duration_seconds ?? es.elapsed_seconds ?? 0) / 60) * 10) / 10;
          });
          return row;
        });
        setChartData(data);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [open, session]);

  const startEdit = () => {
    const d = {};
    exerciseSessions.forEach((es) => {
      d[es.id] = {
        max_weight: es.max_weight ?? null,
        bodyweight: es.max_weight === 0,
        distance_km: es.distance_km ?? null,
        duration_seconds: es.duration_seconds ?? null,
        difficulty: es.difficulty || 'normal',
        note: es.note || '',
        elapsed_seconds: es.elapsed_seconds ?? 0,
      };
    });
    setDrafts(d);
    setEditing(true);
  };

  const setDraft = (id, patch) => setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }));

  const save = async () => {
    setSaving(true);
    try {
      const updated = [];
      for (const es of exerciseSessions) {
        const dr = drafts[es.id];
        if (!dr) { updated.push(es); continue; }
        const payload = {
          max_weight: dr.bodyweight ? 0 : (dr.max_weight === '' ? null : dr.max_weight),
          distance_km: dr.distance_km === '' ? null : dr.distance_km,
          duration_seconds: dr.duration_seconds === '' ? null : dr.duration_seconds,
          difficulty: dr.difficulty || 'normal',
          note: dr.note || '',
          elapsed_seconds: Math.round(dr.elapsed_seconds || 0),
        };
        await supabase.from('exercise_sessions').update(payload).eq('id', es.id);
        updated.push({ ...es, ...payload });
      }
      setExerciseSessions(updated);
      const diffs = updated.map((e) => e.difficulty).filter(Boolean);
      const overall = modeDifficulty(diffs);
      await supabase.from('workout_sessions').update({ overall_difficulty: overall }).eq('id', session.id);
      setEditing(false);
      onSaved?.({ ...session, overall_difficulty: overall });
    } finally { setSaving(false); }
  };

  const yAxisDomain = (() => {
    const values = chartData.flatMap((row) => chartKeys.map((k) => row[k.name]).filter((v) => typeof v === 'number'));
    if (!values.length) return [0, 'auto'];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const padding = (max - min) * 0.15 || max * 0.1 || 1;
    return [Math.max(0, min - padding), max + padding];
  })();

  if (!session) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[85vh] overflow-y-auto">
        <SheetHeader className="px-5 pt-5 pr-12">
          <div className="flex items-start justify-between gap-2">
            <div>
              <SheetTitle className="text-xl text-left">{session.workout_name}</SheetTitle>
              <p className="text-sm text-muted-foreground text-left">{session.date ? fmtDateDDMM(session.date) : ''}</p>
            </div>
            {editable && !editing && (
              <Button variant="outline" size="sm" onClick={startEdit} className="shrink-0">
                <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
              </Button>
            )}
            {editable && editing && (
              <Button size="sm" onClick={save} disabled={saving} className="shrink-0 bg-brand text-brand-foreground">
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />} Save
              </Button>
            )}
          </div>
        </SheetHeader>
        <div className="px-5 pb-8 space-y-5">
          <div className="flex flex-wrap gap-2">
            {session.elapsed_seconds != null && (
              <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-muted text-muted-foreground">
                <Clock className="h-3 w-3" /> {fmtDuration(session.elapsed_seconds)}
              </span>
            )}
            {session.overall_difficulty && (
              <span className={cn('text-xs font-medium px-2.5 py-1 rounded-full', DIFFICULTY_META[session.overall_difficulty]?.color)}>
                {DIFFICULTY_META[session.overall_difficulty]?.label}
              </span>
            )}
          </div>

          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Exercises</p>
            {loading ? (
              <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 text-brand animate-spin" /></div>
            ) : editing ? (
              exerciseSessions.length ? (
                <div className="space-y-2">
                  {exerciseSessions.map((es, i) => (
                    <EditableExerciseRow key={es.id || i} es={es} draft={drafts[es.id] || {}} onChange={(patch) => setDraft(es.id, patch)} />
                  ))}
                </div>
              ) : <p className="text-sm text-muted-foreground text-center py-4">No exercise data logged.</p>
            ) : exerciseSessions.length ? (
              <BlockGroupedExercises blocks={blocks} blockExercisesByBlock={blockExercisesByBlock} exerciseSessions={exerciseSessions} />
            ) : <p className="text-sm text-muted-foreground text-center py-4">No exercise data logged.</p>}
          </div>

          {history.length > 1 && chartKeys.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">History · {history.length} sessions</p>
              <Card className="rounded-2xl border-border p-4">
                <div className="h-48 -ml-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                      <YAxis domain={yAxisDomain} allowDecimals tickFormatter={(v) => Number(v.toFixed(2))} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} width={36} />
                      <Tooltip
                        contentStyle={{ borderRadius: 12, border: '1px solid hsl(var(--border))', fontSize: 12 }}
                        formatter={(value, name) => {
                          const k = chartKeys.find((ck) => ck.name === name);
                          if (k?.metric === 'distance') return `${value} km`;
                          if (k?.metric === 'time') return `${value} min`;
                          return value;
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                      {chartKeys.map((k, i) => (
                        <Line key={k.id} type="monotone" dataKey={k.name} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2} dot={{ r: 3 }} />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Card>
              <div className="mt-3 space-y-2">
                {history.slice().reverse().map((h) => (
                  <Card key={h.session.id} className="rounded-xl border-border p-3 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">{fmtDateDDMM(h.session.date)}</p>
                      <p className="text-[10px] text-muted-foreground">{h.exerciseSessions.length} exercises</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {sessionDurationSeconds(h.exerciseSessions) != null && <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Clock className="h-3 w-3" />{fmtDuration(sessionDurationSeconds(h.exerciseSessions))}</span>}
                      {h.session.overall_difficulty && <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded-full', DIFFICULTY_META[h.session.overall_difficulty]?.color)}>{DIFFICULTY_META[h.session.overall_difficulty]?.label}</span>}
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// Pairs each logged exercise_session up with its block_exercise (matched by
// exercise_id, consumed in block/order_in_block sequence) so history can be
// grouped exactly like the library view. Anything left unmatched (e.g. a
// substituted exercise) is returned separately and rendered without a block.
function groupSessionsByBlock(blocks, blockExercisesByBlock, exerciseSessions) {
  const remaining = exerciseSessions.slice();
  const groups = [];
  blocks.forEach((block) => {
    const blockExs = (blockExercisesByBlock[block.block_id] || []).filter((be) => be.step_type === 'exercise');
    const items = [];
    blockExs.forEach((be) => {
      const idx = remaining.findIndex((es) => es.exercise_id === be.exercise_id);
      if (idx !== -1) {
        items.push(remaining[idx]);
        remaining.splice(idx, 1);
      }
    });
    if (items.length) groups.push({ block, items });
  });
  return { groups, leftover: remaining };
}

function BlockGroupedExercises({ blocks, blockExercisesByBlock, exerciseSessions }) {
  const { groups, leftover } = groupSessionsByBlock(blocks, blockExercisesByBlock, exerciseSessions);

  if (!groups.length) {
    return (
      <div className="space-y-2">
        {exerciseSessions.map((es, i) => <ExercisePerformanceRow key={es.id || i} es={es} />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map(({ block, items }) => (
        <div key={block.block_id}>
          <div className="flex items-center gap-2 mb-2">
            <span className="h-6 w-6 rounded-full bg-brand text-brand-foreground text-xs font-semibold flex items-center justify-center">
              {block.block_label}
            </span>
            <span className="text-xs font-medium text-muted-foreground capitalize">
              {block.block_type?.replace(/_/g, ' ')}
            </span>
            {block.rounds > 1 && <span className="text-xs text-muted-foreground">· {block.rounds} rounds</span>}
          </div>
          <div className="relative ml-8">
            {items.length > 1 && <div className="absolute left-3 top-6 bottom-6 w-px bg-border" />}
            {items.map((es, index) => {
              const stepLabel = items.length > 1 ? `${block.block_label}${index + 1}` : null;
              return (
                <div key={es.id} className="flex items-center gap-2 mb-2 last:mb-0">
                  {stepLabel && (
                    <span className="relative z-10 shrink-0 w-6 text-center text-[10px] font-semibold text-purple-700 bg-purple-100 rounded px-1 py-0.5">{stepLabel}</span>
                  )}
                  <ExercisePerformanceRow es={es} className="flex-1 min-w-0" />
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {leftover.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Other</p>
          <div className="space-y-2">
            {leftover.map((es, i) => <ExercisePerformanceRow key={es.id || i} es={es} />)}
          </div>
        </div>
      )}
    </div>
  );
}

function ExercisePerformanceRow({ es, className = '' }) {
  return (
    <Card className={cn('rounded-xl border-border p-3', className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium truncate">{es.exercise_name}</p>
        <div className="flex items-center gap-2 shrink-0">
          {es.distance_km != null ? (
            <span className="text-sm font-semibold">{es.distance_km}km</span>
          ) : es.max_weight > 0 ? (
            <span className="text-sm font-semibold">{es.max_weight}kg</span>
          ) : es.max_weight === 0 ? (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-brand/10 text-brand">Bodyweight</span>
          ) : null}
          {es.duration_seconds != null ? (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Clock className="h-3 w-3" />{fmtDuration(es.duration_seconds)}</span>
          ) : es.elapsed_seconds != null && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Clock className="h-3 w-3" />{fmtDuration(es.elapsed_seconds)}</span>
          )}
        </div>
      </div>
      {es.difficulty && (
        <span className={cn('inline-block mt-1.5 text-[10px] font-medium px-2 py-0.5 rounded-full', DIFFICULTY_META[es.difficulty]?.color)}>{DIFFICULTY_META[es.difficulty]?.label}</span>
      )}
      {es.note && <p className="text-xs text-muted-foreground mt-1.5">{es.note}</p>}
    </Card>
  );
}

function EditableExerciseRow({ es, draft, onChange }) {
  return (
    <Card className="rounded-xl border-border p-3 space-y-2.5">
      <p className="text-sm font-medium truncate">{es.exercise_name}</p>
      {es.distance_km != null || es.duration_seconds != null ? (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[11px] text-muted-foreground">Distance (km)</label>
            <input type="number" inputMode="decimal" value={draft.distance_km ?? ''} onChange={(e) => onChange({ distance_km: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) })} placeholder="0" className="w-full mt-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground">Time (min)</label>
            <input type="number" inputMode="decimal" value={draft.duration_seconds != null ? draft.duration_seconds / 60 : ''} onChange={(e) => onChange({ duration_seconds: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) * 60 })} placeholder="0" className="w-full mt-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
          </div>
        </div>
      ) : (
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[11px] text-muted-foreground">Weight (kg)</label>
            <button type="button" onClick={() => onChange(draft.bodyweight ? { bodyweight: false, max_weight: null } : { bodyweight: true, max_weight: 0 })} className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full border', draft.bodyweight ? 'bg-brand text-brand-foreground border-brand' : 'border-border text-muted-foreground')}>Bodyweight</button>
          </div>
          {draft.bodyweight ? (
            <div className="w-full rounded-lg border border-brand/30 bg-brand/5 px-3 py-2 text-sm font-semibold text-brand text-center">Bodyweight</div>
          ) : (
            <input type="number" inputMode="decimal" value={draft.max_weight ?? ''} onChange={(e) => onChange({ max_weight: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) })} placeholder="0" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
          )}
        </div>
      )}
      <div>
        <label className="text-[11px] text-muted-foreground">Difficulty</label>
        <div className="grid grid-cols-4 gap-1.5 mt-1">
          {Object.entries(DIFFICULTY_META).map(([val, meta]) => (
            <button key={val} type="button" onClick={() => onChange({ difficulty: val })} className={cn('py-1.5 rounded-lg border text-[10px] font-medium', draft.difficulty === val ? meta.color + ' border-current' : 'border-border text-muted-foreground')}>{meta.label}</button>
          ))}
        </div>
      </div>
      <div>
        <label className="text-[11px] text-muted-foreground">Time (min)</label>
        <input type="number" inputMode="numeric" value={draft.elapsed_seconds ? Math.round(draft.elapsed_seconds / 60) : ''} onChange={(e) => onChange({ elapsed_seconds: e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)) * 60 })} placeholder="0" className="w-full mt-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
      </div>
      <textarea value={draft.note || ''} onChange={(e) => onChange({ note: e.target.value })} placeholder="Note…" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs min-h-[44px] focus:outline-none focus:ring-2 focus:ring-brand" />
    </Card>
  );
}