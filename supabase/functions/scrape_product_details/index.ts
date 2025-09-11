// Supabase Edge Function: scrape_product_details
// Fetches Amazon product page via ScraperAPI and extracts details
// Inputs: { asin, country, userId }
// Output: { success, data: { page_count, dimensions_raw, trim_size, binding, language, series, category, interior_type, interior_confidence }, error? }

import { serve } from "https://deno.land/std@0.167.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.30.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const countryToDomain: Record<string, string> = {
  "com": "amazon.com",
  "us": "amazon.com",
  "it": "amazon.it",
  "de": "amazon.de",
  "fr": "amazon.fr",
  "es": "amazon.es",
  "co.uk": "amazon.co.uk",
  "uk": "amazon.co.uk",
};

const bindingMap: Array<{ rx: RegExp; val: string }> = [
  { rx: /paperback|copertina\s*flessibile|taschenbuch|broché|tapa\s*blanda/i, val: "paperback" },
  { rx: /hardcover|copertina\s*rigida|gebundenes\s*buch|relié|tapa\s*dura/i, val: "hardcover" },
];

const languageKeys: Array<{ rx: RegExp; key: string }> = [
  { rx: /language|lingua|sprache|langue|idioma/i, key: "language" },
];

const pagesRx = /(\d{1,4})\s*(pages|pagine|seiten|pages|páginas)/i;
const dimsLineRx = /(dimensions|product\s*dimensions|dimensioni|abmessungen|dimensions\s*du\s*produit|dimensiones)/i;

function normalizeTrimFromText(text: string): string | null {
  const s = text.toLowerCase();
  let m = s.match(/(\d{1,2}(?:[.,]\d+)?)\s*[x×]\s*(\d{1,2}(?:[.,]\d+)?)\s*(?:in|inch|inches)/i);
  if (m) {
    const w = parseFloat(m[1].replace(",", "."));
    const h = parseFloat(m[2].replace(",", "."));
    return toStdTrim(w, h);
  }
  m = s.match(/(\d{1,2}(?:[.,]\d+)?)\s*[x×]\s*(\d{1,2}(?:[.,]\d+)?)\s*cm/i);
  if (m) {
    const wc = parseFloat(m[1].replace(",", "."));
    const hc = parseFloat(m[2].replace(",", "."));
    const w = wc / 2.54;
    const h = hc / 2.54;
    return toStdTrim(w, h);
  }
  return null;
}

function toStdTrim(wIn: number, hIn: number): string {
  const std = [
    { w: 6.0, h: 9.0, label: "6 × 9 in" },
    { w: 8.5, h: 11.0, label: "8.5 × 11 in" },
    { w: 8.0, h: 10.0, label: "8 × 10 in" },
    { w: 5.0, h: 8.0, label: "5 × 8 in" },
    { w: 5.5, h: 8.5, label: "5.5 × 8.5 in" },
    { w: 7.5, h: 9.25, label: "7.5 × 9.25 in" },
  ];
  const tol = 0.12;
  for (const s of std) {
    if (Math.abs(wIn - s.w) <= tol && Math.abs(hIn - s.h) <= tol) return s.label;
    if (Math.abs(wIn - s.h) <= tol && Math.abs(hIn - s.w) <= tol) return s.label;
  }
  return `${wIn.toFixed(2)} × ${hIn.toFixed(2)} in`;
}

function detectInterior(html: string, title: string, price: number, pages: number): { type: string; confidence: number } {
  const t = `${title}\n${html}`.toLowerCase();
  const kwPremium = /(premium\s*color|premium\s*colour)/i.test(t);
  const kwColor = /(full\s*color|full\s*colour|a\s*colori|colou?r\b|colore|illustrated|photo\s*book)/i.test(t);
  const kwBw = /(black\s*and\s*white|b&w|bianco\s*e\s*nero)/i.test(t);
  const ratio = pages > 0 ? price / pages : 0;
  if (kwPremium) return { type: "premium", confidence: 0.9 };
  if (kwColor) return { type: "color", confidence: 0.8 };
  if (kwBw) return { type: "bw", confidence: 0.8 };
  // Heuristics by price-per-page
  if (ratio >= 0.18) return { type: "premium", confidence: 0.6 };
  if (ratio >= 0.10) return { type: "color", confidence: 0.5 };
  return { type: "bw", confidence: 0.4 };
}

async function fetchWithKey(client: any, userId: string, asin: string, country: string, url: string) {
  const nowIso = new Date().toISOString();
  const { data: keys } = await client
    .from("scraper_api_keys")
    .select("id, api_key, status, credits, max_credits, cost_per_call")
    .eq("user_id", userId)
    .eq("service_name", "scraperapi")
    .order("credits", { ascending: false });
  const candidates = Array.isArray(keys) ? keys : [];
  const costFallback = 5;

  for (const k of candidates) {
    const active = (k?.status || "").toLowerCase() === "active";
    const cost = Number.isFinite(k?.cost_per_call) ? Math.max(1, Number(k.cost_per_call)) : costFallback;
    const hasCredits = Number.isFinite(k?.credits) ? k.credits >= cost : false;
    if (!active || !hasCredits) continue;
    try {
      const apiUrl = `https://api.scraperapi.com/?api_key=${k.api_key}&url=${encodeURIComponent(url)}`;
      const resp = await fetch(apiUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!resp.ok) throw new Error(`ScraperAPI HTTP ${resp.status}`);
      const html = await resp.text();
      await client.from("scraper_api_keys").update({
        credits: Math.max(0, (k.credits || cost) - cost),
        success_count: (k.success_count || 0) + 1,
        last_used_at: nowIso,
      }).eq("id", k.id);
      await client.from("scraper_api_logs").insert({
        api_key_id: k.id,
        asin,
        country,
        status: "success",
        cost,
      });
      return html;
    } catch (err) {
      // Log failure but do not decrement credits
      const msg = String(err?.message || err);
      await client.from("scraper_api_keys").update({
        failure_count: (k.failure_count || 0) + 1,
        last_used_at: nowIso,
      }).eq("id", k.id);
      await client.from("scraper_api_logs").insert({
        api_key_id: k.id,
        asin,
        country,
        status: "failure",
        cost: 0,
        error_message: msg,
      });
      // Try next key
    }
  }
  throw new Error("No usable ScraperAPI key available");
}

function parseField(html: string, rx: RegExp): string | null {
  const m = html.match(rx);
  return m ? m[0] : null;
}

serve(async (req) => {
  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ success: false, error: "Missing Supabase env" }), { status: 500 });
    }
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ success: false, error: "Method Not Allowed" }), { status: 405 });
    }
    const payload = await req.json();
    const asin: string = payload?.asin;
    const country: string = (payload?.country || "com").toLowerCase();
    const userId: string = payload?.userId;
    if (!asin || !userId) {
      return new Response(JSON.stringify({ success: false, error: "Missing asin or userId" }), { status: 400 });
    }

    const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    // Build product URL
    const dom = countryToDomain[country] || countryToDomain["com"];
    const url = `https://${dom}/dp/${asin}`;

    // Get HTML via ScraperAPI
    const html = await fetchWithKey(client, userId, asin, country, url);

    // Parse title and price if available in asin_data
    const { data: asinRow } = await client
      .from("asin_data")
      .select("id, price, title")
      .eq("asin", asin)
      .eq("user_id", userId)
      .maybeSingle();

    const price = Number(asinRow?.price) || 0;
    const title = String(asinRow?.title || "");

    // Extract fields
    let page_count: number | null = null;
    const pagesMatch = html.match(pagesRx);
    if (pagesMatch) {
      page_count = parseInt(pagesMatch[1], 10);
      if (!Number.isFinite(page_count) || page_count < 24) page_count = null;
    }

    // Try to find the line that contains dimensions
    let dimensions_raw: string | null = null;
    const dimsCandidates = html.split(/<|\n|\r/).filter((line) => dimsLineRx.test(line));
    if (dimsCandidates.length) {
      // Merge next few tokens too
      const idx = html.indexOf(dimsCandidates[0]);
      const snippet = html.slice(idx, idx + 300);
      const clean = snippet.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      dimensions_raw = clean;
    } else {
      // Fallback generic search
      const gen = html.match(/\d{1,2}(?:[.,]\d+)?\s*[x×]\s*\d{1,2}(?:[.,]\d+)?\s*(?:in|inch|inches|cm)/i);
      if (gen) dimensions_raw = gen[0];
    }

    const trim_size = dimensions_raw ? (normalizeTrimFromText(dimensions_raw) || dimensions_raw) : null;

    // Binding
    let binding: string | null = null;
    for (const b of bindingMap) {
      if (b.rx.test(html)) { binding = b.val; break; }
    }

    // Language
    let language: string | null = null;
    const langBlock = html.match(/(Language|Lingua|Sprache|Langue|Idioma)[^<\n:]*[:\s]*([A-Za-zÀ-ÿ\- ]{2,})/i);
    if (langBlock) {
      language = (langBlock[2] || "").trim();
    }

    // Series (best-effort)
    let series: string | null = null;
    const seriesBlock = html.match(/(Series|Collana)\s*[:\s]*([^<\n]{2,100})/i);
    if (seriesBlock) series = seriesBlock[2].trim();

    // Category (first Best Sellers Rank line)
    let category: string | null = null;
    const bsrBlock = html.match(/Best\s*Sellers\s*Rank[^<\n]*([\s\S]{0,200})/i);
    if (bsrBlock) {
      const line = bsrBlock[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      category = line || null;
    }

    // Interior heuristic
    const det = detectInterior(html, title, price, page_count || 0);
    const interior_type = det.type;
    const interior_confidence = det.confidence;

    // Update asin_data for this user's ASIN
    if (asinRow?.id) {
      await client
        .from("asin_data")
        .update({
          page_count,
          dimensions_raw,
          trim_size,
          binding,
          language,
          series,
          category,
          interior_type,
          interior_confidence,
          interior_detected: true,
        })
        .eq("id", asinRow.id);
    }

    return new Response(
      JSON.stringify({ success: true, data: { page_count, dimensions_raw, trim_size, binding, language, series, category, interior_type, interior_confidence } }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = String(e?.message || e);
    return new Response(JSON.stringify({ success: false, error: msg }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
