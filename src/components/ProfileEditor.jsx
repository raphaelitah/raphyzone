import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Search, X, Plus } from 'lucide-react';
import {
  GOALS, SECONDARY_GOAL_OPTIONS, BODY_FOCUS_OPTIONS, PERFORMANCE_FOCUS_OPTIONS,
  EXPERIENCE_LEVELS, TRAINING_HISTORY_OPTIONS, PROGRAM_DIFFICULTY_LEVELS,
  WEEK_DAYS, SPORT_ACTIVITIES, TIME_OF_DAY_OPTIONS, ALL_EQUIPMENT,
} from '@/lib/fitness';
import { cn } from '@/lib/utils';
import { recalcPlanWeights } from '@/lib/weightRecalc';
import { getProfileCompleteness } from '@/lib/profileGaps';
import ProfileEquipmentTab from '@/components/ProfileEquipmentTab';
import ProfileDesiredActivities from '@/components/ProfileDesiredActivities';
import ProfileWarmup, { CARDIO_OPTIONS } from '@/components/ProfileWarmup';

export default function ProfileEditor({ profile, open, onOpenChange, onSaved }) {
  const [form, setForm] = useState(null);
  const [saveState, setSaveState] = useState('idle');
  const [draft, setDraft] = useState({ day: 'Monday', time_of_day: 'morning', activity: '' });
  const [activityQuery, setActivityQuery] = useState('');
  const [activityOpen, setActivityOpen] = useState(false);
  const [showActivityForm, setShowActivityForm] = useState(false);
  const [tab, setTab] = useState('basics');
  const [dislikeInput, setDislikeInput] = useState('');
  const debounceRef = useRef(null);
  const loadedRef = useRef(false);
  const formRef = useRef(null);

  const performSave = async (f, { final = false } = {}) => {
    if (!f || !profile) return;
    setSaveState('saving');
    try {
      const { error: updateError } = await supabase.from('athlete_profiles').update({
        goal: f.goal,
        secondary_goal: f.secondary_goal,
        body_focus: f.body_focus,
        performance_focus: f.performance_focus,
        experience_level: f.experience_level,
        training_history: f.training_history,
        weight_unit: f.weight_unit,
        equipment_profile: f.equipment_profile,
        available_equipment: f.equipment_profile === 'full_gym' ? ALL_EQUIPMENT : f.custom_equipment,
        custom_equipment: f.custom_equipment,
        saved_equipment_profiles: f.saved_equipment_profiles,
        weight_setup: f.weight_setup,
        resistance_priority: f.resistance_priority,
        conditioning_priority: f.conditioning_priority,
        program_difficulty: f.program_difficulty,
        training_days: f.training_days,
        scheduled_activities: f.scheduled_activities,
        desired_activities: f.desired_activities,
        scheduled_activities_reviewed: f.scheduled_activities_reviewed,
        desired_activities_reviewed: f.desired_activities_reviewed,
        available_training_days: f.training_days.length,
        strength_known: f.strength_known,
        duration_mode: f.duration_mode,
        duration_min: f.duration_min,
        duration_max: f.duration_max,
        per_day_durations: f.per_day_durations,
        warmup_duration_minutes: f.warmup_duration_minutes,
        warmup_include_mobility: f.warmup_include_mobility,
        warmup_include_cardio: f.warmup_include_cardio,
        warmup_include_first_movement: f.warmup_include_first_movement,
        warmup_mobility_exercises: f.warmup_mobility_exercises,
        warmup_cardio_options: f.warmup_cardio_options,
        warmup_first_movement_sets: f.warmup_first_movement_sets,
        warmup_notes: f.warmup_notes,
        dislikes: f.dislikes,
      }).eq('id', profile.id);
      if (updateError) throw updateError;
      setSaveState('saved');
      if (final) {
        onSaved();
        // Background: recalculate plan weights if weight-relevant fields changed
        if (profile?.user_id && (
          JSON.stringify(f.weight_setup) !== JSON.stringify(profile.weight_setup) ||
          f.program_difficulty !== profile.program_difficulty
        )) {
          recalcPlanWeights(profile.user_id);
        }
      }
      setTimeout(() => setSaveState((s) => (s === 'saved' ? 'idle' : s)), 1500);
    } catch {
      setSaveState('idle');
    }
  };

  useEffect(() => {
    if (open && profile) {
      loadedRef.current = false;
      setTab('basics');
      setShowActivityForm(false);
      const ws = profile.weight_setup || {};
      const customEquip = (profile.custom_equipment && profile.custom_equipment.length)
        ? profile.custom_equipment
        : (profile.available_equipment || []);
      setForm({
        goal: profile.goal || 'general_fitness',
        secondary_goal: profile.secondary_goal || 'none',
        body_focus: profile.body_focus || [],
        performance_focus: profile.performance_focus || [],
        experience_level: profile.experience_level || 'beginner',
        training_history: profile.training_history || 'new',
        weight_unit: profile.weight_unit || 'kg',
        equipment_profile: profile.equipment_profile || 'custom',
        custom_equipment: customEquip,
        saved_equipment_profiles: profile.saved_equipment_profiles || [],
        training_days: profile.training_days || [],
        scheduled_activities: profile.scheduled_activities || [],
        scheduled_activities_reviewed: !!profile.scheduled_activities_reviewed,
        desired_activities: (profile.desired_activities || []).filter((a) => a && typeof a === 'object' && a.day && a.activity),
        desired_activities_reviewed: !!profile.desired_activities_reviewed,
        strength_known: !!profile.strength_known,
        resistance_priority: profile.resistance_priority ?? 70,
        conditioning_priority: profile.conditioning_priority ?? 30,
        program_difficulty: profile.program_difficulty || 'challenger',
        duration_mode: profile.duration_mode || 'general',
        duration_min: profile.duration_min ?? 45,
        duration_max: profile.duration_max ?? 60,
        per_day_durations: profile.per_day_durations || {},
        warmup_duration_minutes: profile.warmup_duration_minutes ?? 10,
        warmup_include_mobility: profile.warmup_include_mobility ?? true,
        warmup_include_cardio: profile.warmup_include_cardio ?? true,
        warmup_include_first_movement: profile.warmup_include_first_movement ?? true,
        warmup_mobility_exercises: profile.warmup_mobility_exercises || [],
        warmup_cardio_options: profile.warmup_cardio_options?.length ? profile.warmup_cardio_options : [...CARDIO_OPTIONS],
        warmup_first_movement_sets: profile.warmup_first_movement_sets ?? 2,
        warmup_notes: profile.warmup_notes || '',
        dislikes: profile.dislikes || [],
        weight_setup: {
          dumbbells: { max_kg: ws.dumbbells?.max_kg ?? null },
          barbell: { max_kg: ws.barbell?.max_kg ?? null },
          kettlebells: { max_kg: ws.kettlebells?.max_kg ?? null },
        },
      });
    }
  }, [open, profile]);

  useEffect(() => { formRef.current = form; }, [form]);

  useEffect(() => {
    if (!form) return;
    if (!loadedRef.current) { loadedRef.current = true; return; }
    debounceRef.current = setTimeout(() => performSave(form), 700);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

  useEffect(() => {
    if (open === false) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      const f = formRef.current;
      if (f) performSave(f, { final: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!form) return null;

  const difficultyIndex = Math.max(0, PROGRAM_DIFFICULTY_LEVELS.findIndex((l) => l.value === form.program_difficulty));
  const difficultyMeta = PROGRAM_DIFFICULTY_LEVELS[difficultyIndex];

  const toggle = (field, value) => {
    setForm((f) => {
      const arr = f[field];
      return { ...f, [field]: arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value] };
    });
  };

  const addActivity = () => {
    if (!draft.activity || !draft.day || !draft.time_of_day) return;
    setForm((f) => ({ ...f, scheduled_activities: [...(f.scheduled_activities || []), { day: draft.day, time_of_day: draft.time_of_day, activity: draft.activity }] }));
    setDraft({ day: 'Monday', time_of_day: 'morning', activity: '' });
    setShowActivityForm(false);
  };

  const removeActivity = (i) => setForm((f) => ({ ...f, scheduled_activities: (f.scheduled_activities || []).filter((_, idx) => idx !== i) }));

  const filteredActivities = SPORT_ACTIVITIES.filter((a) => a.toLowerCase().includes(activityQuery.toLowerCase()));

  const chipClass = (on) => cn('px-3 py-2 rounded-full text-xs font-medium border transition-colors', on ? 'bg-brand text-brand-foreground border-transparent' : 'border-border text-muted-foreground');

  const summary = {
    basics: difficultyMeta?.label,
    equipment: form.equipment_profile === 'full_gym' ? 'Full gym' : `${form.custom_equipment.length} selected`,
    schedule: `${form.training_days.length} days · ${form.duration_mode === 'general' ? `${form.duration_min}–${form.duration_max}m` : 'per day'}`,
  };

  const { done: completeDone, total: completeTotal } = getProfileCompleteness(form);
  const completePct = Math.round((completeDone / completeTotal) * 100);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl h-[90vh] flex flex-col p-0">
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur px-5 pt-5 pb-3 border-b border-border rounded-t-3xl">
          <SheetHeader className="space-y-0 p-0">
            <div className="flex items-center justify-between pr-8">
              <SheetTitle className="text-left">Edit training profile</SheetTitle>
              <span className="text-[11px] text-muted-foreground">{saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? <span className="text-brand">Saved</span> : ''}</span>
            </div>
          </SheetHeader>
          <Tabs value={tab} onValueChange={setTab} className="mt-3">
            <TabsList className="w-full h-auto grid grid-cols-3 gap-1 bg-muted/50 p-1">
              {[{ k: 'basics', label: 'Basics' }, { k: 'equipment', label: 'Equipment' }, { k: 'schedule', label: 'Schedule' }].map((t) => (
                <TabsTrigger key={t.k} value={t.k} className="flex-col items-center gap-0.5 py-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-md">
                  <span className="text-xs font-medium">{t.label}</span>
                  <span className="text-[10px] text-muted-foreground leading-none truncate max-w-full">{summary[t.k]}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          {completePct < 100 && (
            <div className="mt-3 flex items-center gap-2">
              <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${completePct}%` }} />
              </div>
              <span className="text-[11px] text-muted-foreground whitespace-nowrap">{completeDone}/{completeTotal} complete</span>
            </div>
          )}
        </div>

        <Tabs value={tab} onValueChange={setTab} className="flex-1 overflow-y-auto px-5 pb-8 pt-5">
          <TabsContent value="basics" className="space-y-6 mt-0 focus-visible:outline-none">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Primary goal</label>
              <Select value={form.goal} onValueChange={(v) => setForm((f) => ({ ...f, goal: v, secondary_goal: f.secondary_goal === v ? 'none' : f.secondary_goal }))}>
                <SelectTrigger className="mt-1 rounded-xl h-12"><SelectValue /></SelectTrigger>
                <SelectContent>{GOALS.map((g) => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">Secondary goal <span className="text-muted-foreground/60">(optional)</span></label>
              <Select value={form.secondary_goal} onValueChange={(v) => setForm((f) => ({ ...f, secondary_goal: v }))}>
                <SelectTrigger className="mt-1 rounded-xl h-12"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SECONDARY_GOAL_OPTIONS.filter((g) => g.value === 'none' || g.value !== form.goal).map((g) => (
                    <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground/70 mt-1">Influences workout selection but never overrides your primary goal.</p>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">Body focus <span className="text-muted-foreground/60">(optional)</span></label>
              <div className="flex flex-wrap gap-2 mt-1.5">
                {BODY_FOCUS_OPTIONS.map((b) => (
                  <button key={b} onClick={() => toggle('body_focus', b)} className={chipClass(form.body_focus.includes(b))}>{b}</button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">Performance focus <span className="text-muted-foreground/60">(optional)</span></label>
              <div className="flex flex-wrap gap-2 mt-1.5">
                {PERFORMANCE_FOCUS_OPTIONS.map((p) => (
                  <button key={p} onClick={() => toggle('performance_focus', p)} className={chipClass(form.performance_focus.includes(p))}>{p}</button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground/70 mt-1">Only influences workout ranking.</p>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">Experience level</label>
              <Select value={form.experience_level} onValueChange={(v) => setForm((f) => ({ ...f, experience_level: v }))}>
                <SelectTrigger className="mt-1 rounded-xl h-12"><SelectValue /></SelectTrigger>
                <SelectContent>{EXPERIENCE_LEVELS.map((g) => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">Training history</label>
              <Select value={form.training_history} onValueChange={(v) => setForm((f) => ({ ...f, training_history: v }))}>
                <SelectTrigger className="mt-1 rounded-xl h-12"><SelectValue /></SelectTrigger>
                <SelectContent>{TRAINING_HISTORY_OPTIONS.map((g) => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}</SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground/70 mt-1">Differentiates a consistent advanced lifter from one returning after a break.</p>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">Training mix</label>
              <p className="text-[11px] text-muted-foreground/70 mb-3">Set resistance and conditioning independently — you can want both.</p>

              <div className="rounded-xl border border-border p-3 mb-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium">Resistance training priority</span>
                  <span className="text-xs font-semibold text-brand">{form.resistance_priority}</span>
                </div>
                <Slider value={[form.resistance_priority]} min={0} max={100} step={5} onValueChange={([v]) => setForm((f) => ({ ...f, resistance_priority: v }))} />
                <div className="flex justify-between mt-1.5"><span className="text-[10px] text-muted-foreground/60">Low</span><span className="text-[10px] text-muted-foreground/60">High</span></div>
              </div>

              <div className="rounded-xl border border-border p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium">Conditioning priority</span>
                  <span className="text-xs font-semibold text-brand">{form.conditioning_priority}</span>
                </div>
                <Slider value={[form.conditioning_priority]} min={0} max={100} step={5} onValueChange={([v]) => setForm((f) => ({ ...f, conditioning_priority: v }))} />
                <div className="flex justify-between mt-1.5"><span className="text-[10px] text-muted-foreground/60">Low</span><span className="text-[10px] text-muted-foreground/60">High</span></div>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">Program difficulty</label>
                <span className="text-xs font-semibold text-brand">{difficultyMeta?.label}</span>
              </div>
              <p className="text-[11px] text-muted-foreground/70 mb-2">{difficultyMeta?.desc}</p>
              <div className="relative mt-1">
                <Slider
                  value={[difficultyIndex]}
                  min={0}
                  max={PROGRAM_DIFFICULTY_LEVELS.length - 1}
                  step={1}
                  onValueChange={([v]) => setForm((f) => ({ ...f, program_difficulty: PROGRAM_DIFFICULTY_LEVELS[v].value }))}
                />
                <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-2 flex items-center justify-between pointer-events-none">
                  {PROGRAM_DIFFICULTY_LEVELS.map((_, i) => (
                    <div key={i} className={cn('w-2 h-2 rounded-full', i <= difficultyIndex ? 'bg-brand' : 'bg-brand/30')} />
                  ))}
                </div>
              </div>
              <div className="relative h-3.5 mt-2">
                {PROGRAM_DIFFICULTY_LEVELS.map((l, i) => {
                  const isFirst = i === 0;
                  const isLast = i === PROGRAM_DIFFICULTY_LEVELS.length - 1;
                  const pos = (i / (PROGRAM_DIFFICULTY_LEVELS.length - 1)) * 100;
                  return (
                    <span
                      key={l.value}
                      className={cn(
                        'absolute text-[9px] font-medium whitespace-nowrap',
                        i === difficultyIndex ? 'text-brand' : 'text-muted-foreground/60',
                        isFirst ? 'left-0' : isLast ? 'right-0' : ''
                      )}
                      style={!isFirst && !isLast ? { left: `${pos}%`, transform: 'translateX(-50%)' } : undefined}
                    >
                      {l.label}
                    </span>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">Weight unit</label>
              <div className="flex flex-wrap gap-2 mt-1.5">
                {[{ k: 'kg', l: 'Kilograms (kg)' }, { k: 'lbs', l: 'Pounds (lbs)' }].map((u) => (
                  <button key={u.k} onClick={() => setForm((f) => ({ ...f, weight_unit: u.k }))} className={chipClass(form.weight_unit === u.k)}>{u.l}</button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground/70 mt-1.5">All weights across the app are shown in your selected unit.</p>
            </div>

            <ProfileWarmup form={form} setForm={setForm} />

            <div>
              <label className="text-xs font-medium text-muted-foreground">Workout dislikes</label>
              <p className="text-[11px] text-muted-foreground/70 mb-2">Exercises or patterns to avoid in your plans. The AI also learns these automatically when you swap workouts.</p>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {(form.dislikes || []).map((d) => (
                  <span key={d} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 text-xs font-medium">
                    {d}
                    <button onClick={() => setForm((f) => ({ ...f, dislikes: (f.dislikes || []).filter((x) => x !== d) }))} className="hover:text-rose-900"><X className="h-3 w-3" /></button>
                  </span>
                ))}
                {(form.dislikes || []).length === 0 && <span className="text-xs text-muted-foreground">No dislikes set.</span>}
              </div>
              <div className="flex gap-2">
                <input
                  value={dislikeInput}
                  onChange={(e) => setDislikeInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && dislikeInput.trim()) { e.preventDefault(); setForm((f) => ({ ...f, dislikes: [...new Set([...(f.dislikes || []), dislikeInput.trim()])] })); setDislikeInput(''); } }}
                  placeholder="e.g. Jump Rope"
                  className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                />
                <Button variant="outline" size="sm" onClick={() => { if (dislikeInput.trim()) { setForm((f) => ({ ...f, dislikes: [...new Set([...(f.dislikes || []), dislikeInput.trim()])] })); setDislikeInput(''); } }} disabled={!dislikeInput.trim()}>Add</Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="equipment" className="mt-0 focus-visible:outline-none">
            <ProfileEquipmentTab form={form} setForm={setForm} />
            <div className="flex items-center justify-between rounded-xl border border-border p-4 mt-6">
              <div className="pr-3">
                <p className="text-sm font-medium">I know my working weights</p>
                <p className="text-xs text-muted-foreground mt-0.5">Use the Strength Calibration to fine-tune starting weights.</p>
              </div>
              <Switch checked={form.strength_known} onCheckedChange={(v) => setForm((f) => ({ ...f, strength_known: v }))} />
            </div>
          </TabsContent>

          <TabsContent value="schedule" className="space-y-6 mt-0 focus-visible:outline-none">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Training days</label>
              <div className="grid grid-cols-4 gap-2 mt-1.5">
                {WEEK_DAYS.map((d) => (
                  <button key={d} onClick={() => toggle('training_days', d)} className={chipClass(form.training_days.includes(d))}>{d.slice(0, 3)}</button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">Desired duration</label>
              <div className="flex flex-wrap gap-2 mt-1.5">
                {[{ k: 'general', l: 'All days' }, { k: 'per_day', l: 'Per day' }].map((m) => (
                  <button key={m.k} onClick={() => setForm((f) => ({ ...f, duration_mode: m.k }))} className={chipClass(form.duration_mode === m.k)}>{m.l}</button>
                ))}
              </div>

              {form.duration_mode === 'general' ? (
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] text-muted-foreground">Range per session</span>
                    <span className="text-xs font-semibold text-brand">{form.duration_min}–{form.duration_max} min</span>
                  </div>
                  <Slider
                    value={[form.duration_min, form.duration_max]}
                    min={15}
                    max={120}
                    step={5}
                    onValueChange={([lo, hi]) => setForm((f) => ({ ...f, duration_min: Math.min(lo, hi), duration_max: Math.max(lo, hi) }))}
                    className="mt-1"
                  />
                  <div className="flex justify-between mt-1.5">
                    <span className="text-[10px] text-muted-foreground/60">15</span>
                    <span className="text-[10px] text-muted-foreground/60">120</span>
                  </div>
                </div>
              ) : (
                <div className="mt-3 space-y-2">
                  {form.training_days.length === 0 && <p className="text-[11px] text-muted-foreground/70">Select training days above to set per-day durations.</p>}
                  {form.training_days.map((d) => {
                    const val = form.per_day_durations[d] ?? 45;
                    return (
                      <div key={d} className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2">
                        <span className="text-xs font-medium">{d}</span>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            inputMode="numeric"
                            min={10}
                            max={180}
                            step={5}
                            value={val}
                            onChange={(e) => setForm((f) => ({ ...f, per_day_durations: { ...f.per_day_durations, [d]: e.target.value ? Number(e.target.value) : null } }))}
                            className="w-16 rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-brand"
                          />
                          <span className="text-xs text-muted-foreground">min</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <ProfileDesiredActivities form={form} setForm={setForm} />

            <div>
              <label className="text-xs font-medium text-muted-foreground">Scheduled activities</label>
              <p className="text-[11px] text-muted-foreground/70 mb-2">Already-scheduled classes or sports — we'll plan your lifting around them.</p>

              {form.scheduled_activities.length > 0 && (
                <div className="space-y-1.5 mb-3">
                  {form.scheduled_activities.map((a, i) => (
                    <div key={i} className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2">
                      <div className="text-xs">
                        <span className="font-medium">{a.activity}</span>
                        <span className="text-muted-foreground"> · {a.day.slice(0, 3)} · {TIME_OF_DAY_OPTIONS.find((t) => t.value === a.time_of_day)?.label || a.time_of_day}</span>
                      </div>
                      <button onClick={() => removeActivity(i)} className="text-muted-foreground hover:text-destructive"><X className="h-3.5 w-3.5" /></button>
                    </div>
                  ))}
                </div>
              )}

              {showActivityForm ? (
                <div className="rounded-xl border border-border p-3 space-y-3 bg-card">
                  <div>
                    <p className="text-[11px] text-muted-foreground mb-1.5">Day</p>
                    <div className="flex flex-wrap gap-1.5">
                      {WEEK_DAYS.map((d) => (
                        <button key={d} onClick={() => setDraft((s) => ({ ...s, day: d }))} className={chipClass(draft.day === d)}>{d.slice(0, 3)}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground mb-1.5">Time</p>
                    <div className="flex flex-wrap gap-1.5">
                      {TIME_OF_DAY_OPTIONS.map((t) => (
                        <button key={t.value} onClick={() => setDraft((s) => ({ ...s, time_of_day: t.value }))} className={chipClass(draft.time_of_day === t.value)}>{t.label}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground mb-1.5">Activity</p>
                    <div className="relative">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <input
                          value={activityQuery}
                          onChange={(e) => { setActivityQuery(e.target.value); setActivityOpen(true); }}
                          onFocus={() => setActivityOpen(true)}
                          onBlur={() => setTimeout(() => setActivityOpen(false), 150)}
                          placeholder="Search activities..."
                          className="w-full rounded-lg border border-border bg-background pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                        />
                      </div>
                      {activityOpen && filteredActivities.length > 0 && (
                        <div className="absolute z-20 mt-1 w-full max-h-44 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg">
                          {filteredActivities.map((a) => (
                            <button key={a} onMouseDown={(e) => { e.preventDefault(); setDraft((s) => ({ ...s, activity: a })); setActivityOpen(false); setActivityQuery(''); }} className="block w-full text-left px-3 py-2 text-sm hover:bg-accent">{a}</button>
                          ))}
                        </div>
                      )}
                    </div>
                    {draft.activity && <p className="text-[11px] text-brand mt-1">Selected: {draft.activity}</p>}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={addActivity} disabled={!draft.activity} className="flex-1">Add activity</Button>
                    <Button variant="ghost" size="sm" onClick={() => setShowActivityForm(false)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <Button variant="outline" size="sm" onClick={() => setShowActivityForm(true)} className="w-full">
                  <Plus className="h-4 w-4" /> Add a scheduled activity
                </Button>
              )}

              {form.scheduled_activities.length === 0 && !showActivityForm && (
                <label className="flex items-center gap-2 mt-2.5 text-xs text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!form.scheduled_activities_reviewed}
                    onChange={(e) => setForm((f) => ({ ...f, scheduled_activities_reviewed: e.target.checked }))}
                    className="h-3.5 w-3.5 rounded border-border accent-brand"
                  />
                  None — I have no already-scheduled activities
                </label>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}