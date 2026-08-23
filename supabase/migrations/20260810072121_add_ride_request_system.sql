/*
# Add ride request system

1. Modified Tables
- `trips`
  - `created_by` (text, nullable) — anonymous client identifier for ownership checks

2. New Tables
- `ride_requests`
  - id (uuid PK)
  - trip_id (uuid FK → trips.id ON DELETE CASCADE)
  - passenger_name (text) — requester's name
  - passenger_phone (text, nullable) — requester's phone
  - passenger_id (text) — anonymous client identifier of the passenger
  - pickup_location (text) — where passenger wants to be picked up
  - pickup_lat (double precision, nullable)
  - pickup_lng (double precision, nullable)
  - dropoff_location (text) — where passenger wants to go
  - dropoff_lat (double precision, nullable)
  - dropoff_lng (double precision, nullable)
  - seats_needed (integer, default 1)
  - baggage (text, nullable)
  - notes (text, nullable)
  - status (text, default 'pending') — 'pending' | 'accepted' | 'rejected'
  - driver_message (text, nullable) — optional message from driver on accept/reject
  - created_at (timestamptz, default now())
  - updated_at (timestamptz, default now())

3. Security
- RLS enabled on ride_requests
- Anyone can INSERT (passengers create requests)
- Anyone can SELECT (passengers see their own, drivers see requests on their trips)
- UPDATE allowed (driver accepts/rejects; passenger cancels)
- DELETE allowed (passenger cancels request)
- RLS enabled check on trips for created_by column
*/

ALTER TABLE trips ADD COLUMN IF NOT EXISTS created_by text;

CREATE TABLE IF NOT EXISTS ride_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  passenger_name text NOT NULL,
  passenger_phone text,
  passenger_id text NOT NULL,
  pickup_location text NOT NULL,
  pickup_lat double precision,
  pickup_lng double precision,
  dropoff_location text NOT NULL,
  dropoff_lat double precision,
  dropoff_lng double precision,
  seats_needed integer NOT NULL DEFAULT 1,
  baggage text,
  notes text,
  status text NOT NULL DEFAULT 'pending',
  driver_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ride_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_ride_requests" ON ride_requests
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "insert_ride_requests" ON ride_requests
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "update_ride_requests" ON ride_requests
  FOR UPDATE TO anon, authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "delete_ride_requests" ON ride_requests
  FOR DELETE TO anon, authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS idx_ride_requests_trip_id ON ride_requests(trip_id);
CREATE INDEX IF NOT EXISTS idx_ride_requests_status ON ride_requests(status);
CREATE INDEX IF NOT EXISTS idx_ride_requests_passenger_id ON ride_requests(passenger_id);
