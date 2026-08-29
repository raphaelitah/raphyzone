// Provider-agnostic structured-output LLM call, used by every AI-driven function
// in this directory (plan generation, workout swaps, reason verification). This
// replaces Base44's `base44.asServiceRole.integrations.Core.InvokeLLM({ prompt,
// response_json_schema })`, which handled the provider/API key transparently —
// here you own that choice.
//
// Backed by Groq (free tier, OpenAI-compatible chat completions API), via forced
// tool-use for structured JSON output. Requires the GROQ_API_KEY secret:
//   supabase secrets set GROQ_API_KEY=gsk_... --project-ref <ref>

import { getServiceClient } from './supabaseAdmin.ts';

export interface LLMSchema {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
}

const GROQ_MODEL = 'openai/gpt-oss-120b';

// This account's Groq org caps every available model — 120b, 20b, qwen3.6-27b —
// at the same 8,000 tokens/minute (TPM) on the free "on_demand" tier (confirmed
// empirically: identical "Limit 8000" in the 413 body regardless of model). So a
// smaller/faster model buys nothing here; the fix for oversized prompts (e.g.
// generateWeeklyPlan's catalog-heavy selection call) is cutting the prompt
// itself — see filterCatalogForSelection and the trimmed buildWorkoutCatalog in
// planContext.ts.

// Groq's tool-call validator rejects `null` for a property whose declared type is
// a plain string like "string" — even when that property isn't in `required`, and
// even though models routinely emit null for "not applicable here". Every schema
// in this directory has optional fields for exactly that reason (e.g. `focus` only
// applies to strength-modality days), so widen every non-required property's type
// to accept null too, recursively, rather than special-casing each caller.
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
// and Groq's rate-limit headroom without adding latency to the caller's request.
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

async function callLLMOnce({ prompt, schema, model, functionName, attempt }: { prompt: string; schema: LLMSchema; model?: string; functionName: string; attempt: number }): Promise<any> {
  const apiKey = Deno.env.get('GROQ_API_KEY');
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not set. Run `supabase secrets set GROQ_API_KEY=...` before deploying AI-driven functions.');
  }

  const usedModel = model || GROQ_MODEL;
  const startedAt = Date.now();
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: usedModel,
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
    logLLMCall({ functionName, model: usedModel, status: 'error', attempt, latencyMs, errorMessage: `${res.status}: ${text}`.slice(0, 2000), rateLimitHeaders: res.headers });
    throw new Error(`Groq API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall?.function?.arguments || toolCall.function.name !== 'respond') {
    const message = `Groq response had no valid 'respond' tool call (got ${toolCall?.function?.name ?? 'none'}).`;
    logLLMCall({ functionName, model: usedModel, status: 'error', attempt, latencyMs, errorMessage: message, rateLimitHeaders: res.headers });
    throw new Error(message);
  }
  logLLMCall({ functionName, model: usedModel, status: 'ok', attempt, latencyMs, rateLimitHeaders: res.headers });
  return JSON.parse(toolCall.function.arguments);
}

// Groq occasionally hallucinates a different tool name (seen: 'json' instead of
// the forced 'respond'), which the API rejects with a 400 tool_use_failed, or
// returns rate-limit 429s under load — both transient, not systemic, so retry a
// couple of times with a short backoff before giving up. Auth/config errors
// (missing key, 401/403) are not retried — those won't fix themselves.
const RETRYABLE_STATUS = /Groq API error (400|429|5\d\d)/;
export async function callLLM(args: { prompt: string; schema: LLMSchema; model?: string; functionName: string }): Promise<any> {
  const maxAttempts = 3;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await callLLMOnce({ ...args, attempt });
    } catch (err) {
      lastError = err;
      const message = (err as Error).message || '';
      const retryable = RETRYABLE_STATUS.test(message) || message.includes("no valid 'respond' tool call");
      if (!retryable || attempt === maxAttempts) throw err;
      await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
    }
  }
  throw lastError;
}
