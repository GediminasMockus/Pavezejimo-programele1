-- Minimize Data API privileges. RLS is not a substitute for granting only the operations the client actually needs.
REVOKE ALL ON public.trips FROM anon, authenticated;
GRANT SELECT ON public.trips TO authenticated, service_role;

REVOKE ALL ON public.user_profiles FROM anon, authenticated;
GRANT SELECT ON public.user_profiles TO authenticated, service_role;

REVOKE ALL ON public.ride_requests FROM anon, authenticated;
GRANT SELECT, INSERT ON public.ride_requests TO authenticated, service_role;

REVOKE ALL ON public.messages FROM anon, authenticated;
GRANT SELECT, INSERT ON public.messages TO authenticated, service_role;

REVOKE ALL ON public.notifications FROM anon, authenticated;
GRANT SELECT, UPDATE ON public.notifications TO authenticated, service_role;

REVOKE ALL ON public.ratings FROM anon, authenticated;
GRANT SELECT ON public.ratings TO authenticated, service_role;

REVOKE ALL ON public.matches FROM anon, authenticated;
GRANT SELECT ON public.matches TO authenticated, service_role;

REVOKE ALL ON public.public_trips FROM anon, authenticated;
GRANT SELECT ON public.public_trips TO authenticated, service_role;

-- Keep request policies efficient and future-safe if table grants are ever widened again.
DROP POLICY IF EXISTS delete_ride_requests_auth ON public.ride_requests;
CREATE POLICY delete_ride_requests_auth ON public.ride_requests
FOR DELETE TO authenticated
USING (passenger_id = (SELECT auth.uid())::text);

DROP POLICY IF EXISTS update_ride_requests_auth ON public.ride_requests;
CREATE POLICY update_ride_requests_auth ON public.ride_requests
FOR UPDATE TO authenticated
USING (
  passenger_id = (SELECT auth.uid())::text
  OR EXISTS (
    SELECT 1 FROM public.trips
    WHERE trips.id = ride_requests.trip_id
      AND trips.created_by = (SELECT auth.uid())::text
  )
)
WITH CHECK (
  passenger_id = (SELECT auth.uid())::text
  OR EXISTS (
    SELECT 1 FROM public.trips
    WHERE trips.id = ride_requests.trip_id
      AND trips.created_by = (SELECT auth.uid())::text
  )
);

DROP POLICY IF EXISTS insert_ride_requests_v3 ON public.ride_requests;
CREATE POLICY insert_ride_requests_v3 ON public.ride_requests
FOR INSERT TO authenticated
WITH CHECK (
  (
    request_type = 'passenger_request'
    AND passenger_id = (SELECT auth.uid())::text
    AND EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = ride_requests.trip_id
        AND t.role = 'driver'
        AND t.status = 'active'
        AND t.deleted_at IS NULL
        AND t.departure_time > now()
        AND t.created_by <> (SELECT auth.uid())::text
    )
  )
  OR (
    request_type = 'driver_offer'
    AND driver_id = (SELECT auth.uid())::text
    AND EXISTS (
      SELECT 1 FROM public.trips passenger_trip
      WHERE passenger_trip.id = ride_requests.trip_id
        AND passenger_trip.role = 'passenger'
        AND passenger_trip.status = 'active'
        AND passenger_trip.deleted_at IS NULL
        AND passenger_trip.departure_time > now()
        AND passenger_trip.created_by = ride_requests.passenger_id
        AND passenger_trip.created_by <> (SELECT auth.uid())::text
    )
    AND EXISTS (
      SELECT 1 FROM public.trips driver_trip
      WHERE driver_trip.id = ride_requests.driver_trip_id
        AND driver_trip.role = 'driver'
        AND driver_trip.created_by = (SELECT auth.uid())::text
        AND driver_trip.status = 'active'
        AND driver_trip.deleted_at IS NULL
        AND driver_trip.departure_time > now()
    )
  )
  OR COALESCE((
    SELECT user_profiles.is_admin
    FROM public.user_profiles
    WHERE user_profiles.id = (SELECT auth.uid())::text
  ), false)
);