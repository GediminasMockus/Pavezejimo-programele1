-- Admin accounts are provisioned explicitly outside migrations; never store credentials here.
-- Grant admin privileges via RLS policy modification
-- Admins can update/delete any trip, request, or profile

-- Drop existing policies and add admin overrides
DROP POLICY IF EXISTS "select_trips_auth" ON trips;
DROP POLICY IF EXISTS "select_trips_auth" ON trips;
CREATE POLICY "select_trips_auth" ON trips
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_trips_auth" ON trips;
CREATE POLICY "insert_trips_auth" ON trips
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid()::text OR (SELECT is_admin FROM user_profiles WHERE id = auth.uid()::text));

DROP POLICY IF EXISTS "update_trips_auth" ON trips;
CREATE POLICY "update_trips_auth" ON trips
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid()::text OR (SELECT is_admin FROM user_profiles WHERE id = auth.uid()::text))
  WITH CHECK (created_by = auth.uid()::text OR (SELECT is_admin FROM user_profiles WHERE id = auth.uid()::text));

DROP POLICY IF EXISTS "delete_trips_auth" ON trips;
CREATE POLICY "delete_trips_auth" ON trips
  FOR DELETE TO authenticated
  USING (created_by = auth.uid()::text OR (SELECT is_admin FROM user_profiles WHERE id = auth.uid()::text));

-- Similar admin overrides for ride_requests
DROP POLICY IF EXISTS "select_ride_requests_auth" ON ride_requests;
DROP POLICY IF EXISTS "select_ride_requests_auth" ON ride_requests;
CREATE POLICY "select_ride_requests_auth" ON ride_requests
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_ride_requests_auth" ON ride_requests;
CREATE POLICY "insert_ride_requests_auth" ON ride_requests
  FOR INSERT TO authenticated
  WITH CHECK (passenger_id = auth.uid()::text OR (SELECT is_admin FROM user_profiles WHERE id = auth.uid()::text));

DROP POLICY IF EXISTS "update_ride_requests_auth" ON ride_requests;
CREATE POLICY "update_ride_requests_auth" ON ride_requests
  FOR UPDATE TO authenticated
  USING (
    passenger_id = auth.uid()::text
    OR EXISTS (SELECT 1 FROM trips WHERE trips.id = ride_requests.trip_id AND trips.created_by = auth.uid()::text)
    OR (SELECT is_admin FROM user_profiles WHERE id = auth.uid()::text)
  )
  WITH CHECK (true);

DROP POLICY IF EXISTS "delete_ride_requests_auth" ON ride_requests;
CREATE POLICY "delete_ride_requests_auth" ON ride_requests
  FOR DELETE TO authenticated
  USING (passenger_id = auth.uid()::text OR (SELECT is_admin FROM user_profiles WHERE id = auth.uid()::text));

-- Admin can update any user profile
DROP POLICY IF EXISTS "update_own_profile_auth" ON user_profiles;
DROP POLICY IF EXISTS "update_own_profile_auth" ON user_profiles;
CREATE POLICY "update_own_profile_auth" ON user_profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid()::text OR (SELECT is_admin FROM user_profiles WHERE id = auth.uid()::text))
  WITH CHECK (id = auth.uid()::text OR (SELECT is_admin FROM user_profiles WHERE id = auth.uid()::text));

-- Admin can delete any user
DROP POLICY IF EXISTS "delete_user_profiles" ON user_profiles;
DROP POLICY IF EXISTS "delete_user_profiles" ON user_profiles;
CREATE POLICY "delete_user_profiles" ON user_profiles
  FOR DELETE TO authenticated
  USING (id = auth.uid()::text OR (SELECT is_admin FROM user_profiles WHERE id = auth.uid()::text));
