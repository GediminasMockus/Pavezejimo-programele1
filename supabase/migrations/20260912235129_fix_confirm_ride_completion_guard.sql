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
  PERFORM set_config('app.allow_trip_completion','true',true);
  IF p.id IS NOT NULL THEN UPDATE public.trips SET status='completed',completed_at=COALESCE(completed_at,v_now) WHERE id=p.id AND status='active'; END IF;
  SELECT count(*) INTO v_remaining FROM public.ride_requests rr
   WHERE rr.status='accepted' AND COALESCE(rr.driver_trip_id,rr.trip_id)=d.id AND rr.completed_at IS NULL;
  IF v_remaining=0 THEN UPDATE public.trips SET status='completed',completed_at=COALESCE(completed_at,v_now) WHERE id=d.id AND status='active'; END IF;
  PERFORM set_config('app.allow_trip_completion','',true);
 END IF;
 RETURN r;
END; $$;
REVOKE ALL ON FUNCTION public.confirm_ride(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.confirm_ride(uuid) TO authenticated;
