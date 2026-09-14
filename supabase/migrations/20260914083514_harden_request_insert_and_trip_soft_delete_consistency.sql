update public.trips
set status = 'cancelled'
where deleted_at is not null
  and status = 'active';

alter table public.trips
  drop constraint if exists trips_deleted_not_active_check;

alter table public.trips
  add constraint trips_deleted_not_active_check
  check (deleted_at is null or status <> 'active');

alter table public.ride_requests
  drop constraint if exists ride_requests_seats_needed_check;

alter table public.ride_requests
  add constraint ride_requests_seats_needed_check
  check (seats_needed between 1 and 8);

alter table public.ride_requests
  drop constraint if exists ride_requests_status_check;

alter table public.ride_requests
  add constraint ride_requests_status_check
  check (status in ('pending','accepted','rejected','cancelled','completed'));

create unique index if not exists uq_passenger_request_trip_passenger_active
  on public.ride_requests (trip_id, passenger_id)
  where request_type = 'passenger_request'
    and status in ('pending','accepted');

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
      (
        request_type = 'passenger_request'
        and passenger_id = (select auth.uid())::text
        and driver_id is null
        and driver_trip_id is null
        and exists (
          select 1
          from public.trips t
          where t.id = ride_requests.trip_id
            and t.role = 'driver'
            and t.status = 'active'
            and t.deleted_at is null
            and t.departure_time > now()
            and t.created_by <> (select auth.uid())::text
        )
      )
      or
      (
        request_type = 'driver_offer'
        and driver_id = (select auth.uid())::text
        and driver_trip_id is not null
        and exists (
          select 1
          from public.trips passenger_trip
          where passenger_trip.id = ride_requests.trip_id
            and passenger_trip.role = 'passenger'
            and passenger_trip.status = 'active'
            and passenger_trip.deleted_at is null
            and passenger_trip.departure_time > now()
            and passenger_trip.created_by = ride_requests.passenger_id
            and passenger_trip.created_by <> (select auth.uid())::text
        )
        and exists (
          select 1
          from public.trips driver_trip
          where driver_trip.id = ride_requests.driver_trip_id
            and driver_trip.role = 'driver'
            and driver_trip.created_by = (select auth.uid())::text
            and driver_trip.status = 'active'
            and driver_trip.deleted_at is null
            and driver_trip.departure_time > now()
        )
      )
      or coalesce((
        select up.is_admin
        from public.user_profiles up
        where up.id = (select auth.uid())::text
      ), false)
    )
  );
