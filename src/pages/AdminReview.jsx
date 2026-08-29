import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Check, X, ArrowLeft, Loader2 } from 'lucide-react';
import { createNotification } from '@/lib/notifications';
import { cn } from '@/lib/utils';

export default function AdminReview() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState('exercises');
  const [pending, setPending] = useState([]);
  const [pendingWorkouts, setPendingWorkouts] = useState([]);
  const [workoutExercises, setWorkoutExercises] = useState({});
  const [loading, setLoading] = useState(true);
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState('');
  const [processing, setProcessing] = useState(null);

  useEffect(() => {
    if (!user) return;
    if (user.role !== 'admin') { navigate('/'); return; }
    load();
  }, [user]);

  const load = async () => {
    setLoading(true);
    try {
      const [{ data: exs }, { data: workouts }] = await Promise.all([
        supabase.from('exercises').select('*').eq('submission_status', 'pending').order('created_date', { ascending: false }).limit(500),
        supabase.from('workouts').select('*').eq('ownership_type', 'personal').eq('status', 'pending').order('created_date', { ascending: false }).limit(500),
      ]);
      setPending(exs || []);
      setPendingWorkouts(workouts || []);

      if (workouts?.length) {
        const workoutIds = workouts.map(w => w.workout_id);
        const { data: blocks } = await supabase.from('workout_blocks').select('block_id, workout_id').in('workout_id', workoutIds);
        const blockToWorkout = new Map((blocks || []).map(b => [b.block_id, b.workout_id]));
        const blockIds = (blocks || []).map(b => b.block_id);
        const { data: blockExs } = blockIds.length
          ? await supabase.from('block_exercises').select('block_id, step_type, exercise_title_raw, order_in_block').in('block_id', blockIds).order('order_in_block', { ascending: true })
          : { data: [] };
        const byWorkout = {};
        (blockExs || []).forEach(be => {
          const workoutId = blockToWorkout.get(be.block_id);
          if (!workoutId) return;
          if (!byWorkout[workoutId]) byWorkout[workoutId] = [];
          byWorkout[workoutId].push(be);
        });
        setWorkoutExercises(byWorkout);
      } else {
        setWorkoutExercises({});
      }
    } finally { setLoading(false); }
  };

  const approve = async (exercise) => {
    setProcessing(exercise.id);
    try {
      await supabase.from('exercises').update({ submission_status: 'approved', rejection_reason: null }).eq('id', exercise.id);
      if (exercise.author_id) {
        await createNotification({
          userId: exercise.author_id,
          type: 'exercise_approved',
          title: 'Exercise approved',
          body: `Your exercise "${exercise.name}" has been approved and is now in the library.`,
          relatedId: exercise.id,
        });
      }
      setPending(prev => prev.filter(e => e.id !== exercise.id));
    } finally { setProcessing(null); }
  };

  const reject = async (exercise) => {
    setProcessing(exercise.id);
    try {
      await supabase.from('exercises').update({ submission_status: 'rejected', rejection_reason: reason || null }).eq('id', exercise.id);
      if (exercise.author_id) {
        await createNotification({
          userId: exercise.author_id,
          type: 'exercise_rejected',
          title: 'Exercise rejected',
          body: `Your exercise "${exercise.name}" was rejected. Reason: ${reason || 'Not specified.'}`,
          relatedId: exercise.id,
        });
      }
      setPending(prev => prev.filter(e => e.id !== exercise.id));
      setRejecting(null);
      setReason('');
    } finally { setProcessing(null); }
  };

  const approveWorkout = async (workout) => {
    setProcessing(workout.id);
    try {
      await supabase.from('workouts').update({ status: 'approved', rejection_reason: null }).eq('id', workout.id);
      if (workout.author_id) {
        await createNotification({
          userId: workout.author_id,
          type: 'workout_approved',
          title: 'Workout approved',
          body: `Your workout "${workout.name}" has been approved and is now in the library.`,
          relatedId: workout.id,
        });
      }
      setPendingWorkouts(prev => prev.filter(w => w.id !== workout.id));
    } finally { setProcessing(null); }
  };

  const rejectWorkout = async (workout) => {
    setProcessing(workout.id);
    try {
      await supabase.from('workouts').update({ status: 'rejected', rejection_reason: reason || null }).eq('id', workout.id);
      if (workout.author_id) {
        await createNotification({
          userId: workout.author_id,
          type: 'workout_rejected',
          title: 'Workout rejected',
          body: `Your workout "${workout.name}" was rejected. Reason: ${reason || 'Not specified.'}`,
          relatedId: workout.id,
        });
      }
      setPendingWorkouts(prev => prev.filter(w => w.id !== workout.id));
      setRejecting(null);
      setReason('');
    } finally { setProcessing(null); }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-muted border-t-brand rounded-full animate-spin" /></div>;

  return (
    <div className="px-5 pt-10 pb-8">
      <button onClick={() => navigate('/profile')} className="flex items-center gap-1 text-sm text-muted-foreground mb-4 hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to profile
      </button>
      <h1 className="text-2xl font-semibold tracking-tight mb-1">UGC For Review</h1>
      <p className="text-sm text-muted-foreground mb-4">
        {tab === 'exercises'
          ? `${pending.length} exercise${pending.length !== 1 ? 's' : ''} awaiting approval`
          : `${pendingWorkouts.length} workout${pendingWorkouts.length !== 1 ? 's' : ''} awaiting approval`}
      </p>

      <div className="flex gap-1.5 mb-5 rounded-xl bg-muted p-1">
        <button
          onClick={() => setTab('exercises')}
          className={cn('flex-1 rounded-lg py-1.5 text-sm font-medium transition-colors', tab === 'exercises' ? 'bg-background shadow-sm' : 'text-muted-foreground')}
        >
          Exercises ({pending.length})
        </button>
        <button
          onClick={() => setTab('workouts')}
          className={cn('flex-1 rounded-lg py-1.5 text-sm font-medium transition-colors', tab === 'workouts' ? 'bg-background shadow-sm' : 'text-muted-foreground')}
        >
          Workouts ({pendingWorkouts.length})
        </button>
      </div>

      {tab === 'workouts' ? (
        pendingWorkouts.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-16">No workouts pending review.</p>
        ) : (
          <div className="space-y-3">
            {pendingWorkouts.map(w => (
              <Card key={w.id} className="rounded-2xl border-border p-4">
                <div className="mb-2">
                  <p className="font-medium">{w.name}</p>
                  <p className="text-xs text-muted-foreground">Submitted by {w.author_name || 'Unknown'}</p>
                </div>
                <div className="flex flex-wrap gap-1.5 text-xs mb-3">
                  {w.workout_category && <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{w.workout_category}</span>}
                  {w.difficulty && <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground capitalize">{w.difficulty}</span>}
                  {w.est_duration_min && <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{w.est_duration_min} min</span>}
                </div>
                {w.similarity_score != null && (
                  <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 mb-3">
                    <p className="text-xs font-medium text-amber-800">{Math.round(w.similarity_score * 100)}% similar to an existing workout</p>
                    {w.similarity_note && <p className="text-[11px] text-amber-700 mt-0.5">{w.similarity_note}</p>}
                  </div>
                )}
                {(workoutExercises[w.workout_id] || []).length > 0 && (
                  <ul className="text-xs text-muted-foreground mb-3 space-y-0.5">
                    {(workoutExercises[w.workout_id] || []).map((be, i) => (
                      <li key={i}>• {be.step_type === 'rest' ? 'Rest' : be.exercise_title_raw}</li>
                    ))}
                  </ul>
                )}
                {w.notes && <p className="text-xs text-muted-foreground mb-2">{w.notes}</p>}

                {rejecting === w.id ? (
                  <div className="mt-3 space-y-2">
                    <Textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason for rejection (optional)…" className="text-sm" rows={2} />
                    <div className="flex gap-2">
                      <Button size="sm" variant="destructive" onClick={() => rejectWorkout(w)} disabled={processing === w.id} className="flex-1">
                        {processing === w.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm reject'}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { setRejecting(null); setReason(''); }}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2 mt-3">
                    <Button size="sm" onClick={() => approveWorkout(w)} disabled={processing === w.id} className="flex-1">
                      {processing === w.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="h-4 w-4" /> Approve</>}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setRejecting(w.id)} disabled={processing === w.id}>
                      <X className="h-4 w-4" /> Reject
                    </Button>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )
      ) : pending.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-16">No exercises pending review.</p>
      ) : (
        <div className="space-y-3">
          {pending.map(ex => (
            <Card key={ex.id} className="rounded-2xl border-border p-4">
              <div className="mb-2">
                <p className="font-medium">{ex.name}</p>
                <p className="text-xs text-muted-foreground">Submitted by {ex.author_name || 'Unknown'}</p>
              </div>
              <div className="flex flex-wrap gap-1.5 text-xs mb-3">
                {ex.movement_pattern && <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground capitalize">{ex.movement_pattern}</span>}
                {ex.body_region && <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{ex.body_region}</span>}
                {ex.equipment && <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{ex.equipment}</span>}
                {ex.primary_muscle_group && <span className="px-2 py-0.5 rounded-full bg-brand/10 text-brand">{ex.primary_muscle_group}</span>}
              </div>
              {ex.video_url && (
                <a href={ex.video_url} target="_blank" rel="noreferrer" className="text-xs text-brand underline break-all">{ex.video_url}</a>
              )}
              {ex.notes && <p className="text-xs text-muted-foreground mt-2">{ex.notes}</p>}

              {rejecting === ex.id ? (
                <div className="mt-3 space-y-2">
                  <Textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason for rejection (optional)…" className="text-sm" rows={2} />
                  <div className="flex gap-2">
                    <Button size="sm" variant="destructive" onClick={() => reject(ex)} disabled={processing === ex.id} className="flex-1">
                      {processing === ex.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm reject'}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { setRejecting(null); setReason(''); }}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2 mt-3">
                  <Button size="sm" onClick={() => approve(ex)} disabled={processing === ex.id} className="flex-1">
                    {processing === ex.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="h-4 w-4" /> Approve</>}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setRejecting(ex.id)} disabled={processing === ex.id}>
                    <X className="h-4 w-4" /> Reject
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}