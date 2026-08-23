/*
# Create trips table for suburban carpooling

1. New Tables
- `trips`
  - `id` (uuid, primary key)
  - `role` (text, not null) — 'driver' or 'passenger'
  - `from_location` (text, not null) — departure location
  - `to_location` (text, not null) — destination
  - `departure_time` (timestamptz, not null) — when the trip happens
  - `name` (text, not null) — display name of the person posting
  - `phone` (text) — optional contact phone
  - `seats` (integer, default 1) — number of seats offered (driver) or needed (passenger)
  - `notes` (text) — optional extra info
  - `created_at` (timestamptz, default now())
2. Security
- Enable RLS on `trips`.
- Allow anon + authenticated CRUD because the app has no sign-in and the data is intentionally shared/public.
3. Indexes
- Index on `departure_time` for chronological queries.
- Index on `role` for filtering drivers vs passengers.
*/

CREATE TABLE IF NOT EXISTS trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role text NOT NULL CHECK (role IN ('driver', 'passenger')),
  from_location text NOT NULL,
  to_location text NOT NULL,
  departure_time timestamptz NOT NULL,
  name text NOT NULL,
  phone text,
  seats integer NOT NULL DEFAULT 1 CHECK (seats > 0),
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trips_departure_time ON trips (departure_time);
CREATE INDEX IF NOT EXISTS idx_trips_role ON trips (role);

ALTER TABLE trips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_trips" ON trips;
CREATE POLICY "anon_select_trips" ON trips FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_trips" ON trips;
CREATE POLICY "anon_insert_trips" ON trips FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_trips" ON trips;
CREATE POLICY "anon_update_trips" ON trips FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_trips" ON trips;
CREATE POLICY "anon_delete_trips" ON trips FOR DELETE
  TO anon, authenticated USING (true);
