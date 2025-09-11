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
    const days = Math.max(1, Math.min(90, Number(searchParams.get('windowDays') || '30')));
    const mode = (searchParams.get('mode') || 'latest').toLowerCase(); // 'latest' | 'window'
    const sinceDate = new Date(); sinceDate.setDate(sinceDate.getDate() - days);
    const since = sinceDate.toISOString().slice(0,10);

    let query = client
      .from('notification_daily_rollup')
      .select('date, better, worse, stable, net_impact_avg')
      .eq('user_id', user.id)
      .gte('date', since);
    if (asin) query = query.eq('asin', asin);

    const { data, error: qerr } = await query;
    if (qerr) throw qerr;

    let rows = Array.isArray(data) ? data : [];
    // If mode=latest, only consider the most recent date in the window
    let asOf = null;
    if (rows.length > 0) {
      const latest = rows.reduce((acc, r) => {
        const d = String(r.date || '');
        return d > acc ? d : acc;
      }, '');
      if (mode === 'latest' && latest) {
        rows = rows.filter(r => String(r.date || '') === latest);
        asOf = latest;
      }
    }

    const counts = { better: 0, worse: 0, stable: 0 };
    let sumNet = 0; let n = 0;
    for (const r of rows) {
      const b = Number(r.better ?? 0);
      const w = Number(r.worse ?? 0);
      const s = Number(r.stable ?? 0);
      counts.better += Number.isFinite(b) ? b : 0;
      counts.worse += Number.isFinite(w) ? w : 0;
      counts.stable += Number.isFinite(s) ? s : 0;
      const ni = Number(r.net_impact_avg);
      if (Number.isFinite(ni)) { sumNet += ni; n++; }
    }
    const netImpactAvg = n > 0 ? +(sumNet / n).toFixed(1) : 0;

    // Derive a simple sentiment for the summary
    const summarySentiment = netImpactAvg > 1 && counts.better >= counts.worse
      ? 'In miglioramento'
      : netImpactAvg < -1 && counts.worse > counts.better
      ? 'In calo'
      : 'Trend stabile';

    return new Response(JSON.stringify({ counts, netImpactAvg, windowDays: days, asOf, sentiment: summarySentiment, mode }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e?.message || 'Unexpected error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
