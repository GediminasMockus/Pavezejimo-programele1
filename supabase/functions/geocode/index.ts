import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

interface GeoResult {
  display_name: string;
  lat: string;
  lon: string;
  area: string;
}

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
let lastUpstreamRequestAt = 0;

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

  const query = new URL(request.url).searchParams.get('q')?.trim();
  if (!query || query.length < 3 || query.length > 160) {
    return reply({ error: 'invalid query' }, 400);
  }

  const cacheKey = query.toLocaleLowerCase('lt-LT');
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return reply(cached.results);
  if (cached) cache.delete(cacheKey);

  const now = Date.now();
  if (now - lastUpstreamRequestAt < UPSTREAM_INTERVAL_MS) {
    return reply({ error: 'rate limited' }, 429);
  }
  lastUpstreamRequestAt = now;

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
    if (!response.ok) return reply({ error: 'geocoding unavailable' }, 502);

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
  } catch {
    return reply({ error: 'geocoding unavailable' }, 502);
  }
});
