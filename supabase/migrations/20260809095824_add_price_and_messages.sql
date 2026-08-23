/*
# Add price column to trips and create messages table

1. Modified Tables
- `trips`
  - Add `price` (numeric, nullable) — preliminary price in EUR per seat (driver) or offered price (passenger). Nullable so existing rows remain valid.
  - Add `price_unit` (text, default 'asmeniui') — unit label for the price, e.g. "asmeniui" (per person) or "viso" (total).
2. New Tables
- `messages`
  - `id` (uuid, primary key)
  - `trip_id` (uuid, foreign key → trips.id ON DELETE CASCADE) — which trip the message belongs to
  - `author_name` (text, not null) — display name of the sender
  - `body` (text, not null) — message content
  - `created_at` (timestamptz, default now())
3. Security
- Enable RLS on `messages`.
- Allow anon + authenticated CRUD (no-auth app, messages are intentionally public/shared).
4. Indexes
- Index on `messages.trip_id` for fetching a trip's conversation.
- Index on `messages.created_at` for ordering.
*/

ALTER TABLE trips ADD COLUMN IF NOT EXISTS price numeric;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS price_unit text NOT NULL DEFAULT 'asmeniui';

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  author_name text NOT NULL,
  body text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_trip_id ON messages (trip_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages (created_at);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_messages" ON messages;
CREATE POLICY "anon_select_messages" ON messages FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_messages" ON messages;
CREATE POLICY "anon_insert_messages" ON messages FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_messages" ON messages;
CREATE POLICY "anon_update_messages" ON messages FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_messages" ON messages;
CREATE POLICY "anon_delete_messages" ON messages FOR DELETE
  TO anon, authenticated USING (true);
