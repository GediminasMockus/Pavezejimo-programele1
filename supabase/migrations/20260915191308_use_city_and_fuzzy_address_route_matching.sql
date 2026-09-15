-- Normalize Lithuanian route text without requiring an extension.
CREATE OR REPLACE FUNCTION public.normalize_route_search(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT btrim(regexp_replace(
    translate(lower(COALESCE(p_value, '')), 'ąčęėįšųūž', 'aceeisuuz'),
    '[^a-z0-9]+',
    ' ',
    'g'
  ));
$$;

-- Intercity discovery is intentionally city-level. A full address entered by
-- the user is accepted when it contains the public city name, and Lithuanian
-- inflection variants are tolerated through a conservative four-letter stem.
CREATE OR REPLACE FUNCTION public.route_city_matches(
  p_query text,
  p_area text,
  p_location text
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_query text := public.normalize_route_search(p_query);
  v_area text := public.normalize_route_search(p_area);
  v_location text := public.normalize_route_search(p_location);
BEGIN
  IF v_query = '' THEN RETURN true; END IF;
  IF v_area = '' THEN RETURN position(v_query IN v_location) > 0; END IF;

  RETURN v_query = v_area
    OR position(' ' || v_area || ' ' IN ' ' || v_query || ' ') > 0
    OR position(v_query IN v_location) > 0
    OR (length(v_area) >= 4 AND position(left(v_area, 4) IN v_query) > 0);
END;
$$;

-- Same-city discovery uses address-level terms, while ignoring administrative
-- words, punctuation, house-number differences and common abbreviations. One
-- shared meaningful word stem per endpoint is sufficient for a useful match.
CREATE OR REPLACE FUNCTION public.route_address_matches(
  p_query text,
  p_area text,
  p_location text
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_query text := public.normalize_route_search(p_query);
  v_area text := public.normalize_route_search(p_area);
  v_location text := public.normalize_route_search(p_location);
  v_significant_tokens text[];
BEGIN
  IF v_query = '' THEN RETURN true; END IF;
  IF v_query = v_location OR position(v_query IN v_location) > 0 OR position(v_location IN v_query) > 0 THEN
    RETURN true;
  END IF;

  SELECT array_agg(token)
  INTO v_significant_tokens
  FROM regexp_split_to_table(v_query, ' +') AS token
  WHERE length(token) >= 4
    AND token ~ '[a-z]'
    AND token <> ALL (ARRAY[
      'lietuva', 'apskritis', 'savivaldybe', 'rajonas', 'rajono',
      'miestas', 'miesto', 'seniunija', 'gatve', 'gatves',
      'prospektas', 'plentas', 'kelias', 'kaimas'
    ])
    AND NOT EXISTS (
      SELECT 1
      FROM regexp_split_to_table(v_area, ' +') AS area_token
      WHERE length(area_token) >= 4
        AND left(token, 4) = left(area_token, 4)
    );

  -- A city-only query deliberately remains broad inside that city.
  IF COALESCE(array_length(v_significant_tokens, 1), 0) = 0 THEN RETURN true; END IF;

  RETURN EXISTS (
    SELECT 1
    FROM unnest(v_significant_tokens) AS query_token
    JOIN regexp_split_to_table(v_location, ' +') AS location_token
      ON length(location_token) >= 4
     AND left(query_token, 5) = left(location_token, 5)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.normalize_route_search(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.route_city_matches(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.route_address_matches(text, text, text) FROM PUBLIC, anon, authenticated;

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
      OR date_trunc('day', public_row.departure_time) = to_timestamp(p_filters->>'date', 'YYYY-MM-DD')
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
