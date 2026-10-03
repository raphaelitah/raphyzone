#!/usr/bin/env node
// Probes every configured LLM key with a one-token request and prints which can answer.
// Never prints key values. Used by the "LLM key check" workflow (GitHub secrets) and
// runnable locally: GROQ_API_KEY=... GEMINI_API_KEY_2=... node scripts/check-llm-keys.mjs
import { discoverProviders } from './social/lib/llm.mjs';

const providers = discoverProviders();
if (!providers.length) { console.error('No keys in the environment.'); process.exit(1); }
let bad = 0;
for (const p of providers) {
  try {
    const res = await fetch(p.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${p.key}` },
      body: JSON.stringify({ model: p.model, max_tokens: 5, messages: [{ role: 'user', content: 'Reply with: ok' }] }),
    });
    const text = await res.text();
    const reason = res.ok ? '' : (text.match(/"message":\s*"([^"]{0,120})/)?.[1] || text.slice(0, 120));
    console.log(`${p.name.padEnd(10)} ${res.ok ? 'OK' : `FAIL ${res.status}`} ${reason}`);
    if (!res.ok) bad++;
  } catch (err) { console.log(`${p.name.padEnd(10)} ERROR ${err.message}`); bad++; }
}
process.exit(bad ? 1 : 0);
