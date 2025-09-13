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
  // YYYY-MM-DD in UTC
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDateKeyFromIso(iso: string): string {
  const d = new Date(iso);
  return toDateKey(d);
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function stddev(vals: number[]): number {
  if (!vals.length) return 0;
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const v = vals.reduce((acc, x) => acc + Math.pow(x - mean, 2), 0) / vals.length;
  return Math.sqrt(v);
}

function linRegSlope(xs: number[], ys: number[]): number | null {
  // simple least squares slope
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return null;
  const x = xs.slice(0, n);
  const y = ys.slice(0, n);
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((acc, xi, i) => acc + xi * y[i], 0);
  const sumXX = x.reduce((acc, xi) => acc + xi * xi, 0);
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return null;
  return (n * sumXY - sumX * sumY) / denom;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ success: false, error: "Missing Supabase env" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (req.method !== "POST") {
      return new Response(JSON.stringify({ success: false, error: "Method Not Allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const payload = await req.json().catch(() => ({}));
    const inputUserId: string | null = payload?.userId ?? null;

    const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    // helper to compute metrics and snapshots for a single user
    async function computeForUser(userId: string): Promise<void> {
      // Fetch user's ASINs
      const { data: asins, error: asinsError } = await client
        .from("asin_data")
        .select("id, asin, country")
        .eq("user_id", userId);
      if (asinsError) {
        throw new Error(asinsError.message);
      }

      const todayKey = toDateKey(new Date());

      for (const row of asins || []) {
        const asinId = row.id as string;
        // last 60 days of history
        const since = new Date();
        since.setUTCDate(since.getUTCDate() - 60);

        const { data: hist, error: histErr } = await client
          .from("asin_history")
          .select("created_at, bsr, price, review_count, rating, availability")
          .eq("user_id", userId)
          .eq("asin_data_id", asinId)
          .gte("created_at", since.toISOString())
          .order("created_at", { ascending: true });
        if (histErr) continue;

        // Group by day, last record per day
        const byDay = new Map<string, any>();
        for (const h of hist || []) {
          const k = parseDateKeyFromIso(h.created_at);
          const prev = byDay.get(k);
          if (!prev || new Date(h.created_at) > new Date(prev.created_at)) byDay.set(k, h);
        }

        // Build arrays ordered by day
        const days = Array.from(byDay.keys()).sort();

        // Write today's daily metrics if present
        const todayRec = byDay.get(todayKey);
        if (todayRec) {
          const priceNum = Number(todayRec.price);
          const bsrNum = Number(todayRec.bsr);
          let salesLow: number | null = null;
          let salesHigh: number | null = null;
          if (Number.isFinite(bsrNum) && bsrNum > 0) {
            salesLow = Math.max(0, Math.round(1200 / Math.pow(bsrNum, 0.6)));
            salesHigh = Math.max(salesLow, Math.round(2200 / Math.pow(bsrNum, 0.6)));
          }
          const revenueLow = Number.isFinite(priceNum) && salesLow != null ? Number((priceNum * salesLow).toFixed(2)) : null;
          const revenueHigh = Number.isFinite(priceNum) && salesHigh != null ? Number((priceNum * salesHigh).toFixed(2)) : null;

          await client
            .from("asin_daily_metrics")
            .upsert(
              [{
                user_id: userId,
                asin_data_id: asinId,
                asin: row.asin,
                country: row.country || "com",
                day: todayKey,
                bsr: Number.isFinite(bsrNum) ? bsrNum : null,
                price: Number.isFinite(priceNum) ? priceNum : null,
                review_count: Number(todayRec.review_count) || null,
                rating: Number(todayRec.rating) || null,
                availability_code: todayRec.availability === true ? "IN_STOCK" : null,
                stock_status: null,
                sales_est_low: salesLow,
                sales_est_high: salesHigh,
                revenue_est_low: revenueLow,
                revenue_est_high: revenueHigh,
              }],
              { onConflict: "asin_data_id, day" },
            );
        }

        // Compute performance snapshot for today using last 30/60 days
        const last30Days = days.slice(-30);
        const bsr30 = last30Days.map((d) => Number(byDay.get(d)?.bsr)).filter((v) => Number.isFinite(v) && v > 0) as number[];
        const price30 = last30Days.map((d) => Number(byDay.get(d)?.price)).filter((v) => Number.isFinite(v) && v > 0) as number[];

        const allBsr = days.map((d) => Number(byDay.get(d)?.bsr)).filter((v) => Number.isFinite(v) && v > 0) as number[];
        const minEver = allBsr.length ? Math.min(...allBsr) : null;
        const maxEver = allBsr.length ? Math.max(...allBsr) : null;
        const curr = allBsr.length ? allBsr[allBsr.length - 1] : null;

        let qi: number | null = null;
        if (minEver != null && maxEver != null && curr != null && maxEver > minEver) {
          const r = (maxEver - curr) / (maxEver - minEver);
          qi = Math.round(clamp01(r) * 100);
        }

        // Normalize BSR over last30 to [0,1] window
        let vol30: number | null = null;
        let mom7: number | null = null;
        let elasticity: number | null = null;
        let pct: number | null = null;
        if (bsr30.length >= 5) {
          const bMin = Math.min(...bsr30);
          const bMax = Math.max(...bsr30);
          const norm = bsr30.map((v) => (bMax > bMin ? (v - bMin) / (bMax - bMin) : 0.5));
          vol30 = Number(stddev(norm).toFixed(4));
          const window = norm.slice(-7);
          if (window.length >= 2) {
            const xs = Array.from({ length: window.length }, (_, i) => i);
            const s = linRegSlope(xs, window);
            mom7 = s != null ? Number(s.toFixed(4)) : null; // negative slope means improving rank
          }
          if (norm.length > 1) {
            const currN = norm[norm.length - 1];
            pct = Number((1 - currN).toFixed(4)); // 1 is best in window
          }
        }

        if (bsr30.length >= 5 && price30.length >= 5) {
          const bMin = Math.min(...bsr30);
          const bMax = Math.max(...bsr30);
          const normB = bsr30.map((v) => (bMax > bMin ? (v - bMin) / (bMax - bMin) : 0.5));
          const xs = price30;
          const ys = normB.slice(-xs.length); // align lengths defensively
          const slope = linRegSlope(xs.map((_, i) => xs[i]), ys);
          elasticity = slope != null ? Number(slope.toFixed(4)) : null; // +ve means higher price -> worse rank
        }

        await client
          .from("performance_snapshots")
          .upsert(
            [{
              user_id: userId,
              asin_data_id: asinId,
              asin: row.asin,
              country: row.country || "com",
              day: todayKey,
              qi_score: qi,
              baseline_percentile: pct,
              volatility_30: vol30,
              momentum_7: mom7,
              elasticity_est: elasticity,
              notes: null,
            }],
            { onConflict: "asin_data_id, day" },
          );
      }
    }

    // Determine which users to process
    let userIds: string[] = [];
    if (inputUserId) {
      userIds = [inputUserId];
    } else {
      // process all distinct users that have asin_data
      const { data: rows, error } = await client
        .from("asin_data")
        .select("user_id")
        .limit(10000);
      if (error) {
        return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      userIds = Array.from(new Set((rows || []).map((r: any) => r.user_id).filter(Boolean)));
    }

    for (const uid of userIds) {
      await computeForUser(uid);
    }

    return new Response(JSON.stringify({ success: true, processedUsers: userIds.length }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: String(e?.message || e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
