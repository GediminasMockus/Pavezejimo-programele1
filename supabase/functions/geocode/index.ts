import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { photonResults, type GeoResult } from '../_shared/geocode.ts';

interface CachedResult {
  expiresAt: number;
  results: GeoResult[];
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

const cache = new Map<string, CachedResult>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 200;
const UPSTREAM_INTERVAL_MS = 1_100;
let nextUpstreamRequestAt = 0;

async function fallbackSearch(query: string): Promise<GeoResult[] | null> {
  try {
    const endpoint = new URL('https://photon.komoot.io/api/');
    endpoint.search = new URLSearchParams({ q: query, limit: '5', countrycode: 'LT' }).toString();
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) return null;
    const data = await response.json();
    return photonResults(data.features ?? []);
  } catch {
    return null;
  }
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'GET') return reply({ error: 'method not allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const authorization = request.headers.get('Authorization') ?? '';
  const client = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return reply({ error: 'unauthorized' }, 401);

  const params = new URL(request.url).searchParams;
  const query = params.get('q')?.trim();
  const suggest = params.get('mode') === 'suggest';
  if (!query || query.length < 3 || query.length > 160) {
    return reply({ error: 'invalid query' }, 400);
  }

  const cacheKey = `${suggest ? 'suggest' : 'search'}:${query.toLocaleLowerCase('lt-LT')}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return reply(cached.results);
  if (cached) cache.delete(cacheKey);

  const delay = Math.max(0, nextUpstreamRequestAt - Date.now());
  if (delay > 10_000) {
    return reply({ error: 'rate limited' }, 429);
  }
  nextUpstreamRequestAt = Date.now() + delay + UPSTREAM_INTERVAL_MS;
  if (delay) await new Promise(resolve => setTimeout(resolve, delay));

  if (suggest) {
    // Nominatim does not permit autocomplete; Photon supports search-as-you-type.
    const results = await fallbackSearch(query);
    if (results === null) return reply({ error: 'geocoding unavailable' }, 502);
    cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, results });
    return reply(results);
  }

  try {
    const endpoint = new URL(
      Deno.env.get('GEOCODING_URL') ?? 'https://nominatim.openstreetmap.org/search',
    );
    endpoint.search = new URLSearchParams({
      format: 'json',
      q: query,
      addressdetails: '1',
      limit: '5',
      countrycodes: 'lt',
    }).toString();

    const response = await fetch(endpoint, {
      signal: AbortSignal.timeout(8000),
      headers: {
        'User-Agent': Deno.env.get('GEOCODING_USER_AGENT') ?? 'PriemiescioPavezejimai/1.0',
        Accept: 'application/json',
      },
    });
    if (!response.ok) {
      console.warn('geocode primary upstream status', response.status);
      const fallback = await fallbackSearch(query);
      if (fallback === null) return reply({ error: 'geocoding unavailable' }, 502);
      cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, results: fallback });
      return reply(fallback);
    }

    const raw = await response.json();
    const results: GeoResult[] = raw.map(
      (item: { display_name: string; lat: string; lon: string; address?: Record<string, string> }) => {
        const address = item.address ?? {};
        const locality =
          address.city ?? address.town ?? address.village ?? address.municipality ?? address.county;
        const district = address.suburb ?? address.neighbourhood ?? address.city_district;
        const street = address.road ?? address.pedestrian;
        const publicParts = [street, district, locality].filter(
          (part, index, parts): part is string =>
            Boolean(part) &&
            parts.findIndex(
              value =>
                value?.toLocaleLowerCase('lt-LT') === part?.toLocaleLowerCase('lt-LT'),
            ) === index,
        );

        return {
          display_name: item.display_name,
          lat: item.lat,
          lon: item.lon,
          area: publicParts.join(', ') || locality || '',
        };
      },
    );

    if (cache.size >= MAX_CACHE_ENTRIES) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey) cache.delete(oldestKey);
    }
    cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, results });

    return reply(results);
  } catch (error) {
    console.warn('geocode primary upstream error', error instanceof Error ? error.name : 'unknown');
    const fallback = await fallbackSearch(query);
    if (fallback === null) return reply({ error: 'geocoding unavailable' }, 502);
    cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, results: fallback });
    return reply(fallback);
  }
});
