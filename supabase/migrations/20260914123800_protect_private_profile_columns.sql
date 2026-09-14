create or replace function public.get_my_profile()
returns table(
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
language sql
stable
security definer
set search_path = ''
as $$
  select
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
  from public.user_profiles p
  where auth.uid() is not null
    and p.id = auth.uid()::text;
$$;

create or replace function public.get_my_profile_flags()
returns table(is_admin boolean, phone text, default_role text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.is_admin,
    p.phone,
    p.default_role::text
  from public.user_profiles p
  where auth.uid() is not null
    and p.id = auth.uid()::text;
$$;

revoke all on function public.get_my_profile() from public, anon;
revoke all on function public.get_my_profile_flags() from public, anon;
grant execute on function public.get_my_profile() to authenticated;
grant execute on function public.get_my_profile_flags() to authenticated;

revoke select on public.user_profiles from authenticated;
grant select (
  id,
  display_name,
  default_role,
  total_ratings,
  avg_rating,
  created_at
) on public.user_profiles to authenticated;
