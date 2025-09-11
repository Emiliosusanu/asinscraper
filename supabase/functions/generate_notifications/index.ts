// deno-lint-ignore-file no-explicit-any
/// <reference lib="deno.ns" />
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.1";
import {
  WindowParams,
  SnapshotPayload,
  SnapshotStatus,
  Confidence,
  filterValidSamples,
  reviewVelocity as calcReviewVelocity,
  momPercent,
  estimateRoyalty,
  computeDrivers,
  weightedNetImpact,
  confidenceFrom,
  sentimentFrom,
  defaultWeights,
  renormalizeWeights,
} from "../_shared/notifications.ts";

const ALGO_VERSION = "notifications.v1";

function recommendationsFor(status: SnapshotStatus): string[] {
  if (status === 'better') {
    return [
      'Scala budget/offerte su termini e campagne con performance in miglioramento',
      'Focalizzati sui driver principali per massimizzare il momentum',
    ];
  }
  if (status === 'worse') {
    return [
      'Riduci offerte su termini in calo e verifica targeting',
      'Controlla prezzo/BSR e valuta ottimizzazioni del listato',
    ];
  }
  return [
    'Monitora, testa nuove keyword e creativi',
  ];
}

function json(res: unknown, status = 200) {
  return new Response(JSON.stringify(res), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function daysBetween(a: Date, b: Date): number {
  return Math.max(1, Math.round((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24)));
}

serve(async (req: Request) => {
  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get("user_id") || undefined;
    const windowDays = Number(url.searchParams.get("windowDays") || 30);

    const supabaseUrl = (globalThis as any).Deno?.env.get("SUPABASE_URL") as string | undefined || Deno.env.get("SUPABASE_URL");
    const serviceKey = (globalThis as any).Deno?.env.get("SUPABASE_SERVICE_ROLE_KEY") as string | undefined || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) {
      return json({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }, 500);
    }

    const client = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // Resolve users to process
    let users: string[] = [];
    if (userId) {
      users = [userId];
    } else {
      const { data, error } = await client
        .from("asin_data")
        .select("user_id")
        .limit(10000);
      if (error) throw error;
      users = Array.from(new Set((data || []).map((r: any) => r.user_id).filter(Boolean)));
    }

    const fromCurr = new Date();
    const fromPrev = new Date();
    const currStart = new Date(fromCurr); currStart.setDate(currStart.getDate() - windowDays);
    const prevStart = new Date(fromPrev); prevStart.setDate(prevStart.getDate() - windowDays * 2);
    const prevEnd = new Date(prevStart); prevEnd.setDate(prevEnd.getDate() + windowDays);

    let grandBetter = 0, grandWorse = 0, grandStable = 0;
    const items: SnapshotPayload[] = [];

    for (const uid of users) {
      // Load ASINs for user
      const { data: asins, error: e1 } = await client
        .from("asin_data")
        .select("id, asin, title, country, page_count, price")
        .eq("user_id", uid)
        .limit(1000);
      if (e1) throw e1;

      for (const asinRow of (asins || [])) {
        const asinId = asinRow.id;
        const asin = asinRow.asin as string;

        // History in prev and curr windows
        const { data: histPrev, error: ePrev } = await client
          .from("asin_history")
          .select("created_at, bsr, review_count, price")
          .eq("asin_data_id", asinId)
          .gte("created_at", prevStart.toISOString())
          .lt("created_at", prevEnd.toISOString())
          .order("created_at", { ascending: true });
        if (ePrev) throw ePrev;

        const { data: histCurr, error: eCurr } = await client
          .from("asin_history")
          .select("created_at, bsr, review_count, price")
          .eq("asin_data_id", asinId)
          .gte("created_at", currStart.toISOString())
          .order("created_at", { ascending: true });
        if (eCurr) throw eCurr;

        const prevRows = filterValidSamples(histPrev || []);
        const currRows = filterValidSamples(histCurr || []);

        // Calculate per-window aggregates
        const prevDays = prevRows.length > 0
          ? daysBetween(new Date(prevRows[prevRows.length - 1].created_at), new Date(prevRows[0].created_at))
          : windowDays;
        const currDays = currRows.length > 0
          ? daysBetween(new Date(currRows[currRows.length - 1].created_at), new Date(currRows[0].created_at))
          : windowDays;

        const prevReviewDelta = prevRows.length > 0
          ? (Number(prevRows[prevRows.length - 1].review_count || 0) - Number(prevRows[0].review_count || 0))
          : 0;
        const currReviewDelta = currRows.length > 0
          ? (Number(currRows[currRows.length - 1].review_count || 0) - Number(currRows[0].review_count || 0))
          : 0;

        const prev = {
          avgBsr: Math.round((prevRows.reduce((a, r) => a + (Number(r.bsr) || 0), 0) / Math.max(1, prevRows.length)) || 0),
          avgPrice: Number(((prevRows.reduce((a, r) => a + (Number(r.price) || 0), 0) / Math.max(1, prevRows.length)) || 0).toFixed(2)),
          avgRoyalty: Number((prevRows.reduce((a, r) => a + estimateRoyalty({ price: Number(r.price) || asinRow.price, page_count: asinRow.page_count, country: asinRow.country }), 0) / Math.max(1, prevRows.length)).toFixed(2)),
          reviewVelocity: Number(calcReviewVelocity(prevReviewDelta, prevDays).toFixed(3)),
          samples: prevRows.length,
        };
        const curr = {
          avgBsr: Math.round((currRows.reduce((a, r) => a + (Number(r.bsr) || 0), 0) / Math.max(1, currRows.length)) || 0),
          avgPrice: Number(((currRows.reduce((a, r) => a + (Number(r.price) || 0), 0) / Math.max(1, currRows.length)) || 0).toFixed(2)),
          avgRoyalty: Number((currRows.reduce((a, r) => a + estimateRoyalty({ price: Number(r.price) || asinRow.price, page_count: asinRow.page_count, country: asinRow.country }), 0) / Math.max(1, currRows.length)).toFixed(2)),
          reviewVelocity: Number(calcReviewVelocity(currReviewDelta, currDays).toFixed(3)),
          samples: currRows.length,
        };

        // Zero-guard: if both windows have no meaningful signal
        const bothEmpty = (prev.samples === 0 && curr.samples === 0) ||
                          (prev.avgBsr === 0 && curr.avgBsr === 0 && prev.avgPrice === 0 && curr.avgPrice === 0);
        const coverageDays = Math.min(windowDays, currDays);
        const conf: Confidence = bothEmpty ? 'low' : confidenceFrom(coverageDays, curr.samples);

        let drivers: string[] = [];
        let netImpact = 0;
        let status: SnapshotStatus = 'stable';
        let momPct = 0;
        let driverScore = 0; // + for positive drivers, - for negative

        if (!bothEmpty) {
          // Load personalized weights if any
          let weights = defaultWeights();
          const { data: wrows } = await client
            .from("notification_daily_rollup")
            .select("weights, date")
            .eq("user_id", uid)
            .eq("asin", asin)
            .order("date", { ascending: false })
            .limit(1);
          const w0 = (wrows && wrows[0]?.weights) || null;
          if (w0 && typeof w0 === 'object') {
            weights = renormalizeWeights({
              reviews: Number(w0.reviews ?? 0.35),
              bsr: Number(w0.bsr ?? 0.30),
              royalty: Number(w0.royalty ?? 0.25),
              price: Number(w0.price ?? 0.10),
            });
          }
          const { drivers: drv, changes } = computeDrivers(prev, curr);
          drivers = drv;
          netImpact = weightedNetImpact(changes, prev, weights);
          momPct = momPercent(prev.avgRoyalty, curr.avgRoyalty);
          // Derive driver score per spec thresholds
          if (changes.rvDelta >= 0.1) driverScore += 1; else if (changes.rvDelta <= -0.1) driverScore -= 1;
          if (changes.bsrDeltaPct >= 3) driverScore += 1; else if (changes.bsrDeltaPct <= -3) driverScore -= 1;
          if (changes.royaltyDeltaPct >= 1) driverScore += 1; else if (changes.royaltyDeltaPct <= -1) driverScore -= 1;
          if (changes.priceDeltaPct >= 1) driverScore += 1; else if (changes.priceDeltaPct <= -1) driverScore -= 1;
          // Status decision uses driverScore and MoM thresholds
          status = (driverScore > 0 && momPct > 1) ? 'better' : (driverScore < 0 && momPct < -1) ? 'worse' : 'stable';
        }

        const payload: SnapshotPayload = {
          asin,
          user_id: uid,
          status,
          netImpact: Number(netImpact.toFixed(1)),
          sentiment: sentimentFrom(status),
          drivers,
          confidence: conf,
          details: {
            prev: { avgRoyalty: prev.avgRoyalty, avgPrice: prev.avgPrice, avgBsr: prev.avgBsr, reviewVelocity: prev.reviewVelocity, samples: prev.samples },
            curr: { avgRoyalty: curr.avgRoyalty, avgPrice: curr.avgPrice, avgBsr: curr.avgBsr, reviewVelocity: curr.reviewVelocity, samples: curr.samples },
            coverageDays,
          },
          algoVersion: ALGO_VERSION,
          createdAt: new Date().toISOString(),
        };

        // Persist snapshot
        const { data: snapIns, error: eIns } = await client
          .from("notification_snapshots")
          .insert({
            asin,
            user_id: uid,
            status,
            net_impact: payload.netImpact,
            sentiment: payload.sentiment,
            drivers: payload.drivers,
            recommendations: recommendationsFor(status),
            confidence: payload.confidence,
            details: payload.details,
            algo_version: payload.algoVersion,
          })
          .select("id")
          .single();
        if (eIns) throw eIns;

        // Upsert rollup for today
        const today = new Date(); const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
        const dateStr = d.toISOString().slice(0,10);
        const columns: any = { user_id: uid, asin, date: dateStr, better: 0, worse: 0, stable: 0, net_impact_avg: payload.netImpact };
        columns[status] = 1;
        const { error: eRoll } = await client
          .from("notification_daily_rollup")
          .upsert(columns, { onConflict: "user_id,asin,date" });
        if (eRoll) throw eRoll;

        if (status === 'better') grandBetter++; else if (status === 'worse') grandWorse++; else grandStable++;
        items.push(payload);
      }
    }

    return json({ counts: { better: grandBetter, worse: grandWorse, stable: grandStable }, items });
  } catch (e: any) {
    return json({ error: e?.message || String(e) }, 500);
  }
});
