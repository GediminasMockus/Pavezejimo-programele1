CREATE OR REPLACE VIEW public.public_trips
WITH (security_invoker = true)
AS
SELECT
  t.id,
  t.role,
  COALESCE(NULLIF(t.from_area, ''), split_part(t.from_location, ',', 1))::text AS from_location,
  COALESCE(NULLIF(t.to_area, ''), split_part(t.to_location, ',', 1))::text AS to_location,
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
  t.created_by,
  t.is_recurring
FROM public.trips t
WHERE t.deleted_at IS NULL
  AND t.status = 'active'
  AND t.created_by IS NOT NULL
  AND auth.uid() IS NOT NULL;

CREATE OR REPLACE FUNCTION public.search_trips(
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
   AND (COALESCE(t.is_recurring, false) = true OR t.departure_time > now() - interval '24 hours')
   AND (COALESCE(p_filters->>'fromLocation','')='' OR
        position(translate(lower(p_filters->>'fromLocation'),'ąčęėįšųūž','aceeisuuz') IN translate(lower(t.from_location),'ąčęėįšųūž','aceeisuuz'))>0)
   AND (COALESCE(p_filters->>'toLocation','')='' OR
        position(translate(lower(p_filters->>'toLocation'),'ąčęėįšųūž','aceeisuuz') IN translate(lower(t.to_location),'ąčęėįšųūž','aceeisuuz'))>0)
   AND (COALESCE(p_filters->>'maxPrice','')='' OR (t.price IS NOT NULL AND t.price::numeric <= (p_filters->>'maxPrice')::numeric))
   AND (COALESCE(p_filters->>'date','')='' OR date_trunc('day',t.departure_time)=to_timestamp(p_filters->>'date','YYYY-MM-DD'))
   AND (COALESCE((p_filters->>'radiusKm')::numeric, 0)=0 OR
        (p_lat IS NOT NULL AND p_lng IS NOT NULL AND t.from_lat IS NOT NULL AND t.from_lng IS NOT NULL AND
         6371 * acos(
           least(1, greatest(-1,
             sin(radians(p_lat))*sin(radians(t.from_lat)) +
             cos(radians(p_lat))*cos(radians(t.from_lat))*cos(radians(t.from_lng-p_lng))
           ))
         ) <= (p_filters->>'radiusKm')::numeric))
 ORDER BY t.departure_time,t.id;
$$;
