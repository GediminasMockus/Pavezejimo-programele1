import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { evaluateCorridor, type CorridorEvaluation } from '../_shared/corridor.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, 'Content-Type': 'application/json' },
});

type Point = { lat: number; lng: number };
type Role = 'driver' | 'passenger';
type TripRow = {
  id: string;
  role: Role;
  from_location: string;
  to_location: string;
  from_area?: string | null;
  to_area?: string | null;
  from_lat: number | null;
  from_lng: number | null;
  to_lat: number | null;
  to_lng: number | null;
  departure_time: string;
  seats: number;
  created_by: string | null;
  name?: string;
  price?: number | null;
  price_unit?: string;
  baggage?: string | null;
  notes?: string | null;
  created_at?: string;
  status?: string;
  is_recurring?: boolean;
};
type PublicTrip = TripRow & { available_seats?: number } & Record<string, unknown>;
type RoadRoute = { distanceKm: number; durationMinutes: number; geometry: [number, number][] };
type SearchRoute = { from: Point & { display_name: string }; to: Point & { display_name: string } };
type MatchResult = { tripId: string; evaluation: CorridorEvaluation; searchRoute: SearchRoute; estimatedPickupTime: string };

const MAX_CANDIDATES = 12;
const MAX_RESULTS = 5;

function validCoordinates(trip: TripRow) {
  return [trip.from_lat, trip.from_lng, trip.to_lat, trip.to_lng].every(value => typeof value === 'number' && Number.isFinite(value));
}

function point(trip: TripRow, side: 'from' | 'to'): Point {
  return { lat: trip[`${side}_lat`]!, lng: trip[`${side}_lng`]! };
}

function toRad(value: number) { return value * Math.PI / 180; }

function haversineKm(a: Point, b: Point) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

function approximatePairDistance(driver: TripRow, passenger: TripRow) {
  return haversineKm(point(driver, 'from'), point(passenger, 'from'))
    + haversineKm(point(driver, 'to'), point(passenger, 'to'));
}

function nearestOnRoute(target: Point, geometry: [number, number][]) {
  const segmentLengths: number[] = [];
  let totalKm = 0;
  for (let index = 1; index < geometry.length; index += 1) {
    const length = haversineKm(
      { lat: geometry[index - 1][1], lng: geometry[index - 1][0] },
      { lat: geometry[index][1], lng: geometry[index][0] },
    );
    segmentLengths.push(length);
    totalKm += length;
  }

  let bestDistance = Number.POSITIVE_INFINITY;
  let bestAlongKm = 0;
  let travelledKm = 0;
  for (let index = 1; index < geometry.length; index += 1) {
    const a = { lat: geometry[index - 1][1], lng: geometry[index - 1][0] };
    const b = { lat: geometry[index][1], lng: geometry[index][0] };
    const referenceLat = toRad(target.lat);
    const cosLat = Math.max(0.1, Math.cos(referenceLat));
    const ax = a.lng * cosLat;
    const ay = a.lat;
    const bx = b.lng * cosLat;
    const by = b.lat;
    const px = target.lng * cosLat;
    const py = target.lat;
    const dx = bx - ax;
    const dy = by - ay;
    const denominator = dx * dx + dy * dy;
    const ratio = denominator === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / denominator));
    const projected = { lat: ay + ratio * dy, lng: (ax + ratio * dx) / cosLat };
    const distance = haversineKm(target, projected);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestAlongKm = travelledKm + segmentLengths[index - 1] * ratio;
    }
    travelledKm += segmentLengths[index - 1];
  }
  return { distanceKm: bestDistance, progress: totalKm > 0 ? bestAlongKm / totalKm : 0 };
}

async function getRoadRoute(points: Point[], baseUrl: string, includeGeometry = false): Promise<RoadRoute> {
  const coordinates = points.map(item => `${item.lng},${item.lat}`).join(';');
  const overview = includeGeometry ? 'simplified' : 'false';
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/route/v1/driving/${coordinates}?overview=${overview}&geometries=geojson&steps=false`, {
    signal: AbortSignal.timeout(25_000),
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`routing provider returned ${response.status}`);
  const json = await response.json();
  const route = json?.routes?.[0];
  if (!route || !Number.isFinite(route.distance) || !Number.isFinite(route.duration)
    || (includeGeometry && !Array.isArray(route.geometry?.coordinates))) {
    throw new Error('routing provider returned no route');
  }
  return { distanceKm: route.distance / 1000, durationMinutes: route.duration / 60, geometry: route.geometry?.coordinates ?? [] };
}

async function geocode(location: string): Promise<Point & { display_name: string }> {
  const endpoint = new URL(Deno.env.get('GEOCODING_URL') ?? 'https://nominatim.openstreetmap.org/search');
  endpoint.search = new URLSearchParams({ format: 'json', q: location, limit: '1', countrycodes: 'lt' }).toString();
  const response = await fetch(endpoint, {
    signal: AbortSignal.timeout(8000),
    headers: { 'User-Agent': Deno.env.get('GEOCODING_USER_AGENT') ?? 'PriemiescioPavezejimai/1.0', Accept: 'application/json' },
  });
  if (!response.ok) throw new Error('location lookup failed');
  const [result] = await response.json();
  const lat = Number(result?.lat);
  const lng = Number(result?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error('location not found');
  return { lat, lng, display_name: location };
}

function localDate(value: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vilnius', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
}

function publicLocation(area: string | null | undefined, location: string) {
  return area?.trim() || location.split(',')[0].trim();
}

function toPublicTrip(trip: TripRow, availableSeats: number): PublicTrip {
  const roundCoordinate = (value: number | null) => value === null ? null : Math.round(value * 100) / 100;
  return {
    id: trip.id,
    role: trip.role,
    from_location: publicLocation(trip.from_area, trip.from_location),
    to_location: publicLocation(trip.to_area, trip.to_location),
    from_lat: roundCoordinate(trip.from_lat),
    from_lng: roundCoordinate(trip.from_lng),
    to_lat: roundCoordinate(trip.to_lat),
    to_lng: roundCoordinate(trip.to_lng),
    departure_time: trip.departure_time,
    name: trip.name,
    seats: trip.seats,
    price: trip.price,
    price_unit: trip.price_unit,
    baggage: trip.baggage,
    notes: trip.notes,
    created_at: trip.created_at,
    available_seats: availableSeats,
    status: trip.status ?? 'active',
    created_by: trip.created_by,
    is_recurring: trip.is_recurring ?? false,
  };
}

async function evaluatePair(
  driver: TripRow,
  passenger: TripRow,
  resultTripId: string,
  seatsAvailable: number,
  desiredPickupTime: string | null,
  routingBaseUrl: string,
  driverRouteCache: Map<string, Promise<RoadRoute>>,
  searchRoute: SearchRoute,
): Promise<MatchResult | null> {
  if (!validCoordinates(driver) || !validCoordinates(passenger)) return null;
  const cacheKey = `${driver.from_lat},${driver.from_lng}:${driver.to_lat},${driver.to_lng}`;
  let driverRoutePromise = driverRouteCache.get(cacheKey);
  if (!driverRoutePromise) {
    driverRoutePromise = getRoadRoute([point(driver, 'from'), point(driver, 'to')], routingBaseUrl, true);
    driverRouteCache.set(cacheKey, driverRoutePromise);
  }
  const combinedPromise = getRoadRoute([
    point(driver, 'from'),
    point(passenger, 'from'),
    point(passenger, 'to'),
    point(driver, 'to'),
  ], routingBaseUrl);
  const [driverRoute, combined] = await Promise.all([driverRoutePromise, combinedPromise]);
  const pickup = nearestOnRoute(point(passenger, 'from'), driverRoute.geometry);
  const dropoff = nearestOnRoute(point(passenger, 'to'), driverRoute.geometry);
  if (dropoff.progress - pickup.progress < 0.01) return null;
  const detourKm = Math.max(0, combined.distanceKm - driverRoute.distanceKm);
  const detourPct = driverRoute.distanceKm > 0 ? detourKm / driverRoute.distanceKm * 100 : 100;
  const estimatedPickup = new Date(new Date(driver.departure_time).getTime() + pickup.progress * driverRoute.durationMinutes * 60_000);
  const passageDifference = desiredPickupTime
    ? Math.abs(estimatedPickup.getTime() - new Date(desiredPickupTime).getTime()) / 60_000
    : null;
  const evaluation = evaluateCorridor({
    pickupDistanceKm: pickup.distanceKm,
    dropoffDistanceKm: dropoff.distanceKm,
    pickupProgress: pickup.progress,
    dropoffProgress: dropoff.progress,
    detourKm,
    detourPct,
    passageTimeDifferenceMinutes: passageDifference,
    seatsAvailable,
    seatsNeeded: passenger.seats,
  });
  if (!evaluation.qualifies) return null;
  return { tripId: resultTripId, evaluation, searchRoute, estimatedPickupTime: estimatedPickup.toISOString() };
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, mapper: (item: T) => Promise<R>) {
  const results: R[] = [];
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return reply({ error: 'method not allowed' }, 405);
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const routingBaseUrl = Deno.env.get('ROUTING_BASE_URL') ?? 'https://router.project-osrm.org';
  if (!supabaseUrl || !anonKey || !serviceKey) return reply({ error: 'service is not configured' }, 503);

  const authorization = request.headers.get('Authorization') ?? '';
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return reply({ error: 'unauthorized' }, 401);
  const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  try {
    const body = await request.json();
    const action = body?.action;
    let subject: TripRow;
    let searchRoute: SearchRoute;
    let requestedDate: string | null = null;

    if (action === 'search') {
      const role = body?.role as Role;
      const fromLocation = String(body?.fromLocation ?? '').trim();
      const toLocation = String(body?.toLocation ?? '').trim();
      if (!['driver', 'passenger'].includes(role) || fromLocation.length < 2 || toLocation.length < 2) return reply({ error: 'invalid search' }, 400);
      const from = await geocode(fromLocation);
      await new Promise(resolve => setTimeout(resolve, 1100));
      const to = await geocode(toLocation);
      searchRoute = { from, to };
      requestedDate = /^\d{4}-\d{2}-\d{2}$/.test(body?.date) ? body.date : null;
      subject = {
        id: 'search', role, from_location: fromLocation, to_location: toLocation,
        from_lat: from.lat, from_lng: from.lng, to_lat: to.lat, to_lng: to.lng,
        departure_time: new Date().toISOString(), seats: Math.max(1, Math.min(8, Number(body?.seats) || 1)), created_by: user.id,
      };
    } else if (action === 'notify') {
      const tripId = String(body?.tripId ?? '');
      const { data: trip } = await service.from('trips').select('*').eq('id', tripId).eq('created_by', user.id).maybeSingle();
      if (!trip) return reply({ error: 'trip not found' }, 404);
      subject = trip as TripRow;
      if (!validCoordinates(subject)) return reply({ notified: 0, reason: 'trip coordinates missing' });
      searchRoute = {
        from: { ...point(subject, 'from'), display_name: subject.from_location },
        to: { ...point(subject, 'to'), display_name: subject.to_location },
      };
    } else {
      return reply({ error: 'invalid action' }, 400);
    }

    const oppositeRole: Role = subject.role === 'driver' ? 'passenger' : 'driver';
    const { data: candidatesData, error: candidatesError } = await service.from('trips')
      .select('*').eq('role', oppositeRole).eq('status', 'active').is('deleted_at', null)
      .neq('created_by', user.id).gt('departure_time', new Date().toISOString()).limit(100);
    if (candidatesError) throw candidatesError;
    const candidates = (candidatesData ?? []).filter(validCoordinates) as TripRow[];
    const ids = candidates.map(item => item.id);
    const acceptedSeatsByTrip = new Map<string, number>();
    if (ids.length) {
      const { data, error } = await service.from('ride_requests')
        .select('trip_id,driver_trip_id,seats_needed')
        .eq('status', 'accepted')
        .or(`trip_id.in.(${ids.join(',')}),driver_trip_id.in.(${ids.join(',')})`);
      if (error) throw error;
      for (const request of data ?? []) {
        const tripId = request.driver_trip_id ?? request.trip_id;
        if (tripId && ids.includes(tripId)) {
          acceptedSeatsByTrip.set(tripId, (acceptedSeatsByTrip.get(tripId) ?? 0) + Number(request.seats_needed || 0));
        }
      }
    }
    // The public_trips view uses security-invoker RLS, so a caller cannot read
    // an unrelated trip until a request exists. Build the same safe projection
    // inside this authenticated function and never return private trip fields.
    const publicById = new Map(candidates.map(candidate => {
      const availableSeats = candidate.role === 'driver'
        ? Math.max(0, candidate.seats - (acceptedSeatsByTrip.get(candidate.id) ?? 0))
        : candidate.seats;
      return [candidate.id, toPublicTrip(candidate, availableSeats)];
    }));

    const ranked = candidates
      .filter(candidate => !requestedDate || localDate(candidate.departure_time) === requestedDate)
      .map(candidate => {
        const driver = subject.role === 'driver' ? subject : candidate;
        const passenger = subject.role === 'passenger' ? subject : candidate;
        return { candidate, distance: approximatePairDistance(driver, passenger) };
      })
      .sort((a, b) => a.distance - b.distance)
      .slice(0, MAX_CANDIDATES)
      .map(item => item.candidate);

    const routeCache = new Map<string, Promise<RoadRoute>>();
    let evaluationFailures = 0;
    const evaluated = await mapWithConcurrency(ranked, 3, async candidate => {
      const driver = subject.role === 'driver' ? subject : candidate;
      const passenger = subject.role === 'passenger' ? subject : candidate;
      const driverPublic = publicById.get(driver.id);
      const seatsAvailable = Number(driverPublic?.available_seats ?? driver.seats);
      const desiredTime = action === 'notify' ? passenger.departure_time : null;
      try { return await evaluatePair(driver, passenger, candidate.id, seatsAvailable, desiredTime, routingBaseUrl, routeCache, searchRoute); }
      catch (error) {
        evaluationFailures += 1;
        console.error('corridor candidate evaluation failed', { candidateId: candidate.id, error });
        return null;
      }
    });
    if (ranked.length > 0 && evaluationFailures === ranked.length) {
      return reply({ error: 'routing temporarily unavailable' }, 502);
    }
    const matches = evaluated.filter((item): item is MatchResult => Boolean(item))
      .sort((a, b) => b.evaluation.score - a.evaluation.score)
      .slice(0, MAX_RESULTS);

    if (action === 'search') {
      const results = matches.flatMap(match => {
        const trip = publicById.get(match.tripId);
        return trip ? [{ trip, ...match.evaluation, estimatedPickupTime: match.estimatedPickupTime, searchRoute: match.searchRoute }] : [];
      });
      return reply({ matches: results });
    }

    const notificationType = subject.role === 'driver' ? 'auto_match_driver' : 'auto_match_passenger';
    const recipientByTrip = new Map(candidates.map(candidate => [candidate.id, candidate.created_by]));
    const recipientIds = matches.map(match => recipientByTrip.get(match.tripId)).filter((id): id is string => Boolean(id));
    const { data: existing } = recipientIds.length
      ? await service.from('notifications').select('user_id').eq('type', notificationType).eq('related_trip_id', subject.id).in('user_id', recipientIds)
      : { data: [] };
    const existingUsers = new Set((existing ?? []).map(item => item.user_id));
    const notifications = matches.flatMap(match => {
      const recipient = recipientByTrip.get(match.tripId);
      if (!recipient || existingUsers.has(recipient)) return [];
      const detour = match.evaluation.detourKm.toFixed(0);
      return [{
        user_id: recipient,
        type: notificationType,
        title: subject.role === 'driver' ? 'Atsirado pakeleivingas vairuotojas!' : 'Atsirado pakeleivingas keleivis!',
        message: `${subject.from_area || subject.from_location} → ${subject.to_area || subject.to_location} tinka pagal realų kelią. Vairuotojui papildomai apie ${detour} km.`,
        related_trip_id: subject.id,
      }];
    });
    if (notifications.length) {
      const { error } = await service.from('notifications').insert(notifications);
      if (error && error.code !== '23505') throw error;
    }
    return reply({ notified: notifications.length });
  } catch (error) {
    console.error(error);
    return reply({ error: 'corridor matching failed' }, 502);
  }
});
