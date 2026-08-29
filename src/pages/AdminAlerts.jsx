import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { Card } from '@/components/ui/card';
import { ArrowLeft, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const LOOKBACK_LIMIT = 200;

export default function AdminAlerts() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    if (user.role !== 'admin') { navigate('/'); return; }
    load();
  }, [user]);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('llm_call_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(LOOKBACK_LIMIT);
      setLogs(data || []);
    } finally { setLoading(false); }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-muted border-t-brand rounded-full animate-spin" /></div>;

  const errors = logs.filter((l) => l.status === 'error');
  const latest = logs[0];
  const remainingTokens = latest?.rate_limit_remaining_tokens;
  const tokenCap = 8000; // Groq free-tier TPM cap for every model on this account — see _shared/llm.ts
  const tokenPct = remainingTokens != null ? Math.round((remainingTokens / tokenCap) * 100) : null;
  const recentErrorRate = logs.length ? Math.round((errors.length / logs.length) * 100) : 0;

  return (
    <div className="px-5 pt-10 pb-8">
      <button onClick={() => navigate('/profile')} className="flex items-center gap-1 text-sm text-muted-foreground mb-4 hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to profile
      </button>
      <h1 className="text-2xl font-semibold tracking-tight mb-1">LLM Health</h1>
      <p className="text-sm text-muted-foreground mb-5">Last {logs.length} calls to Groq across generateWeeklyPlan, swapWorkout, suggestExerciseSubstitutes, and verifyWorkoutReasons.</p>

      <div className="grid grid-cols-2 gap-3 mb-5">
        <Card className="rounded-2xl border-border p-4">
          <p className="text-xs text-muted-foreground mb-1">Error rate</p>
          <p className={cn('text-2xl font-semibold', recentErrorRate > 0 ? 'text-rose-600' : 'text-emerald-600')}>{recentErrorRate}%</p>
          <p className="text-xs text-muted-foreground mt-0.5">{errors.length} of {logs.length} calls</p>
        </Card>
        <Card className="rounded-2xl border-border p-4">
          <p className="text-xs text-muted-foreground mb-1">Tokens/min remaining</p>
          <p className={cn('text-2xl font-semibold', tokenPct != null && tokenPct < 20 ? 'text-rose-600' : 'text-foreground')}>
            {remainingTokens != null ? remainingTokens.toLocaleString() : '—'}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">{tokenPct != null ? `${tokenPct}% of ${tokenCap.toLocaleString()} cap` : 'no data yet'}</p>
        </Card>
      </div>

      <h2 className="text-sm font-medium mb-2">Recent errors</h2>
      {errors.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-10 flex flex-col items-center gap-2">
          <CheckCircle2 className="h-6 w-6 text-emerald-500" />
          No errors in the last {logs.length} calls.
        </p>
      ) : (
        <div className="space-y-2">
          {errors.slice(0, 30).map((l) => (
            <Card key={l.id} className="rounded-xl border-rose-200 bg-rose-50 p-3">
              <div className="flex items-start justify-between gap-2 mb-1">
                <span className="text-xs font-medium text-rose-800 flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5" /> {l.function_name} (attempt {l.attempt})
                </span>
                <span className="text-[11px] text-rose-600 whitespace-nowrap">{new Date(l.created_at).toLocaleString()}</span>
              </div>
              <p className="text-xs text-rose-700 break-words">{l.error_message}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
