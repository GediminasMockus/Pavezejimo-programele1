/*
  Normalize the relationship between a driver trip and a passenger trip.

  ride_requests remains the compatibility layer for the current MVP. The new
  matches table is the canonical relationship for the next client iteration.
  It prevents the same two trips from creating multiple active matches and
  gives messages, confirmations and ratings one stable booking identity.
*/

CREATE TABLE IF NOT EXISTS public.matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  passenger_trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  request_id uuid REFERENCES public.ride_requests(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  match_score integer,
  route_overlap_pct numeric(5,2),
  detour_pct numeric(6,2),
  pickup_detour_km numeric(7,2),
  dropoff_detour_km numeric(7,2),
  driver_confirmed boolean NOT NULL DEFAULT false,
  passenger_confirmed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT matches_status_check CHECK (status IN ('pending','accepted','rejected','cancelled','completed')),
  CONSTRAINT matches_score_check CHECK (match_score IS NULL OR match_score BETWEEN 0 AND 100),
  CONSTRAINT matches_route_overlap_check CHECK (route_overlap_pct IS NULL OR route_overlap_pct BETWEEN 0 AND 100),
  CONSTRAINT matches_detour_check CHECK (detour_pct IS NULL OR detour_pct >= 0),
  CONSTRAINT matches_distinct_trips CHECK (driver_trip_id <> passenger_trip_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_matches_trip_pair
  ON public.matches(driver_trip_id, passenger_trip_id);

CREATE INDEX IF NOT EXISTS idx_matches_driver_trip
  ON public.matches(driver_trip_id, status);
CREATE INDEX IF NOT EXISTS idx_matches_passenger_trip
  ON public.matches(passenger_trip_id, status);
CREATE INDEX IF NOT EXISTS idx_matches_request
  ON public.matches(request_id);

ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_matches_participants" ON public.matches;
CREATE POLICY "select_matches_participants" ON public.matches
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = matches.driver_trip_id
        AND t.created_by = auth.uid()::text
    )
    OR EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = matches.passenger_trip_id
        AND t.created_by = auth.uid()::text
    )
  );

-- All relationship creation/state transitions happen server-side.
DROP POLICY IF EXISTS "insert_matches_none" ON public.matches;
CREATE POLICY "insert_matches_none" ON public.matches
  FOR INSERT TO authenticated WITH CHECK (false);
DROP POLICY IF EXISTS "update_matches_none" ON public.matches;
CREATE POLICY "update_matches_none" ON public.matches
  FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "delete_matches_none" ON public.matches;
CREATE POLICY "delete_matches_none" ON public.matches
  FOR DELETE TO authenticated USING (false);

CREATE OR REPLACE FUNCTION public.create_match_from_request(
  p_request_id uuid,
  p_match_score integer DEFAULT NULL,
  p_route_overlap_pct numeric DEFAULT NULL,
  p_detour_pct numeric DEFAULT NULL,
  p_pickup_detour_km numeric DEFAULT NULL,
  p_dropoff_detour_km numeric DEFAULT NULL
)
RETURNS public.matches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.ride_requests;
  v_passenger_trip public.trips;
  v_driver_trip public.trips;
  v_match public.matches;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;

  SELECT * INTO v_request
  FROM public.ride_requests
  WHERE id = p_request_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request not found'; END IF;

  IF v_request.passenger_id <> auth.uid()::text THEN
    RAISE EXCEPTION 'only the passenger may create a match from a request';
  END IF;

  IF v_request.driver_trip_id IS NULL THEN
    RAISE EXCEPTION 'driver trip is required for a match';
  END IF;

  SELECT * INTO v_passenger_trip FROM public.trips WHERE id = v_request.trip_id;
  SELECT * INTO v_driver_trip FROM public.trips WHERE id = v_request.driver_trip_id;

  IF NOT FOUND OR v_passenger_trip.created_by <> auth.uid()::text THEN
    RAISE EXCEPTION 'passenger trip not found or not owned';
  END IF;
  IF v_driver_trip.role <> 'driver' OR v_driver_trip.status <> 'active' OR v_driver_trip.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'driver trip is not available';
  END IF;
  IF v_driver_trip.created_by = auth.uid()::text THEN
    RAISE EXCEPTION 'cannot match your own trips';
  END IF;

  INSERT INTO public.matches (
    driver_trip_id,
    passenger_trip_id,
    request_id,
    status,
    match_score,
    route_overlap_pct,
    detour_pct,
    pickup_detour_km,
    dropoff_detour_km
  )
  VALUES (
    v_driver_trip.id,
    v_passenger_trip.id,
    v_request.id,
    CASE WHEN v_request.status = 'accepted' THEN 'accepted' ELSE 'pending' END,
    p_match_score,
    p_route_overlap_pct,
    p_detour_pct,
    p_pickup_detour_km,
    p_dropoff_detour_km
  )
  ON CONFLICT (driver_trip_id, passenger_trip_id)
  DO UPDATE SET
    request_id = COALESCE(public.matches.request_id, EXCLUDED.request_id),
    match_score = COALESCE(EXCLUDED.match_score, public.matches.match_score),
    route_overlap_pct = COALESCE(EXCLUDED.route_overlap_pct, public.matches.route_overlap_pct),
    detour_pct = COALESCE(EXCLUDED.detour_pct, public.matches.detour_pct),
    pickup_detour_km = COALESCE(EXCLUDED.pickup_detour_km, public.matches.pickup_detour_km),
    dropoff_detour_km = COALESCE(EXCLUDED.dropoff_detour_km, public.matches.dropoff_detour_km),
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

GRANT EXECUTE ON FUNCTION public.create_match_from_request(uuid, integer, numeric, numeric, numeric, numeric) TO authenticated;
