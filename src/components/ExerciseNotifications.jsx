import { useState, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

export default function ExerciseNotifications() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_date', { ascending: false })
        .limit(50);
      setNotifications(data || []);
    } finally { setLoading(false); }
  };

  useEffect(() => { if (open) load(); }, [open]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAsRead = async (id) => {
    await supabase.from('notifications').update({ read: true }).eq('id', id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const markAllRead = async () => {
    const unread = notifications.filter(n => !n.read);
    await supabase.from('notifications').update({ read: true }).in('id', unread.map(n => n.id));
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  return (
    <>
      <button onClick={() => setOpen(true)} className="relative p-2 rounded-full hover:bg-muted transition-colors">
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-4 h-4 px-1 rounded-full bg-brand text-brand-foreground text-[10px] font-semibold flex items-center justify-center">{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl h-[80vh] flex flex-col p-0">
          <SheetHeader className="px-5 pt-5 pb-3 border-b border-border">
            <div className="flex items-center justify-between pr-8">
              <SheetTitle className="text-left">Notifications</SheetTitle>
              {unreadCount > 0 && <button onClick={markAllRead} className="text-xs text-brand font-medium">Mark all read</button>}
            </div>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-5 py-3">
            {loading ? (
              <div className="flex justify-center py-20"><div className="w-7 h-7 border-4 border-muted border-t-brand rounded-full animate-spin" /></div>
            ) : notifications.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-16">No notifications yet.</p>
            ) : (
              <div className="space-y-2">
                {notifications.map(n => (
                  <button key={n.id} onClick={() => !n.read && markAsRead(n.id)} className={cn('w-full text-left rounded-xl p-3 border transition-colors', n.read ? 'border-border bg-card' : 'border-brand/30 bg-brand/5')}>
                    <p className="text-sm font-medium">{n.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{n.body}</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-1">{new Date(n.created_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}