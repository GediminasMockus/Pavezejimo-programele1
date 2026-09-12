import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info' };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'GET') return reply({ error: 'method not allowed' }, 405);
  const url = Deno.env.get('SUPABASE_URL')!;
  const authorization = request.headers.get('Authorization') ?? '';
  const client = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return reply({ error: 'unauthorized' }, 401);
  const query = new URL(request.url).searchParams.get('q')?.trim();
  if (!query || query.length < 3 || query.length > 160) return reply({ error: 'invalid query' }, 400);
  const cacheKey = query.toLocaleLowerCase('lt-LT');
  try {
    const { data: cached } = await client.rpc('cached_geocode', { p_query: cacheKey });
    if (cached) return reply(cached);
    const { data: allowed, error: gateError } = await client.rpc('claim_geocode');
    if (gateError) return reply({ error: 'geocoder unavailable' }, 503);
    if (!allowed) return reply({ error: 'rate limited' }, 429);
    const endpoint = new URL(Deno.env.get('GEOCODING_URL') ?? 'https://nominatim.openstreetmap.org/search');
    endpoint.search = new URLSearchParams({ format: 'json', q: query, addressdetails: '1', limit: '5', countrycodes: 'lt' }).toString();
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': Deno.env.get('GEOCODING_USER_AGENT') ?? 'PriemiescioPavezejimai/1.0', Accept: 'application/json' } });
    if (!response.ok) return reply({ error: 'geocoding unavailable' }, 502);
    const raw = await response.json();
    const results = raw.map((item: { display_name: string; lat: string; lon: string; address?: Record<string,string> }) => ({
      display_name: item.display_name, lat: item.lat, lon: item.lon,
      area: item.address?.city ?? item.address?.town ?? item.address?.village ?? item.address?.municipality ?? item.address?.county ?? '',
    }));
    const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    await service.rpc('store_geocode', { p_query: cacheKey, p_result: results });
    return reply(results);
  } catch { return reply({ error: 'geocoding unavailable' }, 502); }
});
