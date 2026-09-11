/*
  Fix settings persistence after the profile privacy boundary.

  The settings screen must not depend on direct table writes because profile
  fields are intentionally behind a SECURITY DEFINER read boundary. Keep the
  write boundary equally explicit and limited to the authenticated user's
  own editable fields.
*/

CREATE OR REPLACE FUNCTION public.update_my_profile(
  p_display_name text,
  p_phone text DEFAULT NULL,
  p_default_role text DEFAULT NULL
)
RETURNS public.user_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.user_profiles;
  v_role public.trip_role;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF p_default_role IS NOT NULL AND p_default_role <> '' THEN
    IF p_default_role NOT IN ('driver', 'passenger') THEN
      RAISE EXCEPTION 'invalid default role';
    END IF;
    v_role := p_default_role::public.trip_role;
  ELSE
    v_role := NULL;
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
    v_role,
    0,
    0
  )
  ON CONFLICT (id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    phone = EXCLUDED.phone,
    default_role = EXCLUDED.default_role
  RETURNING * INTO v_profile;

  RETURN v_profile;
END;
$$;

REVOKE ALL ON FUNCTION public.update_my_profile(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_my_profile(text, text, text) TO authenticated;
