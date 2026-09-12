-- Keep public API access explicit and prevent anonymous execution of owner-scoped RPCs.
ALTER VIEW public.public_trips SET (security_invoker = true);

REVOKE ALL ON FUNCTION public.create_my_trip(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_accessible_trips() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_profile() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_profile_flags() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_trips() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_all_notifications_read() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_notification_read(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_on_request_accepted() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_ride_request_status(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_my_profile(text, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_my_trip(uuid, jsonb) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.create_my_trip(jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_accessible_trips() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_my_profile() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_my_profile_flags() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_my_trips() FROM anon;
REVOKE EXECUTE ON FUNCTION public.mark_all_notifications_read() FROM anon;
REVOKE EXECUTE ON FUNCTION public.mark_notification_read(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.notify_on_request_accepted() FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_ride_request_status(uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_my_profile(text, text, text, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_my_trip(uuid, jsonb) FROM anon;

GRANT EXECUTE ON FUNCTION public.create_my_trip(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_accessible_trips() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_profile_flags() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_trips() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_notification_read(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_ride_request_status(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_my_profile(text, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_my_trip(uuid, jsonb) TO authenticated;

-- Trigger-only function: it should not be callable through PostgREST.
REVOKE EXECUTE ON FUNCTION public.notify_on_request_accepted() FROM authenticated;
