import { useEffect, useState } from 'react';
import { supabase, type Trip, type TripRole } from './supabase';
import type { FilterState } from './tripFilters';

export type CorridorSearchRoute = {
  from: { lat: number; lng: number; display_name: string };
  to: { lat: number; lng: number; display_name: string };
};

export type CorridorMatch = {
  trip: Trip;
  score: number;
  reasons: string[];
  pickupDistanceKm: number;
  dropoffDistanceKm: number;
  detourKm: number;
  detourPct: number;
  estimatedPickupTime: string;
  searchRoute: CorridorSearchRoute;
};

export function useCorridorMatches(role: TripRole, filters: FilterState) {
  const [matches, setMatches] = useState<CorridorMatch[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fromLocation = filters.fromLocation.trim();
    const toLocation = filters.toLocation.trim();
    if (!fromLocation || !toLocation) {
      setMatches([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke('corridor-match', {
        body: {
          action: 'search', role, fromLocation, toLocation, date: filters.date || null,
          seats: Math.max(1, filters.minSeats || 1),
        },
      });
      if (!cancelled) {
        setMatches(error || !Array.isArray(data?.matches) ? [] : data.matches as CorridorMatch[]);
        setLoading(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [role, filters.fromLocation, filters.toLocation, filters.date, filters.minSeats]);

  return { matches, loading };
}
