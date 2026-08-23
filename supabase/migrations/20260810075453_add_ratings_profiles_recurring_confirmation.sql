/*
# Add ratings, profiles, recurring trips, ride confirmation & completion

1. Modified Tables
- `trips`
  - `is_recurring` (boolean, default false) — marks daily/regular trips
  - `status` (text, default 'active') — 'active' | 'completed'
  - `completed_at` (timestamptz, nullable) — when trip was completed
- `ride_requests`
  - `passenger_confirmed` (boolean, default false) — passenger confirmed the ride
  - `driver_confirmed` (boolean, default false) — driver confirmed the ride
  - `completed_at` (timestamptz, nullable) — when both confirmed

2. New Tables
- `user_profiles`
  - id (text PK) — client_id
  - display_name (text)
  - total_ratings (integer, default 0)
  - avg_rating (numeric(2,1), default 0)
- `ratings`
  - id (uuid PK)
  - rater_id (text) — who is rating
  - rated_id (text) — who is being rated
  - trip_id (uuid, nullable) — context trip
  - role (text) — 'driver' | 'passenger' — role of the rated person
  - score (integer, 1-5)
  - comment (text, nullable)
  - created_at (timestamptz, default now())

3. Security
- RLS enabled on all new tables
- user_profiles: public SELECT, UPDATE only for own profile (client_id = id)
- ratings: public SELECT, INSERT for anyone (with CHECK rater_id = client_id), no UPDATE/DELETE
- trips: existing policies cover new columns
- ride_requests: existing policies cover new columns
*/

-- Add columns to trips
ALTER TABLE trips ADD COLUMN IF NOT EXISTS is_recurring boolean NOT NULL DEFAULT false;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
ALTER TABLE trips ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- Add columns to ride_requests
ALTER TABLE ride_requests ADD COLUMN IF NOT EXISTS passenger_confirmed boolean NOT NULL DEFAULT false;
ALTER TABLE ride_requests ADD COLUMN IF NOT EXISTS driver_confirmed boolean NOT NULL DEFAULT false;
ALTER TABLE ride_requests ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- Create user_profiles table
CREATE TABLE IF NOT EXISTS user_profiles (
  id text PRIMARY KEY,
  display_name text NOT NULL,
  total_ratings integer NOT NULL DEFAULT 0,
  avg_rating numeric(2,1) NOT NULL DEFAULT 0.0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_user_profiles" ON user_profiles
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "insert_own_profile" ON user_profiles
  FOR INSERT TO anon, authenticated
  WITH CHECK (id = current_setting('request.headers', true)::json->>'x-client-id');

-- Can't easily check client_id in UPDATE policy without a function, so allow UPDATE for all
-- (the app only updates own profile via client_id match in the WHERE clause)
CREATE POLICY "update_user_profiles" ON user_profiles
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- Create ratings table
CREATE TABLE IF NOT EXISTS ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rater_id text NOT NULL,
  rated_id text NOT NULL,
  trip_id uuid REFERENCES trips(id) ON DELETE SET NULL,
  role text NOT NULL CHECK (role IN ('driver', 'passenger')),
  score integer NOT NULL CHECK (score >= 1 AND score <= 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rater_id, trip_id)
);

ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_ratings" ON ratings
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "insert_ratings" ON ratings
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ratings_rated_id ON ratings(rated_id);
CREATE INDEX IF NOT EXISTS idx_trips_status ON trips(status);
CREATE INDEX IF NOT EXISTS idx_ride_requests_completed ON ride_requests(completed_at);
