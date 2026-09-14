create or replace function private.sync_new_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_display_name text;
  v_phone text;
begin
  v_display_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Vartotojas'
  );
  v_phone := nullif(btrim(new.raw_user_meta_data ->> 'phone'), '');

  insert into public.user_profiles (
    id,
    user_id,
    display_name,
    email,
    phone,
    total_ratings,
    avg_rating
  ) values (
    new.id::text,
    new.id,
    v_display_name,
    new.email,
    v_phone,
    0,
    0
  )
  on conflict (id) do update set
    user_id = coalesce(public.user_profiles.user_id, excluded.user_id),
    email = coalesce(excluded.email, public.user_profiles.email),
    display_name = case
      when coalesce(public.user_profiles.display_name, '') in ('', 'Vartotojas') then excluded.display_name
      else public.user_profiles.display_name
    end,
    phone = coalesce(public.user_profiles.phone, excluded.phone);

  return new;
end;
$$;

revoke all on function private.sync_new_auth_user_profile() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_sync_profile on auth.users;
create trigger on_auth_user_created_sync_profile
after insert on auth.users
for each row execute function private.sync_new_auth_user_profile();

insert into public.user_profiles (
  id,
  user_id,
  display_name,
  email,
  phone,
  total_ratings,
  avg_rating
)
select
  u.id::text,
  u.id,
  coalesce(
    nullif(btrim(u.raw_user_meta_data ->> 'display_name'), ''),
    nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
    'Vartotojas'
  ),
  u.email,
  nullif(btrim(u.raw_user_meta_data ->> 'phone'), ''),
  0,
  0
from auth.users u
where not exists (
  select 1 from public.user_profiles p where p.id = u.id::text
);
