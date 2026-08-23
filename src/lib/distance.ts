export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

export interface DetourInfo {
  originalDistance: number;
  newDistance: number;
  detour: number;
}

export function calculateDetour(
  driverFromLat: number,
  driverFromLng: number,
  driverToLat: number,
  driverToLng: number,
  pickupLat: number | null,
  pickupLng: number | null,
  dropoffLat: number | null,
  dropoffLng: number | null,
): DetourInfo | null {
  if (pickupLat === null || pickupLng === null || dropoffLat === null || dropoffLng === null) {
    return null;
  }

  const original = haversineDistance(driverFromLat, driverFromLng, driverToLat, driverToLng);
  const leg1 = haversineDistance(driverFromLat, driverFromLng, pickupLat, pickupLng);
  const leg2 = haversineDistance(pickupLat, pickupLng, dropoffLat, dropoffLng);
  const leg3 = haversineDistance(dropoffLat, dropoffLng, driverToLat, driverToLng);
  const newDistance = leg1 + leg2 + leg3;
  const detour = newDistance - original;

  return {
    originalDistance: original,
    newDistance,
    detour: Math.max(0, detour),
  };
}
