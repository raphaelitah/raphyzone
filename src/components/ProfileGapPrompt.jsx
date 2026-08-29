import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, X, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function ProfileGapPrompt({ gap, profile, context = null, onAnswer, onDismiss, className = '' }) {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  if (!gap) return null;

  const options = typeof gap.options === 'function' ? gap.options(profile, context) : gap.options;

  const submit = async (value) => {
    setSaving(true);
    try { await onAnswer(value); } finally { setSaving(false); }
  };

  return (
    <Card className={cn('rounded-2xl border-brand/20 bg-brand/5 p-4 relative', className)}>
      <button onClick={onDismiss} className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors" aria-label="Dismiss">
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-start gap-2 pr-6">
        <Sparkles className="h-4 w-4 text-brand shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{gap.question(profile, context)}</p>
          {gap.hint && <p className="text-xs text-muted-foreground mt-0.5">{gap.hint(profile, context)}</p>}
        </div>
      </div>

      <div className="mt-3">
        {gap.type === 'choice' && (
          <div className="flex flex-wrap gap-2">
            {options.map((o) => (
              <button
                key={o.value}
                disabled={saving}
                onClick={() => submit(o.value)}
                className="text-xs font-medium px-3 py-1.5 rounded-full border border-brand/30 bg-background hover:bg-brand/10 disabled:opacity-50 transition-colors"
              >
                {o.label}
              </button>
            ))}
          </div>
        )}
        {gap.type === 'yesno' && (
          <div className="flex gap-2">
            <Button size="sm" disabled={saving} onClick={() => submit(true)} className="rounded-lg bg-brand text-brand-foreground hover:bg-brand/90 h-8">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Yes, add it'}
            </Button>
            <Button size="sm" variant="outline" disabled={saving} onClick={() => submit(false)} className="rounded-lg h-8">No thanks</Button>
          </div>
        )}
        {gap.type === 'link' && (
          <div className="flex gap-2">
            <Button size="sm" className="rounded-lg bg-brand text-brand-foreground hover:bg-brand/90 h-8" onClick={() => navigate(gap.href)}>
              {gap.linkLabel || 'Go'}
            </Button>
            <Button size="sm" variant="outline" className="rounded-lg h-8" onClick={onDismiss}>Not now</Button>
          </div>
        )}
        {gap.type === 'text' && (
          <div className="flex gap-2">
            <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={gap.placeholder} className="h-9 rounded-lg text-sm flex-1" />
            <Button size="sm" disabled={saving || !text.trim()} onClick={() => submit(text)} className="rounded-lg bg-brand text-brand-foreground hover:bg-brand/90 h-9 shrink-0">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save'}
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
