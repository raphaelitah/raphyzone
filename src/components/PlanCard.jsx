import { useState } from 'react';
import { CreditCard, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useEntitlement } from '@/hooks/useEntitlement';
import { openBillingPortal } from '@/lib/billing';
import UpgradeSheet from '@/components/UpgradeSheet';
import { toast } from '@/components/ui/use-toast';

const fmtDate = (iso) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

function describePlan(ent, trialDaysLeft) {
  switch (ent.reason) {
    case 'subscription': {
      const plan = ent.plan_interval === 'year' ? 'Annual' : 'Monthly';
      if (ent.subscription_status === 'past_due') return { title: `Premium · ${plan}`, detail: 'Payment failed — update your card to keep access.' };
      if (ent.cancel_at_period_end) return { title: `Premium · ${plan}`, detail: `Ends ${fmtDate(ent.premium_until)}` };
      return { title: `Premium · ${plan}`, detail: `Renews ${fmtDate(ent.premium_until)}` };
    }
    case 'trial':
      return { title: 'Premium trial', detail: `${trialDaysLeft} ${trialDaysLeft === 1 ? 'day' : 'days'} left — full access` };
    case 'free':
      return { title: 'Free plan', detail: `${ent.ai_remaining} of ${ent.ai_limit} AI actions left this month` };
    default:
      return { title: 'Premium', detail: 'Complimentary access' };
  }
}

export default function PlanCard() {
  const { entitlement, trialDaysLeft } = useEntitlement();
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [opening, setOpening] = useState(false);

  if (!entitlement || entitlement.paywall_enabled === false) return null;
  const { title, detail } = describePlan(entitlement, trialDaysLeft);
  const needsUpgrade = entitlement.reason === 'free' || entitlement.reason === 'trial';

  const manage = async () => {
    setOpening(true);
    try {
      await openBillingPortal();
    } catch (err) {
      toast({ title: 'Could not open billing', description: err.message, variant: 'destructive' });
      setOpening(false);
    }
  };

  return (
    <>
      <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Plan</h2>
      <Card className="rounded-2xl border-border p-4 mb-5" data-testid="plan-card">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium flex items-center gap-1.5"><CreditCard className="h-4 w-4 text-muted-foreground" /> {title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{detail}</p>
          </div>
          {needsUpgrade && (
            <Button size="sm" onClick={() => setUpgradeOpen(true)} className="rounded-lg shrink-0 bg-brand text-brand-foreground hover:bg-brand/90">Upgrade</Button>
          )}
          {entitlement.has_billing && !needsUpgrade && (
            <Button size="sm" variant="outline" onClick={manage} disabled={opening} className="rounded-lg shrink-0">
              {opening ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Manage'}
            </Button>
          )}
        </div>
      </Card>
      <UpgradeSheet open={upgradeOpen} onOpenChange={setUpgradeOpen} reason="general" />
    </>
  );
}
