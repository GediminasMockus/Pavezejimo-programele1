-- Two-sided marketplace matching: drivers can offer a ride to passenger listings.
-- Existing passenger -> driver requests remain fully compatible.

ALTER TABLE public.ride_requests
  ADD COLUMN IF NOT EXISTS request_type text NOT NULL DEFAULT 'passenger_request',
  ADD COLUMN IF NOT EXISTS driver_id text,
  ADD COLUMN IF NOT EXISTS driver_name text,
  ADD COLUMN IF NOT EXISTS driver_phone text,
  ADD COLUMN IF NOT EXISTS driver_trip_id uuid REFERENCES public.trips(id) ON DELETE SET NULL;

ALTER TABLE public.ride_requests
  DROP CONSTRAINT IF EXISTS ride_requests_request_type_check;
ALTER TABLE public.ride_requests
  ADD CONSTRAINT ride_requests_request_type_check
  CHECK (request_type IN ('passenger_request', 'driver_offer'));

CREATE INDEX IF NOT EXISTS idx_ride_requests_driver_id ON public.ride_requests(driver_id);
CREATE INDEX IF NOT EXISTS idx_ride_requests_driver_trip_id ON public.ride_requests(driver_trip_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_driver_offer_passenger_trip_active
  ON public.ride_requests(trip_id)
  WHERE request_type = 'driver_offer' AND status IN ('pending', 'accepted');

DROP POLICY IF EXISTS "select_ride_requests_participants" ON public.ride_requests;
DROP POLICY IF EXISTS "insert_ride_requests_own" ON public.ride_requests;
DROP POLICY IF EXISTS "update_ride_requests_cancel_only" ON public.ride_requests;
DROP POLICY IF EXISTS "delete_ride_requests_own" ON public.ride_requests;

CREATE POLICY "select_ride_requests_participants_v2" ON public.ride_requests
FOR SELECT TO authenticated
USING (
  passenger_id = auth.uid()::text
  OR driver_id = auth.uid()::text
  OR EXISTS (
    SELECT 1 FROM public.trips t
    WHERE t.id = ride_requests.trip_id AND t.created_by = auth.uid()::text
  )
  OR EXISTS (
    SELECT 1 FROM public.trips t
    WHERE t.id = ride_requests.driver_trip_id AND t.created_by = auth.uid()::text
  )
);

CREATE POLICY "insert_ride_requests_v2" ON public.ride_requests
FOR INSERT TO authenticated
WITH CHECK (
  (
    request_type = 'passenger_request'
    AND passenger_id = auth.uid()::text
    AND EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = ride_requests.trip_id
        AND t.role = 'driver'
        AND t.status = 'active'
        AND t.deleted_at IS NULL
        AND t.departure_time > now()
        AND t.created_by <> auth.uid()::text
    )
  )
  OR
  (
    request_type = 'driver_offer'
    AND driver_id = auth.uid()::text
    AND EXISTS (
      SELECT 1 FROM public.trips passenger_trip
      WHERE passenger_trip.id = ride_requests.trip_id
        AND passenger_trip.role = 'passenger'
        AND passenger_trip.status = 'active'
        AND passenger_trip.deleted_at IS NULL
        AND passenger_trip.departure_time > now()
        AND passenger_trip.created_by = ride_requests.passenger_id
        AND passenger_trip.created_by <> auth.uid()::text
    )
    AND EXISTS (
      SELECT 1 FROM public.trips driver_trip
      WHERE driver_trip.id = ride_requests.driver_trip_id
        AND driver_trip.role = 'driver'
        AND driver_trip.created_by = auth.uid()::text
        AND driver_trip.status = 'active'
        AND driver_trip.deleted_at IS NULL
        AND driver_trip.departure_time > now()
    )
  )
);

CREATE POLICY "update_ride_requests_v2" ON public.ride_requests
FOR UPDATE TO authenticated
USING (
  passenger_id = auth.uid()::text OR driver_id = auth.uid()::text
  OR EXISTS (SELECT 1 FROM public.trips t WHERE t.id = ride_requests.trip_id AND t.created_by = auth.uid()::text)
  OR EXISTS (SELECT 1 FROM public.trips t WHERE t.id = ride_requests.driver_trip_id AND t.created_by = auth.uid()::text)
)
WITH CHECK (true);

CREATE POLICY "delete_ride_requests_v2" ON public.ride_requests
FOR DELETE TO authenticated
USING (passenger_id = auth.uid()::text OR driver_id = auth.uid()::text);

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
  v_driver_trip public.trips;
  v_used_seats integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  SELECT * INTO v_request FROM public.ride_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request not found'; END IF;
  SELECT * INTO v_trip FROM public.trips WHERE id = v_request.trip_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'trip not found'; END IF;

  -- Normal flow: passenger asks to join a driver trip.
  IF v_request.request_type = 'passenger_request' THEN
    IF v_trip.created_by = auth.uid()::text THEN
      IF p_status NOT IN ('accepted', 'rejected') THEN RAISE EXCEPTION 'invalid driver status'; END IF;
      IF v_request.status <> 'pending' THEN RAISE EXCEPTION 'request is no longer pending'; END IF;
      IF v_trip.status <> 'active' OR v_trip.deleted_at IS NOT NULL OR v_trip.departure_time <= now() THEN
        RAISE EXCEPTION 'trip is no longer active';
      END IF;
      IF p_status = 'accepted' THEN
        SELECT COALESCE(SUM(seats_needed), 0) INTO v_used_seats
        FROM public.ride_requests
        WHERE trip_id = v_request.trip_id AND request_type = 'passenger_request'
          AND status = 'accepted' AND id <> v_request.id;
        IF v_used_seats + v_request.seats_needed > v_trip.seats THEN RAISE EXCEPTION 'not enough seats'; END IF;
      END IF;
      UPDATE public.ride_requests
      SET status = p_status, driver_message = COALESCE(p_driver_message, driver_message), updated_at = now()
      WHERE id = p_request_id RETURNING * INTO v_request;
      RETURN v_request;
    END IF;
    IF v_request.passenger_id = auth.uid()::text AND p_status = 'cancelled' THEN
      IF v_request.status NOT IN ('pending', 'accepted') THEN RAISE EXCEPTION 'request cannot be cancelled'; END IF;
      UPDATE public.ride_requests SET status = 'cancelled', updated_at = now()
      WHERE id = p_request_id RETURNING * INTO v_request;
      RETURN v_request;
    END IF;
  END IF;

  -- Reverse flow: driver offers a seat to a passenger's trip request.
  IF v_request.request_type = 'driver_offer' THEN
    IF v_request.passenger_id = auth.uid()::text THEN
      IF p_status NOT IN ('accepted', 'rejected') THEN RAISE EXCEPTION 'invalid passenger status'; END IF;
      IF v_request.status <> 'pending' THEN RAISE EXCEPTION 'offer is no longer pending'; END IF;
      IF v_trip.status <> 'active' OR v_trip.deleted_at IS NOT NULL OR v_trip.departure_time <= now() THEN
        RAISE EXCEPTION 'passenger trip is no longer active';
      END IF;
      IF v_request.driver_trip_id IS NULL THEN RAISE EXCEPTION 'driver trip is missing'; END IF;
      SELECT * INTO v_driver_trip FROM public.trips WHERE id = v_request.driver_trip_id FOR UPDATE;
      IF v_driver_trip.created_by <> v_request.driver_id OR v_driver_trip.status <> 'active' OR v_driver_trip.departure_time <= now() THEN
        RAISE EXCEPTION 'driver trip is no longer active';
      END IF;
      UPDATE public.ride_requests
      SET status = p_status, updated_at = now()
      WHERE id = p_request_id RETURNING * INTO v_request;
      RETURN v_request;
    END IF;
    IF v_request.driver_id = auth.uid()::text AND p_status = 'cancelled' THEN
      IF v_request.status <> 'pending' THEN RAISE EXCEPTION 'offer cannot be cancelled'; END IF;
      UPDATE public.ride_requests SET status = 'cancelled', updated_at = now()
      WHERE id = p_request_id RETURNING * INTO v_request;
      RETURN v_request;
    END IF;
  END IF;

  RAISE EXCEPTION 'not authorized';
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_ride_request_status(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.confirm_ride(p_request_id uuid)
RETURNS public.ride_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.ride_requests;
  v_trip public.trips;
  v_open_requests integer;
  v_now timestamptz := now();
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  SELECT * INTO v_request FROM public.ride_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND OR v_request.status <> 'accepted' THEN RAISE EXCEPTION 'ride is not accepted'; END IF;
  SELECT * INTO v_trip FROM public.trips WHERE id = v_request.trip_id FOR UPDATE;

  IF v_request.request_type = 'passenger_request' THEN
    IF v_request.passenger_id = auth.uid()::text THEN
      UPDATE public.ride_requests SET passenger_confirmed = true, updated_at = v_now WHERE id = p_request_id;
    ELSIF v_trip.created_by = auth.uid()::text THEN
      UPDATE public.ride_requests SET driver_confirmed = true, updated_at = v_now WHERE id = p_request_id;
    ELSE RAISE EXCEPTION 'not authorized'; END IF;

    SELECT * INTO v_request FROM public.ride_requests WHERE id = p_request_id;
    IF v_request.passenger_confirmed AND v_request.driver_confirmed THEN
      UPDATE public.ride_requests SET completed_at = COALESCE(completed_at, v_now), updated_at = v_now WHERE id = p_request_id;
      SELECT count(*)::integer INTO v_open_requests
      FROM public.ride_requests
      WHERE trip_id = v_request.trip_id AND request_type = 'passenger_request'
        AND status = 'accepted' AND NOT (passenger_confirmed AND driver_confirmed);
      IF v_open_requests = 0 THEN
        PERFORM set_config('app.allow_trip_completion', 'true', true);
        UPDATE public.trips SET status = 'completed', completed_at = COALESCE(completed_at, v_now)
        WHERE id = v_request.trip_id;
        PERFORM set_config('app.allow_trip_completion', '', true);
      END IF;
    END IF;
  ELSE
    IF v_request.passenger_id = auth.uid()::text THEN
      UPDATE public.ride_requests SET passenger_confirmed = true, updated_at = v_now WHERE id = p_request_id;
    ELSIF v_request.driver_id = auth.uid()::text THEN
      UPDATE public.ride_requests SET driver_confirmed = true, updated_at = v_now WHERE id = p_request_id;
    ELSE RAISE EXCEPTION 'not authorized'; END IF;

    SELECT * INTO v_request FROM public.ride_requests WHERE id = p_request_id;
    IF v_request.passenger_confirmed AND v_request.driver_confirmed THEN
      UPDATE public.ride_requests SET completed_at = COALESCE(completed_at, v_now), updated_at = v_now WHERE id = p_request_id;
      PERFORM set_config('app.allow_trip_completion', 'true', true);
      UPDATE public.trips SET status = 'completed', completed_at = COALESCE(completed_at, v_now) WHERE id = v_request.trip_id;
      IF v_request.driver_trip_id IS NOT NULL THEN
        UPDATE public.trips SET status = 'completed', completed_at = COALESCE(completed_at, v_now) WHERE id = v_request.driver_trip_id;
      END IF;
      PERFORM set_config('app.allow_trip_completion', '', true);
    END IF;
  END IF;

  SELECT * INTO v_request FROM public.ride_requests WHERE id = p_request_id;
  RETURN v_request;
END;
$$;
GRANT EXECUTE ON FUNCTION public.confirm_ride(uuid) TO authenticated;

-- Chat access must follow the actual two-sided participants.
DROP POLICY IF EXISTS "select_messages_participants" ON public.messages;
DROP POLICY IF EXISTS "insert_messages_participants" ON public.messages;
CREATE POLICY "select_messages_participants_v2" ON public.messages
FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.ride_requests r
    WHERE r.id = messages.request_id
      AND (r.passenger_id = auth.uid()::text OR r.driver_id = auth.uid()::text
        OR EXISTS (SELECT 1 FROM public.trips t WHERE t.id = r.trip_id AND t.created_by = auth.uid()::text)
        OR EXISTS (SELECT 1 FROM public.trips t WHERE t.id = r.driver_trip_id AND t.created_by = auth.uid()::text))
  )
);
CREATE POLICY "insert_messages_participants_v2" ON public.messages
FOR INSERT TO authenticated WITH CHECK (
  author_id = auth.uid()::text
  AND EXISTS (
    SELECT 1 FROM public.ride_requests r
    WHERE r.id = messages.request_id AND r.status = 'accepted'
      AND (r.passenger_id = auth.uid()::text OR r.driver_id = auth.uid()::text
        OR EXISTS (SELECT 1 FROM public.trips t WHERE t.id = r.trip_id AND t.created_by = auth.uid()::text)
        OR EXISTS (SELECT 1 FROM public.trips t WHERE t.id = r.driver_trip_id AND t.created_by = auth.uid()::text))
  )
);

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

  SELECT r.* INTO v_request
  FROM public.ride_requests r
  WHERE (r.trip_id = p_trip_id OR r.driver_trip_id = p_trip_id)
    AND r.status = 'accepted'
    AND r.completed_at IS NOT NULL
    AND (
      (r.passenger_id = auth.uid()::text AND p_role = 'driver' AND p_rated_id = CASE WHEN r.request_type = 'driver_offer' THEN r.driver_id ELSE v_trip.created_by END)
      OR
      (r.driver_id = auth.uid()::text AND p_role = 'passenger' AND p_rated_id = r.passenger_id)
      OR
      (r.request_type = 'passenger_request' AND v_trip.created_by = auth.uid()::text AND p_role = 'passenger' AND p_rated_id = r.passenger_id)
    )
  LIMIT 1;

  IF NOT FOUND THEN RAISE EXCEPTION 'not authorized to rate'; END IF;

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
    VALUES (p_rated_id, p_rated_id, 1, p_score);
  END IF;

  RETURN v_rating;
END;
$$;
GRANT EXECUTE ON FUNCTION public.submit_rating(uuid, text, text, integer, text) TO authenticated;
