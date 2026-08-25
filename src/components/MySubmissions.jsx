import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { cn } from '@/lib/utils';

const STATUS_STYLES = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};

export default function MySubmissions() {
  const { user } = useAuth();
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      try {
        const { data } = await supabase
          .from('exercises')
          .select('*')
          .eq('author_id', user.id)
          .order('created_date', { ascending: false })
          .limit(500);
        setSubmissions(data || []);
      } finally { setLoading(false); }
    })();
  }, [user?.id]);

  if (loading) return (
    <div className="flex justify-center py-6"><div className="w-6 h-6 border-4 border-muted border-t-brand rounded-full animate-spin" /></div>
  );

  return (
    <div>
      {submissions.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">You haven't submitted any exercises yet.</p>
      ) : (
        <div className="space-y-2">
          {submissions.map(s => (
            <div key={s.id} className="rounded-xl border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium truncate">{s.name}</p>
                <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium capitalize shrink-0', STATUS_STYLES[s.submission_status] || STATUS_STYLES.pending)}>
                  {s.submission_status || 'pending'}
                </span>
              </div>
              {s.submission_status === 'rejected' && s.rejection_reason && (
                <p className="text-xs text-red-600 mt-1">Reason: {s.rejection_reason}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}