import { useEffect, useState } from 'react';
import { supabase } from './supabase';

export function useUnreadCount(userId: string) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      const { count: total, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('read', false);

      if (!cancelled && !error) setCount(total ?? 0);
    }

    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };

    void refresh();
    const channel = supabase
      .channel('unread-' + userId)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: 'user_id=eq.' + userId,
      }, () => { void refresh(); })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void refresh();
      });

    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    const fallback = window.setInterval(() => { void refresh(); }, 30_000);

    return () => {
      cancelled = true;
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      window.clearInterval(fallback);
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  return count;
}
