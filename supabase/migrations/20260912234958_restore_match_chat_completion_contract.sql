-- Reconcile production with the match/chat/completion contract already used by the client.
-- This migration is intentionally additive and preserves legacy rows.

CREATE TABLE IF NOT EXISTS public.matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  passenger_trip_id uuid REFERENCES public.trips(id) ON DELETE CASCADE,
  request_id uuid REFERENCES public.ride_requests(id) ON DELETE SET NULL,
  driver_id text,
  passenger_id text,
  status text NOT NULL DEFAULT 'pending',
  match_score integer,
  route_overlap_pct numeric(5,2),
  detour_pct numeric(6,2),
  pickup_detour_km numeric(7,2),
  dropoff_detour_km numeric(7,2),
  driver_confirmed boolean NOT NULL DEFAULT false,
  passenger_confirmed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT matches_status_check CHECK (status IN ('pending','accepted','rejected','cancelled','completed')),
  CONSTRAINT matches_score_check CHECK (match_score IS NULL OR match_score BETWEEN 0 AND 100),
  CONSTRAINT matches_route_overlap_check CHECK (route_overlap_pct IS NULL OR route_overlap_pct BETWEEN 0 AND 100),
  CONSTRAINT matches_detour_check CHECK (detour_pct IS NULL OR detour_pct >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_matches_request_id ON public.matches(request_id) WHERE request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_matches_driver_trip ON public.matches(driver_trip_id,status);
CREATE INDEX IF NOT EXISTS idx_matches_passenger_trip ON public.matches(passenger_trip_id,status);
CREATE INDEX IF NOT EXISTS idx_matches_driver_id ON public.matches(driver_id);
CREATE INDEX IF NOT EXISTS idx_matches_passenger_id ON public.matches(passenger_id);
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS matches_participants ON public.matches;
DROP POLICY IF EXISTS select_matches_participants ON public.matches;
CREATE POLICY matches_participants ON public.matches FOR SELECT TO authenticated USING (
  driver_id = (select auth.uid())::text OR passenger_id = (select auth.uid())::text
);
REVOKE ALL ON public.matches FROM anon;
GRANT SELECT ON public.matches TO authenticated;

ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS match_id uuid REFERENCES public.matches(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_messages_match_id ON public.messages(match_id,created_at);
ALTER TABLE public.ratings ADD COLUMN IF NOT EXISTS match_id uuid REFERENCES public.matches(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_ratings_match_id ON public.ratings(match_id);

INSERT INTO public.matches(driver_trip_id,passenger_trip_id,request_id,driver_id,passenger_id,status,driver_confirmed,passenger_confirmed,completed_at)
SELECT COALESCE(r.driver_trip_id,r.trip_id),
       CASE WHEN r.request_type='driver_offer' THEN r.trip_id ELSE NULL END,
       r.id,t.created_by,r.passenger_id,
       CASE WHEN r.completed_at IS NOT NULL THEN 'completed'
            WHEN r.status IN ('accepted','rejected','cancelled') THEN r.status ELSE 'pending' END,
       r.driver_confirmed,r.passenger_confirmed,r.completed_at
FROM public.ride_requests r
JOIN public.trips t ON t.id=COALESCE(r.driver_trip_id,r.trip_id)
ON CONFLICT (request_id) WHERE request_id IS NOT NULL DO UPDATE SET
 driver_trip_id=excluded.driver_trip_id,
 passenger_trip_id=excluded.passenger_trip_id,
 driver_id=excluded.driver_id,
 passenger_id=excluded.passenger_id,
 status=CASE WHEN public.matches.status='completed' THEN 'completed' ELSE excluded.status END,
 driver_confirmed=excluded.driver_confirmed,
 passenger_confirmed=excluded.passenger_confirmed,
 completed_at=COALESCE(public.matches.completed_at,excluded.completed_at),
 updated_at=now();

UPDATE public.messages msg SET match_id=m.id FROM public.matches m
WHERE msg.match_id IS NULL AND msg.request_id IS NOT NULL AND m.request_id=msg.request_id;

CREATE OR REPLACE FUNCTION public.sync_match_from_ride_request() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_driver_trip_id uuid; v_passenger_trip_id uuid; v_driver_id text; v_status text;
BEGIN
 v_driver_trip_id:=COALESCE(NEW.driver_trip_id,NEW.trip_id);
 v_passenger_trip_id:=CASE WHEN NEW.request_type='driver_offer' THEN NEW.trip_id ELSE NULL END;
 SELECT created_by INTO v_driver_id FROM public.trips WHERE id=v_driver_trip_id;
 v_status:=CASE WHEN NEW.completed_at IS NOT NULL THEN 'completed'
                WHEN NEW.status IN ('accepted','rejected','cancelled') THEN NEW.status ELSE 'pending' END;
 INSERT INTO public.matches(driver_trip_id,passenger_trip_id,request_id,driver_id,passenger_id,status,driver_confirmed,passenger_confirmed,completed_at)
 VALUES(v_driver_trip_id,v_passenger_trip_id,NEW.id,v_driver_id,NEW.passenger_id,v_status,NEW.driver_confirmed,NEW.passenger_confirmed,NEW.completed_at)
 ON CONFLICT (request_id) WHERE request_id IS NOT NULL DO UPDATE SET
  driver_trip_id=excluded.driver_trip_id,passenger_trip_id=excluded.passenger_trip_id,
  driver_id=excluded.driver_id,passenger_id=excluded.passenger_id,
  status=CASE WHEN public.matches.status='completed' THEN 'completed' ELSE excluded.status END,
  driver_confirmed=excluded.driver_confirmed,passenger_confirmed=excluded.passenger_confirmed,
  completed_at=COALESCE(public.matches.completed_at,excluded.completed_at),updated_at=now();
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.sync_match_from_ride_request() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_sync_match_from_ride_request ON public.ride_requests;
CREATE TRIGGER trg_sync_match_from_ride_request
AFTER INSERT OR UPDATE OF status,request_type,trip_id,driver_trip_id,driver_confirmed,passenger_confirmed,completed_at ON public.ride_requests
FOR EACH ROW EXECUTE FUNCTION public.sync_match_from_ride_request();

CREATE OR REPLACE FUNCTION public.get_my_matches() RETURNS SETOF public.matches
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT m.* FROM public.matches m
 WHERE auth.uid() IS NOT NULL AND (m.driver_id=auth.uid()::text OR m.passenger_id=auth.uid()::text)
 ORDER BY m.created_at DESC;
$$;
REVOKE ALL ON FUNCTION public.get_my_matches() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_my_matches() TO authenticated;

CREATE OR REPLACE FUNCTION public.confirm_ride(p_request_id uuid) RETURNS public.ride_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.ride_requests; d public.trips; p public.trips; m public.matches; v_now timestamptz:=now(); v_remaining integer;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
 SELECT * INTO r FROM public.ride_requests WHERE id=p_request_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'request not found'; END IF;
 IF r.status<>'accepted' THEN RAISE EXCEPTION 'ride is not accepted'; END IF;
 SELECT * INTO d FROM public.trips WHERE id=COALESCE(r.driver_trip_id,r.trip_id) FOR UPDATE;
 IF d.id IS NULL THEN RAISE EXCEPTION 'driver trip not found'; END IF;
 IF d.departure_time>v_now THEN RAISE EXCEPTION 'trip has not started'; END IF;
 IF r.driver_trip_id IS NOT NULL THEN SELECT * INTO p FROM public.trips WHERE id=r.trip_id FOR UPDATE; END IF;
 SELECT * INTO m FROM public.matches WHERE request_id=p_request_id FOR UPDATE;
 IF m.id IS NULL THEN
  INSERT INTO public.matches(driver_trip_id,passenger_trip_id,request_id,driver_id,passenger_id,status)
  VALUES(d.id,CASE WHEN r.request_type='driver_offer' THEN r.trip_id ELSE NULL END,r.id,d.created_by,r.passenger_id,'accepted')
  RETURNING * INTO m;
 END IF;
 IF r.passenger_id=auth.uid()::text THEN
  UPDATE public.ride_requests SET passenger_confirmed=true,updated_at=v_now WHERE id=p_request_id;
 ELSIF d.created_by=auth.uid()::text THEN
  UPDATE public.ride_requests SET driver_confirmed=true,updated_at=v_now WHERE id=p_request_id;
 ELSE RAISE EXCEPTION 'not authorized'; END IF;
 SELECT * INTO r FROM public.ride_requests WHERE id=p_request_id;
 IF r.passenger_confirmed AND r.driver_confirmed THEN
  UPDATE public.ride_requests SET completed_at=COALESCE(completed_at,v_now),updated_at=v_now WHERE id=p_request_id RETURNING * INTO r;
  UPDATE public.matches SET status='completed',driver_confirmed=true,passenger_confirmed=true,completed_at=COALESCE(completed_at,v_now),updated_at=v_now WHERE id=m.id;
  IF p.id IS NOT NULL THEN UPDATE public.trips SET status='completed',completed_at=COALESCE(completed_at,v_now) WHERE id=p.id AND status='active'; END IF;
  SELECT count(*) INTO v_remaining FROM public.ride_requests rr
   WHERE rr.status='accepted' AND COALESCE(rr.driver_trip_id,rr.trip_id)=d.id AND rr.completed_at IS NULL;
  IF v_remaining=0 THEN UPDATE public.trips SET status='completed',completed_at=COALESCE(completed_at,v_now) WHERE id=d.id AND status='active'; END IF;
 END IF;
 RETURN r;
END; $$;
REVOKE ALL ON FUNCTION public.confirm_ride(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.confirm_ride(uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.submit_rating(uuid,text,text,integer,text,uuid);
CREATE OR REPLACE FUNCTION public.submit_rating(p_trip_id uuid,p_rated_id text,p_role text,p_score integer,p_comment text DEFAULT NULL,p_request_id uuid DEFAULT NULL)
RETURNS public.ratings LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.matches; result public.ratings;
BEGIN
 IF auth.uid() IS NULL OR p_score IS NULL OR p_score NOT BETWEEN 1 AND 5 OR p_role NOT IN ('driver','passenger') OR length(COALESCE(p_comment,''))>1000 THEN RAISE EXCEPTION 'invalid rating'; END IF;
 SELECT * INTO m FROM public.matches WHERE request_id=p_request_id;
 IF m.id IS NULL OR m.status<>'completed' THEN RAISE EXCEPTION 'match is not completed'; END IF;
 IF p_trip_id<>m.driver_trip_id AND p_trip_id IS DISTINCT FROM m.passenger_trip_id THEN RAISE EXCEPTION 'invalid trip for match'; END IF;
 IF p_role='driver' THEN
  IF m.passenger_id IS DISTINCT FROM auth.uid()::text OR m.driver_id IS DISTINCT FROM p_rated_id THEN RAISE EXCEPTION 'not authorized'; END IF;
 ELSE
  IF m.driver_id IS DISTINCT FROM auth.uid()::text OR m.passenger_id IS DISTINCT FROM p_rated_id THEN RAISE EXCEPTION 'not authorized'; END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM public.ratings x WHERE x.rater_id=auth.uid()::text AND x.match_id=m.id) THEN RAISE EXCEPTION 'rating already submitted'; END IF;
 INSERT INTO public.ratings(rater_id,rated_id,trip_id,match_id,role,score,comment)
 VALUES(auth.uid()::text,p_rated_id,p_trip_id,m.id,p_role,p_score,NULLIF(trim(p_comment),'')) RETURNING * INTO result;
 UPDATE public.user_profiles SET
 total_ratings=(SELECT count(*) FROM public.ratings WHERE rated_id=p_rated_id),
 avg_rating=COALESCE((SELECT round(avg(score),1) FROM public.ratings WHERE rated_id=p_rated_id),0)
 WHERE id=p_rated_id;
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.submit_rating(uuid,text,text,integer,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_rating(uuid,text,text,integer,text,uuid) TO authenticated;
