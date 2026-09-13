CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.validate_trip_payload(p_trip jsonb)
RETURNS void
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  v_role text := trim(COALESCE(p_trip->>'role',''));
  v_from text := trim(COALESCE(p_trip->>'from_location',''));
  v_to text := trim(COALESCE(p_trip->>'to_location',''));
  v_from_area text := trim(COALESCE(p_trip->>'from_area',''));
  v_to_area text := trim(COALESCE(p_trip->>'to_area',''));
  v_name text := trim(COALESCE(p_trip->>'name',''));
  v_phone text := trim(COALESCE(p_trip->>'phone',''));
  v_price_unit text := COALESCE(NULLIF(p_trip->>'price_unit',''),'asmeniui');
  v_departure timestamptz;
  v_seats integer;
  v_price numeric;
  v_lat double precision;
  v_lng double precision;
BEGIN
  IF v_role NOT IN ('driver','passenger') THEN RAISE EXCEPTION 'invalid trip role'; END IF;
  IF v_from = '' OR v_to = '' OR v_name = '' THEN RAISE EXCEPTION 'origin, destination and name are required'; END IF;
  IF v_from_area = '' OR v_to_area = '' THEN RAISE EXCEPTION 'public trip areas are required'; END IF;
  IF length(v_name) > 80 OR length(v_from) > 160 OR length(v_to) > 160 OR length(v_from_area) > 160 OR length(v_to_area) > 160 THEN
    RAISE EXCEPTION 'trip text is too long';
  END IF;
  IF length(COALESCE(p_trip->>'notes','')) > 500 OR length(v_phone) > 30 THEN RAISE EXCEPTION 'trip text is too long'; END IF;
  IF length(COALESCE(p_trip->>'car_make','')) > 50 OR length(COALESCE(p_trip->>'car_color','')) > 30 OR length(COALESCE(p_trip->>'car_plate','')) > 15 THEN
    RAISE EXCEPTION 'car information is too long';
  END IF;

  BEGIN
    v_departure := (p_trip->>'departure_time')::timestamptz;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'invalid departure time';
  END;
  IF v_departure < now() + interval '5 minutes' THEN RAISE EXCEPTION 'departure time must be in the future'; END IF;

  BEGIN
    v_seats := COALESCE((p_trip->>'seats')::integer,1);
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'invalid seats';
  END;
  IF v_seats < 1 OR v_seats > 8 THEN RAISE EXCEPTION 'seats must be between 1 and 8'; END IF;

  IF COALESCE(p_trip->>'price','') <> '' THEN
    BEGIN
      v_price := (p_trip->>'price')::numeric;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'invalid price';
    END;
    IF v_price < 0 OR v_price > 10000 THEN RAISE EXCEPTION 'invalid price'; END IF;
  END IF;
  IF v_price_unit NOT IN ('asmeniui','viso') THEN RAISE EXCEPTION 'invalid price unit'; END IF;

  IF v_role = 'driver' AND (
    trim(COALESCE(p_trip->>'car_make','')) = '' OR
    trim(COALESCE(p_trip->>'car_color','')) = '' OR
    trim(COALESCE(p_trip->>'car_plate','')) = ''
  ) THEN RAISE EXCEPTION 'driver car information is required'; END IF;

  IF COALESCE(p_trip->>'from_lat','') <> '' THEN
    v_lat := (p_trip->>'from_lat')::double precision;
    IF v_lat < -90 OR v_lat > 90 THEN RAISE EXCEPTION 'invalid latitude'; END IF;
  END IF;
  IF COALESCE(p_trip->>'to_lat','') <> '' THEN
    v_lat := (p_trip->>'to_lat')::double precision;
    IF v_lat < -90 OR v_lat > 90 THEN RAISE EXCEPTION 'invalid latitude'; END IF;
  END IF;
  IF COALESCE(p_trip->>'from_lng','') <> '' THEN
    v_lng := (p_trip->>'from_lng')::double precision;
    IF v_lng < -180 OR v_lng > 180 THEN RAISE EXCEPTION 'invalid longitude'; END IF;
  END IF;
  IF COALESCE(p_trip->>'to_lng','') <> '' THEN
    v_lng := (p_trip->>'to_lng')::double precision;
    IF v_lng < -180 OR v_lng > 180 THEN RAISE EXCEPTION 'invalid longitude'; END IF;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION private.validate_trip_payload(jsonb) FROM PUBLIC, anon, authenticated;

-- Earlier repository history used a composite return type, while production temporarily used uuid.
-- Drop the function so a clean replay can converge on one stable API contract.
DROP FUNCTION IF EXISTS public.create_my_trip(jsonb);
CREATE FUNCTION public.create_my_trip(p_trip jsonb)
RETURNS public.trips
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_trip public.trips;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  PERFORM private.validate_trip_payload(p_trip);

  INSERT INTO public.trips (
    role, from_location, to_location, from_area, to_area, from_lat, from_lng, to_lat, to_lng,
    departure_time, name, phone, seats, price, price_unit, car_color,
    car_make, car_plate, baggage, notes, is_recurring, created_by
  ) VALUES (
    trim(p_trip->>'role'), trim(p_trip->>'from_location'), trim(p_trip->>'to_location'),
    trim(p_trip->>'from_area'), trim(p_trip->>'to_area'),
    NULLIF(p_trip->>'from_lat','')::double precision, NULLIF(p_trip->>'from_lng','')::double precision,
    NULLIF(p_trip->>'to_lat','')::double precision, NULLIF(p_trip->>'to_lng','')::double precision,
    (p_trip->>'departure_time')::timestamptz, trim(p_trip->>'name'), NULLIF(trim(p_trip->>'phone'),''),
    COALESCE((p_trip->>'seats')::integer,1),
    CASE WHEN p_trip->>'price' IS NULL OR p_trip->>'price' = '' THEN NULL ELSE (p_trip->>'price')::numeric END,
    COALESCE(NULLIF(p_trip->>'price_unit',''),'asmeniui'),
    NULLIF(trim(p_trip->>'car_color'),''), NULLIF(trim(p_trip->>'car_make'),''), NULLIF(trim(p_trip->>'car_plate'),''),
    NULLIF(trim(p_trip->>'baggage'),''), NULLIF(trim(p_trip->>'notes'),''),
    COALESCE((p_trip->>'is_recurring')::boolean,false), auth.uid()::text
  ) RETURNING * INTO v_trip;
  RETURN v_trip;
END;
$function$;

DROP FUNCTION IF EXISTS public.update_my_trip(uuid,jsonb);
CREATE FUNCTION public.update_my_trip(p_trip_id uuid, p_trip jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_trip public.trips;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  PERFORM private.validate_trip_payload(p_trip);

  SELECT * INTO v_trip
  FROM public.trips
  WHERE id = p_trip_id
    AND created_by = auth.uid()::text
    AND status = 'active'
    AND deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'trip not found or access denied'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.ride_requests r
    WHERE (r.trip_id = p_trip_id OR r.driver_trip_id = p_trip_id)
      AND r.status IN ('pending','accepted')
  ) THEN
    RAISE EXCEPTION 'trip has active requests';
  END IF;

  UPDATE public.trips SET
    role = trim(p_trip->>'role'),
    from_location = trim(p_trip->>'from_location'),
    to_location = trim(p_trip->>'to_location'),
    from_area = trim(p_trip->>'from_area'),
    to_area = trim(p_trip->>'to_area'),
    from_lat = NULLIF(p_trip->>'from_lat','')::double precision,
    from_lng = NULLIF(p_trip->>'from_lng','')::double precision,
    to_lat = NULLIF(p_trip->>'to_lat','')::double precision,
    to_lng = NULLIF(p_trip->>'to_lng','')::double precision,
    departure_time = (p_trip->>'departure_time')::timestamptz,
    name = trim(p_trip->>'name'),
    phone = NULLIF(trim(p_trip->>'phone'),''),
    seats = COALESCE((p_trip->>'seats')::integer,1),
    price = CASE WHEN p_trip->>'price' IS NULL OR p_trip->>'price' = '' THEN NULL ELSE (p_trip->>'price')::numeric END,
    price_unit = COALESCE(NULLIF(p_trip->>'price_unit',''),'asmeniui'),
    car_color = NULLIF(trim(p_trip->>'car_color'),''),
    car_make = NULLIF(trim(p_trip->>'car_make'),''),
    car_plate = NULLIF(trim(p_trip->>'car_plate'),''),
    baggage = NULLIF(trim(p_trip->>'baggage'),''),
    notes = NULLIF(trim(p_trip->>'notes'),''),
    is_recurring = COALESCE((p_trip->>'is_recurring')::boolean,false)
  WHERE id = p_trip_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_my_trip(jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_my_trip(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_my_trip(jsonb), public.update_my_trip(uuid,jsonb) TO authenticated, service_role;