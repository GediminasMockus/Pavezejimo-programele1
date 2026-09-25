import { useEffect, useId, useRef, useState } from 'react';
import { MapPin, Loader2, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
export interface AddressValue { display_name: string; lat: number | null; lng: number | null; area?: string }
interface GeoResult { display_name: string; lat: string; lon: string; area?: string }
export function AddressInput({ id, value, onChange, placeholder }: {
  id?: string; value: AddressValue; onChange: (value: AddressValue) => void; placeholder?: string;
}) {
  const [suggestions, setSuggestions] = useState<GeoResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listId = useId();
  function cancelSearch() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    controller.current?.abort();
  }
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    controller.current?.abort();
  }, []);
  async function search(query: string, suggest = false) {
    cancelSearch();
    const current = new AbortController();
    controller.current = current;
    if (query.trim().length < 3) { setError('Įveskite bent 3 simbolius.'); return; }
    setLoading(true); setError(''); setSuggestions([]);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Prisijunkite iš naujo.');
      if (current.signal.aborted) return;
      const response = await fetch(import.meta.env.VITE_SUPABASE_URL + '/functions/v1/geocode?q=' + encodeURIComponent(query.trim()) + (suggest ? '&mode=suggest' : ''), {
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
  function select(item: GeoResult) {
    cancelSearch();
    onChange({ display_name: item.display_name.slice(0, 160), lat: Number(item.lat), lng: Number(item.lon), area: item.area });
    setSuggestions([]); setError(''); setLoading(false);
  }
  return <div className="relative">
    <div className="flex gap-2">
      <input ref={inputRef} id={id} type="text" value={value.display_name} onChange={event => {
        const text = event.target.value;
        cancelSearch(); setLoading(text.trim().length >= 3); setSuggestions([]); setError('');
        onChange({ display_name: text, lat: null, lng: null });
        if (text.trim().length >= 3) timer.current = setTimeout(() => void search(text, true), 450);
      }} onKeyDown={event => {
        if (event.key === 'Escape') { setSuggestions([]); return; }
        if (event.key === 'ArrowDown' && suggestions.length) {
          event.preventDefault(); document.getElementById(`${listId}-0`)?.focus();
        }
        if (event.key === 'Enter') {
          event.preventDefault();
          if (suggestions.length) select(suggestions[0]);
          else void search(value.display_name);
        }
      }} aria-expanded={suggestions.length > 0} aria-controls={suggestions.length ? listId : undefined}
        placeholder={placeholder} className="form-input" autoComplete="off" maxLength={160} />
      <button type="button" onClick={() => void search(value.display_name)} disabled={loading} aria-label="Ieškoti adreso"
        className="icon-button border border-neutral-200 bg-neutral-50 text-primary-700">{loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}</button>
    </div>
    {error && <p role="status" className="text-xs text-warning-700 mt-1">{error}</p>}
    {suggestions.length > 0 && <div id={listId} className="absolute z-50 mt-1 w-full bg-surface rounded-xl border border-neutral-200 shadow-card max-h-60 overflow-y-auto">
      {suggestions.map((item, index) => <button id={`${listId}-${index}`} key={`${item.lat},${item.lon},${index}`} type="button" onClick={() => select(item)} onKeyDown={event => {
        if (event.key === 'Escape') { setSuggestions([]); inputRef.current?.focus(); }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault(); document.getElementById(`${listId}-${index + (event.key === 'ArrowDown' ? 1 : -1)}`)?.focus();
        }
      }} className="ui-button w-full text-left p-3 text-sm hover:bg-primary-50 flex gap-2 [overflow-wrap:anywhere]"><MapPin className="w-4 h-4 shrink-0" />{item.display_name}</button>)}
    </div>}
  </div>;
}
