-- The production database has no admin_list_profiles RPC. Expose only the
-- fields used by the dashboard; keep the privileged read outside the API schema.
CREATE OR REPLACE FUNCTION private.admin_profile_rows()
RETURNS TABLE (
  id text,
  display_name text,
  email text,
  is_admin boolean,
  total_ratings integer,
  avg_rating numeric,
  created_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_profiles p
    WHERE p.id = (SELECT auth.uid())::text AND p.is_admin
  ) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT p.id, p.display_name, p.email, p.is_admin,
           p.total_ratings, p.avg_rating, p.created_at
    FROM public.user_profiles p
    ORDER BY p.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION private.admin_profile_rows() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.admin_profile_rows() TO authenticated;

-- Earlier environments have a SETOF user_profiles version of this function.
DROP FUNCTION IF EXISTS public.admin_list_profiles();
CREATE FUNCTION public.admin_list_profiles()
RETURNS TABLE (
  id text,
  display_name text,
  email text,
  is_admin boolean,
  total_ratings integer,
  avg_rating numeric,
  created_at timestamptz
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT * FROM private.admin_profile_rows();
$$;

REVOKE ALL ON FUNCTION public.admin_list_profiles() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_profiles() TO authenticated;

NOTIFY pgrst, 'reload schema';
