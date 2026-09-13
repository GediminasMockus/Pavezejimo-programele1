CREATE OR REPLACE VIEW public.public_trips
WITH (security_invoker = true)
AS
SELECT
  t.id,
  t.role,
  t.from_location,
  t.to_location,
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
    ), 0::bigint)
    ELSE t.seats::bigint
  END AS available_seats,
  t.status,
  t.created_by
FROM public.trips t
WHERE t.deleted_at IS NULL
  AND t.status = 'active'
  AND t.created_by IS NOT NULL
  AND auth.uid() IS NOT NULL;

REVOKE ALL ON public.public_trips FROM anon;
GRANT SELECT ON public.public_trips TO authenticated, service_role;
