export const config = { runtime: 'edge' };

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.1';

async function getUserFromAuthHeader(req, supabaseUrl, anonKey) {
  const auth = req.headers.get('authorization') || req.headers.get('Authorization');
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return { user: null, error: 'Missing Bearer token' };
  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data?.user) {
    return { user: null, error: 'Invalid token' };
  }
  return { user: data.user, client };
}

export default async function handler(req) {
  try {
    if (req.method !== 'GET') {
      return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405, headers: { 'Allow': 'GET', 'Content-Type': 'application/json' } });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey) {
      return new Response(JSON.stringify({ error: 'Missing SUPABASE_URL or SUPABASE_ANON_KEY' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const { user, client, error } = await getUserFromAuthHeader(req, supabaseUrl, anonKey);
    if (!user) return new Response(JSON.stringify({ error }), { status: 401, headers: { 'Content-Type': 'application/json' } });

    const { searchParams } = new URL(req.url);
    const asin = searchParams.get('asin');
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') || '20')));
    const since = searchParams.get('since'); // ISO string

    let query = client
      .from('notification_snapshots')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (asin) query = query.eq('asin', asin);
    if (since) query = query.gte('created_at', since);

    const { data, error: qerr } = await query;
    if (qerr) throw qerr;

    return new Response(JSON.stringify({ items: data || [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e?.message || 'Unexpected error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
