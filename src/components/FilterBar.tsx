import { useEffect, useState } from 'react';
import { Filter, X, RotateCcw, Repeat, Search } from 'lucide-react';
import { emptyFilters, type FilterState } from '@/lib/tripFilters';

export function FilterBar({ filters, onChange, resultCount }: {
  filters: FilterState;
  onChange: (f: FilterState) => void;
  resultCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<FilterState>(filters);

  useEffect(() => setDraft(filters), [filters]);

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
        <button onClick={() => setOpen(v => !v)} className={`min-h-11 inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold transition-all shadow-md ${open || activeCount ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'}`}>
          <Filter className="w-4 h-4" /> Filtruoti
          {activeCount > 0 && <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-white/25 text-xs">{activeCount}</span>}
        </button>
        <span className="text-sm text-slate-600 font-medium">{resultCount} skelbimų</span>
        {activeCount > 0 && (
          <button onClick={() => { setDraft(emptyFilters); onChange(emptyFilters); }} className="ml-auto min-h-11 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 px-2 py-1 rounded-lg">
            <RotateCcw className="w-3.5 h-3.5" /> Išvalyti
          </button>
        )}
      </div>

      {open && (
        <div className="mt-3 rounded-2xl bg-white border border-slate-200 p-4 shadow-sm flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">Filtravimo kriterijai</h3>
            <button onClick={() => setOpen(false)} className="w-11 h-11 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100" aria-label="Uždaryti filtrus"><X className="w-5 h-5" /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label><span className="text-xs font-medium text-slate-500">Iš kur</span><input value={draft.fromLocation} onChange={e => setDraft({ ...draft, fromLocation: e.target.value })} placeholder="pvz. Vilnius" className="form-input mt-1" /></label>
            <label><span className="text-xs font-medium text-slate-500">Į kur</span><input value={draft.toLocation} onChange={e => setDraft({ ...draft, toLocation: e.target.value })} placeholder="pvz. Trakai" className="form-input mt-1" /></label>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label><span className="text-xs font-medium text-slate-500">Data</span><input type="date" value={draft.date} onChange={e => setDraft({ ...draft, date: e.target.value })} className="form-input mt-1" /></label>
            <label><span className="text-xs font-medium text-slate-500">Min. vietų</span><select value={draft.minSeats} onChange={e => setDraft({ ...draft, minSeats: Number(e.target.value) })} className="form-input mt-1"><option value={0}>Bet kiek</option><option value={1}>1+</option><option value={2}>2+</option><option value={3}>3+</option><option value={4}>4+</option></select></label>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label><span className="text-xs font-medium text-slate-500">Max kaina, €</span><input inputMode="decimal" value={draft.maxPrice} onChange={e => setDraft({ ...draft, maxPrice: e.target.value })} placeholder="pvz. 10" className="form-input mt-1" /></label>
            <label><span className="text-xs font-medium text-slate-500">Atstumas nuo manęs, km</span><select value={draft.radiusKm} onChange={e => setDraft({ ...draft, radiusKm: Number(e.target.value) })} className="form-input mt-1"><option value={0}>Neribotas</option><option value={5}>5 km</option><option value={10}>10 km</option><option value={20}>20 km</option><option value={50}>50 km</option><option value={100}>100 km</option></select></label>
          </div>
          <label className="min-h-11 flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={draft.recurringOnly} onChange={e => setDraft({ ...draft, recurringOnly: e.target.checked })} className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500" /><span className="text-sm text-slate-600 flex items-center gap-1"><Repeat className="w-3.5 h-3.5 text-blue-500" /> Tik pasikartojantys</span></label>
          <button
            type="button"
            onClick={() => { onChange(draft); setOpen(false); }}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white shadow-md shadow-blue-600/20 transition hover:bg-blue-700 active:scale-[0.99]"
          >
            <Search className="h-4 w-4" />
            Rodyti rezultatus
          </button>
        </div>
      )}
    </div>
  );
}
