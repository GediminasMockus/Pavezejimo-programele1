-- Add car fields to user_profiles for pre-filling in trip form
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS car_make text,
  ADD COLUMN IF NOT EXISTS car_color text,
  ADD COLUMN IF NOT EXISTS car_plate text;

-- Add from_area and to_area to trips table
ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS from_area text,
  ADD COLUMN IF NOT EXISTS to_area text;

-- Create private schema if not exists
CREATE SCHEMA IF NOT EXISTS private;

-- Create require_active_user function
CREATE OR REPLACE FUNCTION private.require_active_user() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=auth.uid()) THEN RAISE EXCEPTION 'authentication required'; END IF;
END; $$;

REVOKE ALL ON FUNCTION private.require_active_user() FROM PUBLIC;

-- Update get_my_profile to include car fields
CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS TABLE (
  id text,
  display_name text,
  email text,
  is_admin boolean,
  phone text,
  default_role text,
  car_make text,
  car_color text,
  car_plate text,
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
    p.car_make,
    p.car_color,
    p.car_plate,
    p.total_ratings,
    p.avg_rating,
    p.created_at
  FROM public.user_profiles p
  WHERE p.id = auth.uid()::text;
$$;

-- Update update_my_profile to handle car fields
CREATE OR REPLACE FUNCTION public.update_my_profile(
  p_display_name text,
  p_phone text DEFAULT NULL,
  p_default_role text DEFAULT NULL,
  p_car_make text DEFAULT NULL,
  p_car_color text DEFAULT NULL,
  p_car_plate text DEFAULT NULL
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
    car_make,
    car_color,
    car_plate,
    total_ratings,
    avg_rating
  )
  VALUES (
    auth.uid()::text,
    COALESCE(NULLIF(trim(p_display_name), ''), 'Vartotojas'),
    NULLIF(trim(p_phone), ''),
    NULLIF(p_default_role, ''),
    NULLIF(trim(p_car_make), ''),
    NULLIF(trim(p_car_color), ''),
    NULLIF(trim(p_car_plate), ''),
    0,
    0
  )
  ON CONFLICT (id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    phone = EXCLUDED.phone,
    default_role = EXCLUDED.default_role,
    car_make = EXCLUDED.car_make,
    car_color = EXCLUDED.car_color,
    car_plate = EXCLUDED.car_plate;
END;
$$;

REVOKE ALL ON FUNCTION public.update_my_profile(text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_my_profile(text, text, text, text, text, text) TO authenticated;
