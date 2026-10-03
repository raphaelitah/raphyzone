import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { Card } from '@/components/ui/card';
import { usePendingReviewCount } from '@/hooks/usePendingReviewCount';
import { ChevronRight, ShieldCheck, Tags, Activity, Users } from 'lucide-react';

const items = [
  { to: '/admin-users', label: 'Users', desc: 'Plans, access and invites', icon: Users },
  { to: '/admin-review', label: 'UGC For Review', desc: 'Approve user-submitted exercises and workouts', icon: ShieldCheck },
  { to: '/admin-taxonomy', label: 'Taxonomy Management', desc: 'Edit exercise terms', icon: Tags },
  { to: '/admin-alerts', label: 'LLM Health', desc: 'AI call failures and alerts', icon: Activity },
];

export default function Admin() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const pendingReview = usePendingReviewCount();

  useEffect(() => {
    if (user && user.role !== 'admin') navigate('/');
  }, [user, navigate]);

  return (
    <div className="px-5 pt-10 pb-0">
      <h1 className="text-2xl font-semibold tracking-tight mb-1">Admin</h1>
      <p className="text-sm text-muted-foreground mb-5">Manage users, content and system health.</p>
      <div className="space-y-2">
        {items.map(({ to, label, desc, icon: Icon }) => (
          <Card key={to} onClick={() => navigate(to)} className="rounded-2xl border-border p-4 flex items-center gap-3 cursor-pointer hover:bg-muted/50 transition-colors">
            <Icon className="h-5 w-5 text-brand shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{label}</p>
              <p className="text-xs text-muted-foreground">{desc}</p>
            </div>
            {to === '/admin-review' && pendingReview > 0 && (
              <span className="min-w-5 h-5 px-1.5 rounded-full bg-destructive text-destructive-foreground text-xs leading-5 text-center font-semibold">{pendingReview}</span>
            )}
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Card>
        ))}
      </div>
    </div>
  );
}
