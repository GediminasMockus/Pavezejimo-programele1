-- Exact trip rows are private to the owner and accepted ride participants.
DROP POLICY IF EXISTS select_trips_auth ON public.trips;
CREATE POLICY select_trips_auth ON public.trips
FOR SELECT TO authenticated
USING (
  created_by = (SELECT auth.uid())::text
  OR EXISTS (
    SELECT 1
    FROM public.ride_requests r
    WHERE r.status = 'accepted'
      AND (r.trip_id = trips.id OR r.driver_trip_id = trips.id)
      AND (
        r.passenger_id = (SELECT auth.uid())::text
        OR r.driver_id = (SELECT auth.uid())::text
      )
  )
  OR COALESCE((
    SELECT p.is_admin
    FROM public.user_profiles p
    WHERE p.id = (SELECT auth.uid())::text
  ), false)
);

-- Public discovery is a deliberately narrow, sanitized privileged API. It reads
-- active trip rows but only returns the coarse public_trips contract.
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
 SELECT t.*
 FROM public.public_trips t
 WHERE auth.uid() IS NOT NULL
   AND t.role = p_role
   AND (COALESCE(t.is_recurring,false) = true OR t.departure_time > now() - interval '24 hours')
   AND (COALESCE(p_filters->>'fromLocation','')='' OR position(translate(lower(p_filters->>'fromLocation'),'ąčęėįšųūž','aceeisuuz') IN translate(lower(t.from_location),'ąčęėįšųūž','aceeisuuz'))>0)
   AND (COALESCE(p_filters->>'toLocation','')='' OR position(translate(lower(p_filters->>'toLocation'),'ąčęėįšųūž','aceeisuuz') IN translate(lower(t.to_location),'ąčęėįšųūž','aceeisuuz'))>0)
   AND (COALESCE(p_filters->>'maxPrice','')='' OR (t.price IS NOT NULL AND t.price::numeric <= (p_filters->>'maxPrice')::numeric))
   AND (COALESCE(p_filters->>'date','')='' OR date_trunc('day',t.departure_time)=to_timestamp(p_filters->>'date','YYYY-MM-DD'))
   AND (COALESCE((p_filters->>'radiusKm')::numeric,0)=0 OR (p_lat IS NOT NULL AND p_lng IS NOT NULL AND t.from_lat IS NOT NULL AND t.from_lng IS NOT NULL AND 6371*acos(least(1,greatest(-1,sin(radians(p_lat))*sin(radians(t.from_lat))+cos(radians(p_lat))*cos(radians(t.from_lat))*cos(radians(t.from_lng-p_lng))))) <= (p_filters->>'radiusKm')::numeric))
 ORDER BY t.departure_time,t.id;
$$;

REVOKE EXECUTE ON FUNCTION public.search_trips(text,jsonb,double precision,double precision) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_trips(text,jsonb,double precision,double precision) TO authenticated, service_role;
