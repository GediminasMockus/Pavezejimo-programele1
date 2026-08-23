/*
# Add user registration support and admin data

1. Modified Tables
- `user_profiles`
  - `email` (text, nullable) — user's email from auth, visible to admin
  - `is_admin` (boolean, default false) — admin flag
  - `user_id` (uuid, nullable, references auth.users) — links profile to auth user

2. Security Changes
- Switch all policies from `TO anon, authenticated` to `TO authenticated` only
  (app now requires sign-in)
- trips: SELECT for all authenticated; INSERT/UPDATE/DELETE for owner (created_by = auth.uid()::text)
- ride_requests: SELECT for all authenticated; INSERT for owner; UPDATE for passenger or trip driver; DELETE for passenger
- ratings: SELECT for all authenticated; INSERT where rater_id = auth.uid()::text
- user_profiles: SELECT for all authenticated; INSERT/UPDATE where id = auth.uid()::text
- messages: SELECT for all authenticated; INSERT for any authenticated user
*/

-- Add columns to user_profiles
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Drop old policies on trips
DROP POLICY IF EXISTS "select_trips" ON trips;
DROP POLICY IF EXISTS "insert_trips" ON trips;
DROP POLICY IF EXISTS "update_trips" ON trips;
DROP POLICY IF EXISTS "delete_trips" ON trips;

-- New trips policies (authenticated only)
CREATE POLICY "select_trips_auth" ON trips
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "insert_trips_auth" ON trips
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid()::text);

CREATE POLICY "update_trips_auth" ON trips
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid()::text)
  WITH CHECK (created_by = auth.uid()::text);

CREATE POLICY "delete_trips_auth" ON trips
  FOR DELETE TO authenticated
  USING (created_by = auth.uid()::text);

-- Drop old policies on ride_requests
DROP POLICY IF EXISTS "select_ride_requests" ON ride_requests;
DROP POLICY IF EXISTS "insert_ride_requests" ON ride_requests;
DROP POLICY IF EXISTS "update_ride_requests" ON ride_requests;
DROP POLICY IF EXISTS "delete_ride_requests" ON ride_requests;

-- New ride_requests policies (authenticated only)
CREATE POLICY "select_ride_requests_auth" ON ride_requests
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "insert_ride_requests_auth" ON ride_requests
  FOR INSERT TO authenticated
  WITH CHECK (passenger_id = auth.uid()::text);

CREATE POLICY "update_ride_requests_auth" ON ride_requests
  FOR UPDATE TO authenticated
  USING (
    passenger_id = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM trips
      WHERE trips.id = ride_requests.trip_id
      AND trips.created_by = auth.uid()::text
    )
  )
  WITH CHECK (true);

CREATE POLICY "delete_ride_requests_auth" ON ride_requests
  FOR DELETE TO authenticated
  USING (passenger_id = auth.uid()::text);

-- Drop old policies on ratings
DROP POLICY IF EXISTS "select_ratings" ON ratings;
DROP POLICY IF EXISTS "insert_ratings" ON ratings;

-- New ratings policies (authenticated only)
CREATE POLICY "select_ratings_auth" ON ratings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "insert_ratings_auth" ON ratings
  FOR INSERT TO authenticated
  WITH CHECK (rater_id = auth.uid()::text);

-- Drop old policies on user_profiles
DROP POLICY IF EXISTS "select_user_profiles" ON user_profiles;
DROP POLICY IF EXISTS "insert_own_profile" ON user_profiles;
DROP POLICY IF EXISTS "update_user_profiles" ON user_profiles;

-- New user_profiles policies (authenticated only)
CREATE POLICY "select_user_profiles_auth" ON user_profiles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "insert_own_profile_auth" ON user_profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid()::text);

CREATE POLICY "update_own_profile_auth" ON user_profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid()::text) WITH CHECK (id = auth.uid()::text);

-- Drop old policies on messages and recreate as authenticated-only
DROP POLICY IF EXISTS "select_messages" ON messages;
DROP POLICY IF EXISTS "insert_messages" ON messages;

CREATE POLICY "select_messages_auth" ON messages
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "insert_messages_auth" ON messages
  FOR INSERT TO authenticated WITH CHECK (true);
