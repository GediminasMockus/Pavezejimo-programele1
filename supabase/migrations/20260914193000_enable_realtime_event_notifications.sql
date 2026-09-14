-- Deliver all user-facing events to the notification bell in real time.

DO $publication$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['notifications', 'ride_requests', 'trips', 'messages']
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = v_table
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_table);
    END IF;
  END LOOP;
END;
$publication$;

CREATE OR REPLACE FUNCTION public.notify_on_new_ride_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_recipient_id text;
  v_type text;
  v_title text;
  v_message text;
BEGIN
  IF NEW.request_type = 'driver_offer' THEN
    v_recipient_id := NEW.passenger_id;
    v_type := 'new_offer';
    v_title := 'Gavote pavežėjimo pasiūlymą!';
    v_message := COALESCE(NULLIF(trim(NEW.driver_name), ''), 'Vairuotojas')
      || ' siūlo jus pavežėti. Atidarykite pasiūlymą ir atsakykite.';
  ELSIF NEW.request_type = 'passenger_request' THEN
    SELECT trip.created_by
    INTO v_recipient_id
    FROM public.trips AS trip
    WHERE trip.id = NEW.trip_id;

    v_type := 'new_request';
    v_title := 'Gavote naują keleivio užklausą!';
    v_message := COALESCE(NULLIF(trim(NEW.passenger_name), ''), 'Keleivis')
      || ' nori prisijungti prie jūsų kelionės. Atidarykite užklausą ir atsakykite.';
  ELSE
    RETURN NEW;
  END IF;

  IF v_recipient_id IS NULL OR v_recipient_id = COALESCE(NEW.driver_id, NEW.passenger_id) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (
    user_id,
    type,
    title,
    message,
    related_request_id
  )
  VALUES (
    v_recipient_id,
    v_type,
    v_title,
    v_message,
    NEW.id
  );

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_new_ride_request_notification ON public.ride_requests;
CREATE TRIGGER on_new_ride_request_notification
AFTER INSERT ON public.ride_requests
FOR EACH ROW
EXECUTE FUNCTION public.notify_on_new_ride_request();

CREATE OR REPLACE FUNCTION public.notify_on_request_accepted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_recipient_id text;
  v_type text;
  v_title text;
  v_message text;
BEGIN
  IF OLD.status <> 'pending' OR NEW.status NOT IN ('accepted', 'rejected', 'cancelled') THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'cancelled' THEN
    v_type := 'request_cancelled';

    IF NEW.request_type = 'passenger_request' THEN
      SELECT trip.created_by
      INTO v_recipient_id
      FROM public.trips AS trip
      WHERE trip.id = NEW.trip_id;

      v_title := 'Keleivis atšaukė užklausą';
      v_message := COALESCE(NULLIF(trim(NEW.passenger_name), ''), 'Keleivis')
        || ' atšaukė savo užklausą.';
    ELSIF NEW.request_type = 'driver_offer' THEN
      v_recipient_id := NEW.passenger_id;
      v_title := 'Vairuotojas atšaukė pasiūlymą';
      v_message := COALESCE(NULLIF(trim(NEW.driver_name), ''), 'Vairuotojas')
        || ' atšaukė pavežėjimo pasiūlymą.';
    ELSE
      RETURN NEW;
    END IF;
  ELSIF NEW.request_type = 'passenger_request' THEN
    v_recipient_id := NEW.passenger_id;
    v_type := CASE WHEN NEW.status = 'accepted' THEN 'request_accepted' ELSE 'request_rejected' END;

    IF NEW.status = 'accepted' THEN
      v_title := 'Kelionė patvirtinta!';
      v_message := 'Vairuotojas patvirtino jūsų užklausą. Galite susisiekti per pokalbį.';
    ELSE
      v_title := 'Užklausa atmesta';
      v_message := 'Vairuotojas šį kartą negali priimti jūsų užklausos.';
    END IF;
  ELSIF NEW.request_type = 'driver_offer' THEN
    v_recipient_id := NEW.driver_id;
    v_type := CASE WHEN NEW.status = 'accepted' THEN 'request_accepted' ELSE 'request_rejected' END;

    IF NEW.status = 'accepted' THEN
      v_title := 'Pasiūlymas priimtas!';
      v_message := 'Keleivis priėmė jūsų pasiūlymą. Galite susisiekti per pokalbį.';
    ELSE
      v_title := 'Pasiūlymas atmestas';
      v_message := 'Keleivis šį kartą atsisakė jūsų pasiūlymo.';
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  IF v_recipient_id IS NOT NULL THEN
    INSERT INTO public.notifications (
      user_id,
      type,
      title,
      message,
      related_request_id
    )
    VALUES (
      v_recipient_id,
      v_type,
      v_title,
      v_message,
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_on_new_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_passenger_id text;
  v_driver_id text;
  v_recipient_id text;
BEGIN
  IF NEW.request_id IS NULL OR NEW.author_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT
    request.passenger_id,
    COALESCE(request.driver_id, driver_trip.created_by)
  INTO
    v_passenger_id,
    v_driver_id
  FROM public.ride_requests AS request
  LEFT JOIN public.trips AS driver_trip
    ON driver_trip.id = COALESCE(request.driver_trip_id, request.trip_id)
  WHERE request.id = NEW.request_id;

  IF NEW.author_id = v_passenger_id THEN
    v_recipient_id := v_driver_id;
  ELSIF NEW.author_id = v_driver_id THEN
    v_recipient_id := v_passenger_id;
  ELSE
    RETURN NEW;
  END IF;

  IF v_recipient_id IS NOT NULL AND v_recipient_id <> NEW.author_id THEN
    INSERT INTO public.notifications (
      user_id,
      type,
      title,
      message,
      related_request_id
    )
    VALUES (
      v_recipient_id,
      'new_message',
      'Nauja žinutė',
      COALESCE(NULLIF(trim(NEW.author_name), ''), 'Naudotojas')
        || ': ' || left(trim(NEW.body), 120),
      NEW.request_id
    );
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_new_message_notification ON public.messages;
CREATE TRIGGER on_new_message_notification
AFTER INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.notify_on_new_message();

REVOKE EXECUTE ON FUNCTION public.notify_on_new_ride_request() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_on_request_accepted() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_on_new_message() FROM PUBLIC, anon, authenticated;

-- Backfill still-pending requests/offers that were created before the trigger.
INSERT INTO public.notifications (
  user_id,
  type,
  title,
  message,
  related_request_id
)
SELECT
  CASE
    WHEN request.request_type = 'driver_offer' THEN request.passenger_id
    ELSE driver_trip.created_by
  END,
  CASE
    WHEN request.request_type = 'driver_offer' THEN 'new_offer'
    ELSE 'new_request'
  END,
  CASE
    WHEN request.request_type = 'driver_offer' THEN 'Gavote pavežėjimo pasiūlymą!'
    ELSE 'Gavote naują keleivio užklausą!'
  END,
  CASE
    WHEN request.request_type = 'driver_offer' THEN
      COALESCE(NULLIF(trim(request.driver_name), ''), 'Vairuotojas')
        || ' siūlo jus pavežėti. Atidarykite pasiūlymą ir atsakykite.'
    ELSE
      COALESCE(NULLIF(trim(request.passenger_name), ''), 'Keleivis')
        || ' nori prisijungti prie jūsų kelionės. Atidarykite užklausą ir atsakykite.'
  END,
  request.id
FROM public.ride_requests AS request
LEFT JOIN public.trips AS driver_trip
  ON driver_trip.id = request.trip_id
WHERE request.status = 'pending'
  AND request.request_type IN ('driver_offer', 'passenger_request')
  AND CASE
    WHEN request.request_type = 'driver_offer' THEN request.passenger_id
    ELSE driver_trip.created_by
  END IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.notifications AS notification
    WHERE notification.related_request_id = request.id
      AND notification.type = CASE
        WHEN request.request_type = 'driver_offer' THEN 'new_offer'
        ELSE 'new_request'
      END
  );
