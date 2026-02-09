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

function formatTimestampUtc(d: Date): string {
  const iso = d.toISOString();
  return iso.slice(0, 19).replace("T", " ");
}

function getDashboardLink(req: Request): string {
  const base = String(Deno.env.get("APP_BASE_URL") || "").trim();
  if (base) return base.replace(/\/$/, "") + "/";
  const origin = String(req.headers.get("origin") || "").trim();
  return origin ? origin.replace(/\/$/, "") + "/" : "";
}

function renderStockStatusLabel(code: any): string {
  const c = String(code || "").toUpperCase();
  const inStockCodes = new Set(["IN_STOCK", "LOW_STOCK", "SHIP_DELAY", "POD", "OTHER_SELLERS", "MADE_TO_ORDER", "AVAILABLE_SOON", "PREORDER"]);
  const outOfStockCodes = new Set(["OOS", "UNAVAILABLE", "OUT_OF_STOCK"]);
  if (inStockCodes.has(c)) return "IN STOCK";
  if (outOfStockCodes.has(c)) return "OUT OF STOCK";
  return c || "UNKNOWN";
}

function getMarketplaceDomain(country: string): string {
  const map: Record<string, string> = {
    com: "amazon.com",
    us: "amazon.com",
    it: "amazon.it",
    de: "amazon.de",
    fr: "amazon.fr",
    es: "amazon.es",
    "co.uk": "amazon.co.uk",
    uk: "amazon.co.uk",
  };
  return map[String(country || "").toLowerCase()] || map.com;
}

function buildStockOosEmail(args: {
  firstName: string | null;
  bookTitle: string;
  asin: string;
  marketplace: string;
  oldCode: any;
  newCode: any;
  timestampUtc: string;
  dashboardLink: string;
}): { subject: string; text: string } {
  const name = args.firstName || "there";
  const subject = `Out of stock · ${args.bookTitle} · Amazon`;
  const lines: string[] = [];
  lines.push(`Hi ${name},`);
  lines.push("");
  lines.push("One of your books is currently out of stock on Amazon.");
  lines.push("");
  lines.push("Book:");
  lines.push(args.bookTitle);
  lines.push(`ASIN: \`${args.asin}\``);
  lines.push(`Marketplace: ${args.marketplace}`);
  lines.push("");
  lines.push("Stock status changed:");
  lines.push(`${renderStockStatusLabel(args.oldCode)} → ${renderStockStatusLabel(args.newCode)}`);
  lines.push("");
  lines.push(`Detected at: ${args.timestampUtc} UTC`);
  lines.push("");
  lines.push("If you’re running ads for this ASIN, consider pausing campaigns until availability is restored.");
  if (args.dashboardLink) {
    lines.push("");
    lines.push("Open dashboard:");
    lines.push(args.dashboardLink);
  }
  lines.push("");
  lines.push("—");
  lines.push("KDP Insight Bot");
  lines.push("Automated alert · No reply needed");
  return { subject, text: lines.join("\n") };
}

function buildStockChangeEmail(args: {
  firstName: string | null;
  bookTitle: string;
  asin: string;
  marketplace: string;
  oldCode: any;
  newCode: any;
  timestampUtc: string;
  dashboardLink: string;
}): { subject: string; text: string } {
  const name = args.firstName || "there";
  const subject = `Stock status update · ${args.bookTitle} · Amazon`;
  const lines: string[] = [];
  lines.push(`Hi ${name},`);
  lines.push("");
  lines.push("Amazon availability has changed for one of your tracked books.");
  lines.push("");
  lines.push("Book:");
  lines.push(args.bookTitle);
  lines.push(`ASIN: \`${args.asin}\``);
  lines.push(`Marketplace: ${args.marketplace}`);
  lines.push("");
  lines.push("Stock status:");
  lines.push(`${renderStockStatusLabel(args.oldCode)} → ${renderStockStatusLabel(args.newCode)}`);
  lines.push("");
  lines.push(`Detected at: ${args.timestampUtc} UTC`);
  lines.push("");
  lines.push("This email is sent only when availability changes.");
  if (args.dashboardLink) {
    lines.push("");
    lines.push("View book:");
    lines.push(args.dashboardLink);
  }
  lines.push("");
  lines.push("—");
  lines.push("KDP Insight Bot");
  lines.push("Automated alert · No reply needed");
  return { subject, text: lines.join("\n") };
}

function buildBsrPctEmail(args: {
  firstName: string | null;
  bookTitle: string;
  asin: string;
  marketplace: string;
  oldBsr: number;
  newBsr: number;
  pct: number;
  thresholdPct: number;
  timestampUtc: string;
  dashboardLink: string;
}): { subject: string; text: string } {
  const name = args.firstName || "there";
  const pctForSubject = Number.isFinite(args.pct) ? Math.round(args.pct) : 0;
  const subject = `BSR change ${pctForSubject}% · ${args.bookTitle} · Amazon`;
  const lines: string[] = [];
  lines.push(`Hi ${name},`);
  lines.push("");
  lines.push("The Best Seller Rank for one of your books changed beyond your alert threshold.");
  lines.push("");
  lines.push("Book:");
  lines.push(args.bookTitle);
  lines.push(`ASIN: \`${args.asin}\``);
  lines.push(`Marketplace: ${args.marketplace}`);
  lines.push("");
  lines.push("BSR change:");
  lines.push(`${args.oldBsr} → ${args.newBsr}`);
  lines.push(`Change: ${args.pct.toFixed(1)}% (threshold ${Math.round(args.thresholdPct)}%)`);
  lines.push("");
  lines.push(`Detected at: ${args.timestampUtc} UTC`);
  lines.push("");
  lines.push("This may indicate a sales spike, drop, or category movement.");
  if (args.dashboardLink) {
    lines.push("");
    lines.push("View details:");
    lines.push(args.dashboardLink);
  }
  lines.push("");
  lines.push("—");
  lines.push("KDP Insight Bot");
  lines.push("Automated alert · No reply needed");
  return { subject, text: lines.join("\n") };
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

    const dashboardLink = getDashboardLink(req);
    const ts = formatTimestampUtc(new Date());

    const meta = (userData.user as any)?.user_metadata || {};
    const rawName = String(meta?.first_name || meta?.full_name || "").trim();
    const firstName = rawName ? rawName.split(/\s+/)[0] : (email ? String(email).split("@")[0] : null);

    let book: { asin: string; title: string; country: string } | null = null;
    try {
      const { data } = await supabaseUser
        .from("asin_data")
        .select("asin, title, country")
        .eq("user_id", userData.user.id)
        .limit(1);
      if (Array.isArray(data) && data.length) {
        book = {
          asin: String((data[0] as any)?.asin || ""),
          title: String((data[0] as any)?.title || "").trim(),
          country: String((data[0] as any)?.country || "com").toLowerCase(),
        };
      }
    } catch (_e) {
      book = null;
    }

    const asin = book?.asin || "B0TEST";
    const bookTitle = book?.title || "Example Book Title";
    const marketplace = getMarketplaceDomain(book?.country || "com");

    let subject = "";
    let text = "";

    if (stockAlertEnabled) {
      const emailTpl = buildStockOosEmail({
        firstName,
        bookTitle,
        asin,
        marketplace,
        oldCode: "IN_STOCK",
        newCode: "OOS",
        timestampUtc: ts,
        dashboardLink,
      });
      subject = emailTpl.subject;
      text = emailTpl.text;
    } else if (stockAlertOnChange) {
      const emailTpl = buildStockChangeEmail({
        firstName,
        bookTitle,
        asin,
        marketplace,
        oldCode: "IN_STOCK",
        newCode: "SHIP_DELAY",
        timestampUtc: ts,
        dashboardLink,
      });
      subject = emailTpl.subject;
      text = emailTpl.text;
    } else if (bsrAlertEnabled) {
      const oldBsr = 12000;
      const newBsr = 18000;
      const pct = Math.abs((newBsr - oldBsr) / oldBsr) * 100;
      const emailTpl = buildBsrPctEmail({
        firstName,
        bookTitle,
        asin,
        marketplace,
        oldBsr,
        newBsr,
        pct,
        thresholdPct: bsrAlertThresholdPct,
        timestampUtc: ts,
        dashboardLink,
      });
      subject = emailTpl.subject;
      text = emailTpl.text;
    } else {
      const fallbackLines: string[] = [];
      fallbackLines.push(`Hi ${firstName || "there"},`);
      fallbackLines.push("");
      fallbackLines.push("No alert conditions are enabled.");
      fallbackLines.push("Enable at least one condition in Settings → Automation.");
      fallbackLines.push("");
      fallbackLines.push("—");
      fallbackLines.push("KDP Insight Bot");
      fallbackLines.push("Automated alert · No reply needed");
      subject = `Stock status update · ${bookTitle} · Amazon`;
      text = fallbackLines.join("\n");
    }

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
