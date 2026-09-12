import type { RideRequest, Trip } from './supabase';
export function navigationUrl(trip: Trip, request?: RideRequest | null): string {
  const point = (lat: number | null, lng: number | null, label: string) => lat != null && lng != null ? lat + ',' + lng : label;
  const params = new URLSearchParams({api: '1', travelmode: 'driving', origin: point(trip.from_lat, trip.from_lng, trip.from_location), destination: point(trip.to_lat, trip.to_lng, trip.to_location)});
  if (request) params.set('waypoints', [point(request.pickup_lat, request.pickup_lng, request.pickup_location), point(request.dropoff_lat, request.dropoff_lng, request.dropoff_location)].join('|'));
  return 'https://www.google.com/maps/dir/?' + params.toString();
}
