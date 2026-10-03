// Provider-agnostic JSON generation for the Friday writer. Free tiers only:
// Groq first, then every GEMINI_API_KEY[_N] — the same fallback order the app's
// edge functions use (supabase/functions/_shared/llm.ts). To use another model
// later (e.g. a Claude routine), only this file changes.
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

export function discoverProviders(env = process.env) {
  const providers = [];
  if (env.GROQ_API_KEY) {
    providers.push({ name: 'groq', key: env.GROQ_API_KEY, url: 'https://api.groq.com/openai/v1/chat/completions', model: 'openai/gpt-oss-120b' });
  }
  const geminiKeys = Object.keys(env)
    .filter((k) => /^GEMINI_API_KEY(_\d+)?$/.test(k) && env[k])
    .sort((a, b) => (a === 'GEMINI_API_KEY' ? 0 : parseInt(a.split('_').pop(), 10)) - (b === 'GEMINI_API_KEY' ? 0 : parseInt(b.split('_').pop(), 10)));
  for (const k of geminiKeys) providers.push({ name: k.toLowerCase(), key: env[k], url: GEMINI_URL, model: 'gemini-3.6-flash' });
  return providers;
}

function parseJson(text) {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(cleaned);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Returns parsed JSON. `validate` throws on bad output, which triggers a retry
// on the next provider rather than saving a broken post.
// `log(row)` receives one llm_call_logs-shaped row per request (ok or error) so the
// writer's usage shows up next to the edge functions' in AdminAlerts; it must not throw.
// A provider that answers 429 with a quota message is skipped for the rest of the run.
export async function generateJson({ system, user, validate = (x) => x, providers = discoverProviders(), functionName = 'social:writer', log = () => {} }) {
  if (!providers.length) throw new Error('No LLM provider configured (set GROQ_API_KEY and/or GEMINI_API_KEY).');
  const errors = [];
  let attempt = 0;
  for (let round = 0; round < 2; round++) {
    const live = providers.filter((p) => !exhausted.has(p.name));
    for (const p of live.length ? live : providers) {
      attempt++;
      const startedAt = Date.now();
      const row = { function_name: functionName, model: `${p.name}/${p.model}`, attempt, status: 'error' };
      try {
        const res = await fetch(p.url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${p.key}` },
          body: JSON.stringify({
            model: p.model,
            temperature: 0.8,
            response_format: { type: 'json_object' },
            messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
          }),
        });
        row.latency_ms = Date.now() - startedAt;
        row.rate_limit_remaining_tokens = num(res.headers.get('x-ratelimit-remaining-tokens'));
        row.rate_limit_remaining_requests = num(res.headers.get('x-ratelimit-remaining-requests'));
        if (!res.ok) {
          const text = (await res.text()).slice(0, 200);
          if (res.status === 429 && /quota|per day|daily/i.test(text)) exhausted.add(p.name);
          throw new Error(`${res.status} ${text}`);
        }
        const body = await res.json();
        row.prompt_tokens = body.usage?.prompt_tokens ?? null;
        row.completion_tokens = body.usage?.completion_tokens ?? null;
        const out = validate(parseJson(body.choices[0].message.content));
        log({ ...row, status: 'ok' });
        return out;
      } catch (err) {
        row.latency_ms ??= Date.now() - startedAt;
        log({ ...row, error_message: String(err.message).slice(0, 2000) });
        errors.push(`${p.name}: ${err.message}`);
      }
    }
    await sleep(15000); // per-minute rate limits reset; then one more pass
  }
  throw new Error(`All providers failed:\n${errors.join('\n')}`);
}

const exhausted = new Set();

function num(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}
