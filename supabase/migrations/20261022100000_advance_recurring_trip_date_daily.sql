-- For recurring listings, expose the next upcoming daily occurrence while preserving the
-- originally selected local departure time. Non-recurring listings are unchanged.
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
  CASE
    WHEN t.is_recurring AND t.departure_time <= now() THEN
      (
        (now() AT TIME ZONE 'Europe/Vilnius')::date
        + CASE
            WHEN (t.departure_time AT TIME ZONE 'Europe/Vilnius')::time
                 <= (now() AT TIME ZONE 'Europe/Vilnius')::time
            THEN 1
            ELSE 0
          END
        + (t.departure_time AT TIME ZONE 'Europe/Vilnius')::time
      ) AT TIME ZONE 'Europe/Vilnius'
    ELSE t.departure_time
  END AS departure_time,
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
