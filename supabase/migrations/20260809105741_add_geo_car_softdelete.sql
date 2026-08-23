/*
# Add geo coordinates, car info, and soft-delete to trips

1. Modified Tables
- `trips`
  - `from_lat` (double precision, nullable) — latitude of departure location
  - `from_lng` (double precision, nullable) — longitude of departure location
  - `to_lat` (double precision, nullable) — latitude of destination
  - `to_lng` (double precision, nullable) — longitude of destination
  - `car_color` (text, nullable) — car color (drivers only)
  - `car_make` (text, nullable) — car make/model (drivers only)
  - `car_plate` (text, nullable) — car license plate (drivers only)
  - `deleted_at` (timestamptz, nullable) — when the trip was soft-deleted
  - `deletion_reason` (text, nullable) — why the trip was removed
2. Security
- No policy changes needed — existing UPDATE policy already allows soft-delete via UPDATE.
- The SELECT query in the app filters `deleted_at IS NULL`.
3. Important Notes
- Soft-delete replaces hard DELETE to preserve deletion reasons.
- Existing rows get NULL for all new columns, which is safe.
- Car fields are mandatory for drivers in the app layer (not at DB level, since passengers don't have them).
*/

ALTER TABLE trips ADD COLUMN IF NOT EXISTS from_lat double precision;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS from_lng double precision;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS to_lat double precision;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS to_lng double precision;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS car_color text;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS car_make text;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS car_plate text;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS deletion_reason text;
