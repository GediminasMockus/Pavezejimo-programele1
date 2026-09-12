import { useEffect, useState } from 'react';
import { supabase, type Trip } from './supabase';
import { scoreRouteMatch } from './routeMatching';
import type { TripMatch } from './tripFilters';
export function useRoadMatches(ownTrip: Trip | undefined, candidates: TripMatch[]): TripMatch[] {
  const [matches, setMatches] = useState<TripMatch[]>([]);
  useEffect(() => {
    let cancelled = false;
    setMatches(candidates.map(item => ({ ...item, reasons: ['Preliminarus atitikimas', ...item.reasons] })));
    if (!ownTrip || !candidates.length) return;
    const current = ownTrip;
    async function load() {
      const results = await Promise.all(candidates.map(async candidate => {
        const driver = current.role === 'driver' ? current : candidate.trip;
        const passenger = current.role === 'passenger' ? current : candidate.trip;
        if ([driver.from_lat,driver.from_lng,driver.to_lat,driver.to_lng,passenger.from_lat,passenger.from_lng,passenger.to_lat,passenger.to_lng].some(value => value == null)) return candidate;
        const route = (trip: Trip) => ({ from: { lat: trip.from_lat, lng: trip.from_lng }, to: { lat: trip.to_lat, lng: trip.to_lng } });
        try {
          const { data, error } = await supabase.functions.invoke('route-match', { body: { driver: route(driver), passenger: route(passenger) } });
          if (error || !data) return { ...candidate, reasons: ['Preliminarus atitikimas', ...candidate.reasons] };
          const scored = scoreRouteMatch({ driver: { ...driver, seats: driver.available_seats ?? driver.seats }, passenger,
            routeOverlapPct: data.route_overlap_pct, routeDetourPct: data.detour_pct,
            pickupDetourKm: data.pickup_detour_km, dropoffDetourKm: data.dropoff_detour_km });
          return { trip: candidate.trip, score: scored.score, reasons: ['Pagal kelius, vietos apytikslės', ...scored.reasons] };
        } catch { return { ...candidate, reasons: ['Preliminarus atitikimas', ...candidate.reasons] }; }
      }));
      if (!cancelled) setMatches(results.sort((a,b) => b.score-a.score));
    }
    void load();
    return () => { cancelled = true; };
  }, [ownTrip, candidates]);
  return matches;
}
