export const config = { runtime: 'edge' };

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.1';

function json(res, status = 200) {
  return new Response(JSON.stringify(res), { status, headers: { 'Content-Type': 'application/json' } });
}

export default async function handler(req) {
  try {
    if (req.method !== 'GET') {
      return json({ error: 'Method Not Allowed' }, 405);
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      return json({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }, 500);
    }

    const client = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const thresholdDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days
    const thresholdIso = thresholdDate.toISOString();

    // Keys with last_reset_at <= threshold
    const { data: dueByLastReset, error: e1 } = await client
      .from('scraper_api_keys')
      .select('id, max_credits')
      .lte('last_reset_at', thresholdIso);
    if (e1) throw e1;

    // Keys with no last_reset_at but created_at <= threshold
    const { data: dueByCreated, error: e2 } = await client
      .from('scraper_api_keys')
      .select('id, max_credits, created_at, last_reset_at')
      .is('last_reset_at', null)
      .lte('created_at', thresholdIso);
    if (e2) throw e2;

    const toReset = [...(dueByLastReset || []), ...(dueByCreated || [])];

    let resetCount = 0;
    for (const row of toReset) {
      // Fetch current max_credits to set credits accordingly
      const { data: keyRow, error: eGet } = await client
        .from('scraper_api_keys')
        .select('max_credits')
        .eq('id', row.id)
        .single();
      if (eGet) continue;

      const { error: eUpd } = await client
        .from('scraper_api_keys')
        .update({ credits: keyRow.max_credits, last_reset_at: new Date().toISOString() })
        .eq('id', row.id);
      if (!eUpd) resetCount++;
    }

    return json({ ok: true, resetCount });
  } catch (e) {
    return json({ error: e?.message || String(e) }, 500);
  }
}
