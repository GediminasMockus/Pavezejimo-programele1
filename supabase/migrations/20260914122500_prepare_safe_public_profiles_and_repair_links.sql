update public.user_profiles p
set user_id = u.id
from auth.users u
where p.id = u.id::text
  and p.user_id is null;

create or replace view public.public_user_profiles
with (security_barrier = true)
as
select
  id,
  display_name,
  default_role,
  total_ratings,
  avg_rating,
  created_at
from public.user_profiles;

revoke all on public.public_user_profiles from public, anon;
grant select on public.public_user_profiles to authenticated;
