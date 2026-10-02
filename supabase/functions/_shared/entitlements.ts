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

// Approved catalog rows this user may be given by plan generation/swaps:
// everything for premium (or trialing) users, only is_free workouts otherwise.
export async function loadApprovedCatalog(supabase: any, userId: string) {
  let query = supabase.from('workouts').select('*').eq('status', 'approved');
  if (!(await isPremium(supabase, userId))) query = query.eq('is_free', true);
  return query;
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
