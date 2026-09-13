import type { RideRequest, Trip } from '@/lib/supabase';

export const LISTING_RETENTION_MS = 24 * 60 * 60 * 1000;

export function isWithinListingWindow(trip: Pick<Trip, 'departure_time' | 'is_recurring'>, now = Date.now()): boolean {
  if (trip.is_recurring) return true;
  return new Date(trip.departure_time).getTime() > now - LISTING_RETENTION_MS;
}

export function isPastDeparture(trip: Pick<Trip, 'departure_time'>, now = Date.now()): boolean {
  return new Date(trip.departure_time).getTime() <= now;
}

export function listingRemovalAt(trip: Pick<Trip, 'departure_time' | 'is_recurring'>): number | null {
  if (trip.is_recurring) return null;
  return new Date(trip.departure_time).getTime() + LISTING_RETENTION_MS;
}

export function remainingListingHours(trip: Pick<Trip, 'departure_time' | 'is_recurring'>, now = Date.now()): number | null {
  const removalAt = listingRemovalAt(trip);
  if (removalAt === null) return null;
  return Math.max(0, Math.ceil((removalAt - now) / (60 * 60 * 1000)));
}

const requestPriority: Record<RideRequest['status'], number> = {
  accepted: 0,
  pending: 1,
  rejected: 2,
  cancelled: 3,
};

export function sortRequestsByPriority<T extends Pick<RideRequest, 'status' | 'created_at'>>(requests: T[]): T[] {
  return [...requests].sort((a, b) => {
    const byStatus = requestPriority[a.status] - requestPriority[b.status];
    if (byStatus !== 0) return byStatus;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}
