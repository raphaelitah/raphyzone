import { corsHeaders } from './cors.ts';

// Free/premium gating for edge functions. The database owns the rules
// (is_premium, consume_ai_action in the free_and_premium_tiers migration);
// this only calls them with the service-role client after the caller's JWT
// has been verified.

export async function isPremium(supabase: any, userId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_premium', { p_user: userId });
  if (error) throw new Error(`Entitlement check failed: ${error.message}`);
  return !!data;
}

// How many of the athlete's own saved workouts are offered to the planner (most recently
// changed first). Generous: a week needs at most 7 picks.
const MAX_OWN_CUSTOM_WORKOUTS = 30;

// Workouts the AI may assign this athlete, for plan generation and swap suggestions:
//   * approved catalog rows: everything for premium (or trialing) users, only is_free
//     workouts otherwise;
//   * the athlete's own saved custom workouts (status 'private', owned by them), for any
//     tier since they own them. They never reach anyone else: the filter is by owner.
// The athlete's own come first, so the per-modality cap applied later
// (planContext.ts filterCatalogForSelection) can't crowd them out of the candidates.
// Returns the same { data, error } shape a query would; a failure loading the athlete's
// own workouts is not fatal (the planner just falls back to the catalog alone).
export async function loadPlannerCatalog(supabase: any, userId: string) {
  let catalogQuery = supabase.from('workouts').select('*').eq('status', 'approved');
  if (!(await isPremium(supabase, userId))) catalogQuery = catalogQuery.eq('is_free', true);
  const [catalog, own] = await Promise.all([
    catalogQuery,
    supabase
      .from('workouts')
      .select('*')
      .eq('owner_id', userId)
      .eq('status', 'private')
      .order('updated_date', { ascending: false })
      .limit(MAX_OWN_CUSTOM_WORKOUTS),
  ]);
  if (catalog.error) return catalog;
  const mine = own.error ? [] : (own.data || []);
  return { data: [...mine, ...(catalog.data || [])], error: null };
}

export type AiQuota = { usageId: string };

// Records one metered AI action, or returns the 402 response to send when the
// free monthly quota is used up. Pair with refundAiAction if the action fails
// before delivering anything, so a failed call doesn't burn the quota.
export async function consumeAiAction(
  supabase: any,
  userId: string,
  action: string,
): Promise<{ quota: AiQuota } | { denied: Response }> {
  const { data, error } = await supabase.rpc('consume_ai_action', { p_user: userId, p_action: action });
  if (error) throw new Error(`Quota check failed: ${error.message}`);
  if (!data?.allowed) {
    return {
      denied: Response.json(
        {
          error: 'ai_quota_exceeded',
          message: `You've used your ${data.limit} free AI action${data.limit === 1 ? '' : 's'} this month. Upgrade to premium for unlimited use.`,
          used: data.used,
          limit: data.limit,
        },
        { status: 402, headers: corsHeaders },
      ),
    };
  }
  return { quota: { usageId: data.usage_id } };
}

export async function refundAiAction(supabase: any, quota: AiQuota) {
  try {
    await supabase.rpc('refund_ai_action', { p_usage_id: quota.usageId });
  } catch (err) {
    console.error('refund_ai_action failed:', (err as Error).message);
  }
}
