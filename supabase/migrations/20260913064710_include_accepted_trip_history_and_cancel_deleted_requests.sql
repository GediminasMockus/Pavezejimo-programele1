CREATE OR REPLACE FUNCTION public.get_accessible_trips()
RETURNS SETOF public.trips
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  RETURN QUERY
  SELECT t.*
  FROM public.trips t
  WHERE t.deleted_at IS NULL
    AND (
      t.created_by = auth.uid()::text
      OR EXISTS (
        SELECT 1
        FROM public.ride_requests r
        WHERE r.status = 'accepted'
          AND (r.trip_id = t.id OR r.driver_trip_id = t.id)
          AND (
            r.passenger_id = auth.uid()::text
            OR r.driver_id = auth.uid()::text
          )
      )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_accessible_trips() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_accessible_trips() TO authenticated, service_role;

UPDATE public.ride_requests r
SET status = 'cancelled',
    updated_at = now()
WHERE r.status IN ('pending', 'accepted')
  AND EXISTS (
    SELECT 1
    FROM public.trips t
    WHERE t.deleted_at IS NOT NULL
      AND (t.id = r.trip_id OR t.id = r.driver_trip_id)
  );
