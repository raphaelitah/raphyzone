import { supabase } from '@/lib/supabaseClient';

export async function createNotification({ userId, type, title, body, relatedId }) {
  // No .select() here: an admin creating a notification for another user can INSERT it
  // (RLS allows user_id = auth.uid() OR is_admin()), but a RETURNING clause is also checked
  // against the SELECT policy (user_id = auth.uid() only), which would reject that same row.
  const { error } = await supabase.from('notifications').insert({
    user_id: userId,
    type,
    title,
    body,
    related_entity_id: relatedId || null,
    read: false,
  });
  if (error) throw error;
}
