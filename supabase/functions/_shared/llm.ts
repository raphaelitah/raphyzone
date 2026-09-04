// Provider-agnostic structured-output LLM call, used by every AI-driven function
// in this directory (plan generation, workout swaps, reason verification). This
// replaces Base44's `base44.asServiceRole.integrations.Core.InvokeLLM({ prompt,
// response_json_schema })`, which handled the provider/API key transparently —
// here you own that choice.
//
// Backed by two free-tier providers, tried in order, via forced tool-use for
// structured JSON output:
//   1. Groq   (OpenAI-compatible) — GROQ_API_KEY
//   2. Gemini (OpenAI-compatible endpoint) — GEMINI_API_KEY
// Each provider has its own independent rate-limit budget, so when Groq's
// shared 8000 TPM cap is exhausted, calls fall over to Gemini instead of
// queuing/retrying against the same exhausted quota. Set the secrets with:
//   supabase secrets set GROQ_API_KEY=gsk_... --project-ref <ref>
//   supabase secrets set GEMINI_API_KEY=AIza... --project-ref <ref>
// A provider with no key set is skipped rather than failing the request.

import { getServiceClient } from './supabaseAdmin.ts';

export interface LLMSchema {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
}

interface Provider {
  name: string;
  envKey: string;
  baseUrl: string;
  model: string;
}

// This account's Groq org caps every available model — 120b, 20b, qwen3.6-27b —
// at the same 8,000 tokens/minute (TPM) on the free "on_demand" tier (confirmed
// empirically: identical "Limit 8000" in the 413 body regardless of model). So a
// smaller/faster model buys nothing here; the fix for oversized prompts (e.g.
// generateWeeklyPlan's catalog-heavy selection call) is cutting the prompt
// itself — see filterCatalogForSelection and the trimmed buildWorkoutCatalog in
// planContext.ts. That's also why a second provider (Gemini) with its own
// separate quota is worth having, rather than just retrying Groq harder.
const PROVIDERS: Provider[] = [
  {
    name: 'groq',
    envKey: 'GROQ_API_KEY',
    baseUrl: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'openai/gpt-oss-120b',
  },
  {
    name: 'gemini',
    envKey: 'GEMINI_API_KEY',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    model: 'gemini-3.6-flash',
  },
];

// Groq's tool-call validator rejects `null` for a property whose declared type is
// a plain string like "string" — even when that property isn't in `required`, and
// even though models routinely emit null for "not applicable here". Every schema
// in this directory has optional fields for exactly that reason (e.g. `focus` only
// applies to strength-modality days), so widen every non-required property's type
// to accept null too, recursively, rather than special-casing each caller. Gemini's
// OpenAI-compat layer is more lenient but tolerates the same widened schema fine.
function allowNullOnOptionalFields(node: any, required: string[] = []): any {
  if (Array.isArray(node)) return node.map((n) => allowNullOnOptionalFields(n));
  if (node == null || typeof node !== 'object') return node;

  const out: any = { ...node };
  if (out.type === 'object' && out.properties) {
    const req: string[] = out.required || [];
    out.properties = Object.fromEntries(
      Object.entries(out.properties).map(([key, propSchema]: [string, any]) => {
        const widened = allowNullOnOptionalFields(propSchema);
        if (!req.includes(key) && typeof widened.type === 'string') {
          widened.type = [widened.type, 'null'];
        }
        return [key, widened];
      })
    );
  } else if (out.type === 'array' && out.items) {
    out.items = allowNullOnOptionalFields(out.items);
  }
  return out;
}

// Fire-and-forget insert into llm_call_logs (public.llm_call_logs, admin-only
// read via is_admin() RLS) so the AdminAlerts page can surface provider errors
// and rate-limit headroom without adding latency to the caller's request.
function logLLMCall(row: {
  functionName: string;
  model: string;
  status: 'ok' | 'error';
  attempt: number;
  latencyMs: number;
  errorMessage?: string;
  rateLimitHeaders?: Headers;
}) {
  try {
    const h = row.rateLimitHeaders;
    const client = getServiceClient();
    client.from('llm_call_logs').insert({
      function_name: row.functionName,
      model: row.model,
      status: row.status,
      attempt: row.attempt,
      latency_ms: row.latencyMs,
      error_message: row.errorMessage ?? null,
      rate_limit_remaining_tokens: h ? numOrNull(h.get('x-ratelimit-remaining-tokens')) : null,
      rate_limit_remaining_requests: h ? numOrNull(h.get('x-ratelimit-remaining-requests')) : null,
      rate_limit_reset_tokens_seconds: h ? numOrNull(h.get('x-ratelimit-reset-tokens')) : null,
    }).then(({ error }) => {
      if (error) console.error('llm_call_logs insert failed:', error.message);
    });
  } catch (err) {
    // Logging must never break the actual LLM call.
    console.error('logLLMCall failed:', (err as Error).message);
  }
}

function numOrNull(v: string | null): number | null {
  if (v == null) return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

async function callProviderOnce({ provider, prompt, schema, functionName, attempt }: { provider: Provider; prompt: string; schema: LLMSchema; functionName: string; attempt: number }): Promise<any> {
  const apiKey = Deno.env.get(provider.envKey);
  if (!apiKey) {
    throw new Error(`${provider.envKey} is not set`);
  }

  const loggedModel = `${provider.name}/${provider.model}`;
  const startedAt = Date.now();
  const res = await fetch(provider.baseUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: provider.model,
      messages: [{ role: 'user', content: prompt }],
      tools: [{
        type: 'function',
        function: { name: 'respond', description: 'Return the structured result.', parameters: allowNullOnOptionalFields(schema) },
      }],
      tool_choice: { type: 'function', function: { name: 'respond' } },
    }),
  });
  const latencyMs = Date.now() - startedAt;

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    logLLMCall({ functionName, model: loggedModel, status: 'error', attempt, latencyMs, errorMessage: `${res.status}: ${text}`.slice(0, 2000), rateLimitHeaders: res.headers });
    throw new Error(`${provider.name} API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall?.function?.arguments || toolCall.function.name !== 'respond') {
    const message = `${provider.name} response had no valid 'respond' tool call (got ${toolCall?.function?.name ?? 'none'}).`;
    logLLMCall({ functionName, model: loggedModel, status: 'error', attempt, latencyMs, errorMessage: message, rateLimitHeaders: res.headers });
    throw new Error(message);
  }
  logLLMCall({ functionName, model: loggedModel, status: 'ok', attempt, latencyMs, rateLimitHeaders: res.headers });
  return JSON.parse(toolCall.function.arguments);
}

// Both providers occasionally hallucinate a different tool name (seen on Groq:
// 'json' instead of the forced 'respond'), which the API rejects with a 400
// tool_use_failed, or return rate-limit 429s under load — both transient, not
// systemic, so retry a couple of times before falling over to the next
// provider. Auth/config errors (missing key, 401/403) are not retried — those
// won't fix themselves within the same provider, so we move on immediately.
const RETRYABLE_STATUS = /API error (400|429|5\d\d)/;
const AUTH_STATUS = /API error (401|403)/;

// On our free "on_demand" tier the shared 8000 TPM budget gets exhausted for
// minutes at a stretch (see llm_call_logs), and Groq's 429 body tells us
// exactly how long until it resets, e.g. "Please try again in 51.42s." A flat
// short backoff never survives that wait, so parse it and sleep the requested
// amount (plus a small buffer for clock drift) instead of guessing. Capped so
// one stuck call can't stall the request indefinitely. If a provider is this
// rate-limited we also skip straight to the next provider rather than
// waiting it out — see callLLM.
const RETRY_AFTER_RE = /try again in ([\d.]+)s/i;
const MAX_RATE_LIMIT_WAIT_MS = 60_000;

function backoffMsFor(message: string, attempt: number): number {
  const match = RETRY_AFTER_RE.exec(message);
  if (match) {
    const waitMs = Math.ceil(parseFloat(match[1]) * 1000) + 500;
    return Math.min(waitMs, MAX_RATE_LIMIT_WAIT_MS);
  }
  return 400 * attempt;
}

async function callProviderWithRetry({ provider, prompt, schema, functionName }: { provider: Provider; prompt: string; schema: LLMSchema; functionName: string }): Promise<any> {
  const maxAttempts = 2;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await callProviderOnce({ provider, prompt, schema, functionName, attempt });
    } catch (err) {
      lastError = err;
      const message = (err as Error).message || '';
      // A 429 (rate limit) means this provider's quota is exhausted right now —
      // move to the next provider instead of burning the retry budget waiting
      // on the same exhausted bucket.
      if (message.includes('API error 429')) throw err;
      const retryable = RETRYABLE_STATUS.test(message) || message.includes("no valid 'respond' tool call");
      if (!retryable || attempt === maxAttempts) throw err;
      await new Promise((resolve) => setTimeout(resolve, backoffMsFor(message, attempt)));
    }
  }
  throw lastError;
}

export async function callLLM(args: { prompt: string; schema: LLMSchema; functionName: string }): Promise<any> {
  const available = PROVIDERS.filter((p) => Deno.env.get(p.envKey));
  if (available.length === 0) {
    throw new Error('No LLM provider configured. Set GROQ_API_KEY and/or GEMINI_API_KEY before deploying AI-driven functions.');
  }

  let lastError: unknown;
  for (const provider of available) {
    try {
      return await callProviderWithRetry({ provider, ...args });
    } catch (err) {
      lastError = err;
      console.error(`${provider.name} failed for ${args.functionName}, trying next provider:`, (err as Error).message);
    }
  }
  throw lastError;
}
