CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.can_access_trip(p_trip_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = p_trip_id
        AND t.created_by = auth.uid()::text
    )
    OR EXISTS (
      SELECT 1
      FROM public.ride_requests r
      WHERE r.status = 'accepted'
        AND (r.trip_id = p_trip_id OR r.driver_trip_id = p_trip_id)
        AND (r.passenger_id = auth.uid()::text OR r.driver_id = auth.uid()::text)
    )
    OR COALESCE((
      SELECT p.is_admin
      FROM public.user_profiles p
      WHERE p.id = auth.uid()::text
    ), false)
  );
$$;

REVOKE ALL ON FUNCTION private.can_access_trip(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_access_trip(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS select_trips_auth ON public.trips;
CREATE POLICY select_trips_auth ON public.trips
FOR SELECT TO authenticated
USING ((SELECT private.can_access_trip(id)));
