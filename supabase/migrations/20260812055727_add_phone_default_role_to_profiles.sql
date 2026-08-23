/*
# Add phone and default_role to user_profiles

1. Modified Tables
- `user_profiles`
  - `phone` (text, nullable) — user's phone number for contact
  - `default_role` (text, nullable) — preferred role: 'driver' or 'passenger'
2. Security
- No new tables. Existing RLS policies on user_profiles remain unchanged.
*/

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS default_role text;
