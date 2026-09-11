/*
  Store the two authenticated participants explicitly on matches.
  This makes match-based RLS and client chat/rating identity independent of
  nullable passenger-trip records used by direct passenger requests.
*/

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS driver_id text,
  ADD COLUMN IF NOT EXISTS passenger_id text;

-- Backfill driver identity from the driver trip and passenger identity from
-- the passenger trip or the originating request.
UPDATE public.matches m
SET driver_id = t.created_by
FROM public.trips t
WHERE m.driver_id IS NULL
  AND t.id = m.driver_trip_id;

UPDATE public.matches m
SET passenger_id = COALESCE(pt.created_by, r.passenger_id)
FROM public.matches current_m
LEFT JOIN public.trips pt ON pt.id = current_m.passenger_trip_id
LEFT JOIN public.ride_requests r ON r.id = current_m.request_id
WHERE m.id = current_m.id
  AND m.passenger_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_matches_driver_id ON public.matches(driver_id);
CREATE INDEX IF NOT EXISTS idx_matches_passenger_id ON public.matches(passenger_id);

-- Keep participant identities synchronized for both request shapes.
CREATE OR REPLACE FUNCTION public.sync_match_from_ride_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver_trip_id uuid;
  v_passenger_trip_id uuid;
  v_driver_id text;
  v_passenger_id text;
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

  IF v_driver_trip_id IS NULL THEN RETURN NEW; END IF;

  SELECT created_by INTO v_driver_id
  FROM public.trips
  WHERE id = v_driver_trip_id;

  v_passenger_id := NEW.passenger_id;

  v_status := CASE NEW.status
    WHEN 'accepted' THEN 'accepted'
    WHEN 'rejected' THEN 'rejected'
    WHEN 'cancelled' THEN 'cancelled'
    ELSE 'pending'
  END;

  SELECT * INTO v_match
  FROM public.matches
  WHERE request_id = NEW.id
     OR (
       driver_trip_id = v_driver_trip_id
       AND passenger_id = v_passenger_id
       AND passenger_trip_id IS NOT DISTINCT FROM v_passenger_trip_id
     )
  ORDER BY CASE WHEN request_id = NEW.id THEN 0 ELSE 1 END, created_at
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    UPDATE public.matches
    SET driver_trip_id = v_driver_trip_id,
        passenger_trip_id = v_passenger_trip_id,
        request_id = NEW.id,
        driver_id = v_driver_id,
        passenger_id = v_passenger_id,
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
      driver_id,
      passenger_id,
      status
    )
    VALUES (
      v_driver_trip_id,
      v_passenger_trip_id,
      NEW.id,
      v_driver_id,
      v_passenger_id,
      v_status
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Ensure the participant RPC also exposes consistent identities even for
-- matches created before this migration.
CREATE OR REPLACE FUNCTION public.get_my_matches()
RETURNS SETOF public.matches
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.*
  FROM public.matches m
  WHERE m.driver_id = auth.uid()::text
     OR m.passenger_id = auth.uid()::text
     OR EXISTS (
       SELECT 1 FROM public.trips t
       WHERE t.id = m.driver_trip_id AND t.created_by = auth.uid()::text
     )
     OR EXISTS (
       SELECT 1 FROM public.trips t
       WHERE t.id = m.passenger_trip_id AND t.created_by = auth.uid()::text
     )
  ORDER BY m.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_matches() TO authenticated;
