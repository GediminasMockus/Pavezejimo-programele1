/*
  Complete the migration from ride_requests to matches.

  A driver trip may have multiple passengers, so confirming one passenger
  must not complete the whole driver trip. Ratings are also scoped to the
  exact match so a driver can rate multiple passengers on one trip.
*/

-- Ratings belong to one concrete match.
ALTER TABLE public.ratings
  ADD COLUMN IF NOT EXISTS match_id uuid REFERENCES public.matches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ratings_match_id
  ON public.ratings(match_id);

ALTER TABLE public.ratings
  DROP CONSTRAINT IF EXISTS ratings_rater_id_trip_id_key;

DROP INDEX IF EXISTS public.ratings_rater_id_trip_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_ratings_rater_match
  ON public.ratings(rater_id, match_id)
  WHERE match_id IS NOT NULL;

-- Canonical confirmation/completion path.
CREATE OR REPLACE FUNCTION public.confirm_ride(p_request_id uuid)
RETURNS public.ride_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.ride_requests;
  v_driver_trip public.trips;
  v_passenger_trip public.trips;
  v_match public.matches;
  v_now timestamptz := now();
  v_remaining integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT * INTO v_request
  FROM public.ride_requests
  WHERE id = p_request_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request not found'; END IF;
  IF v_request.status <> 'accepted' THEN RAISE EXCEPTION 'ride is not accepted'; END IF;

  IF v_request.driver_trip_id IS NOT NULL THEN
    SELECT * INTO v_driver_trip
    FROM public.trips
    WHERE id = v_request.driver_trip_id
    FOR UPDATE;

    SELECT * INTO v_passenger_trip
    FROM public.trips
    WHERE id = v_request.trip_id
    FOR UPDATE;
  ELSE
    SELECT * INTO v_driver_trip
    FROM public.trips
    WHERE id = v_request.trip_id
    FOR UPDATE;
  END IF;

  IF v_driver_trip.id IS NULL THEN RAISE EXCEPTION 'driver trip not found'; END IF;

  SELECT * INTO v_match
  FROM public.matches
  WHERE request_id = p_request_id
  FOR UPDATE;

  IF v_match.id IS NULL THEN
    PERFORM public.sync_match_from_request(p_request_id);
    SELECT * INTO v_match
    FROM public.matches
    WHERE request_id = p_request_id
    FOR UPDATE;
  END IF;

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

  SELECT * INTO v_request
  FROM public.ride_requests
  WHERE id = p_request_id;

  IF v_request.passenger_confirmed AND v_request.driver_confirmed THEN
    UPDATE public.ride_requests
    SET completed_at = COALESCE(completed_at, v_now), updated_at = v_now
    WHERE id = p_request_id;

    IF v_match.id IS NOT NULL THEN
      UPDATE public.matches
      SET status = 'completed',
          completed_at = COALESCE(completed_at, v_now),
          updated_at = v_now
      WHERE id = v_match.id;
    END IF;

    -- A passenger's own trip is complete once that concrete ride is complete.
    IF v_passenger_trip.id IS NOT NULL THEN
      PERFORM set_config('app.allow_trip_completion', 'true', true);
      UPDATE public.trips
      SET status = 'completed', completed_at = COALESCE(completed_at, v_now)
      WHERE id = v_passenger_trip.id AND status <> 'completed';
      PERFORM set_config('app.allow_trip_completion', '', true);
    END IF;

    -- The driver's trip remains active while another accepted passenger is
    -- still outstanding. Only close it when all accepted requests are done.
    SELECT COUNT(*) INTO v_remaining
    FROM public.ride_requests rr
    WHERE rr.status = 'accepted'
      AND COALESCE(rr.driver_trip_id, rr.trip_id) = v_driver_trip.id
      AND rr.completed_at IS NULL;

    IF v_remaining = 0 THEN
      PERFORM set_config('app.allow_trip_completion', 'true', true);
      UPDATE public.trips
      SET status = 'completed', completed_at = COALESCE(completed_at, v_now)
      WHERE id = v_driver_trip.id AND status <> 'completed';
      PERFORM set_config('app.allow_trip_completion', '', true);
    END IF;

    SELECT * INTO v_request
    FROM public.ride_requests
    WHERE id = p_request_id;
  END IF;

  RETURN v_request;
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_ride(uuid) TO authenticated;

-- Canonical match-scoped rating API.
CREATE OR REPLACE FUNCTION public.submit_rating(
  p_trip_id uuid,
  p_rated_id text,
  p_role text,
  p_score integer,
  p_comment text DEFAULT NULL,
  p_request_id uuid DEFAULT NULL,
  p_match_id uuid DEFAULT NULL
)
RETURNS public.ratings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match public.matches;
  v_driver_trip public.trips;
  v_passenger_trip public.trips;
  v_request public.ride_requests;
  v_rating public.ratings;
  v_profile public.user_profiles;
  v_match_id uuid := p_match_id;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF p_score < 1 OR p_score > 5 THEN RAISE EXCEPTION 'invalid score'; END IF;
  IF p_role NOT IN ('driver', 'passenger') THEN RAISE EXCEPTION 'invalid role'; END IF;

  IF v_match_id IS NULL AND p_request_id IS NOT NULL THEN
    SELECT id INTO v_match_id
    FROM public.matches
    WHERE request_id = p_request_id
    LIMIT 1;
  END IF;

  IF v_match_id IS NULL THEN
    RAISE EXCEPTION 'match is required';
  END IF;

  SELECT * INTO v_match
  FROM public.matches
  WHERE id = v_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'match not found'; END IF;
  IF v_match.status <> 'completed' THEN RAISE EXCEPTION 'match is not completed'; END IF;

  SELECT * INTO v_driver_trip FROM public.trips WHERE id = v_match.driver_trip_id;
  IF v_driver_trip.id IS NULL THEN RAISE EXCEPTION 'driver trip not found'; END IF;

  IF v_match.passenger_trip_id IS NOT NULL THEN
    SELECT * INTO v_passenger_trip FROM public.trips WHERE id = v_match.passenger_trip_id;
  END IF;

  IF v_match.request_id IS NOT NULL THEN
    SELECT * INTO v_request FROM public.ride_requests WHERE id = v_match.request_id;
  END IF;

  IF p_trip_id IS NULL OR (p_trip_id <> v_driver_trip.id AND (v_passenger_trip.id IS NULL OR p_trip_id <> v_passenger_trip.id)) THEN
    RAISE EXCEPTION 'invalid trip for match';
  END IF;

  IF p_role = 'driver' THEN
    IF v_request.passenger_id <> auth.uid()::text OR p_rated_id <> v_driver_trip.created_by THEN
      RAISE EXCEPTION 'not authorized to rate driver';
    END IF;
  ELSE
    IF v_driver_trip.created_by <> auth.uid()::text OR p_rated_id <> v_request.passenger_id THEN
      RAISE EXCEPTION 'not authorized to rate passenger';
    END IF;
  END IF;

  INSERT INTO public.ratings (rater_id, rated_id, trip_id, match_id, role, score, comment)
  VALUES (
    auth.uid()::text,
    p_rated_id,
    p_trip_id,
    v_match.id,
    p_role,
    p_score,
    NULLIF(trim(p_comment), '')
  )
  ON CONFLICT (rater_id, match_id) DO NOTHING
  RETURNING * INTO v_rating;

  IF v_rating.id IS NULL THEN RAISE EXCEPTION 'rating already submitted'; END IF;

  SELECT * INTO v_profile FROM public.user_profiles WHERE id = p_rated_id FOR UPDATE;
  IF FOUND THEN
    UPDATE public.user_profiles
    SET total_ratings = total_ratings + 1,
        avg_rating = ROUND(((avg_rating * total_ratings) + p_score) / (total_ratings + 1), 1)
    WHERE id = p_rated_id;
  END IF;

  RETURN v_rating;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_rating(uuid, text, text, integer, text, uuid, uuid) TO authenticated;

-- Keep the existing six-argument UI/API compatible while it finishes moving
-- to match_id. The request id is resolved to the canonical match.
CREATE OR REPLACE FUNCTION public.submit_rating(
  p_trip_id uuid,
  p_rated_id text,
  p_role text,
  p_score integer,
  p_comment text DEFAULT NULL,
  p_request_id uuid DEFAULT NULL
)
RETURNS public.ratings
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.submit_rating(
    p_trip_id, p_rated_id, p_role, p_score, p_comment, p_request_id,
    (SELECT m.id FROM public.matches m WHERE m.request_id = p_request_id LIMIT 1)
  );
$$;

GRANT EXECUTE ON FUNCTION public.submit_rating(uuid, text, text, integer, text, uuid) TO authenticated;
