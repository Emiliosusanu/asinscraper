export const config = { runtime: 'edge' };

export default async function handler(req) {
  try {
    if (req.method && req.method !== 'GET') {
      return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405, headers: { 'Allow': 'GET', 'Content-Type': 'application/json' } });
    }
    const { searchParams } = new URL(req.url);
    const s = searchParams.get('start') || searchParams.get('start_date');
    const e = searchParams.get('end') || searchParams.get('end_date');
    const symbols = searchParams.get('symbols') || '';
    const base = searchParams.get('base') || 'EUR';
    if (!s || !e || !symbols) {
      return new Response(JSON.stringify({ error: 'Missing required query params: start/start_date, end/end_date, symbols' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const upstream = new URL('https://api.exchangerate.host/timeseries');
    upstream.searchParams.set('base', base);
    upstream.searchParams.set('start_date', s);
    upstream.searchParams.set('end_date', e);
    upstream.searchParams.set('symbols', symbols);

    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 5000);
    const r = await fetch(upstream.toString(), { signal: ctrl.signal });
    clearTimeout(to);

    if (!r.ok) {
      const text = await r.text().catch(() => '');
      return new Response(JSON.stringify({ error: 'Upstream error', status: r.status, body: text }), { status: 502, headers: { 'Content-Type': 'application/json' } });
    }
    const json = await r.json();
    const headers = new Headers();
    headers.set('Cache-Control', 's-maxage=21600, stale-while-revalidate=86400');
    headers.set('Content-Type', 'application/json');
    return new Response(JSON.stringify(json), { status: 200, headers });
  } catch (e) {
    const status = e?.name === 'AbortError' ? 504 : 500;
    return new Response(JSON.stringify({ error: e?.message || 'Unexpected error' }), { status, headers: { 'Content-Type': 'application/json' } });
  }
}
