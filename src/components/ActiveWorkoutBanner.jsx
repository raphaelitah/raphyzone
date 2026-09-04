import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Clock, ChevronRight } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import useActiveWorkoutSession from '@/hooks/useActiveWorkoutSession';

function formatDuration(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
    : `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

// Sticky banner shown on every screen except the workout itself, so the
// athlete can always get back to an in-progress workout (and see its clock
// still running) no matter where they navigated to.
export default function ActiveWorkoutBanner() {
  const { user } = useAuth();
  const location = useLocation();
  const session = useActiveWorkoutSession(user, location.pathname);
  const navigate = useNavigate();
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!session?.start_timestamp) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [session?.start_timestamp]);

  if (!session) return null;
  if (location.pathname === `/workout/${session.workout_id}`) return null;

  const elapsed = session.start_timestamp
    ? (Date.now() - new Date(session.start_timestamp).getTime()) / 1000
    : null;

  return (
    <button
      onClick={() => navigate(`/workout/${session.workout_id}?date=${session.date}`)}
      className="sticky top-0 z-30 w-full flex items-center gap-2 px-4 py-2.5 bg-brand text-brand-foreground text-sm font-medium"
    >
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-foreground/60" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-foreground" />
      </span>
      <span className="flex-1 text-left truncate">Resume {session.workout_name}</span>
      {elapsed != null && (
        <span className="flex items-center gap-1 tabular-nums shrink-0">
          <Clock className="h-3.5 w-3.5" /> {formatDuration(elapsed)}
        </span>
      )}
      <ChevronRight className="h-4 w-4 shrink-0" />
    </button>
  );
}
