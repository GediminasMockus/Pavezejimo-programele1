-- Add missing columns to messages table
-- The messages table was created without request_id and author_id columns
-- but the ChatDrawer component and RLS policies require them

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS request_id uuid REFERENCES public.ride_requests(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS author_id text;

-- Add index for request_id
CREATE INDEX IF NOT EXISTS idx_messages_request_id ON public.messages(request_id);

-- Update RLS policies to work with the new structure
DROP POLICY IF EXISTS "select_messages_participants_v2" ON public.messages;
CREATE POLICY "select_messages_participants_v2" ON public.messages
FOR SELECT TO authenticated USING (
  request_id IS NULL OR EXISTS (
    SELECT 1 FROM public.ride_requests r
    WHERE r.id = messages.request_id
      AND (r.passenger_id = auth.uid()::text OR r.driver_id = auth.uid()::text
        OR EXISTS (SELECT 1 FROM public.trips t WHERE t.id = r.trip_id AND t.created_by = auth.uid()::text)
        OR EXISTS (SELECT 1 FROM public.trips t WHERE t.id = r.driver_trip_id AND t.created_by = auth.uid()::text))
  )
);

DROP POLICY IF EXISTS "insert_messages_participants_v2" ON public.messages;
CREATE POLICY "insert_messages_participants_v2" ON public.messages
FOR INSERT TO authenticated WITH CHECK (
  author_id = auth.uid()::text
  AND (request_id IS NULL OR EXISTS (
    SELECT 1 FROM public.ride_requests r
    WHERE r.id = messages.request_id AND r.status = 'accepted'
      AND (r.passenger_id = auth.uid()::text OR r.driver_id = auth.uid()::text
        OR EXISTS (SELECT 1 FROM public.trips t WHERE t.id = r.trip_id AND t.created_by = auth.uid()::text)
        OR EXISTS (SELECT 1 FROM public.trips t WHERE t.id = r.driver_trip_id AND t.created_by = auth.uid()::text))
  ))
);
