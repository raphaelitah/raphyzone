import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Check, ChevronRight, ChevronLeft, Dumbbell } from 'lucide-react';
import { GOALS, EXPERIENCE_LEVELS, EQUIPMENT_OPTIONS, EQUIPMENT_PROFILE_OPTIONS, ALL_EQUIPMENT, CALIBRATION_PATTERNS, WEEK_DAYS, fmtISO } from '@/lib/fitness';
import { inputToKg } from '@/lib/units';
import { cn } from '@/lib/utils';

const SKIP = "I don't perform this movement";

export default function Onboarding() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState({
    goal: '',
    experience_level: '',
    equipment_profile: 'custom',
    available_equipment: [],
    training_days: [],
    strength_known: false,
    answers: Object.fromEntries(CALIBRATION_PATTERNS.map((p) => [p.key, { exercise: '', weight: '' }])),
  });

  const steps = ['Goal', 'Experience', 'Equipment', 'Schedule', 'Strength'];
  const total = steps.length;

  const toggle = (key, value) => {
    setData((d) => {
      const arr = d[key];
      return { ...d, [key]: arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value] };
    });
  };

  const canProceed = () => {
    if (step === 0) return !!data.goal;
    if (step === 1) return !!data.experience_level;
    if (step === 2) return data.equipment_profile === 'full_gym' || data.available_equipment.length > 0;
    if (step === 3) return data.training_days.length > 0;
    return true;
  };

  const finish = async () => {
    if (!user) { setError('Not signed in. Please reload and try again.'); return; }
    setSaving(true);
    setError(null);
    try {
      const { data: existing } = await supabase
        .from('athlete_profiles')
        .select('id')
        .eq('user_id', user.id);
      const calibration = data.strength_known
        ? CALIBRATION_PATTERNS.map((p) => {
            const a = data.answers[p.key];
            if (!a || !a.exercise || a.exercise === SKIP) return null;
            const weightKg = inputToKg(a.weight, 'kg');
            if (!weightKg) return null;
            return { pattern: p.key, exercise: a.exercise, weight_kg: weightKg, reps: 8 };
          }).filter(Boolean)
        : [];

      const payload = {
        user_id: user.id,
        goal: data.goal,
        experience_level: data.experience_level,
        equipment_profile: data.equipment_profile,
        available_equipment: data.equipment_profile === 'full_gym' ? ALL_EQUIPMENT : data.available_equipment,
        training_days: data.training_days,
        available_training_days: data.training_days.length,
        strength_known: calibration.length > 0,
        strength_calibration: calibration,
        calibrated: calibration.length > 0,
        onboarded: true,
      };
      if (calibration.length) payload.calibrated_date = fmtISO(new Date());

      if (existing?.[0]) {
        const { error: updateError } = await supabase
          .from('athlete_profiles')
          .update(payload)
          .eq('id', existing[0].id);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase.from('athlete_profiles').insert(payload);
        if (insertError) throw insertError;
      }
      navigate('/');
    } catch (e) {
      setError(e?.message || 'Could not save your profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const next = () => (step < total - 1 ? setStep(step + 1) : finish());
  const back = () => setStep(Math.max(0, step - 1));

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="px-5 pt-10 pb-4">
        <div className="flex items-center gap-2 mb-6">
          <div className="h-9 w-9 rounded-xl bg-brand flex items-center justify-center">
            <Dumbbell className="h-5 w-5 text-brand-foreground" />
          </div>
          <span className="font-semibold tracking-tight">AI Fitness Coach</span>
        </div>
        <div className="flex gap-1.5 mb-1">
          {steps.map((_, i) => (
            <div key={i} className={cn('h-1.5 flex-1 rounded-full transition-colors', i <= step ? 'bg-brand' : 'bg-muted')} />
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-2">Step {step + 1} of {total}</p>
      </div>

      <div className="flex-1 px-5 overflow-y-auto pb-4">
        {step === 0 && (
          <StepWrap title="What's your primary goal?" subtitle="This shapes how we structure your training.">
            {GOALS.map((g) => (
              <OptionCard key={g.value} active={data.goal === g.value} onClick={() => setData({ ...data, goal: g.value })} title={g.label} desc={g.desc} />
            ))}
          </StepWrap>
        )}
        {step === 1 && (
          <StepWrap title="How experienced are you?" subtitle="We tailor exercise selection and progression pace.">
            {EXPERIENCE_LEVELS.map((g) => (
              <OptionCard key={g.value} active={data.experience_level === g.value} onClick={() => setData({ ...data, experience_level: g.value })} title={g.label} desc={g.desc} />
            ))}
          </StepWrap>
        )}
        {step === 2 && (
          <StepWrap title="What equipment do you have?" subtitle="Choose Full Gym if you have access to a complete gym, or pick exactly what you have.">
            <div className="grid grid-cols-2 gap-2.5">
              {EQUIPMENT_PROFILE_OPTIONS.map((p) => (
                <button key={p.value} onClick={() => setData({ ...data, equipment_profile: p.value, available_equipment: p.value === 'full_gym' ? ALL_EQUIPMENT : [] })} className={cn('rounded-xl border px-4 py-3.5 text-left transition-all', data.equipment_profile === p.value ? 'border-brand bg-brand/5' : 'border-border')}>
                  <p className="font-medium text-sm">{p.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{p.desc}</p>
                </button>
              ))}
            </div>
            {data.equipment_profile === 'custom' && (
              <div className="grid grid-cols-2 gap-2.5 pt-2">
                {EQUIPMENT_OPTIONS.map((e) => (
                  <button key={e} onClick={() => toggle('available_equipment', e)} className={cn('rounded-xl border px-3 py-3 text-sm font-medium text-left transition-all', data.available_equipment.includes(e) ? 'border-brand bg-brand/5 text-brand' : 'border-border text-foreground')}>
                    <div className="flex items-center justify-between">
                      <span className="truncate">{e}</span>
                      {data.available_equipment.includes(e) && <Check className="h-4 w-4 shrink-0" />}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </StepWrap>
        )}
        {step === 3 && (
          <StepWrap title="Which days can you train?" subtitle="Pick the days you're usually free to lift.">
            <div className="grid grid-cols-2 gap-2.5">
              {WEEK_DAYS.map((d) => (
                <button key={d} onClick={() => toggle('training_days', d)} className={cn('rounded-xl border px-3 py-3 text-sm font-medium transition-all', data.training_days.includes(d) ? 'border-brand bg-brand/5 text-brand' : 'border-border')}>
                  <div className="flex items-center justify-between">
                    <span>{d.slice(0, 3)}</span>
                    {data.training_days.includes(d) && <Check className="h-4 w-4" />}
                  </div>
                </button>
              ))}
            </div>
          </StepWrap>
        )}
        {step === 4 && (
          <StepWrap title="Know your current strength?" subtitle="Optional — enter your lifts so we can personalize your starting weights, or skip and we'll start conservative and learn as you train.">
            <OptionCard active={data.strength_known} onClick={() => setData({ ...data, strength_known: true })} title="I'll enter my lifts" desc="Fill in your working weights for each movement pattern." />
            <OptionCard active={!data.strength_known} onClick={() => setData({ ...data, strength_known: false })} title="Start conservative" desc="Skip for now — we'll learn from your logged sessions." />
            {data.strength_known && (
              <div className="space-y-3 pt-1">
                {CALIBRATION_PATTERNS.map((p) => {
                  const a = data.answers[p.key] || { exercise: '', weight: '' };
                  const setA = (patch) => setData((d) => ({ ...d, answers: { ...d.answers, [p.key]: { ...d.answers[p.key], ...patch } } }));
                  const skipped = a.exercise === SKIP;
                  return (
                    <Card key={p.key} className="rounded-2xl border-border p-4">
                      <p className="text-sm font-semibold">{p.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 mb-3">{p.question}</p>
                      <select value={a.exercise} onChange={(e) => setA({ exercise: e.target.value, weight: e.target.value === SKIP ? '' : a.weight })} className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand">
                        <option value="">Select movement…</option>
                        {p.options.map((o) => <option key={o} value={o}>{o === SKIP ? "I don't perform this" : o}</option>)}
                      </select>
                      {!skipped && a.exercise && (
                        <input type="number" inputMode="decimal" value={a.weight} onChange={(e) => setA({ weight: e.target.value })} placeholder="Weight (kg) e.g. 60" className="w-full mt-2 rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </StepWrap>
        )}
      </div>

      <div className="sticky bottom-0 px-5 py-4 bg-background border-t border-border flex items-center gap-3">
        {step > 0 && (
          <Button variant="ghost" size="icon" onClick={back} className="rounded-xl">
            <ChevronLeft className="h-5 w-5" />
          </Button>
        )}
        <div className="flex-1">
          <Button onClick={next} disabled={!canProceed() || saving} className="w-full rounded-xl h-12 bg-brand text-brand-foreground hover:bg-brand/90">
            {saving ? 'Saving…' : step === total - 1 ? 'Finish' : 'Continue'}
            {step < total - 1 && <ChevronRight className="h-4 w-4 ml-1" />}
          </Button>
          {error && <p className="text-[11px] text-destructive text-center mt-1.5">{error}</p>}
        </div>
      </div>
    </div>
  );
}

function StepWrap({ title, subtitle, children }) {
  return (
    <div className="animate-in fade-in duration-300">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="text-sm text-muted-foreground mt-1 mb-5">{subtitle}</p>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

function OptionCard({ active, onClick, title, desc }) {
  return (
    <button onClick={onClick} className={cn('w-full rounded-xl border px-4 py-3.5 text-left transition-all', active ? 'border-brand bg-brand/5' : 'border-border hover:border-foreground/20')}>
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium">{title}</p>
          {desc && <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>}
        </div>
        {active && <Check className="h-5 w-5 text-brand" />}
      </div>
    </button>
  );
}