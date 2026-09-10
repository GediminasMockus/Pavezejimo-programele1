/*
  Enforce the trip privacy boundary now that the client reads public trips
  through public_trips and the owner's full trip data through get_my_trips().

  Exact coordinates, phone number and plate are not public discovery data.
*/

REVOKE SELECT (phone, car_plate, from_lat, from_lng, to_lat, to_lng)
ON public.trips
FROM authenticated;

GRANT SELECT (
  id,
  role,
  from_location,
  to_location,
  departure_time,
  name,
  seats,
  price,
  price_unit,
  car_color,
  car_make,
  baggage,
  notes,
  deleted_at,
  deletion_reason,
  created_by,
  is_recurring,
  status,
  completed_at,
  created_at
)
ON public.trips
TO authenticated;
