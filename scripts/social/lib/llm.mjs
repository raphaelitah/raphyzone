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
export async function generateJson({ system, user, validate = (x) => x, providers = discoverProviders() }) {
  if (!providers.length) throw new Error('No LLM provider configured (set GROQ_API_KEY and/or GEMINI_API_KEY).');
  const errors = [];
  for (let round = 0; round < 2; round++) {
    for (const p of providers) {
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
        if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
        const body = await res.json();
        return validate(parseJson(body.choices[0].message.content));
      } catch (err) {
        errors.push(`${p.name}: ${err.message}`);
      }
    }
    await sleep(15000); // per-minute rate limits reset; then one more pass
  }
  throw new Error(`All providers failed:\n${errors.join('\n')}`);
}
