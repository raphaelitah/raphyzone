import { useEffect, useRef, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Play, Pause, RotateCcw, SkipForward } from 'lucide-react';
import { cn } from '@/lib/utils';
import useIntervalTimer from '@/hooks/useIntervalTimer';

function formatClock(sec) {
  const s = Math.max(0, Math.ceil(sec || 0));
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

// initialConfig (optional): { workSec, restSec, rounds, exerciseCount, exerciseNames }
// when present (block is EMOM/Tabata), Interval mode is pre-filled and onExerciseSync
// is called with the block-relative exercise index whenever the active phase's
// exercise changes, so the host page can keep its own navigation in sync.
export default function WorkoutTimerSheet({ open, onOpenChange, initialConfig, onExerciseSync }) {
  const hasBlockContext = !!initialConfig;
  const [mode, setMode] = useState(hasBlockContext ? 'interval' : 'countdown');
  const [countdownSec, setCountdownSec] = useState('60');
  const [workSec, setWorkSec] = useState(initialConfig?.workSec?.toString() || '20');
  const [restSec, setRestSec] = useState(initialConfig?.restSec?.toString() || '10');
  const [rounds, setRounds] = useState(initialConfig?.rounds?.toString() || '8');
  const [armedConfig, setArmedConfig] = useState(null);

  // initialConfig is recomputed by the host on every render (e.g. each session-stopwatch
  // tick), so a fresh object reference must not reset an in-progress timer — only actually
  // opening the sheet should snapshot defaults from it.
  const initialConfigRef = useRef(initialConfig);
  useEffect(() => { initialConfigRef.current = initialConfig; }, [initialConfig]);

  useEffect(() => {
    if (!open) return;
    const cfg = initialConfigRef.current;
    setMode(cfg ? 'interval' : 'countdown');
    setWorkSec(cfg?.workSec?.toString() || '20');
    setRestSec(cfg?.restSec?.toString() || '10');
    setRounds(cfg?.rounds?.toString() || '8');
    setArmedConfig(null);
  }, [open]);

  const timer = useIntervalTimer(armedConfig || { mode: 'countdown', durationSec: 0 });

  useEffect(() => {
    if (!armedConfig || armedConfig.mode !== 'interval' || timer.status !== 'running') return;
    onExerciseSync?.(timer.exerciseIndex);
  }, [armedConfig, timer.status, timer.exerciseIndex, onExerciseSync]);

  const handleStart = () => {
    if (mode === 'countdown') {
      setArmedConfig({ mode: 'countdown', durationSec: Math.max(0, parseInt(countdownSec, 10) || 0) });
    } else {
      setArmedConfig({
        mode: 'interval',
        workSec: Math.max(0, parseInt(workSec, 10) || 0),
        restSec: Math.max(0, parseInt(restSec, 10) || 0),
        rounds: Math.max(1, parseInt(rounds, 10) || 1),
        exerciseCount: initialConfig?.exerciseCount || 1,
      });
    }
  };

  useEffect(() => {
    if (armedConfig && timer.status === 'idle') timer.start();
  }, [armedConfig]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClose = () => {
    timer.reset();
    setArmedConfig(null);
    onOpenChange(false);
  };

  const isConfiguring = !armedConfig || timer.status === 'idle';
  const exerciseName = initialConfig?.exerciseNames?.[timer.exerciseIndex];
  const progressPct = timer.phaseDurationSec > 0 ? ((timer.phaseDurationSec - timer.remainingSec) / timer.phaseDurationSec) * 100 : 0;

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <SheetContent side="bottom" className="rounded-t-3xl">
        <SheetHeader className="px-5 pt-5">
          <SheetTitle className="text-left">Timer</SheetTitle>
        </SheetHeader>
        <div className="px-5 pb-8 space-y-4">
          {isConfiguring ? (
            <>
              <Tabs value={mode} onValueChange={setMode}>
                <TabsList className="w-full">
                  <TabsTrigger value="countdown" className="flex-1">Countdown</TabsTrigger>
                  <TabsTrigger value="interval" className="flex-1">Interval</TabsTrigger>
                </TabsList>
              </Tabs>

              {mode === 'countdown' ? (
                <div>
                  <label className="text-xs text-muted-foreground">Duration (s)</label>
                  <Input type="number" value={countdownSec} onChange={(e) => setCountdownSec(e.target.value)} className="mt-0.5" />
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground">Work (s)</label>
                    <Input type="number" value={workSec} onChange={(e) => setWorkSec(e.target.value)} className="mt-0.5" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Rest (s)</label>
                    <Input type="number" value={restSec} onChange={(e) => setRestSec(e.target.value)} className="mt-0.5" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Rounds</label>
                    <Input type="number" value={rounds} onChange={(e) => setRounds(e.target.value)} className="mt-0.5" />
                  </div>
                </div>
              )}

              <Button onClick={handleStart} className="w-full rounded-xl h-12 bg-brand text-brand-foreground hover:bg-brand/90">
                <Play className="h-4 w-4 mr-2" /> Start
              </Button>
            </>
          ) : (
            <div className="flex flex-col items-center gap-4 py-2">
              {timer.phase && (
                <span className={cn(
                  'text-xs font-semibold uppercase tracking-wide px-3 py-1 rounded-full',
                  timer.phase === 'work' ? 'bg-brand/10 text-brand' : 'bg-muted text-muted-foreground'
                )}>
                  {timer.status === 'done' ? 'Done' : timer.phase}
                </span>
              )}
              <p className="text-6xl font-bold tabular-nums tracking-tight">{formatClock(timer.remainingSec)}</p>
              {exerciseName && <p className="text-sm font-medium text-muted-foreground">{exerciseName}</p>}
              {mode === 'interval' && <p className="text-xs text-muted-foreground">Round {timer.round} of {timer.totalRounds}</p>}
              <Progress value={progressPct} className="w-full" />

              <div className="flex items-center gap-2 w-full mt-2">
                <button onClick={timer.reset} className="flex items-center justify-center w-12 h-12 rounded-xl border border-border text-muted-foreground">
                  <RotateCcw className="h-4 w-4" />
                </button>
                <Button
                  onClick={timer.status === 'running' ? timer.pause : timer.resume}
                  disabled={timer.status === 'done'}
                  className="flex-1 rounded-xl h-12 bg-brand text-brand-foreground hover:bg-brand/90"
                >
                  {timer.status === 'running' ? <><Pause className="h-4 w-4 mr-2" /> Pause</> : <><Play className="h-4 w-4 mr-2" /> Resume</>}
                </Button>
                <button onClick={timer.skipPhase} disabled={timer.status === 'done'} className="flex items-center justify-center w-12 h-12 rounded-xl border border-border text-muted-foreground disabled:opacity-30">
                  <SkipForward className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
