create or replace function public.set_ride_request_status(p_request_id uuid, p_status text, p_driver_message text default null::text)
returns public.ride_requests
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_request public.ride_requests;
  v_trip public.trips;
  v_driver_trip public.trips;
  v_used_seats integer;
  v_uid text;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  v_uid := auth.uid()::text;

  select * into v_request from public.ride_requests where id = p_request_id for update;
  if not found then raise exception 'request not found'; end if;
  select * into v_trip from public.trips where id = v_request.trip_id for update;
  if not found then raise exception 'trip not found'; end if;

  if v_request.completed_at is not null then
    raise exception 'completed request is immutable';
  end if;

  if p_status = 'cancelled' then
    if v_request.status not in ('pending', 'accepted') then raise exception 'request cannot be cancelled'; end if;
    if v_request.request_type = 'passenger_request' then
      if v_request.passenger_id <> v_uid and v_trip.created_by <> v_uid then raise exception 'not authorized'; end if;
    elsif v_request.request_type = 'driver_offer' then
      if v_request.passenger_id <> v_uid and v_request.driver_id <> v_uid then raise exception 'not authorized'; end if;
    else
      raise exception 'unsupported request type';
    end if;
    update public.ride_requests set status = 'cancelled', updated_at = now()
    where id = p_request_id returning * into v_request;
    return v_request;
  end if;

  if v_request.request_type = 'passenger_request' and v_trip.created_by = v_uid then
    if p_status not in ('accepted', 'rejected') then raise exception 'invalid driver status'; end if;
    if v_request.status <> 'pending' then raise exception 'request is no longer pending'; end if;
    if v_trip.status <> 'active' or v_trip.deleted_at is not null or v_trip.departure_time <= now() then raise exception 'trip is no longer active'; end if;
    if p_status = 'accepted' then
      select coalesce(sum(seats_needed), 0) into v_used_seats
      from public.ride_requests
      where trip_id = v_request.trip_id and request_type = 'passenger_request' and status = 'accepted' and id <> v_request.id;
      if v_used_seats + v_request.seats_needed > v_trip.seats then raise exception 'not enough seats'; end if;
    end if;
    update public.ride_requests
    set status = p_status, driver_message = coalesce(p_driver_message, driver_message), updated_at = now()
    where id = p_request_id returning * into v_request;
    return v_request;
  end if;

  if v_request.request_type = 'driver_offer' and v_request.passenger_id = v_uid then
    if p_status not in ('accepted', 'rejected') then raise exception 'invalid passenger status'; end if;
    if v_request.status <> 'pending' then raise exception 'offer is no longer pending'; end if;
    if v_trip.status <> 'active' or v_trip.deleted_at is not null or v_trip.departure_time <= now() then raise exception 'passenger trip is no longer active'; end if;
    if v_request.driver_trip_id is null then raise exception 'driver trip is missing'; end if;
    select * into v_driver_trip from public.trips where id = v_request.driver_trip_id for update;
    if not found or v_driver_trip.created_by <> v_request.driver_id or v_driver_trip.status <> 'active' or v_driver_trip.deleted_at is not null or v_driver_trip.departure_time <= now() then raise exception 'driver trip is no longer active'; end if;
    update public.ride_requests set status = p_status, updated_at = now()
    where id = p_request_id returning * into v_request;
    return v_request;
  end if;

  raise exception 'not authorized';
end;
$function$;

revoke all on function public.set_ride_request_status(uuid,text,text) from public, anon;
grant execute on function public.set_ride_request_status(uuid,text,text) to authenticated, service_role;
