import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { Card } from '@/components/ui/card';
import { ArrowLeft, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const LOOKBACK_DAYS = 7;
const LOOKBACK_LIMIT = 1000; // PostgREST's default max rows
const GROQ_TPM_CAP = 8000; // Groq free-tier TPM cap for every model on this account — see _shared/llm.ts

// 'groq/openai/gpt-oss-120b', 'gemini_2/gemini-3.6-flash'; older rows say 'openai/gpt-oss-120b' (also Groq).
const providerOf = (model) => {
  const head = String(model || '').split('/')[0];
  return head === 'openai' ? 'groq' : head;
};
// Always listed, even before a key has made its first call (Gemini 4 was added after most logs).
const EXPECTED_PROVIDERS = ['groq', 'gemini', 'gemini_2', 'gemini_3', 'gemini_4'];
const providerLabel = (name) => {
  if (name === 'groq') return 'Groq';
  const m = /^gemini(?:_(\d+))?$/.exec(name);
  return m ? `Gemini ${m[1] || 1}` : name;
};
const errorKind = (msg) => {
  const m = String(msg || '');
  if (/quota|per day|daily/i.test(m)) return 'quota exhausted';
  if (/high demand|overloaded|503/i.test(m)) return 'overloaded';
  if (/denied|PERMISSION/i.test(m)) return 'access denied';
  if (/429/.test(m)) return 'rate limited';
  return 'error';
};
const fmt = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));

function summarize(logs) {
  const by = new Map();
  for (const l of logs) { // logs are newest-first
    const name = providerOf(l.model);
    const p = by.get(name) || { name, calls: 0, errors: 0, tokens: 0, kinds: {}, latest: l, lastOk: null };
    p.calls++;
    if (l.status === 'error') { p.errors++; const k = errorKind(l.error_message); p.kinds[k] = (p.kinds[k] || 0) + 1; }
    else if (!p.lastOk) p.lastOk = l.created_at;
    p.tokens += (l.prompt_tokens || 0) + (l.completion_tokens || 0);
    by.set(name, p);
  }
  for (const name of EXPECTED_PROVIDERS) if (!by.has(name)) by.set(name, { name, calls: 0, errors: 0, tokens: 0, kinds: {}, latest: null, lastOk: null });
  const order = (n) => { const i = EXPECTED_PROVIDERS.indexOf(n); return i < 0 ? 99 : i; };
  return [...by.values()].sort((a, b) => order(a.name) - order(b.name) || a.name.localeCompare(b.name));
}

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
      const since = new Date(Date.now() - LOOKBACK_DAYS * 86400000).toISOString();
      const { data } = await supabase
        .from('llm_call_logs')
        .select('*')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(LOOKBACK_LIMIT);
      setLogs(data || []);
    } finally { setLoading(false); }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-muted border-t-brand rounded-full animate-spin" /></div>;

  const errors = logs.filter((l) => l.status === 'error');
  const providers = summarize(logs);
  const tokensTotal = logs.reduce((a, l) => a + (l.prompt_tokens || 0) + (l.completion_tokens || 0), 0);
  const groqLatest = logs.find((l) => providerOf(l.model) === 'groq' && l.rate_limit_remaining_tokens != null);
  const byFunction = [...logs.reduce((m, l) => {
    const f = m.get(l.function_name) || { name: l.function_name, calls: 0, tokens: 0 };
    f.calls++; f.tokens += (l.prompt_tokens || 0) + (l.completion_tokens || 0);
    return m.set(l.function_name, f);
  }, new Map()).values()].sort((a, b) => b.calls - a.calls);

  return (
    <div className="px-5 pt-10 pb-8">
      <button onClick={() => navigate('/admin')} className="flex items-center gap-1 text-sm text-muted-foreground mb-4 hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to admin
      </button>
      <h1 className="text-2xl font-semibold tracking-tight mb-1">LLM Health</h1>
      <p className="text-sm text-muted-foreground mb-5">Last {LOOKBACK_DAYS} days: {logs.length} calls across every provider and function, {tokensTotal ? `${fmt(tokensTotal)} tokens logged` : 'token counts start filling in once the new edge functions run'}.</p>

      <h2 className="text-sm font-medium mb-2">Providers</h2>
      <div className="space-y-2 mb-5">
        {providers.map((p) => {
          if (!p.latest) {
            return (
              <Card key={p.name} className="rounded-2xl border-border p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{providerLabel(p.name)}</span>
                  <span className="text-xs text-muted-foreground">No calls in {LOOKBACK_DAYS} days</span>
                </div>
              </Card>
            );
          }
          const healthy = p.latest.status === 'ok';
          const lastKind = healthy ? null : errorKind(p.latest.error_message);
          const rate = Math.round((p.errors / p.calls) * 100);
          return (
            <Card key={p.name} className="rounded-2xl border-border p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{providerLabel(p.name)}</span>
                <span className={cn('text-xs font-medium', healthy ? 'text-emerald-600' : 'text-rose-600')}>{healthy ? 'Last call OK' : `Last call: ${lastKind}`}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {p.calls} calls · <span className={rate > 0 ? 'text-rose-600' : ''}>{rate}% errors</span>{p.tokens ? ` · ${fmt(p.tokens)} tokens` : ''}
                {p.lastOk ? ` · last OK ${new Date(p.lastOk).toLocaleString()}` : ' · no successful call'}
              </p>
              {p.errors > 0 && <p className="text-[11px] text-muted-foreground mt-0.5">{Object.entries(p.kinds).map(([k, n]) => `${n} ${k}`).join(' · ')}</p>}
              {p.name === 'groq' && groqLatest && (
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {groqLatest.rate_limit_remaining_tokens.toLocaleString()} of {GROQ_TPM_CAP.toLocaleString()} tokens/min left at last call
                </p>
              )}
            </Card>
          );
        })}
      </div>

      <h2 className="text-sm font-medium mb-2">By function</h2>
      <Card className="rounded-2xl border-border p-4 mb-5">
        {byFunction.map((f) => (
          <div key={f.name} className="flex justify-between text-xs py-0.5">
            <span>{f.name}</span>
            <span className="text-muted-foreground">{f.calls} calls{f.tokens ? ` · ${fmt(f.tokens)} tokens` : ''}</span>
          </div>
        ))}
      </Card>

      <h2 className="text-sm font-medium mb-2">Recent errors</h2>
      {errors.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-10 flex flex-col items-center gap-2">
          <CheckCircle2 className="h-6 w-6 text-emerald-500" />
          No errors in the last {LOOKBACK_DAYS} days.
        </p>
      ) : (
        <div className="space-y-2">
          {errors.slice(0, 30).map((l) => (
            <Card key={l.id} className="rounded-xl border-rose-200 bg-rose-50 p-3">
              <div className="flex items-start justify-between gap-2 mb-1">
                <span className="text-xs font-medium text-rose-800 flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5" /> {providerLabel(providerOf(l.model))} · {l.function_name} (attempt {l.attempt})
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
