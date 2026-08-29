import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { getUserFromRequest } from '../_shared/auth.ts';
import { callLLM } from '../_shared/llm.ts';
import { corsHeaders } from '../_shared/cors.ts';

// Ported from the inline base44.integrations.Core.InvokeLLM call in
// src/pages/WorkoutExecution.jsx's requestSubstitute(). The client ranks
// candidate exercises by movement/muscle/equipment overlap and sends the
// top few here; this asks the LLM to explain each one and score confidence.
//
// Input: { exercise, candidates } where exercise = the one being replaced
// and candidates = [{ name, primary_muscle_group, movement_pattern, equipment }]
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const user = await getUserFromRequest(req);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });

    const body = await req.json();
    const { exercise, candidates } = body;
    if (!exercise || !Array.isArray(candidates) || !candidates.length) {
      return Response.json({ alternatives: [] }, { headers: corsHeaders });
    }

    const prompt = `An athlete wants to substitute the exercise "${exercise.name}" (movement: ${exercise.movement_pattern}, primary muscle: ${exercise.primary_muscle_group || 'n/a'}, equipment: ${exercise.equipment}).
Here are candidate alternatives with their details:
${candidates.map((c: any) => `- ${c.name} (muscle: ${c.primary_muscle_group || 'n/a'}, movement: ${c.movement_pattern}, equipment: ${c.equipment})`).join('\n')}

For each candidate, explain in one sentence why it's a good substitute (same muscles/movement/intent) and give a confidence 0-100. Return JSON.`;

    const res = await callLLM({
      functionName: 'suggestExerciseSubstitutes',
      prompt,
      schema: {
        type: 'object',
        properties: {
          alternatives: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                reason: { type: 'string' },
                confidence: { type: 'number' },
              },
              required: ['name', 'reason', 'confidence'],
            },
          },
        },
        required: ['alternatives'],
      },
    });

    return Response.json({ alternatives: res.alternatives || [] }, { headers: corsHeaders });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500, headers: corsHeaders });
  }
});
