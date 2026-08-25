import { supabase } from '@/lib/supabaseClient';

export async function createNotification({ userId, type, title, body, relatedId }) {
  const { data, error } = await supabase
    .from('notifications')
    .insert({
      user_id: userId,
      type,
      title,
      body,
      related_entity_id: relatedId || null,
      read: false,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}
