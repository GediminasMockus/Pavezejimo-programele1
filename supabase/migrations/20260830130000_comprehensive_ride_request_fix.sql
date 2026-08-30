-- Comprehensive fix for ride request system
-- This migration handles the case where the two_sided_matching migration was not applied
-- It adds missing columns and then fixes the insert policy

-- Step 1: Add missing columns from two_sided_matching migration
ALTER TABLE public.ride_requests
  ADD COLUMN IF NOT EXISTS request_type text NOT NULL DEFAULT 'passenger_request',
  ADD COLUMN IF NOT EXISTS driver_id text,
  ADD COLUMN IF NOT EXISTS driver_name text,
  ADD COLUMN IF NOT EXISTS driver_phone text,
  ADD COLUMN IF NOT EXISTS driver_trip_id uuid REFERENCES public.trips(id) ON DELETE SET NULL;

-- Step 2: Add constraint for request_type
ALTER TABLE public.ride_requests
  DROP CONSTRAINT IF EXISTS ride_requests_request_type_check;
ALTER TABLE public.ride_requests
  ADD CONSTRAINT ride_requests_request_type_check
  CHECK (request_type IN ('passenger_request', 'driver_offer'));

-- Step 3: Add indexes
CREATE INDEX IF NOT EXISTS idx_ride_requests_driver_id ON public.ride_requests(driver_id);
CREATE INDEX IF NOT EXISTS idx_ride_requests_driver_trip_id ON public.ride_requests(driver_trip_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_driver_offer_passenger_trip_active
  ON public.ride_requests(trip_id)
  WHERE request_type = 'driver_offer' AND status IN ('pending', 'accepted');

-- Step 4: Drop the broken policy from admin migration
DROP POLICY IF EXISTS "insert_ride_requests_auth" ON public.ride_requests;

-- Step 5: Create the comprehensive insert policy with business logic validation
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
