/*
  Fix settings persistence after the profile privacy boundary.

  The settings screen must not depend on direct table writes. Keep the write
  boundary explicit, limited to the authenticated user's editable fields,
  and do not return the complete user_profiles row to the browser.
*/

-- Drop first so this migration also works if an earlier deployment created
-- the same argument signature with a different return type.
DROP FUNCTION IF EXISTS public.update_my_profile(text, text, text);

CREATE FUNCTION public.update_my_profile(
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
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

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
