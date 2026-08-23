/*
  Harden MVP security and enforce critical business rules server-side.

  Goals:
  - authenticated users only
  - ride requests visible only to their passenger or the trip owner
  - request state changes go through secure RPCs
  - accepted seats are allocated atomically
  - ratings are submitted once per trip and aggregates are updated server-side
  - messages are tied to auth.uid() and, when applicable, a specific ride request
  - trip completion/confirmation is server-side
  - admin access is enforced by RLS and the UI
*/

-- ---------- helpers ----------
CREATE OR REPLACE FUNCTION public.is_trip_owner(p_trip_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.trips t
    WHERE t.id = p_trip_id
      AND t.created_by = auth.uid()::text
  );
$$;

CREATE OR REPLACE FUNCTION public.is_ride_participant(p_request_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.ride_requests r
    JOIN public.trips t ON t.id = r.trip_id
    WHERE r.id = p_request_id
      AND (r.passenger_id = auth.uid()::text OR t.created_by = auth.uid()::text)
  );
$$;

-- ---------- ride requests ----------
DROP POLICY IF EXISTS "select_ride_requests_auth" ON public.ride_requests;
DROP POLICY IF EXISTS "insert_ride_requests_auth" ON public.ride_requests;
DROP POLICY IF EXISTS "update_ride_requests_auth" ON public.ride_requests;
DROP POLICY IF EXISTS "delete_ride_requests_auth" ON public.ride_requests;

CREATE POLICY "select_ride_requests_participants" ON public.ride_requests
  FOR SELECT TO authenticated
  USING (
    passenger_id = auth.uid()::text
    OR public.is_trip_owner(trip_id)
  );

CREATE POLICY "insert_ride_requests_own" ON public.ride_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    passenger_id = auth.uid()::text
    AND EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = trip_id
        AND t.role = 'driver'
        AND t.status = 'active'
        AND t.deleted_at IS NULL
        AND t.created_by <> auth.uid()::text
    )
    AND seats_needed BETWEEN 1 AND 8
  );

-- Direct UPDATE is intentionally limited to the passenger cancelling their own request.
-- Driver accept/reject and confirmation are handled by RPCs below so they can be atomic.
CREATE POLICY "update_ride_requests_cancel_only" ON public.ride_requests
  FOR UPDATE TO authenticated
  USING (passenger_id = auth.uid()::text)
  WITH CHECK (
    passenger_id = auth.uid()::text
    AND status = 'cancelled'
  );

CREATE POLICY "delete_ride_requests_own" ON public.ride_requests
  FOR DELETE TO authenticated
  USING (passenger_id = auth.uid()::text);

CREATE INDEX IF NOT EXISTS idx_ride_requests_trip_status
  ON public.ride_requests(trip_id, status);

-- Atomically accept/reject a request. Acceptance locks the trip row and counts accepted seats.
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
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT * INTO v_request
  FROM public.ride_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'request not found';
  END IF;

  SELECT * INTO v_trip
  FROM public.trips
  WHERE id = v_request.trip_id
  FOR UPDATE;

  IF v_trip.created_by = auth.uid()::text THEN
    IF p_status NOT IN ('accepted', 'rejected') THEN
      RAISE EXCEPTION 'invalid driver status';
    END IF;

    IF p_status = 'accepted' AND v_request.status <> 'accepted' THEN
      SELECT COALESCE(SUM(seats_needed), 0) INTO v_used_seats
      FROM public.ride_requests
      WHERE trip_id = v_request.trip_id
        AND status = 'accepted'
        AND id <> v_request.id;

      IF v_used_seats + v_request.seats_needed > v_trip.seats THEN
        RAISE EXCEPTION 'not enough seats';
      END IF;
    END IF;

    UPDATE public.ride_requests
    SET status = p_status,
        driver_message = COALESCE(p_driver_message, driver_message),
        updated_at = now()
    WHERE id = p_request_id
    RETURNING * INTO v_request;

    RETURN v_request;
  END IF;

  IF v_request.passenger_id = auth.uid()::text AND p_status = 'cancelled' THEN
    UPDATE public.ride_requests
    SET status = 'cancelled', updated_at = now()
    WHERE id = p_request_id
    RETURNING * INTO v_request;
    RETURN v_request;
  END IF;

  RAISE EXCEPTION 'not authorized';
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_ride_request_status(uuid, text, text) TO authenticated;

-- ---------- confirmation / completion ----------


-- ---------- ratings ----------
DROP POLICY IF EXISTS "insert_ratings_auth" ON public.ratings;
DROP POLICY IF EXISTS "update_ratings_auth" ON public.ratings;
DROP POLICY IF EXISTS "delete_ratings_auth" ON public.ratings;

CREATE POLICY "insert_ratings_via_rpc_only" ON public.ratings
  FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY "update_ratings_none" ON public.ratings
  FOR UPDATE TO authenticated USING (false) WITH CHECK (false);

CREATE POLICY "delete_ratings_none" ON public.ratings
  FOR DELETE TO authenticated USING (false);

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

  SELECT r.* INTO v_request
  FROM public.ride_requests r
  WHERE r.trip_id = p_trip_id
    AND r.status = 'accepted'
    AND (
      r.passenger_id = auth.uid()::text
      OR v_trip.created_by = auth.uid()::text
    )
  ORDER BY r.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN RAISE EXCEPTION 'completed ride participant not found'; END IF;

  IF p_role = 'driver' THEN
    IF v_request.passenger_id <> auth.uid()::text OR p_rated_id <> v_trip.created_by THEN
      RAISE EXCEPTION 'not authorized to rate driver';
    END IF;
  ELSE
    IF v_trip.created_by <> auth.uid()::text OR p_rated_id <> v_request.passenger_id THEN
      RAISE EXCEPTION 'not authorized to rate passenger';
    END IF;
  END IF;

  INSERT INTO public.ratings (rater_id, rated_id, trip_id, role, score, comment)
  VALUES (auth.uid()::text, p_rated_id, p_trip_id, p_role, p_score, NULLIF(trim(p_comment), ''))
  ON CONFLICT (rater_id, trip_id) DO NOTHING
  RETURNING * INTO v_rating;

  IF v_rating.id IS NULL THEN
    RAISE EXCEPTION 'rating already submitted';
  END IF;

  SELECT * INTO v_profile
  FROM public.user_profiles
  WHERE id = p_rated_id
  FOR UPDATE;

  IF FOUND THEN
    UPDATE public.user_profiles
    SET total_ratings = total_ratings + 1,
        avg_rating = ROUND(((avg_rating * total_ratings) + p_score) / (total_ratings + 1), 1)
    WHERE id = p_rated_id;
  ELSE
    INSERT INTO public.user_profiles (id, display_name, total_ratings, avg_rating)
    VALUES (p_rated_id, CASE WHEN p_role = 'driver' THEN v_trip.name ELSE v_request.passenger_name END, 1, p_score);
  END IF;

  RETURN v_rating;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_rating(uuid, text, text, integer, text) TO authenticated;

-- ---------- messages ----------
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS author_id text;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS request_id uuid REFERENCES public.ride_requests(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_messages_request_id ON public.messages(request_id);
CREATE INDEX IF NOT EXISTS idx_messages_author_id ON public.messages(author_id);

DROP POLICY IF EXISTS "select_messages_auth" ON public.messages;
DROP POLICY IF EXISTS "insert_messages_auth" ON public.messages;

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
  );

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
      OR EXISTS (
        SELECT 1 FROM public.ride_requests r
        WHERE r.id = messages.request_id
          AND r.passenger_id = auth.uid()::text
          AND r.trip_id = messages.trip_id
          AND r.status = 'accepted'
      )
    )
  );

-- No client-side editing/deleting of messages for MVP.
DROP POLICY IF EXISTS "anon_update_messages" ON public.messages;
DROP POLICY IF EXISTS "anon_delete_messages" ON public.messages;
CREATE POLICY "no_message_updates" ON public.messages FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY "no_message_deletes" ON public.messages FOR DELETE TO authenticated USING (false);

-- ---------- profiles ----------
DROP POLICY IF EXISTS "select_user_profiles_auth" ON public.user_profiles;
DROP POLICY IF EXISTS "insert_own_profile_auth" ON public.user_profiles;
DROP POLICY IF EXISTS "update_own_profile_auth" ON public.user_profiles;

CREATE POLICY "select_user_profiles_auth" ON public.user_profiles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "insert_own_profile_auth" ON public.user_profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid()::text);

CREATE POLICY "update_own_profile_auth" ON public.user_profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid()::text)
  WITH CHECK (id = auth.uid()::text);

-- ---------- trips ----------
-- Keep trip ownership strict. Completed status is only changed by confirm_ride.
DROP POLICY IF EXISTS "select_trips_auth" ON public.trips;
DROP POLICY IF EXISTS "insert_trips_auth" ON public.trips;
DROP POLICY IF EXISTS "update_trips_auth" ON public.trips;
DROP POLICY IF EXISTS "delete_trips_auth" ON public.trips;

CREATE POLICY "select_trips_auth" ON public.trips
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "insert_trips_auth" ON public.trips
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid()::text);

CREATE POLICY "update_trips_owner" ON public.trips
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid()::text)
  WITH CHECK (created_by = auth.uid()::text);

CREATE POLICY "delete_trips_owner" ON public.trips
  FOR DELETE TO authenticated
  USING (created_by = auth.uid()::text);

-- Prevent ordinary client updates from changing completion state/status.
CREATE OR REPLACE FUNCTION public.prevent_direct_trip_completion()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status OR OLD.completed_at IS DISTINCT FROM NEW.completed_at THEN
    IF COALESCE(current_setting('app.allow_trip_completion', true), '') <> 'true' THEN
      RAISE EXCEPTION 'trip completion is managed by confirm_ride';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_direct_trip_completion ON public.trips;
CREATE TRIGGER trg_prevent_direct_trip_completion
BEFORE UPDATE ON public.trips
FOR EACH ROW EXECUTE FUNCTION public.prevent_direct_trip_completion();

-- Replace trigger with an allow-list based on a transaction-local setting set by confirm_ride.
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
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  SELECT * INTO v_request FROM public.ride_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request not found'; END IF;
  IF v_request.status <> 'accepted' THEN RAISE EXCEPTION 'ride is not accepted'; END IF;
  SELECT * INTO v_trip FROM public.trips WHERE id = v_request.trip_id FOR UPDATE;

  IF v_request.passenger_id = auth.uid()::text THEN
    UPDATE public.ride_requests SET passenger_confirmed = true, updated_at = v_now WHERE id = p_request_id;
  ELSIF v_trip.created_by = auth.uid()::text THEN
    UPDATE public.ride_requests SET driver_confirmed = true, updated_at = v_now WHERE id = p_request_id;
  ELSE
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO v_request FROM public.ride_requests WHERE id = p_request_id;

  IF v_request.passenger_confirmed AND v_request.driver_confirmed THEN
    PERFORM set_config('app.allow_trip_completion', 'true', true);
    UPDATE public.ride_requests
    SET completed_at = COALESCE(completed_at, v_now), updated_at = v_now
    WHERE id = p_request_id;
    UPDATE public.trips
    SET status = 'completed', completed_at = COALESCE(completed_at, v_now)
    WHERE id = v_request.trip_id;
    PERFORM set_config('app.allow_trip_completion', '', true);
    SELECT * INTO v_request FROM public.ride_requests WHERE id = p_request_id;
  END IF;

  RETURN v_request;
END;
$$;
GRANT EXECUTE ON FUNCTION public.confirm_ride(uuid) TO authenticated;
