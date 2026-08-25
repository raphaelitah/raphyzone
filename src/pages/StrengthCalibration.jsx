import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { useAthleteProfile } from '@/hooks/useAthleteProfile';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Check, ChevronLeft, ChevronRight, Dumbbell, Info } from 'lucide-react';
import { CALIBRATION_PATTERNS, fmtISO } from '@/lib/fitness';
import { inputToKg } from '@/lib/units';
import { cn } from '@/lib/utils';
import { recalcPlanWeights } from '@/lib/weightRecalc';

const SKIP = "I don't perform this movement";

export default function StrengthCalibration() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { profile, reload } = useAthleteProfile();
  const wasCalibrated = !!profile?.calibrated;
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState(() => Object.fromEntries(CALIBRATION_PATTERNS.map((p) => [p.key, { exercise: '', weight: '' }])));
  const [forceOptions, setForceOptions] = useState(false);
  const [saving, setSaving] = useState(false);

  const unit = profile?.weight_unit || 'kg';
  const pattern = CALIBRATION_PATTERNS[step];
  const ans = answers[pattern.key] || { exercise: '', weight: '' };
  const isLast = step === CALIBRATION_PATTERNS.length - 1;
  const isSkipped = ans.exercise === SKIP;
  const showOptions = !ans.exercise || forceOptions;

  const setAns = (patch) => setAnswers((a) => ({ ...a, [pattern.key]: { ...a[pattern.key], ...patch } }));

  const canContinue = !!ans.exercise && (isSkipped || !!ans.weight);

  useEffect(() => { setForceOptions(false); }, [step]);

  const choose = (o) => {
    setAns({ exercise: o, weight: o === SKIP ? '' : ans.weight });
    if (o !== SKIP) setForceOptions(false);
  };

  const finish = async () => {
    setSaving(true);
    try {
      const calibration = CALIBRATION_PATTERNS.map((p) => {
        const a = answers[p.key];
        if (!a || !a.exercise || a.exercise === SKIP) return null;
        const weightKg = inputToKg(a.weight, unit);
        if (!weightKg) return null;
        return {
          pattern: p.key,
          exercise: a.exercise,
          weight_kg: weightKg,
          reps: 8,
        };
      }).filter(Boolean);

      const { data: existing } = await supabase.from('athlete_profiles').select('id').eq('user_id', user.id);
      if (existing?.[0]) {
        await supabase.from('athlete_profiles').update({
          strength_calibration: calibration,
          calibrated: true,
          calibrated_date: fmtISO(new Date()),
          strength_known: calibration.length > 0,
        }).eq('id', existing[0].id);
      }
      await reload();
      recalcPlanWeights(user.id); // background: recalculate plan weights with new calibration
      navigate(wasCalibrated ? '/profile' : '/plan');
    } finally {
      setSaving(false);
    }
  };

  const next = () => (isLast ? finish() : setStep(step + 1));
  const back = () => setStep(Math.max(0, step - 1));

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="px-5 pt-10 pb-4">
        <div className="flex items-center gap-2 mb-6">
          <div className="h-9 w-9 rounded-xl bg-brand flex items-center justify-center">
            <Dumbbell className="h-5 w-5 text-brand-foreground" />
          </div>
          <span className="font-semibold tracking-tight">Strength Calibration</span>
        </div>
        <div className="flex gap-1.5 mb-1">
          {CALIBRATION_PATTERNS.map((_, i) => (
            <div key={i} className={cn('h-1.5 flex-1 rounded-full transition-colors', i <= step ? 'bg-brand' : 'bg-muted')} />
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-2">Step {step + 1} of {CALIBRATION_PATTERNS.length}</p>
      </div>

      <div className="flex-1 px-5">
        <h1 className="text-2xl font-semibold tracking-tight">{pattern.title}</h1>
        <p className="text-sm text-muted-foreground mt-1 mb-1">{pattern.question}</p>
        <p className="text-xs text-muted-foreground/70 mb-5">If you don't know an answer, simply skip it. We'll learn as you train.</p>

        {showOptions ? (
          <div className="space-y-2.5 mb-5">
            {pattern.options.map((o) => {
              const active = ans.exercise === o;
              return (
                <button key={o} onClick={() => choose(o)} className={cn('w-full rounded-xl border px-4 py-3.5 text-left transition-all', active ? 'border-brand bg-brand/5' : 'border-border')}>
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{o}</span>
                    {active && <Check className="h-5 w-5 text-brand" />}
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="space-y-4 mb-5">
            <button
              onClick={() => setForceOptions(true)}
              className="w-full rounded-xl border border-brand bg-brand/5 px-4 py-3.5 text-left transition-all flex items-center justify-between"
            >
              <div>
                <p className="text-[11px] text-muted-foreground">Selected movement</p>
                <p className="font-medium text-sm">{ans.exercise}</p>
              </div>
              <span className="text-xs font-medium text-brand">Change</span>
            </button>

            {!isSkipped && (
              <Card className="rounded-2xl border-border p-4 space-y-4">
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <p className="text-xs text-muted-foreground">Total Weight</p>
                    <div className="relative inline-flex items-center group">
                      <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                      <div className="absolute z-30 bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 rounded-lg bg-popover border border-border px-3 py-2 text-[11px] text-popover-foreground shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity">
                        For dumbbells or kettlebells, enter the combined weight of both sides (e.g. two 20kg dumbbells = 40kg).
                      </div>
                    </div>
                    <span className="text-[11px] text-muted-foreground/60">({unit})</span>
                  </div>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={ans.weight}
                    onChange={(e) => setAns({ weight: e.target.value })}
                    placeholder="e.g. 60"
                    className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                  />
                </div>
              </Card>
            )}
          </div>
        )}
      </div>

      <div className="sticky bottom-0 px-5 py-4 bg-background border-t border-border flex items-center gap-3">
        {step > 0 && (
          <Button variant="ghost" size="icon" onClick={back} className="rounded-xl">
            <ChevronLeft className="h-5 w-5" />
          </Button>
        )}
        <Button variant="ghost" onClick={next} className="flex items-center gap-1 text-muted-foreground">
          Skip
        </Button>
        <Button onClick={next} disabled={saving || !canContinue} className="flex-1 rounded-xl h-12 bg-brand text-brand-foreground hover:bg-brand/90">
          {saving ? 'Saving…' : isLast ? 'Finish calibration' : 'Continue'}
          {!isLast && <ChevronRight className="h-4 w-4 ml-1" />}
        </Button>
      </div>
    </div>
  );
}