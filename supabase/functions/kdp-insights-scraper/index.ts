import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4?target=deno&bundle";
import * as cheerio from "https://esm.sh/cheerio@1.0.0-rc.12?target=deno&bundle";

declare const Deno: any;
/* ======================= Helpers ======================= */ function getTextSafe($, sel) {
  const t = $(sel).first().text();
  return t ? t.replace(/\s+/g, " ").trim() : "";
}
/** Robust badge parser with multiple placements + locales; returns {is_bestseller, bestseller_category|null} */ function parseBestSeller($) {
  const badgeRoots = $([
    ".a-badge-wrapper",
    "#zeitgeistBadge_feature_div",
    ".mvt-badge",
    "span.mvt-best-seller-badge",
    ".a-section.a-spacing-none.aok-relative",
    ".a-badge-label"
  ].join(","));
  const txt = (badgeRoots.text() || "").toLowerCase();
  // Locale variants for "Best Seller" + generic "#1"
  const re = new RegExp([
    "best\\s*seller",
    "\\bbestseller\\b",
    "meilleure?\\s*vente",
    "n\\.?\\s*1\\s*pi[ùu]\\s*vendut[oi]",
    "más\\s*vendid[oa]s?",
    "mais\\s*vendid[oa]s?"
  ].join("|"), "i");
  const hashOneRe = /#\s*1/;
  const is_bestseller = re.test(txt) || hashOneRe.test(txt);
  // best-effort category near the badge widget
  let cat = $("#zeitgeistBadge_feature_div a, #zeitgeistBadge_feature_div .a-cat-link, .a-badge-text").first().text().trim();
  cat = cat?.replace(/^in\s+/i, "").trim() || null;
  return {
    is_bestseller,
    bestseller_category: cat
  };
}
 function parseGreatOnKindle($) {
  // Strict detection: require the heading AND either the blurb or the CTA
  const bodyTxt = ($("body").text() || "").replace(/\s+/g, " ").trim();
  const hasGok = /(^|\W)great\s+on\s+kindle(\W|$)/i.test(bodyTxt);
  const hasBlurb = /great\s+experience\.?\s*great\s+value\.?/i.test(bodyTxt);
  const hasView = /view\s+kindle\s+edition/i.test(bodyTxt);
  return hasGok && (hasBlurb || hasView);
}
/** Parse all category ranks (subcategories), e.g. "#1 in Travel Reference (Books)" */ function extractCategoryRanks($) {
  const zones = $([
    "#detailBulletsWrapper_feature_div",
    "#detailBullets_feature_div",
    "#productDetails_detailBullets_sections1",
    "#prodDetails",
    "#SalesRank",
    "#bookDetails",
    "#productDetails_db_sections1"
  ].join(","));
  const text = zones.text();
  const lines = text.split(/\n+/);
  const items = [];
  for (const raw of lines){
    const m = raw.match(/#\s*([\d.,]+)\s*(?:in|en|dans|em|auf)\s*(.+)$/i) || raw.match(/\b(?:nr\.|n[ºo]\.?)\s*([\d.,]+)\s*(?:in|en|dans|em|auf)\s*(.+)$/i);
    if (!m) continue;
    const rank = parseInt(String(m[1]).replace(/[^\d]/g, ""), 10);
    let category = (m[2] || "").replace(/\s*\(.*?\)\s*$/, "").trim();
    if (Number.isFinite(rank) && category) items.push({
      rank,
      category
    });
  }
  return items;
}
/** Robust BSR extraction across locales; returns 0 if not found */ function extractBSR($) {
  const $areas = $("#detailBulletsWrapper_feature_div, #detailBullets_feature_div, " + "#productDetails_detailBullets_sections1, #prodDetails, #SalesRank, " + "#bookDetails, #productDetails_db_sections1");
  const ctxRe = /(best\s*sellers?\s*rank|classifica|bestseller[-\s]?rang|meilleures ventes|más vendidos|mais vendidos)/i;
  const rankPatterns = [
    /#\s*([\d.,]+)\s*(?:in|en|dans|em|auf)\b/i,
    /\bn[º\.]?\s*([\d.,]+)\s*(?:in|en|dans|em|auf)\b/i,
    /\bnr\.\s*([\d.,]+)\s*(?:in|en|dans|em|auf)\b/i
  ];
  let found = 0;
  $areas.each((_, el)=>{
    const raw = $(el).text();
    if (!ctxRe.test(raw)) return;
    for (const re of rankPatterns){
      const m = raw.match(re);
      if (m) {
        const n = parseInt(String(m[1]).replace(/[^\d]/g, ""), 10);
        if (Number.isFinite(n) && n > 0) {
          found = n;
          return false;
        }
      }
    }
  });
  return found;
}
function extractPriceToPay($, $root) {
  let el = $root.find(".priceToPay .a-offscreen, .priceToPay .aok-offscreen").first();
  if (el.length) return el.text().trim();
  el = $root.find(".a-price:not(.a-text-price) .a-offscreen, .a-price:not(.a-text-price) .aok-offscreen").first();
  if (el.length) return el.text().trim();
  const whole = $root.find(".a-price:not(.a-text-price) .a-price-whole").first().text().replace(/[^\d]/g, "");
  const frac = $root.find(".a-price:not(.a-text-price) .a-price-fraction").first().text().replace(/[^\d]/g, "");
  if (whole) return `${whole}${frac ? "." + frac : ""}`;
  return null;
}
/** Is Buy Box currently on Paperback and what’s its price text? */ function readPaperbackFromMainBuyBox($) {
  const selectedTxt = $("#tmmSwatches li.a-button-selected").text().toLowerCase();
  const isPb = /(paperback|copertina flessibile|taschenbuch|broché|tapa blanda|capa mole)/i.test(selectedTxt) || $("#tmm-grid-swatch-PAPERBACK").hasClass("a-button-selected");
  if (!isPb) return null;
  const raw = extractPriceToPay($, $("#corePriceDisplay_desktop_feature_div"));
  return raw?.trim() || null;
}
/** Price text shown in the TMM “Paperback” swatch itself */ function readPaperbackFromSwatch($) {
  const raw = $("#tmm-grid-swatch-PAPERBACK .slot-price .a-size-base").first().text().trim() || $("#tmm-grid-swatch-PAPERBACK .a-price:not(.a-text-price) .a-offscreen, #tmm-grid-swatch-PAPERBACK .a-price:not(.a-text-price) .aok-offscreen").first().text().trim();
  return raw || null;
}
/** Strict paperback resolver – ONLY from the two allowed places. */ function getStrictPaperbackPrice($) {
  const raw = readPaperbackFromSwatch($) || readPaperbackFromMainBuyBox($);
  if (!raw) return null;
  const n = currencyToNumber(raw);
  if (!Number.isFinite(n) || n < 2 || n > 500) return null;
  return n;
}
function getAnyPriceRaw($) {
  const raw = $("#corePriceDisplay_desktop_feature_div .a-price:not(.a-text-price) .a-offscreen, #corePriceDisplay_desktop_feature_div .a-price:not(.a-text-price) .aok-offscreen").first().text().trim() || $("#price_inside_buybox").text().trim() || null;
  if (raw && (/—/.test(raw) || raw === "-")) return null;
  return raw;
}
function currencyToNumber(raw) {
  if (!raw) return 0;
  const s = raw.replace(/\s|\u00A0/g, "").replace(/[^0-9,.\-]/g, "");
  const euroGrouped = /^-?\d{1,3}(?:\.\d{3})+,\d{2}$/;
  const usGrouped = /^-?\d{1,3}(?:,\d{3})+\.\d{2}$/;
  const onlyComma = /^-?\d+,\d{2}$/;
  const onlyDot = /^-?\d+\.\d{2}$/;
  if (euroGrouped.test(s)) return parseFloat(s.replace(/\./g, "").replace(",", "."));
  if (usGrouped.test(s)) return parseFloat(s.replace(/,/g, ""));
  if (onlyComma.test(s)) return parseFloat(s.replace(",", "."));
  if (onlyDot.test(s)) return parseFloat(s);
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > lastDot) return parseFloat(s.replace(/\./g, "").replace(",", "."));
  if (lastDot > lastComma) return parseFloat(s.replace(/,/g, ""));
  const v = parseFloat(s);
  return Number.isFinite(v) ? v : 0;
}
function sleep(ms) {
  return new Promise((r)=>setTimeout(r, ms));
}
function parsePublicationDateText(input) {
  const raw = String(input || "").replace(/\s+/g, " ").trim();
  if (!raw) return null;
  const clean = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const dmy = clean.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/);
  if (dmy) {
    const d = parseInt(dmy[1], 10);
    const m = parseInt(dmy[2], 10);
    let y = parseInt(dmy[3], 10);
    if (y < 100) y += 2000;
    if (y > 1900 && m >= 1 && m <= 12 && d >= 1 && d <= 31) return `${String(y).padStart(4,'0')}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  }
  const monthMap = {
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
    gennaio: 1, febbraio: 2, marzo: 3, aprile: 4, maggio: 5, giugno: 6, luglio: 7, agosto: 8, settembre: 9, ottobre: 10, novembre: 11, dicembre: 12,
    januar: 1, februar: 2, marz: 3, maerz: 3, mai: 5, juni: 6, juli: 7, oktober: 10, dezember: 12,
    janvier: 1, fevrier: 2, mars: 3, avril: 4, juin: 6, juillet: 7, aout: 8, septembre: 9, octobre: 10, decembre: 12,
    enero: 1, febrero: 2, abril: 4, mayo: 5, junio: 6, julio: 7, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12
  };
  const mdY = clean.match(/\b([A-Za-z.]+)\s+(\d{1,2})[,]?\s+(\d{4})\b/);
  if (mdY) {
    const mon = monthMap[String(mdY[1]).replace(/\.$/, '').toLowerCase()] || null;
    const d = parseInt(mdY[2], 10);
    const y = parseInt(mdY[3], 10);
    if (mon && y > 1900 && d >= 1 && d <= 31) return `${String(y).padStart(4,'0')}-${String(mon).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  }
  const dMonY = clean.match(/\b(\d{1,2})\s+([A-Za-z.]+)\s+(\d{4})\b/);
  if (dMonY) {
    const mon = monthMap[String(dMonY[2]).replace(/\.$/, '').toLowerCase()] || null;
    const d = parseInt(dMonY[1], 10);
    const y = parseInt(dMonY[3], 10);
    if (mon && y > 1900 && d >= 1 && d <= 31) return `${String(y).padStart(4,'0')}-${String(mon).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  }
  return null;
}
function parseAvailability($) {
  const $candidates = $("#availability, #availabilityInsideBuyBox_feature_div, #mir-layout-DELIVERY_BLOCK-slot-AVAILABILITY, #availability_feature_div");
  const cleanText = ($el)=>{
    const node = $el.clone();
    node.find("style,script,noscript,svg,link,meta,.a-icon,.availabilityMoreDetailsIcon").remove();
    return node.text().replace(/\s+/g, " ").trim();
  };
  let raw = "";
  const $success = $candidates.find(".a-size-medium.a-color-success").first().length ? $candidates.find(".a-size-medium.a-color-success").first() : $candidates.find(".a-color-success").first();
  raw = $success && $success.length ? cleanText($success) : $candidates.length ? cleanText($candidates.first()) : "Unavailable";
  const t = raw.toLowerCase();
  const shipInDaysRe = /(available\s*to\s*ship\s*in\s*\d+(?:[-–]\d+)?\s*days?)|(usually\s*ships\s*within\s*\d+(?:[-–]\d+)?\s*days?)|(ships\s*within\s*\d+(?:[-–]\d+)?\s*days?)/i;
  if (shipInDaysRe.test(t)) return {
    raw,
    code: "SHIP_DELAY"
  };
  if (/(only\s+\d+\s+left in stock)/i.test(t)) return {
    raw,
    code: "LOW_STOCK"
  };
  if (/(in stock|disponibile( subito)?|en stock|auf lager)/i.test(t)) return {
    raw,
    code: "IN_STOCK"
  };
  if (/(temporarily out of stock|attualmente non disponibile|derzeit nicht verfügbar)/i.test(t)) return {
    raw,
    code: "OOS"
  };
  if (/(pre[- ]?order|pre[- ]?ordine)/i.test(t)) return {
    raw,
    code: "PREORDER"
  };
  if (/(currently unavailable|unavailable|non disponibile)/i.test(t)) return {
    raw,
    code: "UNAVAILABLE"
  };
  if (/(print on demand|manufactured on demand)/i.test(t)) return {
    raw,
    code: "POD"
  };
  if (/(other sellers|altri venditori)/i.test(t)) return {
    raw,
    code: "OTHER_SELLERS"
  };
  if (/available/.test(t) && /ship/.test(t)) return {
    raw,
    code: "SHIP_DELAY"
  };
  return {
    raw,
    code: "UNKNOWN"
  };
}

/* ======================= Supabase ======================= */ const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false
  }
});

async function getAccountEmail(userId) {
  try {
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (error) return null;
    const email = data?.user?.email;
    return email ? String(email) : null;
  } catch (_) {
    return null;
  }
}

async function sendMailgunEmail(toEmail, subject, text) {
  const missing = getMissingMailgunEnv();
  if (missing.length) return {
    ok: false,
    error: `Missing Mailgun env: ${missing.join(", ")}`
  };
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
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body
    });
    if (!r.ok) {
      const t = await r.text();
      return {
        ok: false,
        error: `Mailgun error ${r.status}: ${t}`
      };
    }
    return {
      ok: true
    };
  } catch (e) {
    return {
      ok: false,
      error: e?.message || String(e)
    };
  }
}

async function sendDedupedEmailAlert(userId, asin, alertType, dedupeKey, toEmail, subject, text) {
  if (!toEmail) return;
  const { error: insErr } = await supabaseAdmin.from("email_alert_log").insert({
    user_id: userId,
    asin,
    alert_type: alertType,
    dedupe_key: dedupeKey
  });
  if (insErr) {
    const cd = String(insErr?.code || "");
    const msg = String(insErr?.message || "");
    if (cd === "23505" || /duplicate key value/i.test(msg)) return;
    console.error("email_alert_log insert error", insErr);
    return;
  }
  const sent = await sendMailgunEmail(toEmail, subject, text);
  if (!sent?.ok) {
    try {
      await supabaseAdmin.from("email_alert_log").delete().eq("user_id", userId).eq("dedupe_key", dedupeKey);
    } catch (_) {}
    console.error("Mailgun send failed", sent?.error);
  }
}

function normalizeAvailabilityForChange(code) {
  const c = (code || "").toUpperCase();
  if (c === "LOW_STOCK") return "IN_STOCK";
  if (c === "SHIP_DELAY") return "IN_STOCK";
  if (c === "OTHER_SELLERS") return "IN_STOCK";
  if (c === "AVAILABLE_SOON") return "IN_STOCK";
  if (c === "PREORDER") return "IN_STOCK";
  return c || null;
}
/* ======================= Rotation & retries ======================= */ const MAX_RETRIES = 6;
async function getAvailableApiKey(userId, service, excludedIds = []) {
  // Fetch keys (all statuses) and perform auto-reset if 30d elapsed since last_reset_at
  let query = supabaseAdmin.from("scraper_api_keys").select("id, api_key, status, credits, max_credits, cost_per_call, last_used_at, success_count, failure_count, last_success_at, cooldown_until, last_reset_at, created_at").eq("user_id", userId).eq("service_name", service);
  const { data, error } = await query;
  if (error) {
    console.error(`Error fetching API keys (user: ${userId}):`, error);
    return null;
  }
  const nowMs = Date.now();
  // Auto-reset eligible keys
  try {
    const list = Array.isArray(data) ? data : [];
    const dayMs = 24 * 60 * 60 * 1000;
    const needsReset = list.filter((k)=>{
      const baseTs = k?.last_reset_at ? Date.parse(k.last_reset_at) : k?.created_at ? Date.parse(k.created_at) : 0;
      if (!baseTs) return false;
      const elapsedDays = Math.floor((nowMs - baseTs) / dayMs);
      return elapsedDays >= 30;
    });
    if (needsReset.length) {
      const nowIso = new Date().toISOString();
      for (const k of needsReset){
        try {
          const maxCreds = Number.isFinite(k?.max_credits) ? Number(k.max_credits) : 1000;
          const patch = {
            credits: maxCreds,
            last_reset_at: nowIso,
            cooldown_until: null
          };
          // Reactivate only if previously exhausted; keep user-inactive keys untouched
          if ((k?.status || '').toLowerCase() === 'exhausted') patch.status = 'active';
          await supabaseAdmin.from("scraper_api_keys").update(patch).eq("id", k.id);
        } catch (_) {}
      }
    }
  } catch (_) {}
  // Refetch only ACTIVE keys after resets
  let activeData = Array.isArray(data) ? data.filter((k)=>(k?.status || '').toLowerCase() === 'active') : [];
  try {
    const { data: freshActive } = await supabaseAdmin.from("scraper_api_keys").select("id, api_key, status, credits, max_credits, cost_per_call, last_used_at, success_count, failure_count, last_success_at, cooldown_until").eq("user_id", userId).eq("service_name", service).eq("status", "active");
    if (Array.isArray(freshActive)) activeData = freshActive;
  } catch (_) {}
  const excluded = new Set(excludedIds || []);
  const costFallback = 1;
  const candidates = (Array.isArray(activeData) ? activeData : []).filter((k)=>!excluded.has(k?.id)).filter((k)=>{
    if ((k?.status || '').toLowerCase() !== 'active') return false;
    const credits = Number.isFinite(k?.credits) ? Number(k.credits) : 0;
    const unit = Number.isFinite(k?.cost_per_call) ? Math.max(1, Number(k.cost_per_call)) : costFallback;
    if (credits < unit) return false;
    const cd = k?.cooldown_until ? Date.parse(k.cooldown_until) : 0;
    if (cd && cd > nowMs) return false; // skip keys under cooldown
    return true;
  }).sort((a, b)=>{
    const lsA = a?.last_success_at ? Date.parse(a.last_success_at) : 0;
    const lsB = b?.last_success_at ? Date.parse(b.last_success_at) : 0;
    if (lsA !== lsB) return lsB - lsA; // prefer most recently successful
    const luA = a?.last_used_at ? Date.parse(a.last_used_at) : 0;
    const luB = b?.last_used_at ? Date.parse(b.last_used_at) : 0;
    if (luA !== luB) return luA - luB; // least recently used first
    const cA = Number.isFinite(a?.credits) ? Number(a.credits) : 0;
    const cB = Number.isFinite(b?.credits) ? Number(b.credits) : 0;
    if (cA !== cB) return cB - cA; // more credits first
    const fA = Number.isFinite(a?.failure_count) ? Number(a.failure_count) : 0;
    const fB = Number.isFinite(b?.failure_count) ? Number(b.failure_count) : 0;
    return fA - fB; // fewer failures
  });
  return candidates[0] || null;
}
async function updateKeyStats(keyId, success, cost) {
  const { data: key, error } = await supabaseAdmin.from("scraper_api_keys").select("success_count, failure_count, credits").eq("id", keyId).single();
  if (error || !key) {
    console.error(`Could not retrieve key ${keyId} to update stats.`);
    return;
  }
  const nowIso = new Date().toISOString();
  const debit = success ? Math.max(1, Number(cost) || 1) : 0;
  const newCredits = Math.max(0, Number(key.credits || 0) - debit);
  const updatePayload = {
    last_used_at: nowIso,
    success_count: Number(key.success_count || 0) + (success ? 1 : 0),
    failure_count: Number(key.failure_count || 0) + (success ? 0 : 1),
    credits: newCredits,
    ...success ? {
      last_success_at: nowIso,
      cooldown_until: null
    } : {}
  };
  if (success && newCredits <= 0) updatePayload.status = "exhausted";
  const { error: updateError } = await supabaseAdmin.from("scraper_api_keys").update(updatePayload).eq("id", keyId);
  if (updateError) console.error(`Error updating key stats for ${keyId}:`, updateError);
}
async function putKeyOnCooldown(keyId, baseMs, jitterMaxMs) {
  const until = new Date(Date.now() + Math.max(0, baseMs) + Math.floor(Math.random() * Math.max(0, jitterMaxMs || 0))).toISOString();
  const { error } = await supabaseAdmin.from("scraper_api_keys").update({
    cooldown_until: until
  }).eq("id", keyId);
  if (error) console.error(`Error setting cooldown for key ${keyId}:`, error);
}
async function logApiCall(userId, apiKeyId, asin, country, status, cost, errorMessage = null) {
  await supabaseAdmin.from("scraper_api_logs").insert({
    user_id: userId,
    api_key_id: apiKeyId,
    asin,
    country,
    status,
    cost,
    error_message: errorMessage
  });
}
async function logFailedScrape(userId, asin, country, errorMessage) {
  await supabaseAdmin.from("scraper_failed_logs").insert({
    user_id: userId,
    asin,
    country,
    error_message: errorMessage
  });
}
async function logAsinEvent(userId, asinDataId, eventType, description, metadata) {
  await supabaseAdmin.from("asin_events").insert({
    user_id: userId,
    asin_data_id: asinDataId,
    event_type: eventType,
    description,
    metadata
  });
}
/* ======================= Handler ======================= */ serve(async (req)=>{
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders
    });
  }
  try {
    const { asin, country, userId } = await req.json();
    if (!asin || !country || !userId) {
      return new Response(JSON.stringify({
        error: "Missing required parameters: asin, country, userId"
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }

    let alertSettings = null;
    try {
      const { data } = await supabaseAdmin
        .from("settings")
        .select("stock_alert_enabled, stock_alert_on_change, bsr_alert_enabled, bsr_alert_threshold_pct")
        .eq("user_id", userId)
        .maybeSingle();
      alertSettings = data || null;
    } catch (_) {}
    const stockAlertEnabled = !!alertSettings?.stock_alert_enabled;
    const stockAlertOnChange = !!alertSettings?.stock_alert_on_change;
    const bsrAlertEnabled = !!alertSettings?.bsr_alert_enabled;
    const bsrAlertThresholdPct = Number.isFinite(Number(alertSettings?.bsr_alert_threshold_pct))
      ? Number(alertSettings?.bsr_alert_threshold_pct)
      : 20;
    const wantsAnyEmailAlert = stockAlertEnabled || stockAlertOnChange || bsrAlertEnabled;
    const accountEmail = wantsAnyEmailAlert ? await getAccountEmail(userId) : null;

    let attempts = 0;
    const excludedKeyIds = [];
    while(attempts < MAX_RETRIES){
      attempts++;
      const apiKeyRecord = await getAvailableApiKey(userId, "scraperapi", excludedKeyIds);
      if (!apiKeyRecord) {
        const finalErrorMsg = "No active API keys available.";
        await logFailedScrape(userId, asin, country, finalErrorMsg);
        return new Response(JSON.stringify({
          success: false,
          error: finalErrorMsg
        }), {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        });
      }
      const { id: apiKeyId, api_key: apiKey, cost_per_call } = apiKeyRecord;
      const cost = Math.max(1, Number(cost_per_call) || 1);
      excludedKeyIds.push(apiKeyId);
      try {
        const url = `https://www.amazon.${country}/dp/${asin}`;
        const MARKET = {
          com: {
            cc: "us",
            al: "en-US,en;q=0.9"
          },
          "co.uk": {
            cc: "gb",
            al: "en-GB,en;q=0.9"
          },
          de: {
            cc: "de",
            al: "de-DE,de;q=0.9"
          },
          fr: {
            cc: "fr",
            al: "fr-FR,fr;q=0.9"
          },
          it: {
            cc: "it",
            al: "it-IT,it;q=0.9"
          },
          es: {
            cc: "es",
            al: "es-ES,es;q=0.9"
          }
        };
        const m = MARKET[country] ?? MARKET["com"];
        const scraperUrl = `https://api.scraperapi.com?api_key=${apiKey}` + `&url=${encodeURIComponent(url)}` + `&keep_headers=true&device_type=desktop&country_code=${m.cc}`;
        await sleep(300 + Math.floor(Math.random() * 400));
        const response = await fetch(scraperUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36",
            Accept: "text/html,application/xhtml+xml",
            "Accept-Language": m.al,
            "Cache-Control": "no-cache"
          }
        });
        if (!response.ok) throw new Error(`ScraperAPI returned status: ${response.status}`);
        const html = await response.text();
        // Detect bot/blocked pages even with 200 OK
        const blocked = /(Robot\s*Check|automated\s*access|captcha|Enter\s*the\s*characters\s*you\s*see\s*below|Request\s*blocked|To\s*discuss\s*automated\s*access)/i.test(html);
        if (blocked) {
          await putKeyOnCooldown(apiKeyId, 90_000, 30_000);
          await updateKeyStats(apiKeyId, false, 0);
          await logApiCall(userId, apiKeyId, asin, country, "failure", 0, "ScraperAPI blocked content (captcha/robot)");
          await sleep(400 * attempts * attempts + Math.floor(Math.random() * 400));
          continue;
        }
        const $ = cheerio.load(html);
        const title = $("#productTitle").text().trim() || $("h1").text().trim() || "Titolo non disponibile";
        const author = $(".author .a-link-normal").first().text().trim() || "Autore non disponibile";
        const ratingText = $("#acrPopover").attr("title") || $(".a-icon-star .a-icon-alt").first().text() || "0";
        const rating = parseFloat(ratingText.replace(/[^0-9,.]/g, "").replace(",", ".")) || 0;
        const reviewCountText = $("#acrCustomerReviewText").first().text().trim() || "0";
        const review_count = parseInt(reviewCountText.replace(/\D/g, ""), 10) || 0;
        let page_count = 0;
        let publication_date = null;
        $("#detailBullets_feature_div .a-list-item, #productDetails_detailBullets_sections1 tr").each((_, el)=>{
          const rowText = $(el).text();
          if (rowText.includes("Print length") || rowText.includes("Lunghezza stampa")) {
            const pageText = $(el).find("td").eq(1).text().trim() || $(el).find("span").last().text().trim();
            page_count = parseInt(pageText.replace(/[^0-9]/g, ""), 10) || 0;
          }
          if (rowText.includes("Publication date") || rowText.includes("Data di pubblicazione")) {
            const dateText = $(el).find("td").eq(1).text().trim() || $(el).find("span").last().text().trim();
            publication_date = parsePublicationDateText(dateText) || publication_date;
          }
        });
        const image_url = $("#imgTagWrapperId img").attr("src") || $("#ebooksImgBlkFront").attr("src") || null;
        /* ---------- STRICT PAPERBACK PRICE (only two places) ---------- */ const strictPbPrice = getStrictPaperbackPrice($);
        if (strictPbPrice == null) {
          // force retry with another attempt/key; don't write bad/zero price
          throw new Error("PAPERBACK_PRICE_NOT_FOUND");
        }
        const finalPrice = strictPbPrice;
        /* ---------- AVAILABILITY ---------- */ const { raw: stock_status, code: availability_code } = parseAvailability($);
        const isAvailable = [
          "IN_STOCK",
          "LOW_STOCK",
          "MADE_TO_ORDER",
          "OTHER_SELLERS",
          "SHIP_DELAY",
          "POD"
        ].includes(availability_code);
        /* ---------- RANKS, BADGE, BSR ---------- */ const rawBsr = extractBSR($);
        const ranks = extractCategoryRanks($);
        const anyRankOne = ranks.some((r)=>r.rank === 1);
        const { is_bestseller: badgeHit, bestseller_category: badgeCat } = parseBestSeller($);
        const is_bestseller = badgeHit || anyRankOne;
        const bestseller_category = badgeCat || (ranks.find((r)=>r.rank === 1)?.category ?? null);
        const is_great_on_kindle = parseGreatOnKindle($);
        // DO NOT synthesize BSR from badge; only trust numeric BSR or keep previous
        const { data: existingAsin } = await supabaseAdmin.from("asin_data").select("id, title, price, bsr, review_count, stock_status, availability_code").eq("user_id", userId).eq("asin", asin).maybeSingle();
        const finalBsr = rawBsr > 0 ? rawBsr : existingAsin?.bsr ?? null;
        /* ---------- UPSERT MAIN ROW ---------- */ const scrapedData = {
          title,
          author,
          price: finalPrice,
          rating,
          review_count,
          ...finalBsr != null ? {
            bsr: finalBsr
          } : {},
          stock_status,
          availability_code,
          image_url,
          is_bestseller,
          is_great_on_kindle,
          bestseller_category: bestseller_category || undefined,
          ...(page_count > 0 ? {
            page_count
          } : {}),
          ...(publication_date ? {
            publication_date
          } : {})
        };
        const { data: upsertedAsin, error: upsertError } = await supabaseAdmin.from("asin_data").upsert({
          user_id: userId,
          asin,
          country,
          ...scrapedData,
          updated_at: new Date().toISOString()
        }, {
          onConflict: "user_id, asin"
        }).select("id, title, bsr, price").single();
        if (upsertError) throw upsertError;
        /* ---------- HISTORY (insert only valid metrics) ---------- */ const safePrice = finalPrice && finalPrice > 0 ? finalPrice : null;
        const safeBsr = finalBsr && finalBsr > 0 ? finalBsr : null;
        const safeReviews = review_count && review_count > 0 ? review_count : null;
        if (safePrice || safeBsr || safeReviews) {
          await supabaseAdmin.from("asin_history").insert({
            asin_data_id: upsertedAsin.id,
            user_id: userId,
            asin,
            review_count: safeReviews,
            rating,
            bsr: safeBsr,
            price: safePrice,
            availability: isAvailable
          });
        }
        /* ---------- EVENTS ---------- */ if (existingAsin) {
          if (existingAsin.price !== finalPrice) {
            await logAsinEvent(userId, upsertedAsin.id, "PRICE_CHANGED", `Prezzo cambiato da ${existingAsin.price} a ${finalPrice}`, {
              old: existingAsin.price,
              new: finalPrice
            });
          }
          if (existingAsin.bsr !== finalBsr) {
            await logAsinEvent(userId, upsertedAsin.id, "BSR_CHANGED", `BSR cambiato da ${existingAsin.bsr} a ${finalBsr}`, {
              old: existingAsin.bsr,
              new: finalBsr
            });
          }
          if (existingAsin.availability_code !== availability_code) {
            await logAsinEvent(userId, upsertedAsin.id, "STOCK_STATUS_CHANGED", `Disponibilità cambiata da ${existingAsin.availability_code} a ${availability_code}`, {
              old: existingAsin.availability_code,
              new: availability_code
            });
          }

          if (wantsAnyEmailAlert && accountEmail) {
            const dayKey = new Date().toISOString().slice(0, 10);
            const prevCode = existingAsin.availability_code || null;
            const newCode = availability_code || null;
            const prevEff = normalizeAvailabilityForChange(prevCode);
            const newEff = normalizeAvailabilityForChange(newCode);

            const inStockCodes = new Set([
              "IN_STOCK",
              "LOW_STOCK",
              "SHIP_DELAY",
              "POD",
              "OTHER_SELLERS",
              "MADE_TO_ORDER"
            ]);
            const outOfStockCodes = new Set([
              "OOS",
              "UNAVAILABLE",
              "OUT_OF_STOCK"
            ]);

            if (stockAlertOnChange && prevEff && newEff && prevEff !== newEff) {
              const dedupeKey = `stock_change:${asin}:${prevEff}->${newEff}:${dayKey}`;
              const subject = `[KDPInsights] Stock changed (${asin})`;
              const body = [
                `ASIN: ${asin}`,
                `Title: ${existingAsin.title || title || ""}`,
                `Previous: ${prevCode}`,
                `Now: ${newCode}`,
                `Time (UTC): ${new Date().toISOString()}`
              ].filter(Boolean).join("\n");
              await sendDedupedEmailAlert(userId, asin, "stock_change", dedupeKey, accountEmail, subject, body);
            }

            if (stockAlertEnabled && prevCode && newCode && prevCode !== newCode && inStockCodes.has(prevCode) && outOfStockCodes.has(newCode)) {
              const dedupeKey = `stock_oos:${asin}:${newCode}:${dayKey}`;
              const subject = `[KDPInsights] Out of stock (${asin})`;
              const body = [
                `ASIN: ${asin}`,
                `Title: ${existingAsin.title || title || ""}`,
                `Previous: ${prevCode}`,
                `Now: ${newCode}`,
                `Time (UTC): ${new Date().toISOString()}`
              ].filter(Boolean).join("\n");
              await sendDedupedEmailAlert(userId, asin, "stock_oos", dedupeKey, accountEmail, subject, body);
            }

            if (bsrAlertEnabled) {
              const oldBsr = Number(existingAsin.bsr);
              const newBsr = Number(finalBsr);
              if (Number.isFinite(oldBsr) && oldBsr > 0 && Number.isFinite(newBsr) && newBsr > 0 && Number.isFinite(bsrAlertThresholdPct) && bsrAlertThresholdPct > 0) {
                const pct = Math.abs((newBsr - oldBsr) / oldBsr) * 100;
                if (Number.isFinite(pct) && pct >= bsrAlertThresholdPct) {
                  const direction = newBsr < oldBsr ? "DOWN" : "UP";
                  const dedupeKey = `bsr_pct:${asin}:${direction}:${Math.round(bsrAlertThresholdPct)}:${dayKey}`;
                  const subject = `[KDPInsights] BSR ${direction} ${pct.toFixed(1)}% (${asin})`;
                  const body = [
                    `ASIN: ${asin}`,
                    `Title: ${existingAsin.title || title || ""}`,
                    `Previous BSR: ${oldBsr}`,
                    `New BSR: ${newBsr}`,
                    `Change: ${pct.toFixed(1)}% (threshold ${Number(bsrAlertThresholdPct).toFixed(0)}%)`,
                    `Time (UTC): ${new Date().toISOString()}`
                  ].filter(Boolean).join("\n");
                  await sendDedupedEmailAlert(userId, asin, "bsr_pct", dedupeKey, accountEmail, subject, body);
                }
              }
            }
          }
        } else {
          await logAsinEvent(userId, upsertedAsin.id, "ASIN_ADDED", "ASIN aggiunto al monitoraggio", {
            asin,
            title
          });
        }
        /* ---------- BILLING & RETURN ---------- */ await updateKeyStats(apiKeyId, true, cost);
        await logApiCall(userId, apiKeyId, asin, country, "success", cost);
        return new Response(JSON.stringify({
          success: true,
          isNew: !existingAsin,
          data: upsertedAsin
        }), {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        });
      } catch (e) {
        console.error(`Attempt ${attempts} with key ${apiKeyId} failed for ASIN ${asin}:`, e?.message || e);
        const msg = String(e?.message || "");
        let baseCd = 30_000;
        if (/(429|403)/.test(msg) || /captcha|Robot\s*Check/i.test(msg)) baseCd = 90_000;
        await putKeyOnCooldown(apiKeyId, baseCd, 20_000);
        if (/(429|403)/.test(msg)) {
          const retryAfter = 0; // header not available here; upstream handled if needed
          if (retryAfter > 0) await sleep(retryAfter * 1000);
        }
        await sleep(400 * attempts * attempts + Math.floor(Math.random() * 500));
        await updateKeyStats(apiKeyId, false, 0);
        await logApiCall(userId, apiKeyId, asin, country, "failure", 0, e?.message || String(e));
        if (attempts >= MAX_RETRIES) {
          const finalErrorMsg = `All ${MAX_RETRIES} attempts failed. Last error: ${e?.message || e}`;
          await logFailedScrape(userId, asin, country, finalErrorMsg);
          throw new Error(finalErrorMsg);
        }
      }
    }
    const finalErrorMsg = "An unexpected error occurred during the scraping process.";
    await logFailedScrape(userId, asin, country, finalErrorMsg);
    return new Response(JSON.stringify({
      success: false,
      error: finalErrorMsg
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  } catch (error) {
    console.error("Scraper function final error:", error);
    return new Response(JSON.stringify({
      success: false,
      error: error?.message || String(error)
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }
});


