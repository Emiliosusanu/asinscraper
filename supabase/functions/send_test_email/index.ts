import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4?target=deno&bundle";

declare const Deno: any;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

function isValidEmail(s: any): boolean {
  const t = String(s || "").trim();
  if (!t) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}

function readMailgunEnv() {
  const apiKey = Deno.env.get("MAILGUN_API_KEY") ?? "";
  const domain = Deno.env.get("MAILGUN_DOMAIN") ?? "";
  const from = Deno.env.get("MAILGUN_FROM") ?? "";
  const apiBase = Deno.env.get("MAILGUN_API_BASE") ?? "";
  return { apiKey, domain, from, apiBase };
}

function getMissingMailgunEnv(): string[] {
  const { apiKey, domain, from } = readMailgunEnv();
  const missing: string[] = [];
  if (!apiKey) missing.push("MAILGUN_API_KEY");
  if (!domain) missing.push("MAILGUN_DOMAIN");
  if (!from) missing.push("MAILGUN_FROM");
  return missing;
}

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function getBearerToken(req: Request): string | null {
  const auth = req.headers.get("Authorization") || req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

async function sendMailgunEmail(toEmail: string, subject: string, text: string): Promise<{ ok: boolean; error?: string }> {
  const missing = getMissingMailgunEnv();
  if (missing.length) return { ok: false, error: `Missing Mailgun env: ${missing.join(", ")}` };
  try {
    const { apiKey, domain, from, apiBase } = readMailgunEnv();
    const base = (apiBase || "https://api.mailgun.net").replace(/\/+$/, "");
    const url = `${base}/v3/${domain}/messages`;
    const body = new URLSearchParams();
    body.set("from", from);
    body.set("to", toEmail);
    body.set("subject", subject);
    body.set("text", text);
    const auth = btoa(`api:${apiKey}`);

    const r = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    if (!r.ok) {
      const t = await r.text();
      return { ok: false, error: `Mailgun error ${r.status}: ${t}` };
    }

    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!SUPABASE_URL || (!SUPABASE_SERVICE_ROLE_KEY && !SUPABASE_ANON_KEY)) {
      const missing: string[] = [];
      if (!SUPABASE_URL) missing.push("SUPABASE_URL");
      if (!SUPABASE_SERVICE_ROLE_KEY && !SUPABASE_ANON_KEY) missing.push("SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY");

      return new Response(JSON.stringify({ success: false, error: `Missing Supabase env: ${missing.join(", ")}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const jwt = getBearerToken(req);
    if (!jwt) {
      return new Response(JSON.stringify({ success: false, error: "Missing Authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseKey = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
    const supabaseAdmin = createClient(SUPABASE_URL, supabaseKey, {
      auth: { persistSession: false },
    });

    const supabaseUser = createClient(SUPABASE_URL, supabaseKey, {
      global: {
        headers: {
          Authorization: `Bearer ${jwt}`,
        },
      },
      auth: { persistSession: false },
    });

    let payload: any = null;
    try {
      payload = req.method === "POST" ? await req.json() : null;
    } catch (_) {
      payload = null;
    }
    const overrideToEmail = String(payload?.toEmail || "").trim();

    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(jwt);
    if (userErr || !userData?.user?.id) {
      return new Response(JSON.stringify({ success: false, error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const email = userData.user.email;
    if (!email) {
      return new Response(JSON.stringify({ success: false, error: "No email on account" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let settings: any = null;
    try {
      const { data } = await supabaseUser
        .from("settings")
        .select("email_alert_recipient, stock_alert_enabled, stock_alert_on_change, bsr_alert_enabled, bsr_alert_threshold_pct")
        .eq("user_id", userData.user.id)
        .maybeSingle();
      settings = data || null;
    } catch (_e) {
      try {
        const { data } = await supabaseUser
          .from("settings")
          .select("stock_alert_enabled, stock_alert_on_change, bsr_alert_enabled, bsr_alert_threshold_pct")
          .eq("user_id", userData.user.id)
          .maybeSingle();
        settings = data || null;
      } catch (_e2) {
        settings = null;
      }
    }

    if (!settings && SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const { data } = await supabaseAdmin
          .from("settings")
          .select("email_alert_recipient, stock_alert_enabled, stock_alert_on_change, bsr_alert_enabled, bsr_alert_threshold_pct")
          .eq("user_id", userData.user.id)
          .maybeSingle();
        settings = data || null;
      } catch (_e) {
        try {
          const { data } = await supabaseAdmin
            .from("settings")
            .select("stock_alert_enabled, stock_alert_on_change, bsr_alert_enabled, bsr_alert_threshold_pct")
            .eq("user_id", userData.user.id)
            .maybeSingle();
          settings = data || null;
        } catch (_e2) {
          settings = null;
        }
      }
    }

    const recipientFromSettings = String(settings?.email_alert_recipient || "").trim();
    const effectiveRecipient = isValidEmail(overrideToEmail)
      ? overrideToEmail
      : isValidEmail(recipientFromSettings)
        ? recipientFromSettings
        : String(email);

    const stockAlertEnabled = !!settings?.stock_alert_enabled;
    const stockAlertOnChange = !!settings?.stock_alert_on_change;
    const bsrAlertEnabled = !!settings?.bsr_alert_enabled;
    const bsrAlertThresholdPct = Number.isFinite(Number(settings?.bsr_alert_threshold_pct)) ? Number(settings?.bsr_alert_threshold_pct) : 20;

    const now = new Date().toISOString();
    const subject = "[KDPInsights] Test email (sample alerts)";
    const lines: string[] = [];
    lines.push("This is a test email from KDPInsights.");
    lines.push(`Time (UTC): ${now}`);
    lines.push("");
    lines.push("Alert settings (current):");
    lines.push(`- Recipient override: ${isValidEmail(recipientFromSettings) ? recipientFromSettings : "(none)"}`);
    lines.push(`- Stock (Out of stock): ${stockAlertEnabled ? "ON" : "OFF"}`);
    lines.push(`- Stock (Any change): ${stockAlertOnChange ? "ON" : "OFF"}`);
    lines.push(`- BSR change %: ${bsrAlertEnabled ? `ON (threshold ${bsrAlertThresholdPct}%)` : "OFF"}`);
    lines.push("");
    lines.push("Sample alerts (examples):");

    let anySample = false;
    if (stockAlertOnChange) {
      anySample = true;
      lines.push("");
      lines.push("---");
      lines.push("[Example] Stock changed (Any change)");
      lines.push("ASIN: B0TESTSTOCK");
      lines.push("Title: Example Book Title");
      lines.push("Previous: IN_STOCK");
      lines.push("Now: SHIP_DELAY");
      lines.push(`Time (UTC): ${now}`);
    }
    if (stockAlertEnabled) {
      anySample = true;
      lines.push("");
      lines.push("---");
      lines.push("[Example] Out of stock");
      lines.push("ASIN: B0TESTOOS");
      lines.push("Title: Example Book Title");
      lines.push("Previous: IN_STOCK");
      lines.push("Now: OOS");
      lines.push(`Time (UTC): ${now}`);
    }
    if (bsrAlertEnabled) {
      anySample = true;
      lines.push("");
      lines.push("---");
      lines.push("[Example] BSR change %");
      lines.push("ASIN: B0TESTBSR");
      lines.push("Title: Example Book Title");
      lines.push("Previous BSR: 12000");
      lines.push("New BSR: 18000");
      lines.push(`Change: 50.0% (threshold ${Number(bsrAlertThresholdPct).toFixed(0)}%)`);
      lines.push(`Time (UTC): ${now}`);
    }
    if (!anySample) {
      lines.push("");
      lines.push("No alert conditions are enabled. Enable at least one condition in Settings → Automation.");
    }

    const text = lines.join("\n");

    const sent = await sendMailgunEmail(effectiveRecipient, subject, text);
    if (!sent.ok) {
      return new Response(JSON.stringify({ success: false, error: sent.error || "Mailgun send failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ success: false, error: e?.message || String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
