
-- A single server-owned write boundary for trips and bookings.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE OR REPLACE FUNCTION private.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid()::text AND is_admin); $$;
REVOKE ALL ON FUNCTION private.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_admin() TO authenticated;

ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS from_area text, ADD COLUMN IF NOT EXISTS to_area text;
CREATE INDEX IF NOT EXISTS idx_requests_capacity ON public.ride_requests ((COALESCE(driver_trip_id, trip_id))) WHERE status = 'accepted';
CREATE INDEX IF NOT EXISTS idx_trips_discovery ON public.trips(role, departure_time, id) WHERE deleted_at IS NULL AND status = 'active';

-- Replace every legacy policy rather than allowing permissive policies to OR together.
DO $$
DECLARE p record;
BEGIN
 FOR p IN SELECT schemaname, tablename, policyname FROM pg_policies
          WHERE schemaname = 'public' AND tablename IN ('trips','ride_requests','matches','messages','user_profiles','notifications')
 LOOP EXECUTE format('DROP POLICY %I ON %I.%I', p.policyname, p.schemaname, p.tablename); END LOOP;
END;
$$;

REVOKE ALL ON public.trips, public.ride_requests, public.matches, public.messages, public.user_profiles, public.notifications FROM anon, authenticated;
-- Column grants survive table-level revocation; revoke old public trip columns too.
REVOKE SELECT (id,role,from_location,to_location,departure_time,name,seats,price,price_unit,car_color,car_make,baggage,notes,deleted_at,deletion_reason,created_by,is_recurring,status,completed_at,created_at)
ON public.trips FROM authenticated;
GRANT SELECT ON public.trips TO authenticated;
CREATE POLICY trips_participants ON public.trips FOR SELECT TO authenticated USING (
 created_by = auth.uid()::text OR private.is_admin()
 OR EXISTS (SELECT 1 FROM public.matches m WHERE (m.driver_trip_id = trips.id OR m.passenger_trip_id = trips.id)
   AND (m.driver_id = auth.uid()::text OR m.passenger_id = auth.uid()::text) AND m.status IN ('accepted','completed'))
);

GRANT SELECT, INSERT ON public.ride_requests TO authenticated;
CREATE POLICY requests_participants ON public.ride_requests FOR SELECT TO authenticated USING (
 passenger_id = auth.uid()::text OR driver_id = auth.uid()::text OR private.is_admin()
);
CREATE POLICY requests_insert ON public.ride_requests FOR INSERT TO authenticated WITH CHECK (
 status = 'pending' AND completed_at IS NULL AND NOT passenger_confirmed AND NOT driver_confirmed
 AND ((request_type = 'passenger_request' AND passenger_id = auth.uid()::text)
   OR (request_type = 'driver_offer' AND driver_id = auth.uid()::text))
);
GRANT SELECT ON public.matches TO authenticated;
CREATE POLICY matches_participants ON public.matches FOR SELECT TO authenticated USING (
 driver_id = auth.uid()::text OR passenger_id = auth.uid()::text OR private.is_admin()
);
GRANT SELECT, INSERT ON public.messages TO authenticated;
CREATE POLICY messages_read ON public.messages FOR SELECT TO authenticated USING (
 EXISTS (SELECT 1 FROM public.matches m WHERE m.id = messages.match_id
 AND (m.driver_id = auth.uid()::text OR m.passenger_id = auth.uid()::text))
);
CREATE POLICY messages_send ON public.messages FOR INSERT TO authenticated WITH CHECK (
 author_id = auth.uid()::text AND length(trim(body)) BETWEEN 1 AND 2000
 AND EXISTS (SELECT 1 FROM public.matches m WHERE m.id = messages.match_id
 AND m.request_id = messages.request_id AND m.status IN ('accepted','completed')
 AND (m.driver_id = auth.uid()::text OR m.passenger_id = auth.uid()::text))
);
GRANT SELECT (id,display_name,total_ratings,avg_rating,default_role,created_at) ON public.user_profiles TO authenticated;
CREATE POLICY profiles_read ON public.user_profiles FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.notifications TO authenticated;
CREATE POLICY notifications_read ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid()::text);

-- Owner view intentionally redacts exact address strings as well as coordinates.
CREATE OR REPLACE VIEW public.public_trips AS
SELECT t.id,t.role,COALESCE(NULLIF(t.from_area,''),'Vietovė') AS from_location,
 COALESCE(NULLIF(t.to_area,''),'Vietovė') AS to_location,
 round(t.from_lat::numeric,2)::double precision AS from_lat,
 round(t.from_lng::numeric,2)::double precision AS from_lng,
 round(t.to_lat::numeric,2)::double precision AS to_lat,
 round(t.to_lng::numeric,2)::double precision AS to_lng,
 t.departure_time,t.name,NULL::text AS phone,t.seats,t.price,t.price_unit,t.car_color,t.car_make,
 NULL::text AS car_plate,t.baggage,NULL::text AS notes,t.deleted_at,NULL::text AS deletion_reason,
 t.created_by,t.is_recurring,t.status,t.completed_at,t.created_at,
 CASE WHEN t.role = 'driver' THEN greatest(0,t.seats - COALESCE((
 SELECT sum(r.seats_needed)::integer FROM public.ride_requests r
 WHERE COALESCE(r.driver_trip_id,r.trip_id)=t.id AND r.status='accepted'),0)) ELSE t.seats END AS available_seats
FROM public.trips t
WHERE t.deleted_at IS NULL AND t.status='active' AND t.created_by IS NOT NULL AND auth.uid() IS NOT NULL;
REVOKE ALL ON public.public_trips FROM anon, PUBLIC;
GRANT SELECT ON public.public_trips TO authenticated;

CREATE OR REPLACE FUNCTION public.get_accessible_trips()
RETURNS SETOF public.trips LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE t public.trips; full_access boolean;
BEGIN
 PERFORM private.require_active_user();
 FOR t IN SELECT x.* FROM public.trips x WHERE
  (x.created_by=auth.uid()::text AND x.deleted_at IS NULL)
  OR EXISTS (SELECT 1 FROM public.matches m WHERE (m.driver_trip_id=x.id OR m.passenger_trip_id=x.id)
    AND (m.driver_id=auth.uid()::text OR m.passenger_id=auth.uid()::text))
 LOOP
  full_access := t.created_by=auth.uid()::text OR EXISTS (
   SELECT 1 FROM public.matches m WHERE (m.driver_trip_id=t.id OR m.passenger_trip_id=t.id)
   AND m.status IN ('accepted','completed') AND (m.driver_id=auth.uid()::text OR m.passenger_id=auth.uid()::text));
  IF NOT full_access THEN
   t.from_location := COALESCE(t.from_area,'Vietovė'); t.to_location := COALESCE(t.to_area,'Vietovė');
   t.from_lat := round(t.from_lat::numeric,2); t.from_lng := round(t.from_lng::numeric,2);
   t.to_lat := round(t.to_lat::numeric,2); t.to_lng := round(t.to_lng::numeric,2);
   t.phone := NULL; t.car_plate := NULL; t.notes := NULL; t.deletion_reason := NULL;
  END IF;
  RETURN NEXT t;
 END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION private.validate_trip(t public.trips) RETURNS void
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
 IF t.role IS NULL OR t.role NOT IN ('driver','passenger')
 OR t.seats IS NULL OR t.seats NOT BETWEEN 1 AND 8
 OR length(trim(COALESCE(t.name,''))) NOT BETWEEN 1 AND 80
 OR length(trim(COALESCE(t.from_location,''))) NOT BETWEEN 1 AND 160
 OR length(trim(COALESCE(t.to_location,''))) NOT BETWEEN 1 AND 160
 OR length(trim(COALESCE(t.from_area,''))) NOT BETWEEN 1 AND 100
 OR length(trim(COALESCE(t.to_area,''))) NOT BETWEEN 1 AND 100
 OR length(COALESCE(t.notes,'')) > 500 OR length(COALESCE(t.baggage,'')) > 100
 OR t.departure_time IS NULL OR t.departure_time < now() + interval '5 minutes'
 OR (t.price IS NOT NULL AND (t.price < 0 OR t.price > 10000))
 OR t.price_unit IS NULL OR t.price_unit NOT IN ('asmeniui','viso')
 THEN RAISE EXCEPTION 'invalid trip'; END IF;
 IF (t.from_lat IS NULL) <> (t.from_lng IS NULL) OR (t.to_lat IS NULL) <> (t.to_lng IS NULL)
 OR t.from_lat NOT BETWEEN -90 AND 90 OR t.to_lat NOT BETWEEN -90 AND 90
 OR t.from_lng NOT BETWEEN -180 AND 180 OR t.to_lng NOT BETWEEN -180 AND 180
 THEN RAISE EXCEPTION 'invalid coordinates'; END IF;
 IF t.phone IS NOT NULL AND t.phone <> '' AND t.phone !~ '^\+?[0-9 ()-]{8,20}$' THEN RAISE EXCEPTION 'invalid phone'; END IF;
 IF t.role='driver' AND (length(trim(COALESCE(t.car_make,''))) NOT BETWEEN 1 AND 80
 OR length(trim(COALESCE(t.car_color,''))) NOT BETWEEN 1 AND 40
 OR length(trim(COALESCE(t.car_plate,''))) NOT BETWEEN 1 AND 20)
 THEN RAISE EXCEPTION 'car details required'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION private.validate_trip(public.trips) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.create_my_trip(p_trip jsonb) RETURNS public.trips
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE t public.trips;
BEGIN
 PERFORM private.require_active_user();
 t := jsonb_populate_record(NULL::public.trips,p_trip);
 t.id := gen_random_uuid(); t.created_by := auth.uid()::text; t.created_at := now();
 t.deleted_at := NULL; t.deletion_reason := NULL; t.status := 'active'; t.completed_at := NULL;
 t.is_recurring := COALESCE(t.is_recurring,false); t.price_unit := COALESCE(t.price_unit,'asmeniui');
 PERFORM private.validate_trip(t);
 INSERT INTO public.trips SELECT (t).*;
 RETURN t;
END;
$$;
CREATE OR REPLACE FUNCTION public.update_my_trip(p_trip_id uuid,p_trip jsonb) RETURNS public.trips
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE t public.trips; old_trip public.trips;
BEGIN
 PERFORM private.require_active_user();
 SELECT * INTO old_trip FROM public.trips WHERE id=p_trip_id FOR UPDATE;
 IF NOT FOUND OR old_trip.created_by IS DISTINCT FROM auth.uid()::text THEN RAISE EXCEPTION 'not authorized'; END IF;
 IF old_trip.status <> 'active' OR old_trip.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'trip is not active'; END IF;
 IF EXISTS (SELECT 1 FROM public.ride_requests r WHERE (r.trip_id=p_trip_id OR r.driver_trip_id=p_trip_id) AND r.status IN ('pending','accepted'))
 THEN RAISE EXCEPTION 'trip has active requests'; END IF;
 t := jsonb_populate_record(old_trip,p_trip);
 t.id:=old_trip.id; t.created_by:=old_trip.created_by; t.created_at:=old_trip.created_at;
 t.status:=old_trip.status; t.deleted_at:=old_trip.deleted_at; t.completed_at:=old_trip.completed_at;
 PERFORM private.validate_trip(t);
 UPDATE public.trips SET role=t.role,from_location=t.from_location,to_location=t.to_location,
 from_area=t.from_area,to_area=t.to_area,from_lat=t.from_lat,from_lng=t.from_lng,to_lat=t.to_lat,to_lng=t.to_lng,
 departure_time=t.departure_time,name=t.name,phone=NULLIF(t.phone,''),seats=t.seats,price=t.price,price_unit=t.price_unit,
 car_color=t.car_color,car_make=t.car_make,car_plate=t.car_plate,baggage=t.baggage,notes=NULLIF(t.notes,''),is_recurring=t.is_recurring
 WHERE id=p_trip_id RETURNING * INTO t;
 RETURN t;
END;
$$;

-- Persist canonical participant IDs before RLS and match synchronization run.
CREATE OR REPLACE FUNCTION private.validate_request() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE d public.trips; p public.trips;
BEGIN
 PERFORM private.require_active_user();
 IF NEW.request_type='driver_offer' THEN
  SELECT * INTO d FROM public.trips WHERE id=NEW.driver_trip_id FOR UPDATE;
  SELECT * INTO p FROM public.trips WHERE id=NEW.trip_id;
  IF d.created_by IS DISTINCT FROM auth.uid()::text OR p.role IS DISTINCT FROM 'passenger'
    OR p.created_by IS DISTINCT FROM NEW.passenger_id OR p.deleted_at IS NOT NULL OR p.status <> 'active'
    OR abs(extract(epoch FROM (p.departure_time-d.departure_time))) > 3600
  THEN RAISE EXCEPTION 'invalid driver offer'; END IF;
  NEW.seats_needed:=p.seats; NEW.passenger_name:=p.name;
  NEW.pickup_location:=p.from_location; NEW.pickup_lat:=p.from_lat; NEW.pickup_lng:=p.from_lng;
  NEW.dropoff_location:=p.to_location; NEW.dropoff_lat:=p.to_lat; NEW.dropoff_lng:=p.to_lng;
 ELSE
  SELECT * INTO d FROM public.trips WHERE id=NEW.trip_id FOR UPDATE;
  IF NEW.passenger_id IS DISTINCT FROM auth.uid()::text OR NEW.driver_trip_id IS NOT NULL THEN RAISE EXCEPTION 'invalid passenger request'; END IF;
 END IF;
 IF d.id IS NULL OR d.role<>'driver' OR d.status<>'active' OR d.deleted_at IS NOT NULL OR d.departure_time<=now()
 OR d.created_by IS NOT DISTINCT FROM NEW.passenger_id OR NEW.seats_needed NOT BETWEEN 1 AND 8
 OR NEW.seats_needed > d.seats OR length(trim(NEW.pickup_location)) NOT BETWEEN 1 AND 160
 OR length(trim(NEW.dropoff_location)) NOT BETWEEN 1 AND 160 OR length(trim(NEW.passenger_name)) NOT BETWEEN 1 AND 80
 OR length(COALESCE(NEW.notes,''))>500 THEN RAISE EXCEPTION 'invalid ride request'; END IF;
 NEW.driver_id:=d.created_by; NEW.driver_name:=d.name; NEW.driver_phone:=NULL;
 NEW.status:='pending'; NEW.driver_confirmed:=false; NEW.passenger_confirmed:=false; NEW.completed_at:=NULL;
 RETURN NEW;
END;
$$;
CREATE TRIGGER validate_request_before_insert BEFORE INSERT ON public.ride_requests
FOR EACH ROW EXECUTE FUNCTION private.validate_request();
UPDATE public.ride_requests r SET driver_id=t.created_by
FROM public.trips t WHERE t.id=COALESCE(r.driver_trip_id,r.trip_id);
DROP INDEX IF EXISTS public.uq_driver_offer_passenger_trip_active;
CREATE UNIQUE INDEX uq_driver_offer_passenger_trip_active ON public.ride_requests(trip_id,driver_id)
WHERE request_type='driver_offer' AND status IN ('pending','accepted');

CREATE OR REPLACE FUNCTION public.set_ride_request_status(p_request_id uuid,p_status text,p_driver_message text DEFAULT NULL)
RETURNS public.ride_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.ride_requests; d public.trips; recipient text; used integer;
BEGIN
 PERFORM private.require_active_user();
 IF p_status IS NULL OR p_status NOT IN ('accepted','rejected','cancelled') THEN RAISE EXCEPTION 'invalid request status'; END IF;
 -- Every capacity-changing path locks the driver trip before its request.
 SELECT * INTO r FROM public.ride_requests WHERE id=p_request_id;
 SELECT * INTO d FROM public.trips WHERE id=COALESCE(r.driver_trip_id,r.trip_id) FOR UPDATE;
 SELECT * INTO r FROM public.ride_requests WHERE id=p_request_id FOR UPDATE;
 IF r.id IS NULL OR d.id IS NULL THEN RAISE EXCEPTION 'request not found'; END IF;
 IF auth.uid()::text IS DISTINCT FROM r.passenger_id AND auth.uid()::text IS DISTINCT FROM d.created_by THEN RAISE EXCEPTION 'not authorized'; END IF;
 IF r.completed_at IS NOT NULL OR EXISTS (SELECT 1 FROM public.matches WHERE request_id=r.id AND status='completed') THEN RAISE EXCEPTION 'completed match is immutable'; END IF;
 IF r.status=p_status THEN RETURN r; END IF;
 IF r.status IN ('cancelled','rejected') THEN RAISE EXCEPTION 'request is closed'; END IF;
 recipient:=CASE WHEN r.request_type='driver_offer' THEN r.passenger_id ELSE d.created_by END;
 IF p_status IN ('accepted','rejected') AND (auth.uid()::text IS DISTINCT FROM recipient OR r.status<>'pending') THEN RAISE EXCEPTION 'not authorized'; END IF;
 IF p_status='accepted' THEN
  IF d.status<>'active' OR d.deleted_at IS NOT NULL OR d.departure_time<=now() THEN RAISE EXCEPTION 'trip is not active'; END IF;
  IF r.request_type='driver_offer' THEN
   PERFORM 1 FROM public.trips WHERE id=r.trip_id AND status='active' AND deleted_at IS NULL FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'passenger trip is not active'; END IF;
   IF EXISTS (SELECT 1 FROM public.ride_requests WHERE trip_id=r.trip_id AND status='accepted' AND id<>r.id) THEN RAISE EXCEPTION 'passenger already booked'; END IF;
  END IF;
  SELECT COALESCE(sum(seats_needed),0) INTO used FROM public.ride_requests
  WHERE COALESCE(driver_trip_id,trip_id)=d.id AND status='accepted' AND id<>r.id;
  IF used+r.seats_needed>d.seats THEN RAISE EXCEPTION 'not enough seats'; END IF;
 END IF;
 UPDATE public.ride_requests SET status=p_status,driver_message=COALESCE(p_driver_message,driver_message),updated_at=now()
 WHERE id=r.id RETURNING * INTO r;
 RETURN r;
END;
$$;
CREATE OR REPLACE FUNCTION public.set_match_status(p_match_id uuid,p_status text) RETURNS public.matches
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE m public.matches;
BEGIN
 SELECT * INTO m FROM public.matches WHERE id=p_match_id;
 IF m.request_id IS NULL THEN RAISE EXCEPTION 'request required'; END IF;
 PERFORM public.set_ride_request_status(m.request_id,p_status,NULL);
 SELECT * INTO m FROM public.matches WHERE id=p_match_id;
 RETURN m;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_my_trip(p_trip_id uuid,p_reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE t public.trips;
BEGIN
 SELECT * INTO t FROM public.trips WHERE id=p_trip_id FOR UPDATE;
 IF auth.uid() IS NULL OR t.created_by IS DISTINCT FROM auth.uid()::text THEN RAISE EXCEPTION 'not authorized'; END IF;
 IF EXISTS (SELECT 1 FROM public.ride_requests WHERE (trip_id=t.id OR driver_trip_id=t.id) AND status='accepted' AND completed_at IS NULL)
 THEN RAISE EXCEPTION 'cancel accepted requests first'; END IF;
 UPDATE public.ride_requests SET status='cancelled',updated_at=now()
 WHERE (trip_id=t.id OR driver_trip_id=t.id) AND status='pending';
 UPDATE public.trips SET deleted_at=now(),deletion_reason=left(p_reason,500) WHERE id=t.id;
END;
$$;

-- One canonical message identity; callers cannot mix another booking into a message.
CREATE OR REPLACE FUNCTION public.sync_message_match_id() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE m public.matches;
BEGIN
 SELECT * INTO m FROM public.matches WHERE request_id=NEW.request_id;
 IF m.id IS NULL OR (NEW.match_id IS NOT NULL AND NEW.match_id<>m.id)
 OR (NEW.trip_id<>m.driver_trip_id AND NEW.trip_id IS DISTINCT FROM m.passenger_trip_id)
 THEN RAISE EXCEPTION 'invalid message booking'; END IF;
 NEW.match_id:=m.id;
 RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.create_profile() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 INSERT INTO public.user_profiles(id,user_id,display_name,email)
 VALUES(NEW.id::text,NEW.id,left(COALESCE(NULLIF(NEW.raw_user_meta_data->>'display_name',''),'Vartotojas'),80),NEW.email)
 ON CONFLICT(id) DO NOTHING;
 RETURN NEW;
END;
$$;
CREATE TRIGGER create_profile_after_signup AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION private.create_profile();

-- Server-only administration; public profile access never includes admin flags.
CREATE OR REPLACE FUNCTION public.admin_list_profiles() RETURNS SETOF public.user_profiles
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF NOT private.is_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
 RETURN QUERY SELECT * FROM public.user_profiles ORDER BY created_at DESC;
END;
$$;
CREATE OR REPLACE FUNCTION public.admin_set_role(p_user_id text,p_is_admin boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF NOT private.is_admin() OR p_user_id=auth.uid()::text THEN RAISE EXCEPTION 'not authorized'; END IF;
 UPDATE public.user_profiles SET is_admin=p_is_admin WHERE id=p_user_id;
END;
$$;
CREATE OR REPLACE FUNCTION public.admin_delete_record(p_kind text,p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF NOT private.is_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
 IF p_kind='trip' THEN DELETE FROM public.trips WHERE id=p_id;
 ELSIF p_kind='request' THEN DELETE FROM public.ride_requests WHERE id=p_id;
 ELSE RAISE EXCEPTION 'invalid kind'; END IF;
END;
$$;
CREATE OR REPLACE FUNCTION private.cleanup_deleted_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 DELETE FROM public.messages WHERE author_id=OLD.id::text;
 DELETE FROM public.ratings WHERE rater_id=OLD.id::text OR rated_id=OLD.id::text;
 DELETE FROM public.notifications WHERE user_id=OLD.id::text;
 DELETE FROM public.ride_requests WHERE passenger_id=OLD.id::text OR driver_id=OLD.id::text;
 DELETE FROM public.trips WHERE created_by=OLD.id::text;
 DELETE FROM public.user_profiles WHERE id=OLD.id::text;
 RETURN OLD;
END;
$$;
CREATE TRIGGER cleanup_deleted_user BEFORE DELETE ON auth.users FOR EACH ROW EXECUTE FUNCTION private.cleanup_deleted_user();

-- Shared geocoder admission control (works across Edge isolates).
CREATE TABLE private.geocode_gate(id boolean PRIMARY KEY DEFAULT true CHECK(id), next_at timestamptz NOT NULL);
INSERT INTO private.geocode_gate VALUES(true,now());
CREATE TABLE private.geocode_cache(query text PRIMARY KEY,result jsonb NOT NULL,expires_at timestamptz NOT NULL);
CREATE OR REPLACE FUNCTION public.claim_geocode() RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM private.require_active_user();
 UPDATE private.geocode_gate SET next_at=clock_timestamp()+interval '1100 milliseconds' WHERE id AND next_at<=clock_timestamp();
 RETURN FOUND;
END; $$;
CREATE OR REPLACE FUNCTION public.cached_geocode(p_query text) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT result FROM private.geocode_cache WHERE query=p_query AND expires_at>now() AND auth.uid() IS NOT NULL;
$$;
CREATE OR REPLACE FUNCTION public.store_geocode(p_query text,p_result jsonb) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 INSERT INTO private.geocode_cache VALUES(p_query,p_result,now()+interval '1 day')
 ON CONFLICT(query) DO UPDATE SET result=excluded.result,expires_at=excluded.expires_at;
$$;
REVOKE ALL ON FUNCTION public.store_geocode(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.store_geocode(text,jsonb) TO service_role;

-- Remove anonymous execution inherited from PostgreSQL's PUBLIC defaults.
DO $$
DECLARE f record;
BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.prosecdef
 LOOP EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon',f.signature); END LOOP;
END; $$;
GRANT EXECUTE ON FUNCTION public.get_accessible_trips(),public.create_my_trip(jsonb),public.update_my_trip(uuid,jsonb),
public.delete_my_trip(uuid,text),public.admin_list_profiles(),public.admin_set_role(text,boolean),public.admin_delete_record(text,uuid),
public.claim_geocode(),public.cached_geocode(text) TO authenticated;
-- Internal synchronization and validation functions are not client APIs.
REVOKE EXECUTE ON FUNCTION public.sync_match_from_request(uuid),public.create_match_from_request(uuid,integer,numeric,numeric,numeric,numeric)
FROM authenticated;
NOTIFY pgrst, 'reload schema';

CREATE OR REPLACE FUNCTION public.confirm_ride(p_request_id uuid)
RETURNS public.ride_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.ride_requests;
  v_driver_trip public.trips;
  v_passenger_trip public.trips;
  v_match public.matches;
  v_now timestamptz := now();
  v_remaining integer;
BEGIN
  PERFORM private.require_active_user();

  SELECT * INTO v_request FROM public.ride_requests WHERE id=p_request_id;
  PERFORM 1 FROM public.trips WHERE id=COALESCE(v_request.driver_trip_id,v_request.trip_id) FOR UPDATE;
  SELECT * INTO v_request FROM public.ride_requests WHERE id=p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request not found'; END IF;
  IF v_request.status <> 'accepted' THEN RAISE EXCEPTION 'ride is not accepted'; END IF;

  IF v_request.driver_trip_id IS NOT NULL THEN
    SELECT * INTO v_driver_trip FROM public.trips WHERE id = v_request.driver_trip_id FOR UPDATE;
    SELECT * INTO v_passenger_trip FROM public.trips WHERE id = v_request.trip_id FOR UPDATE;
  ELSE
    SELECT * INTO v_driver_trip FROM public.trips WHERE id = v_request.trip_id FOR UPDATE;
  END IF;

  IF v_driver_trip.id IS NULL THEN RAISE EXCEPTION 'driver trip not found'; END IF;
  IF v_driver_trip.departure_time > now() THEN RAISE EXCEPTION 'trip has not started'; END IF;

  SELECT * INTO v_match
  FROM public.matches
  WHERE request_id = p_request_id
  FOR UPDATE;

  IF v_match.id IS NULL THEN
    PERFORM public.sync_match_from_request(p_request_id);
    SELECT * INTO v_match FROM public.matches WHERE request_id = p_request_id FOR UPDATE;
  END IF;

  IF v_request.passenger_id = auth.uid()::text THEN
    UPDATE public.ride_requests SET passenger_confirmed = true, updated_at = v_now WHERE id = p_request_id;
  ELSIF v_driver_trip.created_by = auth.uid()::text THEN
    UPDATE public.ride_requests SET driver_confirmed = true, updated_at = v_now WHERE id = p_request_id;
  ELSE
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO v_request FROM public.ride_requests WHERE id = p_request_id;

  IF v_request.passenger_confirmed AND v_request.driver_confirmed THEN
    UPDATE public.ride_requests
    SET completed_at = COALESCE(completed_at, v_now), updated_at = v_now
    WHERE id = p_request_id;

    IF v_match.id IS NOT NULL THEN
      UPDATE public.matches
      SET status = 'completed',
          completed_at = COALESCE(completed_at, v_now),
          updated_at = v_now
      WHERE id = v_match.id;
    END IF;

    IF v_passenger_trip.id IS NOT NULL THEN
      PERFORM set_config('app.allow_trip_completion', 'true', true);
      UPDATE public.trips
      SET status = 'completed', completed_at = COALESCE(completed_at, v_now)
      WHERE id = v_passenger_trip.id AND status <> 'completed';
      PERFORM set_config('app.allow_trip_completion', '', true);
    END IF;

    SELECT COUNT(*) INTO v_remaining
    FROM public.ride_requests rr
    WHERE rr.status = 'accepted'
      AND COALESCE(rr.driver_trip_id, rr.trip_id) = v_driver_trip.id
      AND rr.completed_at IS NULL;

    IF v_remaining = 0 THEN
      PERFORM set_config('app.allow_trip_completion', 'true', true);
      UPDATE public.trips
      SET status = 'completed', completed_at = COALESCE(completed_at, v_now)
      WHERE id = v_driver_trip.id AND status <> 'completed';
      PERFORM set_config('app.allow_trip_completion', '', true);
    END IF;

    SELECT * INTO v_request FROM public.ride_requests WHERE id = p_request_id;
  END IF;

  RETURN v_request;
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_ride(uuid) TO authenticated;


-- Keep each request's conversation separate, including rejected/replaced offers.
DROP INDEX IF EXISTS public.uq_ride_requests_passenger_trip_active;
CREATE UNIQUE INDEX uq_ride_requests_passenger_trip_active ON public.ride_requests(trip_id,passenger_id,driver_id)
WHERE status IN ('pending','accepted');
DROP INDEX IF EXISTS public.uq_matches_trip_pair;
CREATE UNIQUE INDEX uq_matches_trip_pair ON public.matches(driver_trip_id,passenger_trip_id)
WHERE status IN ('pending','accepted');
CREATE OR REPLACE FUNCTION public.sync_match_from_ride_request() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d uuid; p uuid; driver text;
BEGIN
 d:=COALESCE(NEW.driver_trip_id,NEW.trip_id);
 p:=CASE WHEN NEW.request_type='driver_offer' THEN NEW.trip_id ELSE NULL END;
 SELECT created_by INTO driver FROM public.trips WHERE id=d;
 INSERT INTO public.matches(driver_trip_id,passenger_trip_id,request_id,driver_id,passenger_id,status,driver_confirmed,passenger_confirmed,completed_at)
 VALUES(d,p,NEW.id,driver,NEW.passenger_id,CASE WHEN NEW.completed_at IS NOT NULL THEN 'completed' ELSE NEW.status END,NEW.driver_confirmed,NEW.passenger_confirmed,NEW.completed_at)
 ON CONFLICT(request_id) DO UPDATE SET
 status=CASE WHEN public.matches.status='completed' THEN 'completed' ELSE excluded.status END,
 driver_id=excluded.driver_id,passenger_id=excluded.passenger_id,
 driver_confirmed=excluded.driver_confirmed,passenger_confirmed=excluded.passenger_confirmed,
 completed_at=COALESCE(public.matches.completed_at,excluded.completed_at),updated_at=now();
 RETURN NEW;
END; $$;
DROP FUNCTION IF EXISTS public.submit_rating(uuid,text,text,integer,text);
DROP FUNCTION IF EXISTS public.submit_rating(uuid,text,text,integer,text,uuid);
CREATE OR REPLACE FUNCTION public.submit_rating(p_trip_id uuid,p_rated_id text,p_role text,p_score integer,p_comment text DEFAULT NULL,p_request_id uuid DEFAULT NULL,p_match_id uuid DEFAULT NULL)
RETURNS public.ratings LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.matches; result public.ratings;
BEGIN
 IF auth.uid() IS NULL OR p_score IS NULL OR p_score NOT BETWEEN 1 AND 5 OR p_role IS NULL OR p_role NOT IN ('driver','passenger')
 OR length(COALESCE(p_comment,''))>1000 THEN RAISE EXCEPTION 'invalid rating'; END IF;
 SELECT * INTO m FROM public.matches WHERE id=COALESCE(p_match_id,(SELECT id FROM public.matches WHERE request_id=p_request_id));
 IF m.id IS NULL OR m.status<>'completed' THEN RAISE EXCEPTION 'match is not completed'; END IF;
 IF p_trip_id IS NULL OR (p_trip_id<>m.driver_trip_id AND p_trip_id IS DISTINCT FROM m.passenger_trip_id)
 OR (p_request_id IS NOT NULL AND p_request_id IS DISTINCT FROM m.request_id) THEN RAISE EXCEPTION 'invalid trip for match'; END IF;
 IF p_role='driver' THEN
  IF m.passenger_id IS DISTINCT FROM auth.uid()::text OR m.driver_id IS DISTINCT FROM p_rated_id THEN RAISE EXCEPTION 'not authorized'; END IF;
 ELSE
  IF m.driver_id IS DISTINCT FROM auth.uid()::text OR m.passenger_id IS DISTINCT FROM p_rated_id THEN RAISE EXCEPTION 'not authorized'; END IF;
 END IF;
 PERFORM 1 FROM public.user_profiles WHERE id=p_rated_id FOR UPDATE;
 INSERT INTO public.ratings(rater_id,rated_id,trip_id,match_id,role,score,comment)
 VALUES(auth.uid()::text,p_rated_id,p_trip_id,m.id,p_role,p_score,NULLIF(trim(p_comment),''))
 ON CONFLICT(rater_id,match_id) DO NOTHING RETURNING * INTO result;
 IF result.id IS NULL THEN RAISE EXCEPTION 'rating already submitted'; END IF;
 UPDATE public.user_profiles SET
 total_ratings=(SELECT count(*) FROM public.ratings WHERE rated_id=p_rated_id),
 avg_rating=(SELECT round(avg(score),1) FROM public.ratings WHERE rated_id=p_rated_id)
 WHERE id=p_rated_id;
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.submit_rating(uuid,text,text,integer,text,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_rating(uuid,text,text,integer,text,uuid,uuid) TO authenticated;

-- Old access tokens for a deleted account must not recreate its profile or trips.
CREATE OR REPLACE FUNCTION private.require_active_user() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=auth.uid()) THEN RAISE EXCEPTION 'authentication required'; END IF;
END; $$;
REVOKE ALL ON FUNCTION private.require_active_user() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.update_my_profile(
  p_display_name text,
  p_phone text DEFAULT NULL,
  p_default_role text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM private.require_active_user();
  IF length(COALESCE(p_display_name,'')) > 80 THEN RAISE EXCEPTION 'name too long'; END IF;

  IF p_default_role IS NOT NULL
     AND p_default_role <> ''
     AND p_default_role NOT IN ('driver', 'passenger') THEN
    RAISE EXCEPTION 'invalid default role';
  END IF;

  INSERT INTO public.user_profiles (
    id,
    display_name,
    phone,
    default_role,
    total_ratings,
    avg_rating
  )
  VALUES (
    auth.uid()::text,
    COALESCE(NULLIF(trim(p_display_name), ''), 'Vartotojas'),
    NULLIF(trim(p_phone), ''),
    NULLIF(p_default_role, ''),
    0,
    0
  )
  ON CONFLICT (id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    phone = EXCLUDED.phone,
    default_role = EXCLUDED.default_role;
END;
$$;

REVOKE ALL ON FUNCTION public.update_my_profile(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_my_profile(text, text, text) TO authenticated;


CREATE OR REPLACE FUNCTION public.search_trips(p_role text,p_filters jsonb DEFAULT '{}',p_lat double precision DEFAULT NULL,p_lng double precision DEFAULT NULL)
RETURNS SETOF public.public_trips LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT t.* FROM public.public_trips t
 WHERE t.role=p_role AND t.departure_time>now()
 AND (COALESCE(p_filters->>'fromLocation','')='' OR
 position(translate(lower(p_filters->>'fromLocation'),'ąčęėįšųūž','aceeisuuz') IN translate(lower(t.from_location),'ąčęėįšųūž','aceeisuuz'))>0)
 AND (COALESCE(p_filters->>'toLocation','')='' OR
 position(translate(lower(p_filters->>'toLocation'),'ąčęėįšųūž','aceeisuuz') IN translate(lower(t.to_location),'ąčęėįšųūž','aceeisuuz'))>0)
 AND (NULLIF(p_filters->>'dateFrom','') IS NULL OR t.departure_time >= (p_filters->>'dateFrom')::timestamptz)
 AND (NULLIF(p_filters->>'dateTo','') IS NULL OR t.departure_time < (p_filters->>'dateTo')::timestamptz)
 AND t.available_seats >= COALESCE((p_filters->>'minSeats')::integer,0)
 AND (NULLIF(p_filters->>'maxPrice','') IS NULL OR t.price <= (p_filters->>'maxPrice')::numeric)
 AND (NOT COALESCE((p_filters->>'recurringOnly')::boolean,false) OR t.is_recurring)
 AND (COALESCE((p_filters->>'radiusKm')::numeric,0)<=0 OR p_lat IS NULL OR p_lng IS NULL OR
 (t.from_lat IS NOT NULL AND t.from_lng IS NOT NULL AND
  6371*acos(least(1.0,greatest(-1.0,sin(radians(p_lat))*sin(radians(t.from_lat))+
  cos(radians(p_lat))*cos(radians(t.from_lat))*cos(radians(t.from_lng-p_lng))))) <= (p_filters->>'radiusKm')::numeric))
 ORDER BY t.departure_time,t.id;
$$;
REVOKE ALL ON FUNCTION public.search_trips(text,jsonb,double precision,double precision) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.search_trips(text,jsonb,double precision,double precision) TO authenticated;
