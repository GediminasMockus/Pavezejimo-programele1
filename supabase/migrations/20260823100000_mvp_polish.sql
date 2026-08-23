-- MVP polish: prevent duplicate requests, improve completion semantics for multi-passenger trips.

CREATE UNIQUE INDEX IF NOT EXISTS uq_ride_requests_passenger_trip_active
  ON public.ride_requests (trip_id, passenger_id)
  WHERE status IN ('pending', 'accepted');

CREATE OR REPLACE FUNCTION public.confirm_ride(p_request_id uuid)
RETURNS public.ride_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.ride_requests;
  v_trip public.trips;
  v_now timestamptz := now();
  v_open_requests integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;

  SELECT * INTO v_request
  FROM public.ride_requests
  WHERE id = p_request_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request not found'; END IF;
  IF v_request.status <> 'accepted' THEN RAISE EXCEPTION 'ride is not accepted'; END IF;

  SELECT * INTO v_trip
  FROM public.trips
  WHERE id = v_request.trip_id
  FOR UPDATE;

  IF v_request.passenger_id = auth.uid()::text THEN
    UPDATE public.ride_requests
    SET passenger_confirmed = true, updated_at = v_now
    WHERE id = p_request_id;
  ELSIF v_trip.created_by = auth.uid()::text THEN
    UPDATE public.ride_requests
    SET driver_confirmed = true, updated_at = v_now
    WHERE id = p_request_id;
  ELSE
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO v_request FROM public.ride_requests WHERE id = p_request_id;

  IF v_request.passenger_confirmed AND v_request.driver_confirmed THEN
    UPDATE public.ride_requests
    SET completed_at = COALESCE(completed_at, v_now), updated_at = v_now
    WHERE id = p_request_id;

    SELECT count(*)::integer INTO v_open_requests
    FROM public.ride_requests
    WHERE trip_id = v_request.trip_id
      AND status = 'accepted'
      AND NOT (passenger_confirmed AND driver_confirmed);

    IF v_open_requests = 0 THEN
      PERFORM set_config('app.allow_trip_completion', 'true', true);
      UPDATE public.trips
      SET status = 'completed', completed_at = COALESCE(completed_at, v_now)
      WHERE id = v_request.trip_id;
      PERFORM set_config('app.allow_trip_completion', '', true);
    END IF;

    SELECT * INTO v_request FROM public.ride_requests WHERE id = p_request_id;
  END IF;

  RETURN v_request;
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_ride(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_rating(
  p_trip_id uuid,
  p_rated_id text,
  p_role text,
  p_score integer,
  p_comment text DEFAULT NULL
)
RETURNS public.ratings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trip public.trips;
  v_request public.ride_requests;
  v_rating public.ratings;
  v_profile public.user_profiles;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF p_score < 1 OR p_score > 5 THEN RAISE EXCEPTION 'invalid score'; END IF;
  IF p_role NOT IN ('driver', 'passenger') THEN RAISE EXCEPTION 'invalid role'; END IF;

  SELECT * INTO v_trip FROM public.trips WHERE id = p_trip_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'trip not found'; END IF;
  IF v_trip.status <> 'completed' THEN RAISE EXCEPTION 'trip is not completed'; END IF;

  IF p_role = 'driver' THEN
    SELECT r.* INTO v_request
    FROM public.ride_requests r
    WHERE r.trip_id = p_trip_id
      AND r.status = 'accepted'
      AND r.passenger_id = auth.uid()::text
      AND r.completed_at IS NOT NULL
    LIMIT 1;

    IF NOT FOUND OR p_rated_id <> v_trip.created_by THEN
      RAISE EXCEPTION 'not authorized to rate driver';
    END IF;
  ELSE
    SELECT r.* INTO v_request
    FROM public.ride_requests r
    WHERE r.trip_id = p_trip_id
      AND r.status = 'accepted'
      AND v_trip.created_by = auth.uid()::text
      AND r.passenger_id = p_rated_id
      AND r.completed_at IS NOT NULL
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'not authorized to rate passenger';
    END IF;
  END IF;

  INSERT INTO public.ratings (rater_id, rated_id, trip_id, role, score, comment)
  VALUES (auth.uid()::text, p_rated_id, p_trip_id, p_role, p_score, NULLIF(trim(p_comment), ''))
  ON CONFLICT (rater_id, trip_id) DO NOTHING
  RETURNING * INTO v_rating;

  IF v_rating.id IS NULL THEN RAISE EXCEPTION 'rating already submitted'; END IF;

  SELECT * INTO v_profile FROM public.user_profiles WHERE id = p_rated_id FOR UPDATE;

  IF FOUND THEN
    UPDATE public.user_profiles
    SET total_ratings = total_ratings + 1,
        avg_rating = ROUND(((avg_rating * total_ratings) + p_score) / (total_ratings + 1), 1)
    WHERE id = p_rated_id;
  ELSE
    INSERT INTO public.user_profiles (id, display_name, total_ratings, avg_rating)
    VALUES (
      p_rated_id,
      CASE WHEN p_role = 'driver' THEN v_trip.name ELSE v_request.passenger_name END,
      1,
      p_score
    );
  END IF;

  RETURN v_rating;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_rating(uuid, text, text, integer, text) TO authenticated;


-- Tighten request state transitions and reject stale trip requests.
CREATE OR REPLACE FUNCTION public.set_ride_request_status(
  p_request_id uuid,
  p_status text,
  p_driver_message text DEFAULT NULL
)
RETURNS public.ride_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.ride_requests;
  v_trip public.trips;
  v_used_seats integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;

  SELECT * INTO v_request FROM public.ride_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request not found'; END IF;

  SELECT * INTO v_trip FROM public.trips WHERE id = v_request.trip_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'trip not found'; END IF;

  IF v_trip.created_by = auth.uid()::text THEN
    IF p_status NOT IN ('accepted', 'rejected') THEN RAISE EXCEPTION 'invalid driver status'; END IF;
    IF v_request.status <> 'pending' THEN RAISE EXCEPTION 'request is no longer pending'; END IF;
    IF v_trip.status <> 'active' OR v_trip.deleted_at IS NOT NULL OR v_trip.departure_time <= now() THEN
      RAISE EXCEPTION 'trip is no longer active';
    END IF;

    IF p_status = 'accepted' THEN
      SELECT COALESCE(SUM(seats_needed), 0) INTO v_used_seats
      FROM public.ride_requests
      WHERE trip_id = v_request.trip_id AND status = 'accepted' AND id <> v_request.id;
      IF v_used_seats + v_request.seats_needed > v_trip.seats THEN RAISE EXCEPTION 'not enough seats'; END IF;
    END IF;

    UPDATE public.ride_requests
    SET status = p_status, driver_message = COALESCE(p_driver_message, driver_message), updated_at = now()
    WHERE id = p_request_id
    RETURNING * INTO v_request;
    RETURN v_request;
  END IF;

  IF v_request.passenger_id = auth.uid()::text AND p_status = 'cancelled' THEN
    IF v_request.status NOT IN ('pending', 'accepted') THEN RAISE EXCEPTION 'request cannot be cancelled'; END IF;
    UPDATE public.ride_requests SET status = 'cancelled', updated_at = now()
    WHERE id = p_request_id RETURNING * INTO v_request;
    RETURN v_request;
  END IF;

  RAISE EXCEPTION 'not authorized';
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_ride_request_status(uuid, text, text) TO authenticated;
