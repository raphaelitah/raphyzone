// Provider-agnostic structured-output LLM call, used by every AI-driven function
// in this directory (plan generation, workout swaps, reason verification). This
// replaces Base44's `base44.asServiceRole.integrations.Core.InvokeLLM({ prompt,
// response_json_schema })`, which handled the provider/API key transparently —
// here you own that choice.
//
// Backed by Groq (free tier, OpenAI-compatible chat completions API), via forced
// tool-use for structured JSON output. Requires the GROQ_API_KEY secret:
//   supabase secrets set GROQ_API_KEY=gsk_... --project-ref <ref>

export interface LLMSchema {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
}

const GROQ_MODEL = 'openai/gpt-oss-120b';

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

export async function callLLM({ prompt, schema }: { prompt: string; schema: LLMSchema }): Promise<any> {
  const apiKey = Deno.env.get('GROQ_API_KEY');
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not set. Run `supabase secrets set GROQ_API_KEY=...` before deploying AI-driven functions.');
  }

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: 'user', content: prompt }],
      tools: [{
        type: 'function',
        function: { name: 'respond', description: 'Return the structured result.', parameters: allowNullOnOptionalFields(schema) },
      }],
      tool_choice: { type: 'function', function: { name: 'respond' } },
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Groq API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall?.function?.arguments) {
    throw new Error('Groq response had no structured tool call.');
  }
  return JSON.parse(toolCall.function.arguments);
}
