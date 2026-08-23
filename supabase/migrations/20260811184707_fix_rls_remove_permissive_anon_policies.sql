-- Remove permissive anon policies on trips that bypass ownership checks
DROP POLICY IF EXISTS anon_delete_trips ON trips;
DROP POLICY IF EXISTS anon_insert_trips ON trips;
DROP POLICY IF EXISTS anon_select_trips ON trips;
DROP POLICY IF EXISTS anon_update_trips ON trips;

-- Remove permissive anon policies on messages that bypass ownership checks
DROP POLICY IF EXISTS anon_delete_messages ON messages;
DROP POLICY IF EXISTS anon_insert_messages ON messages;
DROP POLICY IF EXISTS anon_select_messages ON messages;
DROP POLICY IF EXISTS anon_update_messages ON messages;

-- Ratings: add UPDATE and DELETE policies (currently only SELECT and INSERT exist)
DROP POLICY IF EXISTS update_ratings_auth ON ratings;
DROP POLICY IF EXISTS delete_ratings_auth ON ratings;

CREATE POLICY "update_ratings_auth" ON ratings
  FOR UPDATE TO authenticated
  USING (rater_id = auth.uid()::text)
  WITH CHECK (rater_id = auth.uid()::text);

CREATE POLICY "delete_ratings_auth" ON ratings
  FOR DELETE TO authenticated USING (rater_id = auth.uid()::text);
