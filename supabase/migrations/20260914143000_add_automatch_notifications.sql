-- Notify passengers when a newly created or materially updated driver trip
-- matches an active passenger listing. Matching is deliberately conservative:
-- same travel direction, departure within 90 minutes, enough seats, and either
-- nearby endpoints (15 km) or matching coarse areas.

CREATE UNIQUE INDEX IF NOT EXISTS notifications_user_type_trip_uidx
  ON public.notifications (user_id, type, related_trip_id)
  WHERE related_trip_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.notify_passengers_on_driver_trip_match()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_from text := COALESCE(NULLIF(trim(NEW.from_area), ''), split_part(NEW.from_location, ',', 1));
  v_to text := COALESCE(NULLIF(trim(NEW.to_area), ''), split_part(NEW.to_location, ',', 1));
BEGIN
  IF NEW.role <> 'driver'
     OR NEW.status <> 'active'
     OR NEW.deleted_at IS NOT NULL
     OR NEW.created_by IS NULL
     OR NEW.departure_time <= now()
  THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (
    user_id,
    type,
    title,
    message,
    related_trip_id
  )
  SELECT DISTINCT
    passenger.created_by,
    'auto_match',
    'Atsirado tinkama kelionė!',
    'Maršrutas ' || v_from || ' → ' || v_to ||
      ' gali tikti jūsų keleivio skelbimui. Atidarykite programėlę ir peržiūrėkite.',
    NEW.id
  FROM public.trips AS passenger
  WHERE passenger.role = 'passenger'
    AND passenger.status = 'active'
    AND passenger.deleted_at IS NULL
    AND passenger.created_by IS NOT NULL
    AND passenger.created_by <> NEW.created_by
    AND passenger.departure_time > now()
    AND abs(extract(epoch FROM (passenger.departure_time - NEW.departure_time))) <= 90 * 60
    AND passenger.seats <= NEW.seats
    AND (
      (
        NEW.from_lat IS NOT NULL
        AND NEW.from_lng IS NOT NULL
        AND NEW.to_lat IS NOT NULL
        AND NEW.to_lng IS NOT NULL
        AND passenger.from_lat IS NOT NULL
        AND passenger.from_lng IS NOT NULL
        AND passenger.to_lat IS NOT NULL
        AND passenger.to_lng IS NOT NULL
        AND 6371 * acos(least(1, greatest(-1,
          sin(radians(NEW.from_lat)) * sin(radians(passenger.from_lat)) +
          cos(radians(NEW.from_lat)) * cos(radians(passenger.from_lat)) *
          cos(radians(passenger.from_lng - NEW.from_lng))
        ))) <= 15
        AND 6371 * acos(least(1, greatest(-1,
          sin(radians(NEW.to_lat)) * sin(radians(passenger.to_lat)) +
          cos(radians(NEW.to_lat)) * cos(radians(passenger.to_lat)) *
          cos(radians(passenger.to_lng - NEW.to_lng))
        ))) <= 15
      )
      OR (
        translate(lower(trim(COALESCE(NULLIF(passenger.from_area, ''), split_part(passenger.from_location, ',', 1)))), 'ąčęėįšųūž', 'aceeisuuz')
          = translate(lower(trim(v_from)), 'ąčęėįšųūž', 'aceeisuuz')
        AND translate(lower(trim(COALESCE(NULLIF(passenger.to_area, ''), split_part(passenger.to_location, ',', 1)))), 'ąčęėįšųūž', 'aceeisuuz')
          = translate(lower(trim(v_to)), 'ąčęėįšųūž', 'aceeisuuz')
      )
    )
  ON CONFLICT (user_id, type, related_trip_id)
    WHERE related_trip_id IS NOT NULL
  DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_passengers_on_driver_trip_match() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS notify_passengers_on_driver_trip_match_trigger ON public.trips;
CREATE TRIGGER notify_passengers_on_driver_trip_match_trigger
AFTER INSERT OR UPDATE OF
  role, from_location, to_location, from_area, to_area,
  from_lat, from_lng, to_lat, to_lng,
  departure_time, seats, status, deleted_at
ON public.trips
FOR EACH ROW
EXECUTE FUNCTION public.notify_passengers_on_driver_trip_match();
