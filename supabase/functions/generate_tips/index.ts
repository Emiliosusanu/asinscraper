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

function opCompare(a: number | null, op: string, b: number): boolean {
  if (a == null || !Number.isFinite(a)) return false;
  switch (op) {
    case "lt": return a < b;
    case "lte": return a <= b;
    case "gt": return a > b;
    case "gte": return a >= b;
    case "eq": return a === b;
    case "neq": return a !== b;
    default: return false;
  }
}

function evalCondition(snap: any, cond: any): boolean {
  if (!cond || typeof cond !== "object") return false;
  if (Array.isArray(cond.all)) return cond.all.every((c) => evalCondition(snap, c));
  if (Array.isArray(cond.any)) return cond.any.some((c) => evalCondition(snap, c));
  const metric = String(cond.metric || "");
  const op = String(cond.op || "");
  const value = Number(cond.value);
  if (!metric || !op || !Number.isFinite(value)) return false;
  const a = snap[metric];
  return opCompare(typeof a === "string" ? Number(a) : a, op, value);
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
    const userIdInput: string | null = payload?.userId ?? null;
    const day: string = payload?.day || toDateKey(new Date());

    const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    async function processForUser(userId: string, dayKey: string): Promise<{created: number; skipped: number}> {
      // Load rules
      const { data: rules, error: rulesErr } = await client
        .from("notification_rules")
        .select("id, name, rule_type, condition, cooloff_seconds, channels, enabled")
        .eq("user_id", userId)
        .eq("enabled", true);
      if (rulesErr) throw rulesErr;

      if (!rules || rules.length === 0) return { created: 0, skipped: 0 };

      // Load today's snapshots
      const { data: snaps, error: snapsErr } = await client
        .from("performance_snapshots")
        .select("id, asin_data_id, asin, country, day, qi_score, baseline_percentile, volatility_30, momentum_7, elasticity_est")
        .eq("user_id", userId)
        .eq("day", dayKey);
      if (snapsErr) throw snapsErr;

      // Optional tips library
      const { data: tipsLib } = await client
        .from("tips_library")
        .select("code, title, body_md, severity");
      const tipsByCode = new Map<string, any>();
      for (const t of tipsLib || []) tipsByCode.set(t.code, t);

      let created = 0;
      let skipped = 0;

      for (const rule of rules || []) {
        const cond = (rule as any).condition || {};
        const cooloffSec = Number(rule.cooloff_seconds || 21600);
        const channels: string[] = Array.isArray(rule.channels) ? rule.channels : ["inapp"];

        for (const snap of snaps || []) {
          const pass = evalCondition(snap, cond);
          if (!pass) { skipped++; continue; }

          // dedupe by cooloff
          const keySig = JSON.stringify({ rule: rule.id, asin: snap.asin_data_id, cond });
          const dedupeKey = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(keySig)).then((buf) =>
            Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("")
          );

          const { data: recent } = await client
            .from("notification_events")
            .select("id, created_at")
            .eq("user_id", userId)
            .eq("dedupe_key", dedupeKey)
            .gte("created_at", new Date(Date.now() - cooloffSec * 1000).toISOString())
            .limit(1);
          if (recent && recent.length) { skipped++; continue; }

          // optional tip binding via condition.tip_code
          const tipCode = (cond && (cond as any).tip_code) ? String((cond as any).tip_code) : null;
          const tip = tipCode ? tipsByCode.get(tipCode) : null;

          const severity = tip?.severity || 'info';
          const title = tip?.title || rule.name || 'Performance update';
          const baseMd = tip?.body_md || '';
          const md = `${baseMd}\n\nASIN: ${snap.asin}\nCountry: ${snap.country}\n\nMetrics (today):\n- QI: ${snap.qi_score ?? '—'}\n- Momentum(7): ${snap.momentum_7 ?? '—'}\n- Volatility(30): ${snap.volatility_30 ?? '—'}\n- Baseline pct: ${snap.baseline_percentile ?? '—'}\n- Elasticity est: ${snap.elasticity_est ?? '—'}`;

          // insert one event per channel
          for (const ch of channels) {
            const { error: insErr } = await client.from("notification_events").insert({
              user_id: userId,
              asin_data_id: snap.asin_data_id,
              rule_id: rule.id,
              severity,
              title,
              body_md: md,
              channel: ch,
              dedupe_key: dedupeKey,
              status: 'queued',
            });
            if (insErr) console.error('insert event error', insErr);
          }
          created++;
        }
      }

      return { created, skipped };
    }

    // Decide which users to process
    let userIds: string[] = [];
    if (userIdInput) {
      userIds = [userIdInput];
    } else {
      // Use users with enabled rules
      const { data: usersRows, error: uerr } = await client
        .from('notification_rules')
        .select('user_id')
        .eq('enabled', true)
        .limit(10000);
      if (uerr) throw uerr;
      userIds = Array.from(new Set((usersRows || []).map((r: any) => r.user_id).filter(Boolean)));
    }

    let totalCreated = 0; let totalSkipped = 0;
    for (const uid of userIds) {
      const { created, skipped } = await processForUser(uid, day);
      totalCreated += created; totalSkipped += skipped;
    }

    return new Response(JSON.stringify({ success: true, created: totalCreated, skipped: totalSkipped, users: userIds.length }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: String(e?.message || e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
