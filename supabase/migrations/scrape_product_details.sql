import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4?target=deno&bundle";
import * as cheerio from "https://esm.sh/cheerio@1.0.0-rc.12?target=deno&bundle";

/* ======================= Helpers ======================= */
function getTextSafe($: any, sel: string) {
  const t = $(sel).first().text();
  return t ? t.replace(/\s+/g, " ").trim() : "";
}

function currencyToNumber(raw: string | null) {
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

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function cleanNodeText($el: any) {
  const node = $el.clone();
  node.find("style,script,noscript,svg,link,meta,.a-icon,.availabilityMoreDetailsIcon").remove();
  return node.text().replace(/\s+/g, " ").trim();
}

function normalizeDashes(s: string) {
  return s.replace(/[\u2012\u2013\u2014\u2212]/g, "-");
}

/* ======================= Print length (robust) ======================= */
function extractPrintLengthPages($: any): number {
  const labels = [
    "Print length",
    "Lunghezza stampa",
    "Seitenzahl",
    "Nombre de pages",
    "Número de páginas",
    "Numero di pagine",
    "Pages",
    "Pagine",
    "Seiten",
    "Páginas",
  ];

  const rows = $(
    "#productDetails_detailBullets_sections1 tr, #productDetails_db_sections1 tr, #productDetails_techSpec_section_1 tr, #productDetailsTable tr",
  );

  for (const el of rows.toArray()) {
    const $el = $(el);
    const th = $el.find("th").first().text().replace(/\s+/g, " ").trim();
    if (!th) continue;

    if (labels.some((l) => th.toLowerCase() === l.toLowerCase())) {
      const td = $el.find("td").first().text().replace(/\s+/g, " ").trim();
      const m = td.match(/(\d[\d,.]*)/);
      if (m) return parseInt(m[1].replace(/[^\d]/g, ""), 10) || 0;
    }
  }

  const bullets = $(
    "#detailBullets_feature_div li, #detailBulletsWrapper_feature_div li, #detailBullets_feature_div .a-list-item, #detailBulletsWrapper_feature_div .a-list-item",
  );

  for (const el of bullets.toArray()) {
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (!text) continue;

    if (labels.some((l) => text.toLowerCase().includes(l.toLowerCase()))) {
      const m = text.match(/(\d[\d,.]*)\s*(pages|pagine|seiten|páginas|page|pagina|seite)/i);
      if (m) return parseInt(m[1].replace(/[^\d]/g, ""), 10) || 0;
      const m2 = text.match(/(\d[\d,.]*)/);
      if (m2) return parseInt(m2[1].replace(/[^\d]/g, ""), 10) || 0;
    }
  }

  return 0;
}

/* ======================= Best Seller + Ranks + BSR ======================= */
function parseBestSeller($: any) {
  const badgeRoots = $(
    [
      ".a-badge-wrapper",
      "#zeitgeistBadge_feature_div",
      ".mvt-badge",
      "span.mvt-best-seller-badge",
      ".a-section.a-spacing-none.aok-relative",
      ".a-badge-label",
    ].join(","),
  );

  const txt = (badgeRoots.text() || "").toLowerCase();
  const re = new RegExp(
    [
      "best\\s*seller",
      "\\bbestseller\\b",
      "meilleure?\\s*vente",
      "n\\.?\\s*1\\s*pi[ùu]\\s*vendut[oi]",
      "más\\s*vendid[oa]s?",
      "mais\\s*vendid[oa]s?",
    ].join("|"),
    "i",
  );

  const hashOneRe = /#\s*1/;
  const is_bestseller = re.test(txt) || hashOneRe.test(txt);

  let cat = $("#zeitgeistBadge_feature_div a, #zeitgeistBadge_feature_div .a-cat-link, .a-badge-text")
    .first()
    .text()
    .trim();
  cat = cat?.replace(/^in\s+/i, "").trim() || null;

  return { is_bestseller, bestseller_category: cat };
}

 function parseGreatOnKindle($: any) {
  // Strict detection: must contain the heading AND either the blurb or CTA text
  const bodyTxt = ($("body").text() || "").replace(/\s+/g, " ").trim();
  const hasGok = /(^|\W)great\s+on\s+kindle(\W|$)/i.test(bodyTxt);
  const hasBlurb = /great\s+experience\.?\s*great\s+value\.?/i.test(bodyTxt);
  const hasView = /view\s+kindle\s+edition/i.test(bodyTxt);
  return hasGok && (hasBlurb || hasView);
 }

function extractCategoryRanks($: any) {
  const zones = $(
    [
      "#detailBulletsWrapper_feature_div",
      "#detailBullets_feature_div",
      "#productDetails_detailBullets_sections1",
      "#prodDetails",
      "#SalesRank",
      "#bookDetails",
      "#productDetails_db_sections1",
    ].join(","),
  );

  const text = zones.text();
  const lines = text.split(/\n+/);
  const items: Array<{ rank: number; category: string }> = [];

  for (const raw of lines) {
    const m =
      raw.match(/#\s*([\d.,]+)\s*(?:in|en|dans|em|auf)\s*(.+)$/i) ||
      raw.match(/\b(?:nr\.|n[ºo]\.? )\s*([\d.,]+)\s*(?:in|en|dans|em|auf)\s*(.+)$/i);
    if (!m) continue;

    const rank = parseInt(String(m[1]).replace(/[^\d]/g, ""), 10);
    let category = (m[2] || "").replace(/\s*\(.*?\)\s*$/, "").trim();

    if (Number.isFinite(rank) && category) items.push({ rank, category });
  }

  return items;
}

function extractBSR($: any) {
  const $areas = $(
    "#detailBulletsWrapper_feature_div, #detailBullets_feature_div, #productDetails_detailBullets_sections1, #prodDetails, #SalesRank, #bookDetails, #productDetails_db_sections1",
  );

  const ctxRe =
    /(best\s*sellers?\s*rank|classifica|bestseller[-\s]?rang|meilleures ventes|más vendidos|mais vendidos)/i;

  const rankPatterns = [
    /#\s*([\d.,]+)\s*(?:in|en|dans|em|auf)\b/i,
    /\bn[º\.]?\s*([\d.,]+)\s*(?:in|en|dans|em|auf)\b/i,
    /\bnr\.\s*([\d.,]+)\s*(?:in|en|dans|em|auf)\b/i,
  ];

  let found = 0;
  $areas.each((_: any, el: any) => {
    const raw = $(el).text();
    if (!ctxRe.test(raw)) return;

    for (const re of rankPatterns) {
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

/* ======================= Price extraction helpers ======================= */
function extractPriceToPay($: any, $root: any) {
  let el = $root.find(".priceToPay .a-offscreen, .priceToPay .aok-offscreen").first();
  if (el.length) return el.text().trim();

  el = $root
    .find(".a-price:not(.a-text-price) .a-offscreen, .a-price:not(.a-text-price) .aok-offscreen")
    .first();
  if (el.length) return el.text().trim();

  const whole = $root
    .find(".a-price:not(.a-text-price) .a-price-whole")
    .first()
    .text()
    .replace(/[^\d]/g, "");

  const frac = $root
    .find(".a-price:not(.a-text-price) .a-price-fraction")
    .first()
    .text()
    .replace(/[^\d]/g, "");

  if (whole) return `${whole}${frac ? "." + frac : ""}`;
  return null;
}

/* ======================= Availability (fixed: pick the RIGHT message, keep text AS-IS) ======================= */
function parseAvailability($: any) {
  // We score multiple nodes because Amazon can show multiple availability messages on the same page
  // (different sellers / formats). We want the most specific buybox message.
  const selectors = [
    // Buy box / delivery availability (often a-color-price like "Usually ships within 7 to 8 days")
    "#availabilityInsideBuyBox_feature_div span.a-color-price",
    "#availability span.a-color-price",
    "#availability_feature_div span.a-color-price",
    "#mir-layout-DELIVERY_BLOCK-slot-AVAILABILITY span.a-color-price",

    // Success-style "In Stock" nodes
    "#availabilityInsideBuyBox_feature_div span.a-color-success",
    "#availability span.a-color-success",
    "#availability_feature_div span.a-color-success",
    "#mir-layout-DELIVERY_BLOCK-slot-AVAILABILITY span.a-color-success",

    // Fallback containers
    "#availabilityInsideBuyBox_feature_div",
    "#availability",
    "#availability_feature_div",
    "#mir-layout-DELIVERY_BLOCK-slot-AVAILABILITY",
  ];

  const els = $(selectors.join(",")).toArray();

  // Prefer explicit green "In Stock" from success nodes when present
  const $successNode = $(
    "#availabilityInsideBuyBox_feature_div span.a-color-success, #availability span.a-color-success, #availability_feature_div span.a-color-success, #mir-layout-DELIVERY_BLOCK-slot-AVAILABILITY span.a-color-success"
  ).first();
  if ($successNode.length) {
    const sText = cleanNodeText($successNode);
    const sLower = normalizeDashes(sText.toLowerCase());
    const inStockRePref = /(\bin\s*stock\b|disponibile(\s*subito)?|en\s*stock|auf\s*lager)/i;
    if (inStockRePref.test(sLower)) {
      return { raw: sText, code: "IN_STOCK", is_green_in_stock: true };
    }
  }

  const classify = (rawInput: string) => {
    const raw = rawInput.replace(/\s+/g, " ").trim();
    const t = normalizeDashes(raw.toLowerCase());

    // Exact phrases you asked to treat as low_stock group (non-green)
    // - Usually ships within 1–2 days
    // - Usually ships within 2–5 days
    // - Usually ships within 7 to 8 days
    // - In Stock (green)
    // - Temporarily out of stock
    // - Only X left in stock
    // - Available from these sellers
    const onlyLeftRe = /(only\s+\d+\s+left\s+in\s+stock)/i;
    const shipDelayRe =
      /(usually\s*ships\s*within\s*\d+(?:\s*(?:-|to)\s*\d+)?\s*days?)|(ships\s*within\s*\d+(?:\s*(?:-|to)\s*\d+)?\s*days?)|(available\s*to\s*ship\s*in\s*\d+(?:\s*(?:-|to)\s*\d+)?\s*days?)/i;
    const oosRe = /(temporarily\s*out\s*of\s*stock|attualmente\s*non\s*disponibile|derzeit\s*nicht\s*verfügbar)/i;
    const otherSellersRe =
      /(available\s*from\s*these\s*sellers|available\s*from\s*other\s*sellers|available\s*from\s*sellers|other\s*sellers|altri\s*venditori)/i;
    const inStockRe = /(\bin\s*stock\b|disponibile(\s*subito)?|en\s*stock|auf\s*lager)/i;

    if (onlyLeftRe.test(t)) return { raw, code: "LOW_STOCK", is_green_in_stock: false, prio: 100 };
    if (oosRe.test(t)) return { raw, code: "OOS", is_green_in_stock: false, prio: 90 };
    if (shipDelayRe.test(t)) return { raw, code: "SHIP_DELAY", is_green_in_stock: false, prio: 80 };
    if (otherSellersRe.test(t)) return { raw, code: "OTHER_SELLERS", is_green_in_stock: false, prio: 70 };
    if (inStockRe.test(t)) return { raw, code: "IN_STOCK", is_green_in_stock: true, prio: 60 };

    if (/(pre[- ]?order|pre[- ]?ordine)/i.test(t)) return { raw, code: "PREORDER", is_green_in_stock: false, prio: 50 };
    if (/(currently\s*unavailable|\bunavailable\b|non\s*disponibile)/i.test(t)) return { raw, code: "UNAVAILABLE", is_green_in_stock: false, prio: 40 };
    if (/(print\s*on\s*demand|manufactured\s*on\s*demand)/i.test(t)) return { raw, code: "POD", is_green_in_stock: false, prio: 30 };

    return { raw, code: "UNKNOWN", is_green_in_stock: false, prio: 0 };
  };

  let best = { raw: "Unavailable", code: "UNAVAILABLE", is_green_in_stock: false, prio: -1 };

  for (const el of els) {
    const txt = cleanNodeText($(el));
    if (!txt) continue;

    const c = classify(txt);
    if (c.prio > best.prio) best = c;
  }

  return { raw: best.raw, code: best.code, is_green_in_stock: best.is_green_in_stock };
}

/* ======================= Paperback price resolver (resilient) ======================= */
function isPaperbackSelected($: any) {
  const selectedTxt = $("#tmmSwatches li.a-button-selected, #tmmSwatches .a-button-selected")
    .text()
    .toLowerCase();

  if (/(paperback|copertina flessibile|taschenbuch|broché|tapa blanda|capa mole)/i.test(selectedTxt)) return true;

  const $sw = $("#tmm-grid-swatch-PAPERBACK");
  if ($sw.hasClass("a-button-selected")) return true;
  if ($sw.find(".a-button-selected").length) return true;
  if ($sw.closest(".a-button-selected").length) return true;

  return false;
}

function readPaperbackFromSwatch($: any) {
  const $sw = $("#tmm-grid-swatch-PAPERBACK");
  if (!$sw.length) return null;

  const raw =
    $sw.find(".priceToPay .a-offscreen, .priceToPay .aok-offscreen").first().text().trim() ||
    $sw
      .find(".a-price:not(.a-text-price) .a-offscreen, .a-price:not(.a-text-price) .aok-offscreen")
      .first()
      .text()
      .trim() ||
    $sw.find(".aok-offscreen, .a-offscreen").first().text().trim() ||
    $sw.find(".slot-price .a-size-base").first().text().trim();

  return raw || null;
}

function readCorePrice($: any) {
  const $core = $("#corePriceDisplay_desktop_feature_div, #corePriceDisplay_feature_div").first();
  if (!$core.length) return null;
  const raw = extractPriceToPay($, $core);
  return raw?.trim() || null;
}

function hasOnlyBuyingOptions($: any) {
  return (
    $(
      "#buybox-see-all-buying-choices, #olpLinkWidget_feature_div, a[href*='offer-listing'], #buybox-see-all-buying-choices-announce",
    ).length > 0 || /see all buying options/i.test($("body").text())
  );
}

function resolvePaperbackPrice($: any) {
  const hasPbSwatch = $("#tmm-grid-swatch-PAPERBACK").length > 0;

  const candidates: Array<{ source: string; raw: string }> = [];

  const sw = readPaperbackFromSwatch($);
  if (sw) candidates.push({ source: "pb_swatch", raw: sw });

  const core = readCorePrice($);
  if (core) candidates.push({ source: "core_price", raw: core });

  if (isPaperbackSelected($)) {
    const sel = readCorePrice($);
    if (sel) candidates.push({ source: "pb_selected_core", raw: sel });
  }

  for (const c of candidates) {
    const n = currencyToNumber(c.raw);
    if (Number.isFinite(n) && n >= 2 && n <= 500) {
      return { price: n, source: c.source, missingReason: null, hasPbSwatch };
    }
  }

  const availText = (
    $("#availability, #availability_feature_div, #availabilityInsideBuyBox_feature_div").text() || ""
  ).toLowerCase();

  const unavailable =
    /(currently unavailable|unavailable|out of stock|not available|non disponibile|nicht verfügbar|agotado)/i.test(
      availText,
    );

  const buyingOptions = hasOnlyBuyingOptions($);

  let missingReason = "UNKNOWN_LAYOUT_OR_MISSING_MODULE";
  if (!hasPbSwatch) missingReason = "NO_PAPERBACK_SWATCH";
  else if (unavailable) missingReason = "PAPERBACK_UNAVAILABLE";
  else if (buyingOptions) missingReason = "ONLY_BUYING_OPTIONS";

  return { price: null, source: null, missingReason, hasPbSwatch };
}

/* ======================= Supabase ======================= */
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/* ======================= Rotation & retries ======================= */
const MAX_RETRIES = 6;

async function getAvailableApiKey(userId: string, service: string, excludedIds: string[] = []) {
  const { data, error } = await supabaseAdmin
    .from("scraper_api_keys")
    .select(
      "id, api_key, status, credits, max_credits, cost_per_call, last_used_at, success_count, failure_count, last_success_at, cooldown_until",
    )
    .eq("user_id", userId)
    .eq("service_name", service)
    .eq("status", "active");

  if (error) {
    console.error(`Error fetching API keys (user: ${userId}):`, error);
    return null;
  }

  const nowMs = Date.now();
  const excluded = new Set(excludedIds || []);
  const costFallback = 1;

  const candidates = (Array.isArray(data) ? data : [])
    .filter((k: any) => !excluded.has(k?.id))
    .filter((k: any) => {
      if ((k?.status || "").toLowerCase() !== "active") return false;
      const credits = Number.isFinite(k?.credits) ? Number(k.credits) : 0;
      const unit = Number.isFinite(k?.cost_per_call) ? Math.max(1, Number(k.cost_per_call)) : costFallback;
      if (credits < unit) return false;
      const cd = k?.cooldown_until ? Date.parse(k.cooldown_until) : 0;
      if (cd && cd > nowMs) return false;
      return true;
    })
    .sort((a: any, b: any) => {
      const lsA = a?.last_success_at ? Date.parse(a.last_success_at) : 0;
      const lsB = b?.last_success_at ? Date.parse(b.last_success_at) : 0;
      if (lsA !== lsB) return lsB - lsA;

      const luA = a?.last_used_at ? Date.parse(a.last_used_at) : 0;
      const luB = b?.last_used_at ? Date.parse(b.last_used_at) : 0;
      if (luA !== luB) return luA - luB;

      const cA = Number.isFinite(a?.credits) ? Number(a.credits) : 0;
      const cB = Number.isFinite(b?.credits) ? Number(b.credits) : 0;
      if (cA !== cB) return cB - cA;

      const fA = Number.isFinite(a?.failure_count) ? Number(a.failure_count) : 0;
      const fB = Number.isFinite(b?.failure_count) ? Number(b.failure_count) : 0;
      return fA - fB;
    });

  return candidates[0] || null;
}

async function updateKeyStats(keyId: string, success: boolean, cost: number) {
  const { data: key, error } = await supabaseAdmin
    .from("scraper_api_keys")
    .select("success_count, failure_count, credits")
    .eq("id", keyId)
    .single();

  if (error || !key) {
    console.error(`Could not retrieve key ${keyId} to update stats.`);
    return;
  }

  const nowIso = new Date().toISOString();
  const debit = success ? Math.max(1, Number(cost) || 1) : 0;
  const newCredits = Math.max(0, Number(key.credits || 0) - debit);

  const updatePayload: any = {
    last_used_at: nowIso,
    success_count: Number(key.success_count || 0) + (success ? 1 : 0),
    failure_count: Number(key.failure_count || 0) + (success ? 0 : 1),
    credits: newCredits,
    ...(success ? { last_success_at: nowIso, cooldown_until: null } : {}),
  };

  if (success && newCredits <= 0) updatePayload.status = "exhausted";

  const { error: updateError } = await supabaseAdmin.from("scraper_api_keys").update(updatePayload).eq("id", keyId);
  if (updateError) console.error(`Error updating key stats for ${keyId}:`, updateError);
}

async function putKeyOnCooldown(keyId: string, baseMs: number, jitterMaxMs: number) {
  const until = new Date(
    Date.now() + Math.max(0, baseMs) + Math.floor(Math.random() * Math.max(0, jitterMaxMs || 0)),
  ).toISOString();

  const { error } = await supabaseAdmin.from("scraper_api_keys").update({ cooldown_until: until }).eq("id", keyId);
  if (error) console.error(`Error setting cooldown for key ${keyId}:`, error);
}

async function logApiCall(
  userId: string,
  apiKeyId: string,
  asin: string,
  country: string,
  status: "success" | "failure",
  cost: number,
  errorMessage: string | null = null,
) {
  await supabaseAdmin.from("scraper_api_logs").insert({
    user_id: userId,
    api_key_id: apiKeyId,
    asin,
    country,
    status,
    cost,
    error_message: errorMessage,
  });
}

async function logFailedScrape(userId: string, asin: string, country: string, errorMessage: string) {
  await supabaseAdmin.from("scraper_failed_logs").insert({
    user_id: userId,
    asin,
    country,
    error_message: errorMessage,
  });
}

async function logAsinEvent(userId: string, asinDataId: string, eventType: string, description: string, metadata: any) {
  await supabaseAdmin.from("asin_events").insert({
    user_id: userId,
    asin_data_id: asinDataId,
    event_type: eventType,
    description,
    metadata,
  });
}

/* ======================= Handler ======================= */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { asin, country, userId } = await req.json();

    if (!asin || !country || !userId) {
      return new Response(JSON.stringify({ error: "Missing required parameters: asin, country, userId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let attempts = 0;
    const excludedKeyIds: string[] = [];

    while (attempts < MAX_RETRIES) {
      attempts++;

      const apiKeyRecord: any = await getAvailableApiKey(userId, "scraperapi", excludedKeyIds);

      if (!apiKeyRecord) {
        const finalErrorMsg = "No active API keys available.";
        await logFailedScrape(userId, asin, country, finalErrorMsg);
        return new Response(JSON.stringify({ success: false, error: finalErrorMsg }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { id: apiKeyId, api_key: apiKey, cost_per_call } = apiKeyRecord;
      const cost = Math.max(1, Number(cost_per_call) || 1);
      excludedKeyIds.push(apiKeyId);

      try {
        const url = `https://www.amazon.${country}/dp/${asin}?th=1&psc=1`;

        const MARKET: any = {
          com: { cc: "us", al: "en-US,en;q=0.9" },
          "co.uk": { cc: "gb", al: "en-GB,en;q=0.9" },
          de: { cc: "de", al: "de-DE,de;q=0.9" },
          fr: { cc: "fr", al: "fr-FR,fr;q=0.9" },
          it: { cc: "it", al: "it-IT,it;q=0.9" },
          es: { cc: "es", al: "es-ES,es;q=0.9" },
        };

        const m = MARKET[country] ?? MARKET["com"];

        const scraperUrl =
          `https://api.scraperapi.com?api_key=${apiKey}` +
          `&url=${encodeURIComponent(url)}` +
          `&keep_headers=true&device_type=desktop&country_code=${m.cc}`;

        await sleep(300 + Math.floor(Math.random() * 400));

        const response = await fetch(scraperUrl, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36",
            Accept: "text/html,application/xhtml+xml",
            "Accept-Language": m.al,
            "Cache-Control": "no-cache",
          },
        });

        if (!response.ok) throw new Error(`ScraperAPI returned status: ${response.status}`);

        const html = await response.text();

        const blocked =
          /(Robot\s*Check|automated\s*access|captcha|Enter\s*the\s*characters\s*you\s*see\s*below|Request\s*blocked|To\s*discuss\s*automated\s*access)/i.test(
            html,
          );

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

        const page_count = extractPrintLengthPages($);

        let publication_date: string | null = null;
        $("#detailBullets_feature_div .a-list-item, #productDetails_detailBullets_sections1 tr").each((_: any, el: any) => {
          const rowText = $(el).text();
          if (rowText.includes("Publication date") || rowText.includes("Data di pubblicazione")) {
            const dateText = $(el).find("td").eq(1).text().trim() || $(el).find("span").last().text().trim();
            try {
              publication_date = new Date(dateText).toISOString();
            } catch {
              publication_date = null;
            }
          }
        });

        const image_url = $("#imgTagWrapperId img").attr("src") || $("#ebooksImgBlkFront").attr("src") || null;

        const pb = resolvePaperbackPrice($);

        if (pb.price == null && pb.missingReason === "UNKNOWN_LAYOUT_OR_MISSING_MODULE" && attempts < MAX_RETRIES) {
          throw new Error("PAPERBACK_PRICE_SOFT_MISSING");
        }

        const finalPrice = pb.price; // can be null

        const { raw: stock_status, code: availability_code, is_green_in_stock } = parseAvailability($);

        const isAvailable = ["IN_STOCK", "LOW_STOCK", "OTHER_SELLERS", "SHIP_DELAY", "POD"].includes(availability_code);

        const rawBsr = extractBSR($);
        const ranks = extractCategoryRanks($);
        const anyRankOne = ranks.some((r: any) => r.rank === 1);

        const { is_bestseller: badgeHit, bestseller_category: badgeCat } = parseBestSeller($);
        const is_bestseller = badgeHit || anyRankOne;
        const bestseller_category = badgeCat || (ranks.find((r: any) => r.rank === 1)?.category ?? null);
        const is_great_on_kindle = parseGreatOnKindle($);

        const { data: existingAsin } = await supabaseAdmin
          .from("asin_data")
          .select("id, price, bsr, review_count, stock_status")
          .eq("user_id", userId)
          .eq("asin", asin)
          .single();

        const finalBsr = rawBsr > 0 ? rawBsr : existingAsin?.bsr ?? null;

        const scrapedData: any = {
          title,
          author,
          price: finalPrice,
          price_source: pb.source,
          price_missing_reason: pb.missingReason,

          rating,
          review_count,

          ...(finalBsr != null ? { bsr: finalBsr } : {}),

          stock_status,
          availability_code,
          is_green_in_stock,

          image_url,
          is_bestseller,
          is_great_on_kindle,
          bestseller_category: bestseller_category || undefined,
          ...(page_count > 0 ? { page_count } : {}),
          ...(publication_date ? { publication_date } : {}),
        };

        const { data: upsertedAsin, error: upsertError } = await supabaseAdmin
          .from("asin_data")
          .upsert(
            {
              user_id: userId,
              asin,
              country,
              ...scrapedData,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id, asin" },
          )
          .select("id, title, bsr, price")
          .single();

        if (upsertError) throw upsertError;

        const safePrice = finalPrice && finalPrice > 0 ? finalPrice : null;
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
            availability: isAvailable,
            availability_code,
            stock_status,
            is_green_in_stock,
          });
        }

        if (existingAsin) {
          if (existingAsin.price !== finalPrice) {
            await logAsinEvent(
              userId,
              upsertedAsin.id,
              "PRICE_CHANGED",
              `Prezzo cambiato da ${existingAsin.price} a ${finalPrice}`,
              { old: existingAsin.price, new: finalPrice, source: pb.source, reason: pb.missingReason },
            );
          }

          if (existingAsin.bsr !== finalBsr) {
            await logAsinEvent(
              userId,
              upsertedAsin.id,
              "BSR_CHANGED",
              `BSR cambiato da ${existingAsin.bsr} a ${finalBsr}`,
              { old: existingAsin.bsr, new: finalBsr },
            );
          }
        } else {
          await logAsinEvent(userId, upsertedAsin.id, "ASIN_ADDED", "ASIN aggiunto al monitoraggio", {
            asin,
            title,
          });
        }

        await updateKeyStats(apiKeyId, true, cost);
        await logApiCall(userId, apiKeyId, asin, country, "success", cost);

        return new Response(JSON.stringify({ success: true, isNew: !existingAsin, data: upsertedAsin }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (e: any) {
        console.error(`Attempt ${attempts} with key ${apiKeyId} failed for ASIN ${asin}:`, e?.message || e);

        const msg = String(e?.message || "");
        let baseCd = 30_000;
        if (/(429|403)/.test(msg) || /captcha|Robot\s*Check/i.test(msg)) baseCd = 90_000;

        await putKeyOnCooldown(apiKeyId, baseCd, 20_000);
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

    return new Response(JSON.stringify({ success: false, error: finalErrorMsg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Scraper function final error:", error);

    return new Response(JSON.stringify({ success: false, error: error?.message || String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
