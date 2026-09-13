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
REVOKE EXECUTE ON FUNCTION public.create_my_trip(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_my_trip(jsonb) TO authenticated, service_role;