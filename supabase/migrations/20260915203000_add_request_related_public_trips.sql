-- Load sanitized trip details for requests and offers without exposing exact
-- pickup/drop-off data before both parties accept the request.
CREATE OR REPLACE FUNCTION public.get_request_related_trips()
RETURNS SETOF public.public_trips
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public_row.*
  FROM public.trips AS private_row
  JOIN public.public_trips AS public_row ON public_row.id = private_row.id
  WHERE auth.uid() IS NOT NULL
    AND private_row.deleted_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.ride_requests AS request_row
      WHERE request_row.status <> 'cancelled'
        AND (request_row.trip_id = private_row.id OR request_row.driver_trip_id = private_row.id)
        AND (
          request_row.passenger_id = auth.uid()::text
          OR request_row.driver_id = auth.uid()::text
        )
    )
  ORDER BY public_row.id;
$$;

REVOKE ALL ON FUNCTION public.get_request_related_trips() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_request_related_trips() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_request_related_trips() TO authenticated;
