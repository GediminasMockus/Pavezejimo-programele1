CREATE OR REPLACE VIEW public.public_trips AS
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

ALTER VIEW public.public_trips SET (security_invoker = true);
REVOKE ALL ON public.public_trips FROM anon, PUBLIC;
GRANT SELECT ON public.public_trips TO authenticated;
