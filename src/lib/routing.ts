export type RoutePoint = [lat: number, lng: number];

export interface DrivingRoute {
  coordinates: RoutePoint[];
  distance: number;
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
