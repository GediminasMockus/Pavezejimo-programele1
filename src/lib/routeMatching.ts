import type { Trip } from './supabase';

export type RoutePoint = { lat: number; lng: number };

export interface RouteMatchInput {
  driver: Pick<Trip, 'from_lat' | 'from_lng' | 'to_lat' | 'to_lng' | 'departure_time' | 'seats' | 'price' | 'price_unit'>;
  passenger: Pick<Trip, 'from_lat' | 'from_lng' | 'to_lat' | 'to_lng' | 'departure_time' | 'seats' | 'price' | 'price_unit'>;
  pickupDetourKm?: number | null;
  dropoffDetourKm?: number | null;
  routeDetourPct?: number | null;
  routeOverlapPct?: number | null;
}

export interface RouteMatchResult {
  score: number;
  routeOverlapPct: number | null;
  detourPct: number | null;
  pickupDetourKm: number | null;
  dropoffDetourKm: number | null;
  timeDifferenceMinutes: number;
  reasons: string[];
}

const EARTH_RADIUS_KM = 6371;

function toRad(value: number) {
  return (value * Math.PI) / 180;
}

export function haversineKm(a: RoutePoint, b: RoutePoint): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

function coordinatesPresent(trip: RouteMatchInput['driver']) {
  return [trip.from_lat, trip.from_lng, trip.to_lat, trip.to_lng].every((value) => typeof value === 'number' && Number.isFinite(value));
}

function minutesBetween(a: string, b: string) {
  const delta = Math.abs(new Date(a).getTime() - new Date(b).getTime());
  return Math.round(delta / 60000);
}

/**
 * Scores a driver/passenger pair using road-routing metrics when supplied.
 * It deliberately does not pretend that straight-line distance is road overlap.
 * Until a routing provider returns detour/overlap, the coordinate score is only
 * a conservative fallback and the result is marked with null route metrics.
 */
export function scoreRouteMatch(input: RouteMatchInput): RouteMatchResult {
  const timeDifferenceMinutes = minutesBetween(input.driver.departure_time, input.passenger.departure_time);
  const reasons: string[] = [];
  let score = 0;

  if (input.routeOverlapPct != null) {
    const overlap = Math.max(0, Math.min(100, input.routeOverlapPct));
    score += overlap * 0.45;
    if (overlap >= 85) reasons.push('Kelionės maršrutas beveik sutampa');
    else if (overlap >= 65) reasons.push('Didelė maršruto dalis sutampa');
  } else if (coordinatesPresent(input.driver) && coordinatesPresent(input.passenger)) {
    const startDistance = haversineKm(
      { lat: input.driver.from_lat!, lng: input.driver.from_lng! },
      { lat: input.passenger.from_lat!, lng: input.passenger.from_lng! },
    );
    const endDistance = haversineKm(
      { lat: input.driver.to_lat!, lng: input.driver.to_lng! },
      { lat: input.passenger.to_lat!, lng: input.passenger.to_lng! },
    );
    score += Math.max(0, 20 - startDistance) * 0.5;
    score += Math.max(0, 20 - endDistance) * 0.5;
    reasons.push('Preliminarus atitikimas pagal koordinates');
  }

  const detourPct = input.routeDetourPct ?? null;
  if (detourPct != null) {
    if (detourPct <= 5) {
      score += 25;
      reasons.push('Beveik nėra papildomo apvažiavimo');
    } else if (detourPct <= 10) {
      score += 18;
      reasons.push('Nedidelis papildomas apvažiavimas');
    } else if (detourPct <= 20) {
      score += 10;
      reasons.push('Vidutinis papildomas apvažiavimas');
    }
  }

  if (timeDifferenceMinutes <= 15) {
    score += 20;
    reasons.push('Laikas beveik sutampa');
  } else if (timeDifferenceMinutes <= 30) {
    score += 15;
    reasons.push('Laikas gerai sutampa');
  } else if (timeDifferenceMinutes <= 60) {
    score += 8;
  }

  if (input.driver.seats >= input.passenger.seats) {
    score += 10;
    reasons.push('Pakanka vietų');
  }

  return {
    score: Math.round(Math.max(0, Math.min(100, score))),
    routeOverlapPct: input.routeOverlapPct ?? null,
    detourPct,
    pickupDetourKm: input.pickupDetourKm ?? null,
    dropoffDetourKm: input.dropoffDetourKm ?? null,
    timeDifferenceMinutes,
    reasons: reasons.slice(0, 5),
  };
}
