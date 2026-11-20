import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { validateWorkoutName, suggestWorkoutName, MAX_WORKOUT_NAME } from '@/lib/workoutNames';
import { isNameTakenError, isInvalidNameError, isPremiumRequiredError } from '@/lib/customizeWorkout';

/**
 * Asks for a name and saves a workout as a custom workout under it. The name
 * must differ from the original workout and from the athlete's other custom
 * workouts, so saving never replaces anything. The server re-checks it (a
 * catalog workout's name, or a race), and that answer is shown here too.
 *
 * `onSave(name)` does the saving and should throw if it fails.
 */
export default function SaveCustomWorkoutForm({
  sourceName,
  takenNames = [],
  onSave,
  onCancel,
  onPremiumRequired,
  cancelLabel = 'Not now',
  saveLabel = 'Save to My workouts',
}) {
  const [name, setName] = useState(() => suggestWorkoutName(sourceName, [sourceName, ...takenNames]));
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // The original's own name is always off limits, on top of the athlete's existing custom names.
  const taken = [sourceName, ...takenNames];

  const submit = async (e) => {
    e?.preventDefault();
    const result = validateWorkoutName(name, taken);
    if (result.error) { setError(result.error); return; }
    setBusy(true);
    setError(null);
    try {
      await onSave(result.name);
    } catch (err) {
      if (isNameTakenError(err)) setError('That name is already taken. Pick a different one.');
      else if (isInvalidNameError(err)) setError('Enter a valid name.');
      else if (isPremiumRequiredError(err)) onPremiumRequired?.();
      else setError("Couldn't save your workout. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="w-full space-y-3 text-left">
      <div>
        <label htmlFor="custom-workout-save-name" className="text-xs font-medium text-muted-foreground">Name your workout</label>
        <Input
          id="custom-workout-save-name"
          value={name}
          maxLength={MAX_WORKOUT_NAME + 20}
          onChange={(e) => { setName(e.target.value); setError(null); }}
          onFocus={(e) => e.target.select()}
          aria-invalid={!!error}
          aria-describedby={error ? 'custom-workout-save-error' : undefined}
          className="mt-1"
          disabled={busy}
        />
        {error && <p id="custom-workout-save-error" role="alert" className="text-xs text-destructive mt-1.5">{error}</p>}
        <p className="text-[11px] text-muted-foreground mt-1.5">Must be different from &ldquo;{sourceName}&rdquo;, which stays as it is.</p>
      </div>
      <Button type="submit" disabled={busy} className="w-full rounded-xl h-12 bg-brand text-brand-foreground hover:bg-brand/90">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : saveLabel}
      </Button>
      {onCancel && (
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy} className="w-full rounded-xl h-11 text-muted-foreground">
          {cancelLabel}
        </Button>
      )}
    </form>
  );
}
