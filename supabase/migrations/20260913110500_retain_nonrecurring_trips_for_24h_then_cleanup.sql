-- pg_cron is available in Supabase Postgres but not in the lightweight PGlite
-- database used by repository migration tests. Install/schedule only when the
-- extension exists; the cleanup function itself is portable and always created.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    EXECUTE 'create extension if not exists pg_cron with schema pg_catalog';
  END IF;
END;
$$;

create or replace function public.cleanup_expired_nonrecurring_trips()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected integer;
begin
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

create or replace function public.search_trips(
  p_role text,
  p_filters jsonb default '{}'::jsonb,
  p_lat double precision default null::double precision,
  p_lng double precision default null::double precision
)
returns setof public.public_trips
language sql
stable
set search_path to ''
as $$
 select t.* from public.public_trips t
 where t.role = p_role
   and t.departure_time > now() - interval '24 hours'
   and (coalesce(p_filters->>'fromLocation','')='' or
        position(translate(lower(p_filters->>'fromLocation'),'ąčęėįšųūž','aceeisuuz') in translate(lower(t.from_location),'ąčęėįšųūž','aceeisuuz'))>0)
   and (coalesce(p_filters->>'toLocation','')='' or
        position(translate(lower(p_filters->>'toLocation'),'ąčęėįšųūž','aceeisuuz') in translate(lower(t.to_location),'ąčęėįšųūž','aceeisuuz'))>0)
   and (coalesce(p_filters->>'maxPrice','')='' or (t.price is not null and t.price::numeric <= (p_filters->>'maxPrice')::numeric))
   and (coalesce(p_filters->>'date','')='' or date_trunc('day',t.departure_time)=to_timestamp(p_filters->>'date','YYYY-MM-DD'))
   and (coalesce((p_filters->>'radiusKm')::numeric, 0)=0 or
        (p_lat is not null and p_lng is not null and t.from_lat is not null and t.from_lng is not null and
         6371 * acos(
           least(1, greatest(-1,
             sin(radians(p_lat))*sin(radians(t.from_lat)) +
             cos(radians(p_lat))*cos(radians(t.from_lat))*cos(radians(t.from_lng-p_lng))
           ))
         ) <= (p_filters->>'radiusKm')::numeric))
 order by t.departure_time,t.id;
$$;

DO $$
DECLARE
  v_job_id bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    FOR v_job_id IN EXECUTE 'select jobid from cron.job where jobname = ''cleanup-expired-nonrecurring-trips'''
    LOOP
      EXECUTE format('select cron.unschedule(%s)', v_job_id);
    END LOOP;

    EXECUTE $$select cron.schedule(
      'cleanup-expired-nonrecurring-trips',
      '15 * * * *',
      'select public.cleanup_expired_nonrecurring_trips();'
    )$$;
  END IF;
END;
$$;
