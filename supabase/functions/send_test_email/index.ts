import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4?target=deno&bundle";

declare const Deno: any;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

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
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ success: false, error: "Missing Supabase env" }), {
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

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

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

    const now = new Date().toISOString();
    const subject = "[KDPInsights] Test email";
    const text = ['This is a test email from KDPInsights.', `Time (UTC): ${now}`].join("\n");

    const sent = await sendMailgunEmail(email, subject, text);
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
