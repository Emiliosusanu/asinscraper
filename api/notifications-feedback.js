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

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function renorm(w) {
  const s = w.reviews + w.bsr + w.royalty + w.price;
  if (s <= 0) return { reviews: 0.35, bsr: 0.30, royalty: 0.25, price: 0.10 };
  return { reviews: w.reviews/s, bsr: w.bsr/s, royalty: w.royalty/s, price: w.price/s };
}
function ema(oldW, signal) {
  const next = {
    reviews: 0.95 * (oldW.reviews ?? 0.35) + 0.05 * signal,
    bsr: 0.95 * (oldW.bsr ?? 0.30) + 0.05 * signal,
    royalty: 0.95 * (oldW.royalty ?? 0.25) + 0.05 * signal,
    price: 0.95 * (oldW.price ?? 0.10) + 0.05 * signal,
  };
  next.reviews = clamp(next.reviews, 0.05, 0.6);
  next.bsr = clamp(next.bsr, 0.05, 0.6);
  next.royalty = clamp(next.royalty, 0.05, 0.6);
  next.price = clamp(next.price, 0.05, 0.6);
  return renorm(next);
}

export default async function handler(req) {
  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405, headers: { 'Allow': 'POST', 'Content-Type': 'application/json' } });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey) {
      return new Response(JSON.stringify({ error: 'Missing SUPABASE_URL or SUPABASE_ANON_KEY' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const { user, client, error } = await getUserFromAuthHeader(req, supabaseUrl, anonKey);
    if (!user) return new Response(JSON.stringify({ error }), { status: 401, headers: { 'Content-Type': 'application/json' } });

    const bodyText = await req.text();
    let body; try { body = JSON.parse(bodyText || '{}'); } catch { body = {}; }
    const { notification_id, asin, action, driverSign } = body || {};
    const allowed = ['clicked','dismissed','helpful','ignored'];
    if (!notification_id || !asin || !allowed.includes(action)) {
      return new Response(JSON.stringify({ error: 'Invalid body: notification_id, asin, action required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // Insert feedback
    const { error: insErr } = await client
      .from('notification_feedback')
      .insert({ notification_id, asin, action, user_id: user.id });
    if (insErr) {
      return new Response(JSON.stringify({ error: insErr.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    // Light auto-learning on weights
    // Fetch latest weights from rollup
    const { data: rows, error: qerr } = await client
      .from('notification_daily_rollup')
      .select('weights, date, net_impact_avg, better, worse, stable')
      .eq('user_id', user.id)
      .eq('asin', asin)
      .order('date', { ascending: false })
      .limit(1);
    if (qerr) {
      return new Response(JSON.stringify({ error: qerr.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const oldW = (rows && rows[0] && rows[0].weights) || { reviews: 0.35, bsr: 0.30, royalty: 0.25, price: 0.10 };
    let signal = 0;
    if (action === 'helpful' || action === 'clicked') {
      signal = (driverSign === 'negative') ? -1 : 1;
    }
    const newW = ema(oldW, signal);

    // Upsert weights into today's rollup, preserving counters if existing
    const today = new Date(); const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    const dateStr = d.toISOString().slice(0,10);
    const base = rows && rows[0] ? rows[0] : { better: 0, worse: 0, stable: 0, net_impact_avg: 0 };
    const { error: upErr } = await client
      .from('notification_daily_rollup')
      .upsert({ user_id: user.id, asin, date: dateStr, better: base.better, worse: base.worse, stable: base.stable, net_impact_avg: base.net_impact_avg, weights: newW }, { onConflict: 'user_id,asin,date' });
    if (upErr) {
      return new Response(JSON.stringify({ error: upErr.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ ok: true, weights: newW }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e?.message || 'Unexpected error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
