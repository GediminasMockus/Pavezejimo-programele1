/*
  Canonical match lifecycle for both request directions.

  A ride_request is the creation/compatibility record. A match is the stable
  booking identity. Direct passenger requests do not necessarily have a
  passenger trip, so passenger_trip_id is nullable; participant ids make the
  relationship explicit and secure.
*/

ALTER TABLE public.matches
  ALTER COLUMN passenger_trip_id DROP NOT NULL;

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS driver_id text,
  ADD COLUMN IF NOT EXISTS passenger_id text;

-- Backfill participant ids for rows created by the previous migration.
UPDATE public.matches m
SET passenger_id = COALESCE(m.passenger_id, rp.passenger_id),
    driver_id = COALESCE(
      m.driver_id,
      CASE
        WHEN rp.request_type = 'driver_offer' THEN rp.driver_id
        ELSE dt.created_by
      END
    )
FROM public.ride_requests rp
JOIN public.trips dt ON dt.id = m.driver_trip_id
WHERE m.request_id = rp.id;

-- Driver + request is the canonical identity for direct passenger requests.
CREATE UNIQUE INDEX IF NOT EXISTS uq_matches_request_id
  ON public.matches(request_id)
  WHERE request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_matches_driver_id_status
  ON public.matches(driver_id, status);
CREATE INDEX IF NOT EXISTS idx_matches_passenger_id_status
  ON public.matches(passenger_id, status);

-- Replace trip-ownership-only RLS with explicit participant RLS.
DROP POLICY IF EXISTS "select_matches_participants" ON public.matches;
CREATE POLICY "select_matches_participants" ON public.matches
  FOR SELECT TO authenticated
  USING (
    driver_id = auth.uid()::text
    OR passenger_id = auth.uid()::text
  );

-- Canonical match creation from either request direction. This is invoked by
-- a trigger, so clients never need INSERT permission on matches.
CREATE OR REPLACE FUNCTION public.sync_match_from_request(p_request_id uuid)
RETURNS public.matches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.ride_requests;
  v_driver_trip public.trips;
  v_passenger_trip public.trips;
  v_match public.matches;
BEGIN
  SELECT * INTO v_request
  FROM public.ride_requests
  WHERE id = p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'request not found'; END IF;

  IF v_request.request_type = 'driver_offer' THEN
    IF v_request.driver_trip_id IS NULL THEN
      RAISE EXCEPTION 'driver trip is required for driver offer';
    END IF;
    SELECT * INTO v_driver_trip FROM public.trips WHERE id = v_request.driver_trip_id;
    SELECT * INTO v_passenger_trip FROM public.trips WHERE id = v_request.trip_id;
  ELSE
    SELECT * INTO v_driver_trip FROM public.trips WHERE id = v_request.trip_id;
    v_passenger_trip := NULL;
  END IF;

  IF NOT FOUND OR v_driver_trip.role <> 'driver' THEN
    RAISE EXCEPTION 'driver trip not found';
  END IF;
  IF v_driver_trip.created_by IS NULL OR v_request.passenger_id IS NULL THEN
    RAISE EXCEPTION 'match participants are missing';
  END IF;
  IF v_driver_trip.created_by = v_request.passenger_id THEN
    RAISE EXCEPTION 'cannot match a user with their own trip';
  END IF;

  INSERT INTO public.matches (
    driver_trip_id,
    passenger_trip_id,
    request_id,
    status,
    driver_id,
    passenger_id
  )
  VALUES (
    v_driver_trip.id,
    CASE WHEN v_passenger_trip.id IS NULL THEN NULL ELSE v_passenger_trip.id END,
    v_request.id,
    CASE WHEN v_request.status = 'accepted' THEN 'accepted' ELSE 'pending' END,
    v_driver_trip.created_by,
    v_request.passenger_id
  )
  ON CONFLICT (request_id)
  DO UPDATE SET
    driver_trip_id = EXCLUDED.driver_trip_id,
    passenger_trip_id = COALESCE(EXCLUDED.passenger_trip_id, public.matches.passenger_trip_id),
    driver_id = EXCLUDED.driver_id,
    passenger_id = EXCLUDED.passenger_id,
    status = CASE
      WHEN public.matches.status = 'completed' THEN 'completed'
      WHEN EXCLUDED.status = 'accepted' THEN 'accepted'
      ELSE public.matches.status
    END,
    updated_at = now()
  RETURNING * INTO v_match;

  RETURN v_match;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sync_match_from_request(uuid) FROM authenticated;

CREATE OR REPLACE FUNCTION public.trg_sync_match_from_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('pending', 'accepted') THEN
    PERFORM public.sync_match_from_request(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ride_request_sync_match ON public.ride_requests;
CREATE TRIGGER trg_ride_request_sync_match
AFTER INSERT OR UPDATE OF status, driver_trip_id, trip_id
ON public.ride_requests
FOR EACH ROW
EXECUTE FUNCTION public.trg_sync_match_from_request();

-- Keep match state and request state aligned when both participants confirm.
CREATE OR REPLACE FUNCTION public.confirm_ride(p_request_id uuid)
RETURNS public.ride_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.ride_requests;
  v_driver_trip public.trips;
  v_match public.matches;
  v_now timestamptz := now();
  v_all_driver_bookings_done boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;

  SELECT * INTO v_request
  FROM public.ride_requests
  WHERE id = p_request_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request not found'; END IF;
  IF v_request.status <> 'accepted' THEN RAISE EXCEPTION 'ride is not accepted'; END IF;

  IF v_request.request_type = 'driver_offer' THEN
    SELECT * INTO v_driver_trip
    FROM public.trips
    WHERE id = v_request.driver_trip_id
    FOR UPDATE;
  ELSE
    SELECT * INTO v_driver_trip
    FROM public.trips
    WHERE id = v_request.trip_id
    FOR UPDATE;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'driver trip not found'; END IF;

  IF v_request.passenger_id = auth.uid()::text THEN
    UPDATE public.ride_requests
    SET passenger_confirmed = true, updated_at = v_now
    WHERE id = p_request_id;
  ELSIF v_driver_trip.created_by = auth.uid()::text THEN
    UPDATE public.ride_requests
    SET driver_confirmed = true, updated_at = v_now
    WHERE id = p_request_id;
  ELSE
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO v_request FROM public.ride_requests WHERE id = p_request_id;

  SELECT * INTO v_match
  FROM public.matches
  WHERE request_id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    v_match := public.sync_match_from_request(p_request_id);
  END IF;

  UPDATE public.matches
  SET driver_confirmed = v_request.driver_confirmed,
      passenger_confirmed = v_request.passenger_confirmed,
      status = CASE
        WHEN status = 'completed' THEN 'completed'
        WHEN v_request.driver_confirmed AND v_request.passenger_confirmed THEN 'completed'
        ELSE 'accepted'
      END,
      completed_at = CASE
        WHEN v_request.driver_confirmed AND v_request.passenger_confirmed THEN COALESCE(completed_at, v_now)
        ELSE completed_at
      END,
      updated_at = v_now
  WHERE id = v_match.id;

  IF v_request.passenger_confirmed AND v_request.driver_confirmed THEN
    UPDATE public.ride_requests
    SET completed_at = COALESCE(completed_at, v_now), updated_at = v_now
    WHERE id = p_request_id;

    -- A driver trip is completed only after every accepted booking on that
    -- trip has completed. One passenger can no longer complete the whole trip.
    SELECT NOT EXISTS (
      SELECT 1
      FROM public.ride_requests r
      WHERE r.status = 'accepted'
        AND (
          (r.request_type = 'passenger_request' AND r.trip_id = v_driver_trip.id)
          OR (r.request_type = 'driver_offer' AND r.driver_trip_id = v_driver_trip.id)
        )
        AND r.completed_at IS NULL
    ) INTO v_all_driver_bookings_done;

    IF v_all_driver_bookings_done THEN
      PERFORM set_config('app.allow_trip_completion', 'true', true);
      UPDATE public.trips
      SET status = 'completed', completed_at = COALESCE(completed_at, v_now)
      WHERE id = v_driver_trip.id
        AND status <> 'completed';
      PERFORM set_config('app.allow_trip_completion', '', true);
    END IF;

    SELECT * INTO v_request FROM public.ride_requests WHERE id = p_request_id;
  END IF;

  RETURN v_request;
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_ride(uuid) TO authenticated;
