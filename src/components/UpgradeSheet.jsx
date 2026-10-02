import { useState } from 'react';
import { Lock, Sparkles, Loader2 } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useEntitlement } from '@/hooks/useEntitlement';
import { PRICING } from '@/lib/pricing';
import { startCheckout } from '@/lib/billing';
import { cn } from '@/lib/utils';
import { toast } from '@/components/ui/use-toast';

const PERKS = [
  'The full workout library',
  'Unlimited AI weekly plans, swaps and substitutes',
  'Everything we add next',
];

export function LockBadge({ className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground ${className}`}>
      <Lock className="h-3 w-3" /> Premium
    </span>
  );
}

// `reason` picks the headline: 'workout' (locked workout), 'ai' (used-up AI quota) or 'general'.
export default function UpgradeSheet({ open, onOpenChange, reason = 'workout' }) {
  const { entitlement } = useEntitlement();
  const limit = entitlement?.ai_limit;
  const [interval, setInterval] = useState('year');
  const [busy, setBusy] = useState(false);

  const subscribe = async () => {
    setBusy(true);
    try {
      await startCheckout(interval);
    } catch (err) {
      toast({ title: 'Could not start checkout', description: err.message, variant: 'destructive' });
      setBusy(false);
    }
  };

  const title = { ai: 'AI limit reached', workout: 'This workout is premium' }[reason] || 'Go Premium';
  const description = {
    ai: `Free accounts get ${limit ?? 'a few'} AI action${limit === 1 ? '' : 's'} per month. You can still build your week by hand from the library.`,
    workout: 'Free accounts include a selection of workouts. Premium unlocks the whole library.',
  }[reason] || 'Keep full access after your trial: the whole library plus unlimited AI planning.';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl p-0 max-h-[85dvh] overflow-y-auto">
        <SheetHeader className="px-5 pt-5 pb-3">
          <div className="h-10 w-10 rounded-full bg-brand/10 text-brand flex items-center justify-center mb-2">
            <Sparkles className="h-5 w-5" />
          </div>
          <SheetTitle className="text-left">{title}</SheetTitle>
          <SheetDescription className="text-left">{description}</SheetDescription>
        </SheetHeader>
        <div className="px-5 pb-8">
        <ul className="mt-1 space-y-2 text-sm">
          {PERKS.map((perk) => <li key={perk} className="flex items-center gap-2"><span className="text-brand">✓</span>{perk}</li>)}
        </ul>
        <div className="grid grid-cols-2 gap-2 mt-5" role="radiogroup" aria-label="Billing period">
          {['year', 'month'].map((key) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={interval === key}
              onClick={() => setInterval(key)}
              className={cn('rounded-xl border p-3 text-left transition-colors', interval === key ? 'border-brand bg-brand/5' : 'border-border')}
            >
              <span className="text-xs text-muted-foreground flex items-center justify-between">
                {PRICING[key].label}
                {key === 'year' && <span className="text-[10px] font-medium text-brand">Save {PRICING.year.savePct}%</span>}
              </span>
              <span className="block text-lg font-semibold leading-tight mt-0.5">{PRICING.currency}{PRICING[key].amount}<span className="text-xs font-normal text-muted-foreground">{PRICING[key].cadence}</span></span>
              {key === 'year' && <span className="block text-[11px] text-muted-foreground">{PRICING.currency}{PRICING.year.perMonth}/month</span>}
            </button>
          ))}
        </div>
        <Button onClick={subscribe} disabled={busy} className="w-full rounded-xl h-12 mt-3 bg-brand text-brand-foreground hover:bg-brand/90">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Continue to payment'}
        </Button>
        <p className="text-[11px] text-muted-foreground text-center mt-2">Cancel anytime. Secure payment by Stripe.</p>
        <Button variant="ghost" onClick={() => onOpenChange(false)} className="w-full rounded-xl h-11 mt-1">Not now</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
