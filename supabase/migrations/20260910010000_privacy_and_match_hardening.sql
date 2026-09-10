/*
  Production privacy hardening.

  Public clients must not be able to read:
  - phone numbers
  - exact trip coordinates
  - vehicle registration plates
  - profile email/phone/admin flag

  Public trip coordinates are rounded to ~1 km for discovery.
  Owners can still retrieve their complete trips through a SECURITY DEFINER RPC.
*/

CREATE OR REPLACE FUNCTION public.get_my_trips()
RETURNS SETOF public.trips
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.*
  FROM public.trips t
  WHERE t.created_by = auth.uid()::text
    AND t.deleted_at IS NULL
  ORDER BY t.departure_time ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_trips() TO authenticated;

CREATE OR REPLACE VIEW public.public_trips AS
SELECT
  t.id,
  t.role,
  t.from_location,
  t.to_location,
  CASE WHEN t.from_lat IS NULL THEN NULL ELSE round(t.from_lat::numeric, 2)::double precision END AS from_lat,
  CASE WHEN t.from_lng IS NULL THEN NULL ELSE round(t.from_lng::numeric, 2)::double precision END AS from_lng,
  CASE WHEN t.to_lat IS NULL THEN NULL ELSE round(t.to_lat::numeric, 2)::double precision END AS to_lat,
  CASE WHEN t.to_lng IS NULL THEN NULL ELSE round(t.to_lng::numeric, 2)::double precision END AS to_lng,
  t.departure_time,
  t.name,
  NULL::text AS phone,
  t.seats,
  t.price,
  t.price_unit,
  t.car_color,
  t.car_make,
  NULL::text AS car_plate,
  t.baggage,
  t.notes,
  t.deleted_at,
  t.deletion_reason,
  t.created_by,
  t.is_recurring,
  t.status,
  t.completed_at,
  t.created_at
FROM public.trips t
WHERE t.deleted_at IS NULL
  AND t.status = 'active';

GRANT SELECT ON public.public_trips TO authenticated;

-- Remove sensitive column access from direct client reads while retaining the
-- existing row-level policies for writes and owner operations.
REVOKE SELECT (phone, from_lat, from_lng, to_lat, to_lng, car_plate)
  ON public.trips FROM authenticated;

-- Profile discovery only needs public identity and rating data.
REVOKE SELECT (email, phone, is_admin)
  ON public.user_profiles FROM authenticated;

CREATE OR REPLACE FUNCTION public.get_my_profile_flags()
RETURNS TABLE (
  is_admin boolean,
  phone text,
  email text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.is_admin, p.phone, p.email
  FROM public.user_profiles p
  WHERE p.id = auth.uid()::text;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_profile_flags() TO authenticated;

-- A rating must target the exact accepted participant, not whichever accepted
-- request happened to be newest for the trip.
CREATE OR REPLACE FUNCTION public.submit_rating(
  p_trip_id uuid,
  p_rated_id text,
  p_role text,
  p_score integer,
  p_comment text DEFAULT NULL,
  p_request_id uuid DEFAULT NULL
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

  IF p_request_id IS NOT NULL THEN
    SELECT * INTO v_request
    FROM public.ride_requests
    WHERE id = p_request_id
      AND trip_id = p_trip_id
      AND status = 'accepted';
  ELSE
    SELECT * INTO v_request
    FROM public.ride_requests
    WHERE trip_id = p_trip_id
      AND status = 'accepted'
      AND (passenger_id = auth.uid()::text OR v_trip.created_by = auth.uid()::text)
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  IF NOT FOUND THEN RAISE EXCEPTION 'accepted ride participant not found'; END IF;

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

GRANT EXECUTE ON FUNCTION public.submit_rating(uuid, text, text, integer, text, uuid) TO authenticated;

-- Prevent duplicate passenger requests for the same driver trip while keeping
-- cancelled requests reusable.
CREATE UNIQUE INDEX IF NOT EXISTS ux_active_passenger_request_per_trip
ON public.ride_requests (trip_id, passenger_id)
WHERE request_type = 'passenger_request' AND status <> 'cancelled';
