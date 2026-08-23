import { useState } from 'react';
import { Filter, X, RotateCcw, Repeat } from 'lucide-react';

export interface FilterState {
  fromLocation: string;
  toLocation: string;
  date: string;
  minSeats: number;
  maxPrice: string;
  recurringOnly: boolean;
}

export const emptyFilters: FilterState = {
  fromLocation: '',
  toLocation: '',
  date: '',
  minSeats: 0,
  maxPrice: '',
  recurringOnly: false,
};

export function FilterBar({
  filters,
  onChange,
  resultCount,
}: {
  filters: FilterState;
  onChange: (f: FilterState) => void;
  resultCount: number;
}) {
  const [open, setOpen] = useState(false);
  const activeCount =
    (filters.fromLocation ? 1 : 0) +
    (filters.toLocation ? 1 : 0) +
    (filters.date ? 1 : 0) +
    (filters.minSeats > 0 ? 1 : 0) +
    (filters.maxPrice ? 1 : 0) +
    (filters.recurringOnly ? 1 : 0);

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setOpen(!open)}
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold transition-all shadow-md ${
            open || activeCount > 0
              ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-blue-500/30'
              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 hover:border-blue-300'
          }`}
        >
          <Filter className="w-4 h-4" />
          Filtruoti
          {activeCount > 0 && (
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-white/25 text-xs">
              {activeCount}
            </span>
          )}
        </button>
        <span className="text-sm text-slate-600 font-medium">{resultCount} skelbimų</span>
        {activeCount > 0 && (
          <button
            onClick={() => onChange(emptyFilters)}
            className="ml-auto inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 hover:bg-slate-100 px-2 py-1 rounded-lg transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Išvalyti
          </button>
        )}
      </div>

      {open && (
        <div className="mt-3 rounded-2xl bg-white border border-slate-200 p-4 shadow-sm flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">Filtravimo kriterijai</h3>
            <button
              onClick={() => setOpen(false)}
              className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-slate-500">Iš kur</span>
              <input
                type="text"
                value={filters.fromLocation}
                onChange={(e) => onChange({ ...filters, fromLocation: e.target.value })}
                placeholder="pvz. Vilnius"
                className="form-input mt-1"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-500">Į kur</span>
              <input
                type="text"
                value={filters.toLocation}
                onChange={(e) => onChange({ ...filters, toLocation: e.target.value })}
                placeholder="pvz. Trakai"
                className="form-input mt-1"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-slate-500">Data</span>
              <input
                type="date"
                value={filters.date}
                onChange={(e) => onChange({ ...filters, date: e.target.value })}
                className="form-input mt-1"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-500">Min. vietų</span>
              <select
                value={filters.minSeats}
                onChange={(e) => onChange({ ...filters, minSeats: Number(e.target.value) })}
                className="form-input mt-1"
              >
                <option value={0}>Bet kiek</option>
                <option value={1}>1+</option>
                <option value={2}>2+</option>
                <option value={3}>3+</option>
                <option value={4}>4+</option>
              </select>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-slate-500">Max kaina, €</span>
              <input
                type="text"
                inputMode="decimal"
                value={filters.maxPrice}
                onChange={(e) => onChange({ ...filters, maxPrice: e.target.value })}
                placeholder="pvz. 10"
                className="form-input mt-1"
              />
            </label>
            <label className="flex items-center gap-2 mt-6 cursor-pointer">
              <input
                type="checkbox"
                checked={filters.recurringOnly}
                onChange={(e) => onChange({ ...filters, recurringOnly: e.target.checked })}
                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-slate-600 flex items-center gap-1">
                <Repeat className="w-3.5 h-3.5 text-blue-500" />
                Tik pasikartojantys
              </span>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

export function applyFilters(trips: import('@/lib/supabase').Trip[], filters: FilterState): import('@/lib/supabase').Trip[] {
  return trips.filter((t) => {
    if (filters.fromLocation) {
      if (!t.from_location.toLowerCase().includes(filters.fromLocation.toLowerCase())) return false;
    }
    if (filters.toLocation) {
      if (!t.to_location.toLowerCase().includes(filters.toLocation.toLowerCase())) return false;
    }
    if (filters.date) {
      const tripDate = new Date(t.departure_time).toISOString().slice(0, 10);
      if (tripDate !== filters.date) return false;
    }
    if (filters.minSeats > 0 && t.seats < filters.minSeats) return false;
    if (filters.maxPrice) {
      const max = parseFloat(filters.maxPrice);
      if (!isNaN(max) && (t.price === null || t.price > max)) return false;
    }
    if (filters.recurringOnly && !t.is_recurring) return false;
    return true;
  });
}
