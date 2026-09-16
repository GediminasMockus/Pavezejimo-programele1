-- Users may permanently remove only their own notifications after the
-- product's 48-hour retention window. RLS prevents deleting recent or
-- another user's notifications.
CREATE INDEX IF NOT EXISTS idx_notifications_user_created_at
  ON public.notifications(user_id, created_at);

GRANT DELETE ON public.notifications TO authenticated;

DROP POLICY IF EXISTS delete_own_expired_notifications ON public.notifications;
CREATE POLICY delete_own_expired_notifications ON public.notifications
FOR DELETE TO authenticated
USING (
  user_id = (SELECT auth.uid())::text
  AND created_at < now() - interval '48 hours'
);

DELETE FROM public.notifications
WHERE created_at < now() - interval '48 hours';
