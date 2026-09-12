/*
  Bridge the existing ride_requests workflow to the canonical matches model.

  Both current MVP request shapes are supported:
  - passenger_request: trip_id is the driver's trip, no passenger trip exists;
  - driver_offer: trip_id is the passenger trip and driver_trip_id is the driver's trip.

  The match is created/updated server-side so the client does not need to
  perform a non-atomic "insert request, then insert match" sequence.
*/

ALTER TABLE public.matches
  ALTER COLUMN passenger_trip_id DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_matches_request_id
  ON public.matches(request_id)
  WHERE request_id IS NOT NULL;

DROP POLICY IF EXISTS "select_matches_participants" ON public.matches;
CREATE POLICY "select_matches_participants" ON public.matches
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = matches.driver_trip_id
        AND t.created_by = auth.uid()::text
    )
    OR EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = matches.passenger_trip_id
        AND t.created_by = auth.uid()::text
    )
    OR EXISTS (
      SELECT 1 FROM public.ride_requests r
      WHERE r.id = matches.request_id
        AND r.passenger_id = auth.uid()::text
    )
  );

CREATE OR REPLACE FUNCTION public.sync_match_from_ride_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver_trip_id uuid;
  v_passenger_trip_id uuid;
  v_status text;
  v_match public.matches;
BEGIN
  IF NEW.request_type = 'driver_offer' THEN
    v_driver_trip_id := NEW.driver_trip_id;
    v_passenger_trip_id := NEW.trip_id;
  ELSE
    v_driver_trip_id := NEW.trip_id;
    v_passenger_trip_id := NULL;
  END IF;

  IF v_driver_trip_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'accepted' THEN
    v_status := 'accepted';
  ELSIF NEW.status = 'rejected' THEN
    v_status := 'rejected';
  ELSIF NEW.status = 'cancelled' THEN
    v_status := 'cancelled';
  ELSE
    v_status := 'pending';
  END IF;

  SELECT * INTO v_match
  FROM public.matches
  WHERE request_id = NEW.id
     OR (
       driver_trip_id = v_driver_trip_id
       AND passenger_trip_id IS NOT DISTINCT FROM v_passenger_trip_id
     )
  ORDER BY CASE WHEN request_id = NEW.id THEN 0 ELSE 1 END, created_at
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    UPDATE public.matches
    SET request_id = NEW.id,
        status = CASE
          WHEN public.matches.status = 'completed' THEN 'completed'
          ELSE v_status
        END,
        updated_at = now()
    WHERE id = v_match.id;
  ELSE
    INSERT INTO public.matches (
      driver_trip_id,
      passenger_trip_id,
      request_id,
      status
    )
    VALUES (
      v_driver_trip_id,
      v_passenger_trip_id,
      NEW.id,
      v_status
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_match_from_ride_request ON public.ride_requests;
CREATE TRIGGER trg_sync_match_from_ride_request
AFTER INSERT OR UPDATE OF status, request_type, trip_id, driver_trip_id
ON public.ride_requests
FOR EACH ROW
EXECUTE FUNCTION public.sync_match_from_ride_request();

GRANT EXECUTE ON FUNCTION public.sync_match_from_ride_request() TO authenticated;

-- Read-only participant RPC for the next client iteration.
CREATE OR REPLACE FUNCTION public.get_my_matches()
RETURNS SETOF public.matches
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.*
  FROM public.matches m
  WHERE EXISTS (
    SELECT 1 FROM public.trips t
    WHERE t.id = m.driver_trip_id
      AND t.created_by = auth.uid()::text
  )
  OR EXISTS (
    SELECT 1 FROM public.trips t
    WHERE t.id = m.passenger_trip_id
      AND t.created_by = auth.uid()::text
  )
  OR EXISTS (
    SELECT 1 FROM public.ride_requests r
    WHERE r.id = m.request_id
      AND r.passenger_id = auth.uid()::text
  )
  ORDER BY m.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_matches() TO authenticated;
