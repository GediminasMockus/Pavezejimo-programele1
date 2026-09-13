create unique index if not exists notifications_user_type_trip_uidx
on public.notifications (user_id, type, related_trip_id)
where related_trip_id is not null;

create or replace function public.cleanup_expired_nonrecurring_trips()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected integer;
begin
  insert into public.notifications (user_id, type, title, message, related_trip_id)
  select
    t.created_by,
    'trip_expiry',
    'Skelbimo galiojimas',
    'Kelionės laikas praėjo. Šis skelbimas dar bus rodomas 24 valandas, o tada bus automatiškai pašalintas.',
    t.id
  from public.trips t
  where t.deleted_at is null
    and t.status = 'active'
    and coalesce(t.is_recurring, false) = false
    and t.departure_time <= now()
    and t.departure_time > now() - interval '24 hours'
    and t.created_by is not null
    and exists (
      select 1
      from public.user_profiles p
      where p.id = t.created_by
        and p.user_id is not null
        and p.user_id::text = t.created_by
    )
  on conflict (user_id, type, related_trip_id) where related_trip_id is not null
  do nothing;

  with expired as (
    select t.id
    from public.trips t
    where t.deleted_at is null
      and t.status = 'active'
      and coalesce(t.is_recurring, false) = false
      and t.departure_time <= now() - interval '24 hours'
  ), cancelled_requests as (
    update public.ride_requests r
    set status = 'cancelled'
    where r.status = 'pending'
      and (
        r.trip_id in (select id from expired)
        or r.driver_trip_id in (select id from expired)
      )
    returning r.id
  )
  update public.trips t
  set deleted_at = now(),
      deletion_reason = 'Automatiškai pašalinta praėjus 24 val. po kelionės laiko',
      status = 'cancelled'
  where t.id in (select id from expired);

  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function public.cleanup_expired_nonrecurring_trips() from public, anon, authenticated;
grant execute on function public.cleanup_expired_nonrecurring_trips() to service_role;
