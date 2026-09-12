DROP POLICY IF EXISTS insert_messages_participants_v2 ON public.messages;
DROP POLICY IF EXISTS select_messages_participants_v2 ON public.messages;

CREATE POLICY select_messages_participants_v3 ON public.messages
FOR SELECT TO authenticated
USING (
  (
    request_id IS NULL
    AND (
      author_id = (select auth.uid())::text
      OR EXISTS (
        SELECT 1 FROM public.trips t
        WHERE t.id = messages.trip_id
          AND t.created_by = (select auth.uid())::text
      )
    )
  )
  OR EXISTS (
    SELECT 1 FROM public.ride_requests r
    WHERE r.id = messages.request_id
      AND (
        r.passenger_id = (select auth.uid())::text
        OR r.driver_id = (select auth.uid())::text
        OR EXISTS (SELECT 1 FROM public.trips t WHERE t.id = r.trip_id AND t.created_by = (select auth.uid())::text)
        OR EXISTS (SELECT 1 FROM public.trips t WHERE t.id = r.driver_trip_id AND t.created_by = (select auth.uid())::text)
      )
  )
  OR EXISTS (
    SELECT 1 FROM public.matches m
    WHERE m.id = messages.match_id
      AND (m.driver_id = (select auth.uid())::text OR m.passenger_id = (select auth.uid())::text)
  )
);

CREATE POLICY insert_messages_participants_v3 ON public.messages
FOR INSERT TO authenticated
WITH CHECK (
  author_id = (select auth.uid())::text
  AND request_id IS NOT NULL
  AND length(trim(body)) BETWEEN 1 AND 2000
  AND EXISTS (
    SELECT 1 FROM public.ride_requests r
    WHERE r.id = messages.request_id
      AND r.status = 'accepted'
      AND (
        r.passenger_id = (select auth.uid())::text
        OR r.driver_id = (select auth.uid())::text
        OR EXISTS (
          SELECT 1 FROM public.trips t
          WHERE t.id = COALESCE(r.driver_trip_id,r.trip_id)
            AND t.created_by = (select auth.uid())::text
        )
      )
  )
);
