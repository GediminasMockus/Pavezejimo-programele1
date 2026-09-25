export type RoutePoint = [lat: number, lng: number];

export interface DrivingRoute {
  coordinates: RoutePoint[];
  distance: number;
}

const roadDistanceCache = new Map<string, Promise<number | null>>();
let activeDistanceRequests = 0;
const distanceWaiters: Array<() => void> = [];

async function withDistanceSlot<T>(task: () => Promise<T>): Promise<T> {
  if (activeDistanceRequests >= 3) await new Promise<void>(resolve => distanceWaiters.push(resolve));
  else activeDistanceRequests += 1;
  try { return await task(); }
  finally {
    const next = distanceWaiters.shift();
    if (next) next();
    else activeDistanceRequests -= 1;
  }
}

/** Distance only; keep the full geometry request for the map preview. */
export function fetchDrivingDistance(points: RoutePoint[]): Promise<number | null> {
  if (points.length < 2) return Promise.resolve(null);
  const coordinates = points.map(([lat, lng]) => `${lng},${lat}`).join(';');
  const cached = roadDistanceCache.get(coordinates);
  if (cached) return cached;
  const request = withDistanceSlot(async () => {
    try {
      const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=false&steps=false`);
      if (!response.ok) return null;
      const json = await response.json();
      const distance = json.routes?.[0]?.distance;
      return Number.isFinite(distance) ? distance / 1000 : null;
    } catch { return null; }
  }).then(distance => {
    if (distance === null) roadDistanceCache.delete(coordinates);
    return distance;
  });
  roadDistanceCache.set(coordinates, request);
  if (roadDistanceCache.size > 200) roadDistanceCache.delete(roadDistanceCache.keys().next().value!);
  return request;
}

export async function fetchDrivingRoute(
  points: RoutePoint[],
  signal?: AbortSignal,
): Promise<DrivingRoute | null> {
  if (points.length < 2) return null;

  try {
    const coordinates = points.map(([lat, lng]) => `${lng},${lat}`).join(';');
    const response = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=false`,
      { signal },
    );
    if (!response.ok) return null;

    const json = await response.json();
    const route = json.routes?.[0];
    if (!route || !Number.isFinite(route.distance) || !Array.isArray(route.geometry?.coordinates)) return null;

    const routeCoordinates: RoutePoint[] = route.geometry.coordinates
      .filter((coordinate: unknown): coordinate is [number, number] =>
        Array.isArray(coordinate)
        && coordinate.length >= 2
        && Number.isFinite(coordinate[0])
        && Number.isFinite(coordinate[1]))
      .map(([lng, lat]: [number, number]) => [lat, lng]);

    if (routeCoordinates.length < 2) return null;
    return { coordinates: routeCoordinates, distance: route.distance / 1000 };
  } catch {
    return null;
  }
}
