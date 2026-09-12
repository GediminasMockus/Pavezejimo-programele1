import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info' };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return reply({ error: 'method not allowed' }, 405);
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const client = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: request.headers.get('Authorization') ?? '' } }, auth: { persistSession: false },
    });
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user) return reply({ error: 'unauthorized' }, 401);
    const { data: flags } = await client.rpc('get_my_profile_flags');
    if (!flags?.[0]?.is_admin) return reply({ error: 'forbidden' }, 403);
    const { userId } = await request.json();
    if (typeof userId !== 'string' || !/^[0-9a-f-]{36}$/i.test(userId) || userId === user.id) return reply({ error: 'invalid user' }, 400);
    const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    // Auth removes the identity and sessions; a database trigger removes application data.
    const { error: deleteError } = await service.auth.admin.deleteUser(userId);
    if (deleteError) return reply({ error: 'user deletion failed' }, 409);
    return reply({ deleted: true });
  } catch { return reply({ error: 'invalid request' }, 400); }
});
