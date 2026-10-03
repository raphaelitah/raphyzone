import { NavLink } from 'react-router-dom';
import { Home, Dumbbell, TrendingUp, Library, User, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { cn } from '@/lib/utils';
import { usePendingReviewCount } from '@/hooks/usePendingReviewCount';

const tabs = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/workouts', label: 'Workouts', icon: Dumbbell },
  { to: '/progress', label: 'Progress', icon: TrendingUp },
  { to: '/library', label: 'Exercises', icon: Library },
  { to: '/profile', label: 'Profile', icon: User },
];

const adminTab = { to: '/admin', label: 'Admin', icon: ShieldCheck };

export default function BottomNav() {
  const { user } = useAuth();
  const pendingReview = usePendingReviewCount();
  const items = user?.role === 'admin' ? [...tabs, adminTab] : tabs;
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 h-16 border-t border-border bg-background/90 backdrop-blur-lg">
      <div className="mx-auto max-w-md h-full grid" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-medium transition-colors',
                isActive ? 'text-brand' : 'text-muted-foreground'
              )
            }
          >
            {({ isActive }) => (
              <>
                <span className="relative">
                  <Icon className={cn('h-5 w-5', isActive && 'stroke-[2.5]')} />
                  {to === '/admin' && pendingReview > 0 && (
                    <span
                      data-testid="admin-review-badge"
                      className="absolute -top-1.5 -right-2.5 min-w-4 h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] leading-4 text-center font-semibold"
                    >
                      {pendingReview > 99 ? '99+' : pendingReview}
                    </span>
                  )}
                </span>
                {label}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}