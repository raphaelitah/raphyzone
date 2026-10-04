import { useState } from 'react';

const FIELD = 'w-full mt-1 rounded-xl border border-border bg-background px-2 h-10 text-xs font-medium text-center focus:outline-none focus:ring-2 focus:ring-brand';
const FIELD_COMPACT = 'w-full mt-1 rounded-lg border border-border bg-background px-2 h-8 text-[10px] font-medium text-center focus:outline-none focus:ring-2 focus:ring-brand';

const split = (totalSeconds) => {
  const t = Math.max(0, Math.round(totalSeconds || 0));
  return { h: Math.floor(t / 3600), m: Math.floor((t % 3600) / 60), s: t % 60 };
};

// Hours / minutes / seconds inputs that report a single total in seconds
// (null when everything is blank), so "1:23" never has to be typed as 1.38 min.
export default function DurationInput({ valueSeconds, onChange, compact = false }) {
  const [parts, setParts] = useState(() => (valueSeconds != null ? { h: String(split(valueSeconds).h || ''), m: String(split(valueSeconds).m || ''), s: String(split(valueSeconds).s || '') } : { h: '', m: '', s: '' }));

  const update = (key, raw) => {
    const clean = raw.replace(/\D/g, '').slice(0, 2);
    const next = { ...parts, [key]: clean };
    setParts(next);
    if (!next.h && !next.m && !next.s) { onChange(null); return; }
    onChange((Number(next.h) || 0) * 3600 + (Number(next.m) || 0) * 60 + (Number(next.s) || 0));
  };

  return (
    <div className="grid grid-cols-3 gap-1.5">
      {[['h', 'h'], ['m', 'min'], ['s', 'sec']].map(([key, label]) => (
        <div key={key}>
          <input type="text" inputMode="numeric" value={parts[key]} onChange={(ev) => update(key, ev.target.value)} placeholder="0" aria-label={label} className={compact ? FIELD_COMPACT : FIELD} />
          <p className="text-[10px] text-muted-foreground text-center mt-0.5">{label}</p>
        </div>
      ))}
    </div>
  );
}
