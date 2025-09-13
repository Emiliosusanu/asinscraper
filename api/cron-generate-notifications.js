export const config = { runtime: 'edge' };

export default async function handler(req) {
  try {
    if (req.method !== 'GET') {
      return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405, headers: { 'Allow': 'GET', 'Content-Type': 'application/json' } });
    }

    const supabaseUrl = process.env.SUPABASE_URL || (typeof Deno !== 'undefined' ? Deno.env.get('SUPABASE_URL') : undefined);
    const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY || (typeof Deno !== 'undefined' ? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') : undefined);
    if (!supabaseUrl || !svcKey) {
      return new Response(JSON.stringify({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const headers = {
      'Authorization': `Bearer ${svcKey}`,
      'Content-Type': 'application/json',
    };

    // 1) compute_performance (all users)
    const cpUrl = `${supabaseUrl}/functions/v1/compute_performance`;
    const cpRes = await fetch(cpUrl, { method: 'POST', headers, body: JSON.stringify({}) });
    const cpText = await cpRes.text();
    const cpBody = (() => { try { return JSON.parse(cpText) } catch { return { raw: cpText } } })();
    if (!cpRes.ok) {
      return new Response(JSON.stringify({ error: 'compute_performance failed', status: cpRes.status, body: cpBody }), { status: 502, headers: { 'Content-Type': 'application/json' } });
    }

    // 2) generate_notifications (snapshots/rollups)
    const gnUrl = `${supabaseUrl}/functions/v1/generate_notifications`;
    const gnRes = await fetch(gnUrl, { method: 'GET', headers });
    const gnText = await gnRes.text();
    const gnBody = (() => { try { return JSON.parse(gnText) } catch { return { raw: gnText } } })();
    if (!gnRes.ok) {
      return new Response(JSON.stringify({ error: 'generate_notifications failed', status: gnRes.status, body: gnBody }), { status: 502, headers: { 'Content-Type': 'application/json' } });
    }

    // 3) generate_tips (rule-based events to notification_events)
    const gtUrl = `${supabaseUrl}/functions/v1/generate_tips`;
    const gtRes = await fetch(gtUrl, { method: 'POST', headers, body: JSON.stringify({}) });
    const gtText = await gtRes.text();
    const gtBody = (() => { try { return JSON.parse(gtText) } catch { return { raw: gtText } } })();
    if (!gtRes.ok) {
      return new Response(JSON.stringify({ error: 'generate_tips failed', status: gtRes.status, body: gtBody }), { status: 502, headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ ok: true, compute_performance: cpBody, generate_notifications: gnBody, generate_tips: gtBody }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e?.message || 'Unexpected error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
