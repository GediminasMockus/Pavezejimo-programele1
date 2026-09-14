drop policy if exists insert_ride_requests_v3 on public.ride_requests;
create policy insert_ride_requests_v3
on public.ride_requests
for insert
to authenticated
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
    or coalesce((select f.is_admin from public.get_my_profile_flags() f), false)
  )
);

drop policy if exists select_ride_requests_auth on public.ride_requests;
create policy select_ride_requests_auth
on public.ride_requests
for select
to authenticated
using (
  passenger_id = (select auth.uid())::text
  or driver_id = (select auth.uid())::text
  or exists (
    select 1
    from public.trips t
    where t.id = ride_requests.trip_id
      and t.created_by = (select auth.uid())::text
  )
  or exists (
    select 1
    from public.trips t
    where t.id = ride_requests.driver_trip_id
      and t.created_by = (select auth.uid())::text
  )
  or coalesce((select f.is_admin from public.get_my_profile_flags() f), false)
);
