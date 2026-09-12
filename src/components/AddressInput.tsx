import { useEffect, useRef, useState } from 'react';
import { MapPin, Loader2, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
export interface AddressValue { display_name: string; lat: number | null; lng: number | null; area?: string }
interface GeoResult { display_name: string; lat: string; lon: string; area?: string }
export function AddressInput({ value, onChange, placeholder }: {
  value: AddressValue; onChange: (value: AddressValue) => void; placeholder?: string;
}) {
  const [suggestions, setSuggestions] = useState<GeoResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function search() {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    if (value.display_name.trim().length < 3) { setError('Įveskite bent 3 simbolius.'); return; }
    setLoading(true); setError(''); setSuggestions([]);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Prisijunkite i? naujo.');
      const response = await fetch(import.meta.env.VITE_SUPABASE_URL + '/functions/v1/geocode?q=' + encodeURIComponent(value.display_name.trim()), {
        signal: current.signal,
        headers: { Authorization: 'Bearer ' + session.access_token, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
      });
      if (!response.ok) throw new Error(response.status === 429 ? 'Palaukite prieš kartodami paiešką.' : 'Adresų paieška nepasiekiama. Galite įvesti adresą ranka.');
      const data = await response.json();
      if (!current.signal.aborted) { setSuggestions(data); if (!data.length) setError('Adreso nerasta. Patikslinkite paiešką.'); }
    } catch (cause) {
      if (!current.signal.aborted) setError(cause instanceof Error ? cause.message : 'Paieškos klaida.');
    } finally { if (!current.signal.aborted) setLoading(false); }
  }
  return <div className="relative">
    <div className="flex gap-2">
      <input type="text" value={value.display_name} onChange={event => {
        controller.current?.abort(); setLoading(false); setSuggestions([]); setError('');
        onChange({ display_name: event.target.value, lat: null, lng: null });
      }} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void search(); } }}
        placeholder={placeholder} className="form-input" autoComplete="off" maxLength={160} />
      <button type="button" onClick={() => void search()} disabled={loading} aria-label="Ieškoti adreso"
        className="px-3 rounded-xl bg-blue-50 text-blue-700">{loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}</button>
    </div>
    {error && <p role="status" className="text-xs text-amber-700 mt-1">{error}</p>}
    {suggestions.length > 0 && <div className="absolute z-50 mt-1 w-full bg-white rounded-xl border border-slate-200 shadow-lg max-h-60 overflow-y-auto">
      {suggestions.map((item, index) => <button key={index} type="button" onClick={() => {
        onChange({ display_name: item.display_name.slice(0, 160), lat: Number(item.lat), lng: Number(item.lon), area: item.area }); setSuggestions([]);
      }} className="w-full text-left p-3 text-sm hover:bg-blue-50 flex gap-2"><MapPin className="w-4 h-4 shrink-0" />{item.display_name}</button>)}
    </div>}
  </div>;
}
