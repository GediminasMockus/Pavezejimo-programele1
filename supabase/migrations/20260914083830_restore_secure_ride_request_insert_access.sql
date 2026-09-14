create or replace function private.can_insert_ride_request(
  p_trip_id uuid,
  p_request_type text,
  p_passenger_id text,
  p_driver_id text,
  p_driver_trip_id uuid,
  p_seats_needed integer
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when auth.uid() is null then false
    when p_request_type = 'passenger_request' then
      p_passenger_id = auth.uid()::text
      and p_driver_id is null
      and p_driver_trip_id is null
      and exists (
        select 1
        from public.trips t
        where t.id = p_trip_id
          and t.role = 'driver'
          and t.status = 'active'
          and t.deleted_at is null
          and t.departure_time > now()
          and t.created_by <> auth.uid()::text
          and p_seats_needed between 1 and least(8, t.seats)
      )
    when p_request_type = 'driver_offer' then
      p_driver_id = auth.uid()::text
      and p_driver_trip_id is not null
      and exists (
        select 1
        from public.trips passenger_trip
        where passenger_trip.id = p_trip_id
          and passenger_trip.role = 'passenger'
          and passenger_trip.status = 'active'
          and passenger_trip.deleted_at is null
          and passenger_trip.departure_time > now()
          and passenger_trip.created_by = p_passenger_id
          and passenger_trip.created_by <> auth.uid()::text
          and p_seats_needed = passenger_trip.seats
      )
      and exists (
        select 1
        from public.trips driver_trip
        where driver_trip.id = p_driver_trip_id
          and driver_trip.role = 'driver'
          and driver_trip.created_by = auth.uid()::text
          and driver_trip.status = 'active'
          and driver_trip.deleted_at is null
          and driver_trip.departure_time > now()
          and p_seats_needed <= driver_trip.seats
      )
    else false
  end;
$$;

revoke all on function private.can_insert_ride_request(uuid,text,text,text,uuid,integer) from public, anon;
grant execute on function private.can_insert_ride_request(uuid,text,text,text,uuid,integer) to authenticated, service_role;

drop policy if exists insert_ride_requests_v3 on public.ride_requests;

create policy insert_ride_requests_v3 on public.ride_requests
  for insert to authenticated
  with check (
    status = 'pending'
    and passenger_confirmed = false
    and driver_confirmed = false
    and completed_at is null
    and seats_needed between 1 and 8
    and length(passenger_name) between 1 and 80
    and length(pickup_location) between 1 and 200
    and length(dropoff_location) between 1 and 200
    and coalesce(length(notes), 0) <= 500
    and (
      private.can_insert_ride_request(
        trip_id,
        request_type,
        passenger_id,
        driver_id,
        driver_trip_id,
        seats_needed
      )
      or coalesce((
        select up.is_admin
        from public.user_profiles up
        where up.id = (select auth.uid())::text
      ), false)
    )
  );
