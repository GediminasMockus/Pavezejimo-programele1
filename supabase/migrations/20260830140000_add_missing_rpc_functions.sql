-- Add missing RPC functions from two_sided_matching migration
-- These functions are required for ride request status management

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
