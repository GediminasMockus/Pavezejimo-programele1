/* Match lifecycle hardening. Supports direct passenger requests and driver offers. */

ALTER TABLE public.matches
  ALTER COLUMN passenger_trip_id DROP NOT NULL;

DROP INDEX IF EXISTS public.uq_matches_trip_pair;
CREATE UNIQUE INDEX IF NOT EXISTS uq_matches_trip_pair
  ON public.matches(driver_trip_id, passenger_trip_id)
  WHERE passenger_trip_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_matches_request_id
  ON public.matches(request_id)
  WHERE request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_matches_driver_request
  ON public.matches(driver_trip_id, request_id);

CREATE OR REPLACE FUNCTION public.sync_match_from_request(p_request_id uuid)
RETURNS public.matches
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_request public.ride_requests;
  v_driver_trip public.trips;
  v_passenger_trip public.trips;
  v_match public.matches;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  SELECT * INTO v_request FROM public.ride_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request not found'; END IF;

  IF v_request.driver_trip_id IS NOT NULL THEN
    SELECT * INTO v_driver_trip FROM public.trips WHERE id = v_request.driver_trip_id FOR SHARE;
    SELECT * INTO v_passenger_trip FROM public.trips WHERE id = v_request.trip_id FOR SHARE;
    IF v_passenger_trip.id IS NULL OR v_driver_trip.id IS NULL THEN RAISE EXCEPTION 'match trips not found'; END IF;
  ELSE
    SELECT * INTO v_driver_trip FROM public.trips WHERE id = v_request.trip_id FOR SHARE;
    IF v_driver_trip.id IS NULL THEN RAISE EXCEPTION 'driver trip not found'; END IF;
  END IF;

  IF v_driver_trip.role <> 'driver' OR v_driver_trip.status <> 'active' OR v_driver_trip.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'driver trip is not available';
  END IF;
  IF v_request.passenger_id IS NULL THEN RAISE EXCEPTION 'passenger is required'; END IF;
  IF v_passenger_trip.id IS NOT NULL AND v_passenger_trip.created_by <> v_request.passenger_id THEN
    RAISE EXCEPTION 'passenger trip owner mismatch';
  END IF;

  INSERT INTO public.matches (driver_trip_id, passenger_trip_id, request_id, status, updated_at)
  VALUES (v_driver_trip.id, v_passenger_trip.id, v_request.id,
          CASE WHEN v_request.status = 'accepted' THEN 'accepted' ELSE v_request.status END, now())
  ON CONFLICT (request_id) DO UPDATE SET
    status = CASE
      WHEN public.matches.status = 'completed' THEN 'completed'
      WHEN EXCLUDED.status IN ('accepted','rejected','cancelled') THEN EXCLUDED.status
      ELSE public.matches.status
    END,
    updated_at = now()
  RETURNING * INTO v_match;
  RETURN v_match;
END;
$$;
GRANT EXECUTE ON FUNCTION public.sync_match_from_request(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_ride_request_status(
  p_request_id uuid, p_status text, p_driver_message text DEFAULT NULL
)
RETURNS public.ride_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_request public.ride_requests;
  v_trip public.trips;
  v_used_seats integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF p_status NOT IN ('accepted','rejected','cancelled') THEN RAISE EXCEPTION 'invalid request status'; END IF;
  SELECT * INTO v_request FROM public.ride_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request not found'; END IF;

  IF v_request.driver_trip_id IS NOT NULL THEN
    SELECT * INTO v_trip FROM public.trips WHERE id = v_request.driver_trip_id FOR UPDATE;
  ELSE
    SELECT * INTO v_trip FROM public.trips WHERE id = v_request.trip_id FOR UPDATE;
  END IF;
  IF v_trip.id IS NULL THEN RAISE EXCEPTION 'driver trip not found'; END IF;

  IF v_trip.created_by = auth.uid()::text THEN
    IF p_status NOT IN ('accepted','rejected') THEN RAISE EXCEPTION 'invalid driver status'; END IF;
    IF p_status = 'accepted' AND v_request.status <> 'accepted' THEN
      SELECT COALESCE(SUM(seats_needed),0) INTO v_used_seats
      FROM public.ride_requests
      WHERE (trip_id = v_trip.id OR driver_trip_id = v_trip.id)
        AND status = 'accepted' AND id <> v_request.id;
      IF v_used_seats + v_request.seats_needed > v_trip.seats THEN RAISE EXCEPTION 'not enough seats'; END IF;
    END IF;
    UPDATE public.ride_requests
      SET status = p_status, driver_message = COALESCE(p_driver_message, driver_message), updated_at = now()
      WHERE id = p_request_id RETURNING * INTO v_request;
  ELSIF v_request.passenger_id = auth.uid()::text AND p_status = 'cancelled' THEN
    UPDATE public.ride_requests SET status = 'cancelled', updated_at = now()
      WHERE id = p_request_id RETURNING * INTO v_request;
  ELSE
    RAISE EXCEPTION 'not authorized';
  END IF;

  PERFORM public.sync_match_from_request(p_request_id);
  RETURN v_request;
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_ride_request_status(uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_match_status(p_match_id uuid, p_status text)
RETURNS public.matches
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_match public.matches;
  v_driver_trip public.trips;
  v_passenger_trip public.trips;
  v_request public.ride_requests;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF p_status NOT IN ('accepted','rejected','cancelled') THEN RAISE EXCEPTION 'invalid match transition'; END IF;
  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'match not found'; END IF;
  IF v_match.status = 'completed' THEN RAISE EXCEPTION 'completed match is immutable'; END IF;
  SELECT * INTO v_driver_trip FROM public.trips WHERE id = v_match.driver_trip_id FOR SHARE;

  IF v_driver_trip.created_by = auth.uid()::text THEN
    IF p_status NOT IN ('accepted','rejected') THEN RAISE EXCEPTION 'driver cannot cancel here'; END IF;
  ELSIF v_match.passenger_trip_id IS NOT NULL THEN
    SELECT * INTO v_passenger_trip FROM public.trips WHERE id = v_match.passenger_trip_id FOR SHARE;
    IF v_passenger_trip.created_by <> auth.uid()::text OR p_status <> 'cancelled' THEN RAISE EXCEPTION 'not authorized'; END IF;
  ELSIF v_match.request_id IS NOT NULL THEN
    SELECT * INTO v_request FROM public.ride_requests WHERE id = v_match.request_id FOR SHARE;
    IF v_request.passenger_id <> auth.uid()::text OR p_status <> 'cancelled' THEN RAISE EXCEPTION 'not authorized'; END IF;
  ELSE
    RAISE EXCEPTION 'match participant cannot be resolved';
  END IF;

  UPDATE public.matches SET status = p_status, updated_at = now()
    WHERE id = p_match_id RETURNING * INTO v_match;
  IF v_match.request_id IS NOT NULL THEN
    UPDATE public.ride_requests SET status = p_status, updated_at = now()
      WHERE id = v_match.request_id AND status <> 'completed';
  END IF;
  RETURN v_match;
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_match_status(uuid,text) TO authenticated;
