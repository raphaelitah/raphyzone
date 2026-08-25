import { NavLink } from 'react-router-dom';
import { Home, Dumbbell, TrendingUp, Library, User } from 'lucide-react';
import { cn } from '@/lib/utils';

const tabs = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/workouts', label: 'Workouts', icon: Dumbbell },
  { to: '/progress', label: 'Progress', icon: TrendingUp },
  { to: '/library', label: 'Exercises', icon: Library },
  { to: '/profile', label: 'Profile', icon: User },
];

export default function BottomNav() {
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 h-16 border-t border-border bg-background/90 backdrop-blur-lg">
      <div className="mx-auto max-w-md h-full grid grid-cols-5">
        {tabs.map(({ to, label, icon: Icon, end }) => (
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
                <Icon className={cn('h-5 w-5', isActive && 'stroke-[2.5]')} />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}