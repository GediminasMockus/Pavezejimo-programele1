-- Make automatch notifications actionable by recording the role of the matched trip.
-- Existing notifications are backfilled so already delivered matches can be opened.

UPDATE public.notifications AS notification
SET type = CASE
  WHEN trip.role = 'driver' THEN 'auto_match_driver'
  ELSE 'auto_match_passenger'
END
FROM public.trips AS trip
WHERE notification.type = 'auto_match'
  AND notification.related_trip_id = trip.id;

CREATE OR REPLACE FUNCTION public.notify_users_on_trip_match()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_from text := COALESCE(NULLIF(trim(NEW.from_area), ''), split_part(NEW.from_location, ',', 1));
  v_to text := COALESCE(NULLIF(trim(NEW.to_area), ''), split_part(NEW.to_location, ',', 1));
BEGIN
  IF NEW.role NOT IN ('driver', 'passenger')
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
    candidate.created_by,
    CASE
      WHEN NEW.role = 'driver' THEN 'auto_match_driver'
      ELSE 'auto_match_passenger'
    END,
    CASE
      WHEN NEW.role = 'driver' THEN 'Atsirado tinkama kelionė!'
      ELSE 'Atsirado tinkamas keleivis!'
    END,
    CASE
      WHEN NEW.role = 'driver' THEN
        'Maršrutas ' || v_from || ' → ' || v_to ||
        ' gali tikti jūsų keleivio skelbimui. Atidarykite programėlę ir peržiūrėkite.'
      ELSE
        'Keleivis ieško kelionės maršrutu ' || v_from || ' → ' || v_to ||
        '. Atidarykite programėlę ir peržiūrėkite.'
    END,
    NEW.id
  FROM public.trips AS candidate
  WHERE candidate.role = CASE WHEN NEW.role = 'driver' THEN 'passenger' ELSE 'driver' END
    AND candidate.status = 'active'
    AND candidate.deleted_at IS NULL
    AND candidate.created_by IS NOT NULL
    AND candidate.created_by <> NEW.created_by
    AND candidate.departure_time > now()
    AND abs(extract(epoch FROM (candidate.departure_time - NEW.departure_time))) <= 90 * 60
    AND (
      (
        NEW.role = 'driver'
        AND candidate.seats <= NEW.seats
      )
      OR (
        NEW.role = 'passenger'
        AND NEW.seats <= candidate.seats - COALESCE((
          SELECT sum(requests.seats_needed)
          FROM public.ride_requests AS requests
          WHERE COALESCE(requests.driver_trip_id, requests.trip_id) = candidate.id
            AND requests.status = 'accepted'
        ), 0)
      )
    )
    AND (
      (
        NEW.from_lat IS NOT NULL
        AND NEW.from_lng IS NOT NULL
        AND NEW.to_lat IS NOT NULL
        AND NEW.to_lng IS NOT NULL
        AND candidate.from_lat IS NOT NULL
        AND candidate.from_lng IS NOT NULL
        AND candidate.to_lat IS NOT NULL
        AND candidate.to_lng IS NOT NULL
        AND 6371 * acos(least(1, greatest(-1,
          sin(radians(NEW.from_lat)) * sin(radians(candidate.from_lat)) +
          cos(radians(NEW.from_lat)) * cos(radians(candidate.from_lat)) *
          cos(radians(candidate.from_lng - NEW.from_lng))
        ))) <= 15
        AND 6371 * acos(least(1, greatest(-1,
          sin(radians(NEW.to_lat)) * sin(radians(candidate.to_lat)) +
          cos(radians(NEW.to_lat)) * cos(radians(candidate.to_lat)) *
          cos(radians(candidate.to_lng - NEW.to_lng))
        ))) <= 15
      )
      OR (
        translate(lower(trim(COALESCE(NULLIF(candidate.from_area, ''), split_part(candidate.from_location, ',', 1)))), 'ąčęėįšųūž', 'aceeisuuz')
          = translate(lower(trim(v_from)), 'ąčęėįšųūž', 'aceeisuuz')
        AND translate(lower(trim(COALESCE(NULLIF(candidate.to_area, ''), split_part(candidate.to_location, ',', 1)))), 'ąčęėįšųūž', 'aceeisuuz')
          = translate(lower(trim(v_to)), 'ąčęėįšųūž', 'aceeisuuz')
      )
    )
  ON CONFLICT (user_id, type, related_trip_id)
    WHERE related_trip_id IS NOT NULL
  DO NOTHING;

  RETURN NEW;
END;
$function$;
