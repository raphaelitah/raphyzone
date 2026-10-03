import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { LEGAL } from '@/lib/legal';

export function Section({ title, children }) {
  return (
    <section className="mt-7">
      <h2 className="text-base font-semibold mb-2">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

export function List({ items }) {
  return (
    <ul className="list-disc pl-5 space-y-1.5">
      {items.map((item) => <li key={item}>{item}</li>)}
    </ul>
  );
}

// Public (no login) page shell shared by /terms and /privacy.
export default function LegalPage({ title, children }) {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-5 py-10">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-5">
          <ArrowLeft className="h-4 w-4" /> Back to {LEGAL.appName}
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground mt-1">Effective {LEGAL.effectiveDate}</p>
        {children}
        <nav className="mt-10 pt-5 border-t border-border flex gap-4 text-sm text-muted-foreground">
          <Link to="/terms" className="hover:text-foreground">Terms of Service</Link>
          <Link to="/privacy" className="hover:text-foreground">Privacy Policy</Link>
        </nav>
      </div>
    </div>
  );
}
