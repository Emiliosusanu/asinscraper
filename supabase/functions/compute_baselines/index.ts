import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4?target=deno&bundle";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

function toDateKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function quantile(sorted: number[], q: number): number | null {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if ((sorted[base + 1] !== undefined)) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  } else {
    return sorted[base];
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ success: false, error: "Missing Supabase env" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const payload = await req.json().catch(() => ({}));
    const userId: string | null = payload?.userId ?? null;
    const day: string = payload?.day || toDateKey(new Date());
    if (!userId) {
      return new Response(JSON.stringify({ success: false, error: "Missing userId" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    // fetch user's asin-data with category
    const { data: asinRows, error: asinErr } = await client
      .from("asin_data")
      .select("id, asin, country, category")
      .eq("user_id", userId)
      .not("category", "is", null);
    if (asinErr) throw asinErr;

    // Load today's bsr per asin_data_id
    const { data: daily, error: dailyErr } = await client
      .from("asin_daily_metrics")
      .select("asin_data_id, bsr, day")
      .eq("user_id", userId)
      .eq("day", day);
    if (dailyErr) throw dailyErr;

    const byAsin = new Map<string, any>();
    for (const r of asinRows || []) byAsin.set(r.id, r);

    // Group by country+category
    const groups = new Map<string, number[]>();
    for (const d of daily || []) {
      if (!Number.isFinite(d.bsr) || d.bsr <= 0) continue;
      const meta = byAsin.get(d.asin_data_id);
      if (!meta) continue;
      const key = `${meta.country || 'com'}||${(meta.category || '').slice(0, 120)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(Number(d.bsr));
    }

    let upserts: any[] = [];
    for (const [key, arr] of groups.entries()) {
      const [country, category] = key.split("||");
      const sorted = arr.slice().sort((a, b) => a - b);
      const p20 = quantile(sorted, 0.2);
      const p50 = quantile(sorted, 0.5);
      const p80 = quantile(sorted, 0.8);

      upserts.push({
        user_id: userId,
        country,
        category,
        day,
        bsr_p20: p20 ?? null,
        bsr_p50: p50 ?? null,
        bsr_p80: p80 ?? null,
        price_p50: null,
        volume_index: 1.0,
      });
    }

    if (upserts.length) {
      const { error: upErr } = await client
        .from("category_baselines")
        .upsert(upserts, { onConflict: "user_id, country, category, day" });
      if (upErr) throw upErr;
    }

    return new Response(JSON.stringify({ success: true, groups: groups.size, rows: upserts.length }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: String(e?.message || e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
