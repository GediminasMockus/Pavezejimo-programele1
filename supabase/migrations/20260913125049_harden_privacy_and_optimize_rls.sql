-- Keep public discovery coarse while preserving precise trip details for owners and accepted participants.
CREATE OR REPLACE VIEW public.public_trips
WITH (security_invoker = true)
AS
SELECT
  t.id,
  t.role,
  COALESCE(NULLIF(t.from_area, ''), split_part(t.from_location, ',', 1))::text AS from_location,
  COALESCE(NULLIF(t.to_area, ''), split_part(t.to_location, ',', 1))::text AS to_location,
  round(t.from_lat::numeric, 2)::double precision AS from_lat,
  round(t.from_lng::numeric, 2)::double precision AS from_lng,
  round(t.to_lat::numeric, 2)::double precision AS to_lat,
  round(t.to_lng::numeric, 2)::double precision AS to_lng,
  t.departure_time,
  t.name,
  t.seats,
  t.price,
  t.price_unit,
  t.baggage,
  t.notes,
  t.created_at,
  CASE
    WHEN t.role = 'driver' THEN t.seats - COALESCE((
      SELECT sum(r.seats_needed)
      FROM public.ride_requests r
      WHERE COALESCE(r.driver_trip_id, r.trip_id) = t.id
        AND r.status = 'accepted'
    ), 0)
    ELSE t.seats::bigint
  END AS available_seats,
  t.status,
  t.created_by
FROM public.trips t
WHERE t.deleted_at IS NULL
  AND t.status = 'active'
  AND t.created_by IS NOT NULL
  AND auth.uid() IS NOT NULL;

REVOKE ALL ON public.public_trips FROM anon, PUBLIC;
GRANT SELECT ON public.public_trips TO authenticated, service_role;

-- Ride requests are private to their participants, trip owners, and administrators.
DROP POLICY IF EXISTS select_ride_requests_auth ON public.ride_requests;
CREATE POLICY select_ride_requests_auth ON public.ride_requests
FOR SELECT TO authenticated
USING (
  passenger_id = (SELECT auth.uid())::text
  OR driver_id = (SELECT auth.uid())::text
  OR EXISTS (
    SELECT 1 FROM public.trips t
    WHERE t.id = ride_requests.trip_id
      AND t.created_by = (SELECT auth.uid())::text
  )
  OR EXISTS (
    SELECT 1 FROM public.trips t
    WHERE t.id = ride_requests.driver_trip_id
      AND t.created_by = (SELECT auth.uid())::text
  )
  OR COALESCE((
    SELECT p.is_admin
    FROM public.user_profiles p
    WHERE p.id = (SELECT auth.uid())::text
  ), false)
);

-- Avoid re-evaluating auth.uid() once per row in common RLS policies.
DROP POLICY IF EXISTS insert_trips_auth ON public.trips;
CREATE POLICY insert_trips_auth ON public.trips
FOR INSERT TO authenticated
WITH CHECK (created_by = (SELECT auth.uid())::text);

DROP POLICY IF EXISTS update_trips_auth ON public.trips;
CREATE POLICY update_trips_auth ON public.trips
FOR UPDATE TO authenticated
USING (created_by = (SELECT auth.uid())::text)
WITH CHECK (created_by = (SELECT auth.uid())::text);

DROP POLICY IF EXISTS delete_trips_auth ON public.trips;
CREATE POLICY delete_trips_auth ON public.trips
FOR DELETE TO authenticated
USING (created_by = (SELECT auth.uid())::text);

DROP POLICY IF EXISTS insert_own_profile_auth ON public.user_profiles;
CREATE POLICY insert_own_profile_auth ON public.user_profiles
FOR INSERT TO authenticated
WITH CHECK (id = (SELECT auth.uid())::text);

DROP POLICY IF EXISTS update_own_profile_auth ON public.user_profiles;
CREATE POLICY update_own_profile_auth ON public.user_profiles
FOR UPDATE TO authenticated
USING (id = (SELECT auth.uid())::text)
WITH CHECK (id = (SELECT auth.uid())::text);

DROP POLICY IF EXISTS insert_ratings_auth ON public.ratings;
CREATE POLICY insert_ratings_auth ON public.ratings
FOR INSERT TO authenticated
WITH CHECK (rater_id = (SELECT auth.uid())::text);

DROP POLICY IF EXISTS update_ratings_auth ON public.ratings;
CREATE POLICY update_ratings_auth ON public.ratings
FOR UPDATE TO authenticated
USING (rater_id = (SELECT auth.uid())::text)
WITH CHECK (rater_id = (SELECT auth.uid())::text);

DROP POLICY IF EXISTS delete_ratings_auth ON public.ratings;
CREATE POLICY delete_ratings_auth ON public.ratings
FOR DELETE TO authenticated
USING (rater_id = (SELECT auth.uid())::text);

DROP POLICY IF EXISTS select_own_notifications ON public.notifications;
CREATE POLICY select_own_notifications ON public.notifications
FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid())::text);

DROP POLICY IF EXISTS insert_system_notifications ON public.notifications;
CREATE POLICY insert_system_notifications ON public.notifications
FOR INSERT TO authenticated
WITH CHECK (user_id = (SELECT auth.uid())::text);

DROP POLICY IF EXISTS update_own_notifications ON public.notifications;
CREATE POLICY update_own_notifications ON public.notifications
FOR UPDATE TO authenticated
USING (user_id = (SELECT auth.uid())::text)
WITH CHECK (user_id = (SELECT auth.uid())::text);

-- Invoker RPCs need the underlying table privileges; RLS remains the authorization boundary.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trips TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.user_profiles TO authenticated;
GRANT SELECT, UPDATE ON public.notifications TO authenticated;

-- These functions operate on rows already protected by RLS and do not require elevated privileges.
-- The fresh-replay schema uses private helpers from these invoker RPCs, so grant only those helpers
-- explicitly instead of opening the private schema broadly.
GRANT USAGE ON SCHEMA private TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.require_active_user() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.validate_trip(public.trips) TO authenticated, service_role;

ALTER FUNCTION public.get_my_profile() SECURITY INVOKER;
ALTER FUNCTION public.get_my_profile_flags() SECURITY INVOKER;
ALTER FUNCTION public.get_my_matches() SECURITY INVOKER;
ALTER FUNCTION public.get_accessible_trips() SECURITY INVOKER;
ALTER FUNCTION public.mark_notification_read(uuid) SECURITY INVOKER;
ALTER FUNCTION public.mark_all_notifications_read() SECURITY INVOKER;
ALTER FUNCTION public.update_my_profile(text,text,text,text,text,text) SECURITY INVOKER;
ALTER FUNCTION public.create_my_trip(jsonb) SECURITY INVOKER;
ALTER FUNCTION public.update_my_trip(uuid,jsonb) SECURITY INVOKER;

-- No frontend RPC is callable anonymously or through PUBLIC inheritance.
REVOKE EXECUTE ON FUNCTION public.confirm_ride(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_my_trip(uuid,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_ride_request_status(uuid,text,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.submit_rating(uuid,text,text,integer,text,uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_my_profile() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_my_profile_flags() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_my_matches() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_accessible_trips() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mark_notification_read(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mark_all_notifications_read() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_my_profile(text,text,text,text,text,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_my_trip(jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_my_trip(uuid,jsonb) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.confirm_ride(uuid),
  public.delete_my_trip(uuid,text),
  public.set_ride_request_status(uuid,text,text),
  public.submit_rating(uuid,text,text,integer,text,uuid),
  public.get_my_profile(),
  public.get_my_profile_flags(),
  public.get_my_matches(),
  public.get_accessible_trips(),
  public.mark_notification_read(uuid),
  public.mark_all_notifications_read(),
  public.update_my_profile(text,text,text,text,text,text),
  public.create_my_trip(jsonb),
  public.update_my_trip(uuid,jsonb)
TO authenticated, service_role;
