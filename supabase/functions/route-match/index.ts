import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Point = { lat: number; lng: number };
type Route = { distanceKm: number; geometry: [number, number][] };

const MAX_DISTANCE_KM = 1000;
const MAX_DETOUR_PCT = 200;

function validPoint(point: unknown): point is Point {
  if (!point || typeof point !== 'object') return false;
  const value = point as Record<string, unknown>;
  return Number.isFinite(value.lat) && Number.isFinite(value.lng)
    && Number(value.lat) >= -90 && Number(value.lat) <= 90
    && Number(value.lng) >= -180 && Number(value.lng) <= 180;
}

function toRad(value: number) { return (value * Math.PI) / 180; }

function haversineKm(a: Point, b: Point) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

function pointToSegmentKm(point: Point, a: Point, b: Point) {
  // Equirectangular projection is sufficiently accurate for short road segments.
  const lat = toRad(point.lat);
  const cosLat = Math.cos(lat);
  const ax = a.lng * cosLat;
  const ay = a.lat;
  const bx = b.lng * cosLat;
  const by = b.lat;
  const px = point.lng * cosLat;
  const py = point.lat;
  const dx = bx - ax;
  const dy = by - ay;
  const denominator = dx * dx + dy * dy;
  const t = denominator === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / denominator));
  return haversineKm(point, { lat: ay + t * dy, lng: (ax + t * dx) / cosLat });
}

function nearestDistanceKm(point: Point, geometry: [number, number][]) {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 1; i < geometry.length; i += 1) {
    const a = { lat: geometry[i - 1][1], lng: geometry[i - 1][0] };
    const b = { lat: geometry[i][1], lng: geometry[i][0] };
    best = Math.min(best, pointToSegmentKm(point, a, b));
  }
  return best;
}

function routeDistance(points: Point[], route: Route) {
  return route.distanceKm;
}

async function getRoute(points: Point[], baseUrl: string, signal: AbortSignal): Promise<Route> {
  const coordinates = points.map((p) => `${p.lng},${p.lat}`).join(';');
  const url = `${baseUrl.replace(/\/$/, '')}/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=false`;
  const response = await fetch(url, {
    signal,
    headers: { 'Accept': 'application/json' },
  });
  if (!response.ok) throw new Error(`routing provider returned ${response.status}`);
  const json = await response.json();
  const route = json?.routes?.[0];
  if (!route || !Number.isFinite(route.distance) || !Array.isArray(route.geometry?.coordinates)) {
    throw new Error('routing provider returned no route');
  }
  return {
    distanceKm: route.distance / 1000,
    geometry: route.geometry.coordinates,
  };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return new Response(JSON.stringify({ error: 'method not allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  const routingBaseUrl = Deno.env.get('ROUTING_BASE_URL');
  if (!routingBaseUrl) {
    return new Response(JSON.stringify({ error: 'routing provider is not configured' }), { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  try {
    const body = await request.json();
    const driver = body?.driver as { from: Point; to: Point };
    const passenger = body?.passenger as { from: Point; to: Point };
    if (!validPoint(driver?.from) || !validPoint(driver?.to) || !validPoint(passenger?.from) || !validPoint(passenger?.to)) {
      return new Response(JSON.stringify({ error: 'invalid coordinates' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const allPoints = [driver.from, driver.to, passenger.from, passenger.to];
    if (allPoints.some((point) => haversineKm(driver.from, point) > MAX_DISTANCE_KM)) {
      return new Response(JSON.stringify({ error: 'route too long for matching' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const [driverRoute, detourRoute] = await Promise.all([
        getRoute([driver.from, driver.to], routingBaseUrl, controller.signal),
        getRoute([driver.from, passenger.from, passenger.to, driver.to], routingBaseUrl, controller.signal),
      ]);

      const pickupDetourKm = haversineKm(driver.from, passenger.from);
      const dropoffDetourKm = haversineKm(driver.to, passenger.to);
      const detourPct = driverRoute.distanceKm > 0
        ? Math.max(0, Math.min(MAX_DETOUR_PCT, ((detourRoute.distanceKm - driverRoute.distanceKm) / driverRoute.distanceKm) * 100))
        : null;

      // Sample passenger endpoints against the driver's actual road geometry.
      // This is intentionally conservative: route overlap is not inferred from
      // straight-line distance between city coordinates.
      const passengerGeometry = await getRoute([passenger.from, passenger.to], routingBaseUrl, controller.signal);
      const samples = passengerGeometry.geometry.filter((_, index) => index % Math.max(1, Math.floor(passengerGeometry.geometry.length / 30)) === 0);
      const onDriverRoute = samples.filter(([lng, lat]) => nearestDistanceKm({ lat, lng }, driverRoute.geometry) <= 2.0).length;
      const routeOverlapPct = samples.length ? (onDriverRoute / samples.length) * 100 : null;

      return new Response(JSON.stringify({
        driver_route_km: routeDistance([driver.from, driver.to], driverRoute),
        combined_route_km: detourRoute.distanceKm,
        passenger_route_km: passengerGeometry.distanceKm,
        pickup_detour_km: Number(pickupDetourKm.toFixed(2)),
        dropoff_detour_km: Number(dropoffDetourKm.toFixed(2)),
        detour_pct: detourPct == null ? null : Number(detourPct.toFixed(2)),
        route_overlap_pct: routeOverlapPct == null ? null : Number(routeOverlapPct.toFixed(2)),
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'route matching failed';
    const status = message.includes('aborted') ? 504 : 502;
    return new Response(JSON.stringify({ error: message }), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
