import { Lock, Sparkles } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useEntitlement } from '@/hooks/useEntitlement';

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

  const title = { ai: 'AI limit reached', workout: 'This workout is premium' }[reason] || 'Go Premium';
  const description = {
    ai: `Free accounts get ${limit ?? 'a few'} AI action${limit === 1 ? '' : 's'} per month. You can still build your week by hand from the library.`,
    workout: 'Free accounts include a selection of workouts. Premium unlocks the whole library.',
  }[reason] || 'Keep full access after your trial: the whole library plus unlimited AI planning.';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl max-w-md mx-auto">
        <SheetHeader className="text-left">
          <div className="h-10 w-10 rounded-full bg-brand/10 text-brand flex items-center justify-center mb-2">
            <Sparkles className="h-5 w-5" />
          </div>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <ul className="mt-4 space-y-2 text-sm">
          {PERKS.map((perk) => <li key={perk} className="flex items-center gap-2"><span className="text-brand">✓</span>{perk}</li>)}
        </ul>
        <Button disabled className="w-full rounded-xl h-12 mt-5">Subscriptions coming soon</Button>
        <Button variant="ghost" onClick={() => onOpenChange(false)} className="w-full rounded-xl h-11 mt-1">Not now</Button>
      </SheetContent>
    </Sheet>
  );
}
