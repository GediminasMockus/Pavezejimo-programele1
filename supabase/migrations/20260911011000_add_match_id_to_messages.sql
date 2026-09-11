/*
  Give chat messages a canonical booking identity while keeping request_id
  during the migration period for backwards compatibility.
*/

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS match_id uuid REFERENCES public.matches(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_messages_match_id
  ON public.messages(match_id, created_at);

UPDATE public.messages m
SET match_id = x.id
FROM public.matches x
WHERE m.match_id IS NULL
  AND m.request_id IS NOT NULL
  AND x.request_id = m.request_id;

-- Existing request-based access remains valid. Match-based access is added so
-- future clients can stop depending on request/trip identity for chat.
DROP POLICY IF EXISTS "select_messages_participants" ON public.messages;
CREATE POLICY "select_messages_participants" ON public.messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = messages.trip_id
        AND t.created_by = auth.uid()::text
    )
    OR (
      messages.request_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.ride_requests r
        WHERE r.id = messages.request_id
          AND r.passenger_id = auth.uid()::text
          AND r.trip_id = messages.trip_id
      )
    )
    OR (
      messages.match_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.matches m
        WHERE m.id = messages.match_id
          AND (m.driver_id = auth.uid()::text OR m.passenger_id = auth.uid()::text)
      )
    )
  );

DROP POLICY IF EXISTS "insert_messages_participants" ON public.messages;
CREATE POLICY "insert_messages_participants" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()::text
    AND (
      EXISTS (
        SELECT 1 FROM public.trips t
        WHERE t.id = messages.trip_id
          AND t.created_by = auth.uid()::text
      )
      OR (
        messages.request_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.ride_requests r
          WHERE r.id = messages.request_id
            AND r.passenger_id = auth.uid()::text
            AND r.trip_id = messages.trip_id
            AND r.status = 'accepted'
        )
      )
      OR (
        messages.match_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.matches m
          WHERE m.id = messages.match_id
            AND m.status = 'accepted'
            AND (m.driver_id = auth.uid()::text OR m.passenger_id = auth.uid()::text)
        )
      )
    )
  );
