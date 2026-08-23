import { useEffect, useRef, useState } from 'react';
import { MapPin, Loader2 } from 'lucide-react';

export interface AddressValue {
  display_name: string;
  lat: number | null;
  lng: number | null;
}

interface GeoResult {
  display_name: string;
  lat: string;
  lon: string;
}

export function AddressInput({
  value,
  onChange,
  placeholder,
}: {
  value: AddressValue;
  onChange: (val: AddressValue) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState(value.display_name);
  const [suggestions, setSuggestions] = useState<GeoResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(value.display_name);
  }, [value.display_name]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const controller = new AbortController();
    const trimmed = query.trim();
    if (trimmed.length < 3) {
      setSuggestions([]);
      setOpen(false);
      setLoading(false);
      return () => controller.abort();
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/geocode?q=${encodeURIComponent(trimmed)}`;
        const res = await fetch(apiUrl, {
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
        });
        if (!res.ok) {
          setSuggestions([]);
          return;
        }
        const data = await res.json();
        if (Array.isArray(data) && !controller.signal.aborted) {
          setSuggestions(data);
          setOpen(data.length > 0);
        }
      } catch (error) {
        if ((error as DOMException).name !== 'AbortError') setSuggestions([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      controller.abort();
    };
  }, [query]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function pickSuggestion(s: GeoResult) {
    setQuery(s.display_name);
    onChange({
      display_name: s.display_name,
      lat: parseFloat(s.lat),
      lng: parseFloat(s.lon),
    });
    setSuggestions([]);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          onChange({ display_name: e.target.value, lat: null, lng: null });
        }}
        onFocus={() => {
          if (suggestions.length > 0) setOpen(true);
        }}
        placeholder={placeholder}
        className="form-input"
        autoComplete="off"
      />
      {loading && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
        </div>
      )}
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-white rounded-xl border border-slate-200 shadow-lg max-h-60 overflow-y-auto">
          {suggestions.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => pickSuggestion(s)}
              className="w-full text-left px-3.5 py-2.5 text-sm text-slate-700 hover:bg-blue-50 hover:text-blue-700 transition-colors border-b border-slate-100 last:border-b-0 flex items-start gap-2"
            >
              <MapPin className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
              <span>{s.display_name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
