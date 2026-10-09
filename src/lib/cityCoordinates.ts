import { supabase } from './supabase';
import type { AddressValue } from '@/components/AddressInput';

const normalize = (text: string) => text.trim().toLocaleLowerCase('lt-LT').normalize('NFD').replace(/\p{Diacritic}/gu, '');

/** Only resolve a bare locality name; street addresses still require an explicit selection. */
export async function resolveCityCoordinates(value: AddressValue): Promise<AddressValue> {
  if (value.lat !== null && value.lng !== null) return value;
  const parts = value.display_name.split(',').map(part => part.trim());
  if (parts.length > 2 || (parts.length === 2 && normalize(parts[1]) !== 'lietuva')
    || parts[0].length < 3 || /[\d.]/u.test(parts[0])) return value;

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return value;
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/geocode?q=${encodeURIComponent(parts[0] + ', Lietuva')}`, {
      signal: AbortSignal.timeout(25000),
      headers: { Authorization: 'Bearer ' + session.access_token, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
    });
    if (!response.ok) return value;
    const results: unknown = await response.json();
    if (!Array.isArray(results)) return value;
    const matches = results.filter(result => typeof result.area === 'string'
      && normalize(result.area) === normalize(parts[0])
      && typeof result.display_name === 'string'
      && normalize(result.display_name.split(',')[0]) === normalize(parts[0])
      && typeof result.lat === 'string' && result.lat.trim() !== ''
      && typeof result.lon === 'string' && result.lon.trim() !== ''
      && Number.isFinite(Number(result.lat)) && Math.abs(Number(result.lat)) <= 90
      && Number.isFinite(Number(result.lon)) && Math.abs(Number(result.lon)) <= 180);
    // An ambiguous town name must be selected by the user.
    if (matches.length !== 1) return value;
    return { ...value, lat: Number(matches[0].lat), lng: Number(matches[0].lon), area: matches[0].area };
  } catch {
    return value;
  }
}
