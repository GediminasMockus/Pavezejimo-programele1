import { useEffect, useState } from 'react';
import { supabase } from './supabase';
export function useUnreadCount(userId: string) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      const { count: total, error } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('read', false);
      if (!cancelled && !error) setCount(total ?? 0);
    }
    void refresh();
    const channel = supabase.channel('unread-' + userId).on('postgres_changes', {
      event: '*', schema: 'public', table: 'notifications', filter: 'user_id=eq.' + userId,
    }, () => { void refresh(); }).subscribe();
    return () => { cancelled = true; void supabase.removeChannel(channel); };
  }, [userId]);
  return count;
}
