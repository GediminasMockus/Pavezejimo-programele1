/*
  Profile privacy boundary.

  Public profile discovery may read only non-sensitive presentation fields.
  The authenticated user reads their own email/phone/admin flag through a
  SECURITY DEFINER function instead of selecting sensitive columns directly.
*/

CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS TABLE (
  id text,
  display_name text,
  email text,
  is_admin boolean,
  phone text,
  default_role text,
  total_ratings integer,
  avg_rating numeric,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.display_name,
    p.email,
    p.is_admin,
    p.phone,
    p.default_role::text,
    p.total_ratings,
    p.avg_rating,
    p.created_at
  FROM public.user_profiles p
  WHERE p.id = auth.uid()::text;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;

-- Keep public profile cards working while removing direct access to sensitive
-- profile fields. Updates/inserts remain governed by the existing RLS rules.
REVOKE SELECT (email, phone, is_admin) ON public.user_profiles FROM authenticated;
