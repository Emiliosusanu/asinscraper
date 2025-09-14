export const config = { runtime: 'edge' };

export default async function handler(req) {
  try {
    if (req.method !== 'GET') {
      return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405, headers: { 'Allow': 'GET', 'Content-Type': 'application/json' } });
    }

    const supabaseUrl = process.env.SUPABASE_URL || Deno.env.get('SUPABASE_URL');
    const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !svcKey) {
      return new Response(JSON.stringify({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const fnUrl = `${supabaseUrl}/functions/v1/generate_notifications`;
    const r = await fetch(fnUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${svcKey}`,
        'Content-Type': 'application/json',
      }
    });

    const text = await r.text();
    const body = (() => { try { return JSON.parse(text) } catch { return { raw: text } } })();

    if (!r.ok) {
      return new Response(JSON.stringify({ error: 'generate_notifications failed', status: r.status, body }), { status: 502, headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ ok: true, result: body }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e?.message || 'Unexpected error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
