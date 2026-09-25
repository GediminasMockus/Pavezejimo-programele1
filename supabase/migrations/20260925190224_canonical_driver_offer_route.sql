-- Driver offers arrive from public cards whose coordinates are rounded.
-- Copy the address and coordinates together from the authoritative passenger trip.
CREATE SCHEMA IF NOT EXISTS private;
CREATE OR REPLACE FUNCTION private.canonical_driver_offer_route()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE passenger public.trips;
BEGIN
  IF NEW.request_type <> 'driver_offer' THEN RETURN NEW; END IF;
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.trips d WHERE d.id = NEW.driver_trip_id
      AND d.role = 'driver' AND d.created_by = auth.uid()::text
      AND d.created_by = NEW.driver_id
  ) THEN RAISE EXCEPTION 'not authorized'; END IF;
  SELECT * INTO passenger FROM public.trips p WHERE p.id = NEW.trip_id
    AND p.role = 'passenger' AND p.created_by = NEW.passenger_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid passenger trip'; END IF;
  NEW.pickup_location := passenger.from_location;
  NEW.pickup_lat := passenger.from_lat;
  NEW.pickup_lng := passenger.from_lng;
  NEW.dropoff_location := passenger.to_location;
  NEW.dropoff_lat := passenger.to_lat;
  NEW.dropoff_lng := passenger.to_lng;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.canonical_driver_offer_route() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER canonical_driver_offer_route_before_insert
BEFORE INSERT ON public.ride_requests
FOR EACH ROW EXECUTE FUNCTION private.canonical_driver_offer_route();

-- Repair only active offers that still contain the rounded source coordinates.
UPDATE public.ride_requests r SET
  pickup_location = p.from_location, pickup_lat = p.from_lat, pickup_lng = p.from_lng,
  dropoff_location = p.to_location, dropoff_lat = p.to_lat, dropoff_lng = p.to_lng
FROM public.trips p
WHERE r.request_type = 'driver_offer' AND r.status IN ('pending', 'accepted')
  AND r.trip_id = p.id AND p.role = 'passenger' AND r.passenger_id = p.created_by
  AND r.pickup_lat = round(p.from_lat::numeric, 2)::double precision
  AND r.pickup_lng = round(p.from_lng::numeric, 2)::double precision
  AND r.dropoff_lat = round(p.to_lat::numeric, 2)::double precision
  AND r.dropoff_lng = round(p.to_lng::numeric, 2)::double precision;
