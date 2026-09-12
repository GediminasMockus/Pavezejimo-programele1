import type { Trip } from './supabase';
export interface FilterState {
  fromLocation: string;
  toLocation: string;
  date: string;
  minSeats: number;
  maxPrice: string;
  recurringOnly: boolean;
  radiusKm: number;
}

export const emptyFilters: FilterState = {
  fromLocation: '',
  toLocation: '',
  date: '',
  minSeats: 0,
  maxPrice: '',
  recurringOnly: false,
  radiusKm: 0,
};

export function applyFilters(trips: Trip[], filters: FilterState, userLat?: number | null, userLng?: number | null): Trip[] {
  return trips.filter(t => {
    if (filters.fromLocation && !locationMatches(t.from_location, filters.fromLocation)) return false;
    if (filters.toLocation && !locationMatches(t.to_location, filters.toLocation)) return false;
    if (filters.date && localDate(t.departure_time) !== filters.date) return false;
    if (filters.minSeats > 0 && (t.available_seats ?? t.seats) < filters.minSeats) return false;
    if (filters.maxPrice) {
      const max = Number(filters.maxPrice.replace(',', '.'));
      if (Number.isFinite(max) && (t.price === null || t.price > max)) return false;
    }
    if (filters.recurringOnly && !t.is_recurring) return false;
    if (filters.radiusKm > 0 && userLat != null && userLng != null) {
      if (t.from_lat == null || t.from_lng == null) return false;
      if (haversineDistance(userLat, userLng, t.from_lat, t.from_lng) > filters.radiusKm) return false;
    }
    return true;
  });
}

function locationMatches(a: string, b: string): boolean {
  const left = normalize(a);
  const right = normalize(b);
  return left.includes(right) || right.includes(left);
}

function normalize(value: string): string {
  return value.toLocaleLowerCase('lt-LT').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface TripMatch {
  trip: Trip;
  score: number;
  reasons: string[];
}

type MatchInput = Pick<Trip, 'role' | 'from_location' | 'to_location' | 'from_lat' | 'from_lng' | 'to_lat' | 'to_lng' | 'departure_time'> & Partial<Pick<Trip, 'price' | 'seats' | 'is_recurring'>>;

/**
 * Product-level matching score. The score is intentionally normalized to 0-100
 * so it can be shown to users as a match percentage.
 */
export function findBestMatches(userTrip: MatchInput, availableTrips: Trip[], limit = 5): TripMatch[] {
  const matches: TripMatch[] = [];
  const userTime = new Date(userTrip.departure_time).getTime();

  for (const trip of availableTrips) {
    if (trip.status !== 'active' || trip.deleted_at || trip.role === userTrip.role) continue;
    if (Math.abs(userTime - new Date(trip.departure_time).getTime()) > 60 * 60_000) continue;
    const driverSeats = userTrip.role === 'driver' ? userTrip.seats ?? 1 : trip.available_seats ?? trip.seats;
    const neededSeats = userTrip.role === 'passenger' ? userTrip.seats ?? 1 : trip.seats;
    if (driverSeats < neededSeats) continue;

    let score = 0;
    const reasons: string[] = [];

    const fromText = locationMatches(userTrip.from_location, trip.from_location);
    const toText = locationMatches(userTrip.to_location, trip.to_location);
    if (fromText) { score += 20; reasons.push('Išvykimo vieta sutampa'); }
    if (toText) { score += 20; reasons.push('Atvykimo vieta sutampa'); }

    let fromDistance: number | null = null;
    let toDistance: number | null = null;
    if (userTrip.from_lat != null && userTrip.from_lng != null && trip.from_lat != null && trip.from_lng != null) {
      fromDistance = haversineDistance(userTrip.from_lat, userTrip.from_lng, trip.from_lat, trip.from_lng);
      score += distanceScore(fromDistance, 20);
      if (fromDistance <= 2) reasons.push('Paėmimas iki 2 km');
      else if (fromDistance <= 10) reasons.push('Paėmimas netoliese');
    }
    if (userTrip.to_lat != null && userTrip.to_lng != null && trip.to_lat != null && trip.to_lng != null) {
      toDistance = haversineDistance(userTrip.to_lat, userTrip.to_lng, trip.to_lat, trip.to_lng);
      score += distanceScore(toDistance, 20);
      if (toDistance <= 2) reasons.push('Išlaipinimas iki 2 km');
      else if (toDistance <= 10) reasons.push('Išlaipinimas netoliese');
    }

    const timeDiffMinutes = Math.abs(userTime - new Date(trip.departure_time).getTime()) / 60000;
    const timeScore = timeDiffMinutes <= 15 ? 15 : timeDiffMinutes <= 30 ? 12 : timeDiffMinutes <= 60 ? 8 : timeDiffMinutes <= 120 ? 4 : 0;
    score += timeScore;
    if (timeDiffMinutes <= 15) reasons.push('Laikas beveik sutampa');
    else if (timeDiffMinutes <= 60) reasons.push('Laikas tinkamas');

    // Capacity is a small confidence bonus, never the dominant factor.
    if ((trip.seats ?? 0) >= 2) { score += 3; reasons.push('Pakanka vietų'); }
    if (trip.is_recurring) { score += 2; reasons.push('Pasikartojanti kelionė'); }

    // Avoid presenting very weak matches as recommendations.
    if (score >= 35 && (fromDistance == null || fromDistance <= 50) && (toDistance == null || toDistance <= 50)) {
      matches.push({ trip, score: Math.min(100, Math.round(score)), reasons: reasons.slice(0, 5) });
    }
  }

  return matches.sort((a, b) => b.score - a.score || new Date(a.trip.departure_time).getTime() - new Date(b.trip.departure_time).getTime()).slice(0, limit);
}

function distanceScore(distanceKm: number, maxPoints: number): number {
  if (distanceKm <= 2) return maxPoints;
  if (distanceKm <= 5) return Math.round(maxPoints * 0.8);
  if (distanceKm <= 10) return Math.round(maxPoints * 0.6);
  if (distanceKm <= 20) return Math.round(maxPoints * 0.3);
  return 0;
}

function localDate(value: string) {
  const date = new Date(value);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}
