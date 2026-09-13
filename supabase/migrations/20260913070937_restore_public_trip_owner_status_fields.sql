-- This migration intentionally rebuilds the public discovery view. Older repository
-- migrations created a wider version of the view, and CREATE OR REPLACE VIEW cannot
-- remove columns in PostgreSQL. Drop the dependent search function first so a clean
-- migration replay produces the same contract as production.
DROP FUNCTION IF EXISTS public.search_trips(text, jsonb, double precision, double precision);
DROP VIEW IF EXISTS public.public_trips;

CREATE VIEW public.public_trips
WITH (security_invoker = true)
AS
SELECT
  t.id,
  t.role,
  COALESCE(NULLIF(t.from_area, ''), 'Vietovė') AS from_location,
  COALESCE(NULLIF(t.to_area, ''), 'Vietovė') AS to_location,
  round(t.from_lat::numeric, 2)::double precision AS from_lat,
  round(t.from_lng::numeric, 2)::double precision AS from_lng,
  round(t.to_lat::numeric, 2)::double precision AS to_lat,
  round(t.to_lng::numeric, 2)::double precision AS to_lng,
  t.departure_time,
  t.name,
  t.seats,
  t.price,
  t.price_unit,
  t.baggage,
  t.notes,
  t.created_at,
  CASE
    WHEN t.role = 'driver' THEN t.seats - COALESCE((
      SELECT sum(r.seats_needed)
      FROM public.ride_requests r
      WHERE COALESCE(r.driver_trip_id, r.trip_id) = t.id
        AND r.status = 'accepted'
    ), 0)
    ELSE t.seats::bigint
  END AS available_seats,
  t.status,
  t.created_by
FROM public.trips t
WHERE t.deleted_at IS NULL
  AND t.status = 'active'
  AND t.created_by IS NOT NULL
  AND auth.uid() IS NOT NULL;

REVOKE ALL ON public.public_trips FROM anon, PUBLIC;
GRANT SELECT ON public.public_trips TO authenticated;

CREATE FUNCTION public.search_trips(
  p_role text,
  p_filters jsonb DEFAULT '{}'::jsonb,
  p_lat double precision DEFAULT NULL,
  p_lng double precision DEFAULT NULL
)
RETURNS SETOF public.public_trips
LANGUAGE sql
STABLE
SET search_path TO ''
AS $$
  SELECT t.*
  FROM public.public_trips t
  WHERE t.role = p_role
    AND t.departure_time > now()
    AND (
      COALESCE(p_filters->>'fromLocation', '') = ''
      OR position(
        translate(lower(p_filters->>'fromLocation'), 'ąčęėįšųūž', 'aceeisuuz')
        IN translate(lower(t.from_location), 'ąčęėįšųūž', 'aceeisuuz')
      ) > 0
    )
    AND (
      COALESCE(p_filters->>'toLocation', '') = ''
      OR position(
        translate(lower(p_filters->>'toLocation'), 'ąčęėįšųūž', 'aceeisuuz')
        IN translate(lower(t.to_location), 'ąčęėįšųūž', 'aceeisuuz')
      ) > 0
    )
    AND (
      COALESCE(p_filters->>'maxPrice', '') = ''
      OR (t.price IS NOT NULL AND t.price::numeric <= (p_filters->>'maxPrice')::numeric)
    )
    AND (
      COALESCE(p_filters->>'date', '') = ''
      OR date_trunc('day', t.departure_time) = to_timestamp(p_filters->>'date', 'YYYY-MM-DD')
    )
    AND (
      COALESCE((p_filters->>'radiusKm')::numeric, 0) = 0
      OR (
        p_lat IS NOT NULL AND p_lng IS NOT NULL
        AND t.from_lat IS NOT NULL AND t.from_lng IS NOT NULL
        AND 6371 * acos(
          least(1, greatest(-1,
            sin(radians(p_lat)) * sin(radians(t.from_lat))
            + cos(radians(p_lat)) * cos(radians(t.from_lat))
              * cos(radians(t.from_lng - p_lng))
          ))
        ) <= (p_filters->>'radiusKm')::numeric
      )
    )
  ORDER BY t.departure_time, t.id;
$$;

REVOKE ALL ON FUNCTION public.search_trips(text, jsonb, double precision, double precision) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_trips(text, jsonb, double precision, double precision) TO authenticated;
