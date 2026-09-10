import { useState } from 'react';
import { Filter, X, RotateCcw, Repeat } from 'lucide-react';
import type { Trip } from '@/lib/supabase';

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

export function FilterBar({ filters, onChange, resultCount }: {
  filters: FilterState;
  onChange: (f: FilterState) => void;
  resultCount: number;
}) {
  const [open, setOpen] = useState(false);
  const activeCount = [
    filters.fromLocation,
    filters.toLocation,
    filters.date,
    filters.minSeats > 0,
    filters.maxPrice,
    filters.recurringOnly,
    filters.radiusKm > 0,
  ].filter(Boolean).length;

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2">
        <button onClick={() => setOpen(v => !v)} className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold transition-all shadow-md ${open || activeCount ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'}`}>
          <Filter className="w-4 h-4" /> Filtruoti
          {activeCount > 0 && <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-white/25 text-xs">{activeCount}</span>}
        </button>
        <span className="text-sm text-slate-600 font-medium">{resultCount} skelbimų</span>
        {activeCount > 0 && (
          <button onClick={() => onChange(emptyFilters)} className="ml-auto inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 px-2 py-1 rounded-lg">
            <RotateCcw className="w-3.5 h-3.5" /> Išvalyti
          </button>
        )}
      </div>

      {open && (
        <div className="mt-3 rounded-2xl bg-white border border-slate-200 p-4 shadow-sm flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">Filtravimo kriterijai</h3>
            <button onClick={() => setOpen(false)} className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100" aria-label="Uždaryti filtrus"><X className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label><span className="text-xs font-medium text-slate-500">Iš kur</span><input value={filters.fromLocation} onChange={e => onChange({ ...filters, fromLocation: e.target.value })} placeholder="pvz. Vilnius" className="form-input mt-1" /></label>
            <label><span className="text-xs font-medium text-slate-500">Į kur</span><input value={filters.toLocation} onChange={e => onChange({ ...filters, toLocation: e.target.value })} placeholder="pvz. Trakai" className="form-input mt-1" /></label>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label><span className="text-xs font-medium text-slate-500">Data</span><input type="date" value={filters.date} onChange={e => onChange({ ...filters, date: e.target.value })} className="form-input mt-1" /></label>
            <label><span className="text-xs font-medium text-slate-500">Min. vietų</span><select value={filters.minSeats} onChange={e => onChange({ ...filters, minSeats: Number(e.target.value) })} className="form-input mt-1"><option value={0}>Bet kiek</option><option value={1}>1+</option><option value={2}>2+</option><option value={3}>3+</option><option value={4}>4+</option></select></label>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label><span className="text-xs font-medium text-slate-500">Max kaina, €</span><input inputMode="decimal" value={filters.maxPrice} onChange={e => onChange({ ...filters, maxPrice: e.target.value })} placeholder="pvz. 10" className="form-input mt-1" /></label>
            <label><span className="text-xs font-medium text-slate-500">Spindulys, km</span><select value={filters.radiusKm} onChange={e => onChange({ ...filters, radiusKm: Number(e.target.value) })} className="form-input mt-1"><option value={0}>Neribotas</option><option value={5}>5 km</option><option value={10}>10 km</option><option value={20}>20 km</option><option value={50}>50 km</option><option value={100}>100 km</option></select></label>
          </div>
          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={filters.recurringOnly} onChange={e => onChange({ ...filters, recurringOnly: e.target.checked })} className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" /><span className="text-sm text-slate-600 flex items-center gap-1"><Repeat className="w-3.5 h-3.5 text-blue-500" /> Tik pasikartojantys</span></label>
        </div>
      )}
    </div>
  );
}

export function applyFilters(trips: Trip[], filters: FilterState, userLat?: number | null, userLng?: number | null): Trip[] {
  return trips.filter(t => {
    if (filters.fromLocation && !locationMatches(t.from_location, filters.fromLocation)) return false;
    if (filters.toLocation && !locationMatches(t.to_location, filters.toLocation)) return false;
    if (filters.date && new Date(t.departure_time).toISOString().slice(0, 10) !== filters.date) return false;
    if (filters.minSeats > 0 && t.seats < filters.minSeats) return false;
    if (filters.maxPrice) {
      const max = Number(filters.maxPrice);
      if (Number.isFinite(max) && (t.price === null || t.price > max)) return false;
    }
    if (filters.recurringOnly && !t.is_recurring) return false;
    if (filters.radiusKm > 0 && userLat != null && userLng != null && t.from_lat != null && t.from_lng != null) {
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

type MatchInput = Pick<Trip, 'from_location' | 'to_location' | 'from_lat' | 'from_lng' | 'to_lat' | 'to_lng' | 'departure_time'> & Partial<Pick<Trip, 'price' | 'seats' | 'is_recurring'>>;

/**
 * Product-level matching score. The score is intentionally normalized to 0-100
 * so it can be shown to users as a match percentage.
 */
export function findBestMatches(userTrip: MatchInput, availableTrips: Trip[], limit = 5): TripMatch[] {
  const matches: TripMatch[] = [];
  const userTime = new Date(userTrip.departure_time).getTime();

  for (const trip of availableTrips) {
    if (trip.status !== 'active' || trip.deleted_at) continue;

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
