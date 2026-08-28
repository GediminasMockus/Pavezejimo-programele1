-- Fix ride request insert policy to restore business logic validation
-- The admin migration (20260828075000) replaced insert_ride_requests_v2 with a simpler policy
-- that removed all business logic checks, causing passenger requests to fail.

-- Drop the overly permissive policy from the admin migration
DROP POLICY IF EXISTS "insert_ride_requests_auth" ON public.ride_requests;

-- Restore the comprehensive insert policy with business logic validation
-- while preserving admin override capability
CREATE POLICY "insert_ride_requests_v3" ON public.ride_requests
FOR INSERT TO authenticated
WITH CHECK (
  (
    request_type = 'passenger_request'
    AND passenger_id = auth.uid()::text
    AND EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = ride_requests.trip_id
        AND t.role = 'driver'
        AND t.status = 'active'
        AND t.deleted_at IS NULL
        AND t.departure_time > now()
        AND t.created_by <> auth.uid()::text
    )
  )
  OR
  (
    request_type = 'driver_offer'
    AND driver_id = auth.uid()::text
    AND EXISTS (
      SELECT 1 FROM public.trips passenger_trip
      WHERE passenger_trip.id = ride_requests.trip_id
        AND passenger_trip.role = 'passenger'
        AND passenger_trip.status = 'active'
        AND passenger_trip.deleted_at IS NULL
        AND passenger_trip.departure_time > now()
        AND passenger_trip.created_by = ride_requests.passenger_id
        AND passenger_trip.created_by <> auth.uid()::text
    )
    AND EXISTS (
      SELECT 1 FROM public.trips driver_trip
      WHERE driver_trip.id = ride_requests.driver_trip_id
        AND driver_trip.role = 'driver'
        AND driver_trip.created_by = auth.uid()::text
        AND driver_trip.status = 'active'
        AND driver_trip.deleted_at IS NULL
        AND driver_trip.departure_time > now()
    )
  )
  OR
  (
    -- Admin override: admins can insert any request
    (SELECT is_admin FROM user_profiles WHERE id = auth.uid()::text) = true
  )
);
