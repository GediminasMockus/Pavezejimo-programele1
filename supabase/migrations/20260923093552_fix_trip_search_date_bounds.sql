-- Use a half-open local-day interval, independent of the database time zone.
CREATE OR REPLACE FUNCTION public.search_trips(
  p_role text,
  p_filters jsonb DEFAULT '{}'::jsonb,
  p_lat double precision DEFAULT NULL,
  p_lng double precision DEFAULT NULL
)
RETURNS SETOF public.public_trips
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public_row.*
  FROM public.trips AS private_row
  JOIN public.public_trips AS public_row ON public_row.id = private_row.id
  CROSS JOIN LATERAL (
    SELECT
      COALESCE(NULLIF(trim(private_row.from_area), ''), split_part(private_row.from_location, ',', 1)) AS from_area,
      COALESCE(NULLIF(trim(private_row.to_area), ''), split_part(private_row.to_location, ',', 1)) AS to_area
  ) AS route
  WHERE auth.uid() IS NOT NULL
    AND private_row.role = p_role
    AND (COALESCE(private_row.is_recurring, false) = true OR private_row.departure_time > now() - interval '24 hours')
    AND (
      CASE
        WHEN public.normalize_route_search(route.from_area) <> public.normalize_route_search(route.to_area)
        THEN
          public.route_city_matches(p_filters->>'fromLocation', route.from_area, private_row.from_location)
          AND public.route_city_matches(p_filters->>'toLocation', route.to_area, private_row.to_location)
        ELSE
          public.route_address_matches(p_filters->>'fromLocation', route.from_area, private_row.from_location)
          AND public.route_address_matches(p_filters->>'toLocation', route.to_area, private_row.to_location)
      END
    )
    AND (
      COALESCE(p_filters->>'maxPrice', '') = ''
      OR (public_row.price IS NOT NULL AND public_row.price::numeric <= (p_filters->>'maxPrice')::numeric)
    )
    AND (
      COALESCE(p_filters->>'date', '') = ''
      OR (
        public_row.departure_time >= COALESCE(
          NULLIF(p_filters->>'dateFrom', '')::timestamptz,
          (p_filters->>'date')::date::timestamp AT TIME ZONE 'Europe/Vilnius'
        )
        AND public_row.departure_time < COALESCE(
          NULLIF(p_filters->>'dateTo', '')::timestamptz,
          ((p_filters->>'date')::date + 1)::timestamp AT TIME ZONE 'Europe/Vilnius'
        )
      )
    )
    AND (
      COALESCE((p_filters->>'minSeats')::integer, 0) = 0
      OR public_row.available_seats >= (p_filters->>'minSeats')::integer
    )
    AND (
      COALESCE((p_filters->>'recurringOnly')::boolean, false) = false
      OR COALESCE(public_row.is_recurring, false) = true
    )
    AND (
      COALESCE((p_filters->>'radiusKm')::numeric, 0) = 0
      OR (
        p_lat IS NOT NULL AND p_lng IS NOT NULL
        AND public_row.from_lat IS NOT NULL AND public_row.from_lng IS NOT NULL
        AND 6371 * acos(least(1, greatest(-1,
          sin(radians(p_lat)) * sin(radians(public_row.from_lat))
          + cos(radians(p_lat)) * cos(radians(public_row.from_lat)) * cos(radians(public_row.from_lng - p_lng))
        ))) <= (p_filters->>'radiusKm')::numeric
      )
    )
  ORDER BY public_row.departure_time, public_row.id;
$$;

REVOKE EXECUTE ON FUNCTION public.search_trips(text, jsonb, double precision, double precision) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_trips(text, jsonb, double precision, double precision) TO authenticated, service_role;
