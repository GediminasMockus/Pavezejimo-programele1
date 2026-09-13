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
  WHERE t.created_by = auth.uid()::text
    AND t.deleted_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.get_accessible_trips() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_accessible_trips() TO authenticated, service_role;
