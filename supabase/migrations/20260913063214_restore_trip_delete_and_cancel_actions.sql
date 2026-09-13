DROP FUNCTION IF EXISTS public.delete_my_trip(uuid, text);

CREATE FUNCTION public.delete_my_trip(p_trip_id uuid, p_reason text)
RETURNS public.trips
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trip public.trips;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN RAISE EXCEPTION 'deletion reason required'; END IF;

  SELECT * INTO v_trip FROM public.trips WHERE id = p_trip_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'trip not found'; END IF;
  IF v_trip.created_by <> auth.uid()::text THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF v_trip.deleted_at IS NOT NULL THEN RETURN v_trip; END IF;

  UPDATE public.trips
  SET deleted_at = now(),
      deletion_reason = left(trim(p_reason), 500),
      status = 'cancelled'
  WHERE id = p_trip_id
  RETURNING * INTO v_trip;

  UPDATE public.ride_requests
  SET status = 'cancelled', updated_at = now()
  WHERE status IN ('pending', 'accepted')
    AND (trip_id = p_trip_id OR driver_trip_id = p_trip_id);

  RETURN v_trip;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_my_trip(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.delete_my_trip(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_ride_request_status(
  p_request_id uuid,
  p_status text,
  p_driver_message text DEFAULT NULL::text
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
  v_uid text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  v_uid := auth.uid()::text;

  SELECT * INTO v_request FROM public.ride_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request not found'; END IF;
  SELECT * INTO v_trip FROM public.trips WHERE id = v_request.trip_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'trip not found'; END IF;

  IF p_status = 'cancelled' THEN
    IF v_request.status NOT IN ('pending', 'accepted') THEN RAISE EXCEPTION 'request cannot be cancelled'; END IF;

    IF v_request.request_type = 'passenger_request' THEN
      IF v_request.passenger_id <> v_uid AND v_trip.created_by <> v_uid THEN RAISE EXCEPTION 'not authorized'; END IF;
    ELSIF v_request.request_type = 'driver_offer' THEN
      IF v_request.passenger_id <> v_uid AND v_request.driver_id <> v_uid THEN RAISE EXCEPTION 'not authorized'; END IF;
    ELSE
      RAISE EXCEPTION 'unsupported request type';
    END IF;

    UPDATE public.ride_requests
    SET status = 'cancelled', updated_at = now()
    WHERE id = p_request_id
    RETURNING * INTO v_request;
    RETURN v_request;
  END IF;

  IF v_request.request_type = 'passenger_request' AND v_trip.created_by = v_uid THEN
    IF p_status NOT IN ('accepted', 'rejected') THEN RAISE EXCEPTION 'invalid driver status'; END IF;
    IF v_request.status <> 'pending' THEN RAISE EXCEPTION 'request is no longer pending'; END IF;
    IF v_trip.status <> 'active' OR v_trip.deleted_at IS NOT NULL OR v_trip.departure_time <= now() THEN
      RAISE EXCEPTION 'trip is no longer active';
    END IF;

    IF p_status = 'accepted' THEN
      SELECT COALESCE(SUM(seats_needed), 0) INTO v_used_seats
      FROM public.ride_requests
      WHERE trip_id = v_request.trip_id
        AND request_type = 'passenger_request'
        AND status = 'accepted'
        AND id <> v_request.id;
      IF v_used_seats + v_request.seats_needed > v_trip.seats THEN RAISE EXCEPTION 'not enough seats'; END IF;
    END IF;

    UPDATE public.ride_requests
    SET status = p_status,
        driver_message = COALESCE(p_driver_message, driver_message),
        updated_at = now()
    WHERE id = p_request_id
    RETURNING * INTO v_request;
    RETURN v_request;
  END IF;

  IF v_request.request_type = 'driver_offer' AND v_request.passenger_id = v_uid THEN
    IF p_status NOT IN ('accepted', 'rejected') THEN RAISE EXCEPTION 'invalid passenger status'; END IF;
    IF v_request.status <> 'pending' THEN RAISE EXCEPTION 'offer is no longer pending'; END IF;
    IF v_trip.status <> 'active' OR v_trip.deleted_at IS NOT NULL OR v_trip.departure_time <= now() THEN
      RAISE EXCEPTION 'passenger trip is no longer active';
    END IF;
    IF v_request.driver_trip_id IS NULL THEN RAISE EXCEPTION 'driver trip is missing'; END IF;

    SELECT * INTO v_driver_trip FROM public.trips WHERE id = v_request.driver_trip_id FOR UPDATE;
    IF NOT FOUND
       OR v_driver_trip.created_by <> v_request.driver_id
       OR v_driver_trip.status <> 'active'
       OR v_driver_trip.deleted_at IS NOT NULL
       OR v_driver_trip.departure_time <= now() THEN
      RAISE EXCEPTION 'driver trip is no longer active';
    END IF;

    UPDATE public.ride_requests
    SET status = p_status, updated_at = now()
    WHERE id = p_request_id
    RETURNING * INTO v_request;
    RETURN v_request;
  END IF;

  RAISE EXCEPTION 'not authorized';
END;
$$;

REVOKE ALL ON FUNCTION public.set_ride_request_status(uuid, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_ride_request_status(uuid, text, text) TO authenticated, service_role;
