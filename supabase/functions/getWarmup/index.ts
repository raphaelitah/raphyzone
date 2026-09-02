import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { getUserFromRequest } from '../_shared/auth.ts';
import { getServiceClient } from '../_shared/supabaseAdmin.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { generateWarmup } from '../_shared/warmupGenerator.ts';

// Generates a warm up for a single workout for the calling user's profile.
// Used wherever a workout is assigned to a plan slot outside of applySwap
// (manual adds, rest-day picks, activity-suggestion picks, and the
// generateWeeklyPlan fallback) so those slots get a warm up too.
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const user = await getUserFromRequest(req);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });

    const body = await req.json();
    const { workout_id } = body;
    if (!workout_id) return Response.json({ error: 'missing fields' }, { status: 400, headers: corsHeaders });

    const supabase = getServiceClient();
    const [{ data: workout }, { data: profiles }, { data: exerciseCatalog }] = await Promise.all([
      supabase.from('workouts').select('*').eq('id', workout_id).maybeSingle(),
      supabase.from('athlete_profiles').select('*').eq('user_id', user.id),
      supabase.from('exercises').select('id, name, movement_category, body_region, movement_pattern, primary_muscle_group, secondary_muscle_group, equipment_tags, modality'),
    ]);

    if (!workout) return Response.json({ error: 'Workout not found' }, { status: 404, headers: corsHeaders });

    const profile = profiles?.[0];
    let warmup = null;
    if (profile) {
      try {
        warmup = generateWarmup(
          profile,
          [...(profile?.available_equipment || []), ...(profile?.custom_equipment || [])],
          workout,
          exerciseCatalog || []
        );
      } catch {
        warmup = null;
      }
    }

    return Response.json({ warmup }, { headers: corsHeaders });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500, headers: corsHeaders });
  }
});
