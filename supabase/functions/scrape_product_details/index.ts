// Supabase Edge Function: scrape_product_details
// Fetches Amazon product page via ScraperAPI and extracts details
// Inputs: { asin, country, userId }

// Robust page count extraction across locales and bullet formats (ASCII-safe)
function extractPageCount(html: string): number | null {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const patterns: RegExp[] = [
    /(Print\s*length|Lunghezza\s*stampa|Seitenzahl|Nombre\s*de\s*pages|Numero\s*de\s*paginas|Page\s*count|Pagine|Seiten)\s*[:\s]*([0-9]{1,4})\s*(pages|pagine|seiten|paginas)?/i,
    /(Paperback|Hardcover|Copertina\s*(?:rigida|flessibile)|Taschenbuch|Relie|Tapa\s*(?:dura|blanda))[^0-9]{0,40}([0-9]{1,4})\s*(pages|pagine|seiten|paginas)/i,
    /(?:[^0-9]|^)([0-9]{1,4})\s*(pages|pagine|seiten|paginas)(?:[^a-z]|$)/i,
  ];
  for (const rx of patterns) {
    const m = text.match(rx);
    if (m) {
      const val = parseInt(m[2] || m[1], 10);
      if (Number.isFinite(val) && val > 0) return val;
    }
  }
  return null;
}

// Localized month mapping for date parsing (ASCII-safe keys)
const monthMapEn: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};
const monthMapIt: Record<string, number> = {
  gennaio: 1, febbraio: 2, marzo: 3, aprile: 4, maggio: 5, giugno: 6, luglio: 7, agosto: 8, settembre: 9, ottobre: 10, novembre: 11, dicembre: 12,
  gen: 1, mag: 5, giu: 6, lug: 7, ago: 8, set: 9, ott: 10, dic: 12,
};
const monthMapDe: Record<string, number> = {
  januar: 1, februar: 2, maerz: 3, marz: 3, juni: 6, juli: 7, oktober: 10, dezember: 12,
  mrz: 3, okt: 10, dez: 12,
};
const monthMapFr: Record<string, number> = {
  janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12,
  janv: 1, fevr: 2, avr: 4, juil: 7,
};
const monthMapEs: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
  ene: 1, abr: 4,
};
const monthMap: Record<string, number> = { ...monthMapEn, ...monthMapIt, ...monthMapDe, ...monthMapFr, ...monthMapEs };

function mapMonth(nameRaw: string): number | null {
  const n = nameRaw
    .toLowerCase()
    .replace(/\.$/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // strip diacritics (e.g., févr → fevr, märz → marz)
  return monthMap[n] ?? null;
}

function toIsoDate(y: number, m: number, d: number): string | null {
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const iso = `${y.toString().padStart(4,'0')}-${m.toString().padStart(2,'0')}-${d.toString().padStart(2,'0')}`;
  return iso;
}

function extractPublicationDate(html: string): string | null {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  // 1) Explicit label in various locales (ASCII-safe)
  const label = /(Publication\s*date|Data\s*di\s*pubblicazione|Erscheinungsdatum|Date\s*de\s*publication|Fecha\s*de\s*publicacion|Pubblicato|Published)/i;
  const m1 = text.match(new RegExp(label.source + `\s*[:\-]?\s*([A-Za-z\.]+)\s+([0-9]{1,2})[,\/]?\s*([0-9]{4})`, 'i'));
  if (m1) {
    const mon = mapMonth(m1[1]);
    const day = parseInt(m1[2], 10);
    const year = parseInt(m1[3], 10);
    if (mon) return toIsoDate(year, mon, day);
  }
  // 2) D/M/Y or D-M-Y nearby
  const m2 = text.match(new RegExp(label.source + `[^0-9]{0,10}([0-9]{1,2})[\/\-]([0-9]{1,2})[\/\-]([0-9]{2,4})`, 'i'));
  if (m2) {
    const d = parseInt(m2[1], 10);
    const m = parseInt(m2[2], 10);
    let y = parseInt(m2[3], 10);
    if (y < 100) y += 2000;
    return toIsoDate(y, m, d);
  }
  // 3) Bullet format: Paperback : August 3, 2024
  const m3 = text.match(/(?:Paperback|Hardcover|Copertina\s*(?:rigida|flessibile)|Taschenbuch|Relie)\s*:\s*([A-Za-z\.]+)\s+([0-9]{1,2}),\s*([0-9]{4})/i);
  if (m3) {
    const mon = mapMonth(m3[1]);
    const day = parseInt(m3[2], 10);
    const year = parseInt(m3[3], 10);
    if (mon) return toIsoDate(year, mon, day);
  }
  // 4) Alternative order: 3 August 2024
  const m4 = text.match(new RegExp(label.source + `\s*[:\-]?\s*([0-9]{1,2})\s+([A-Za-z\.]+)\s+([0-9]{4})`, 'i'));
  if (m4) {
    const d = parseInt(m4[1], 10);
    const mon = mapMonth(m4[2]);
    const y = parseInt(m4[3], 10);
    if (mon) return toIsoDate(y, mon, d);
  }
  // 5) Month YYYY only
  const m5 = text.match(new RegExp(label.source + `\s*[:\-]?\s*([A-Za-z\.]+)\s+([0-9]{4})`, 'i'));
  if (m5) {
    const mon = mapMonth(m5[1]);
    const y = parseInt(m5[2], 10);
    if (mon) return toIsoDate(y, mon, 1);
  }
  // 6) Publisher: Independently published (August 3, 2024)
  const m6 = text.match(/Publisher[^()]{0,80}\(([A-Za-z\.]+)\s+([0-9]{1,2}),\s*([0-9]{4})\)/i);
  if (m6) {
    const mon = mapMonth(m6[1]);
    const d = parseInt(m6[2], 10);
    const y = parseInt(m6[3], 10);
    if (mon) return toIsoDate(y, mon, d);
  }
  // 7) Publisher: Independently published (3 August 2024)
  const m7 = text.match(/Publisher[^()]{0,80}\(([0-9]{1,2})\s+([A-Za-z\.]+)\s+([0-9]{4})\)/i);
  if (m7) {
    const d = parseInt(m7[1], 10);
    const mon = mapMonth(m7[2]);
    const y = parseInt(m7[3], 10);
    if (mon) return toIsoDate(y, mon, d);
  }
  return null;
}

// Parse top category ranks from the BSR section (up to 3 entries), localized
function parseTopCategoryRanks(html: string): Array<{ rank: number; name: string }> {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  // Try to scope near localized BSR headings to reduce false positives (best effort)
  const bsrHeads = [
    /Best\s*Sellers\s*Rank/i,
    /Bestseller\s*di\s*Amazon|Posizione\s*nella\s*classifica\s*Bestseller/i,
    /Bestseller-?Rang|Amazon\s*Bestseller-?Rang/i,
    /Classement\s*des\s*meilleures\s*ventes/i,
    /Clasificación\s*en\s*los\s*m[aá]s\s*vendidos/i,
  ];
  let scoped = text;
  for (const rx of bsrHeads) {
    const m = text.match(new RegExp(`.{0,400}${rx.source}.{0,800}`, rx.flags));
    if (m) { scoped = m[0]; break; }
  }
  const ranks: Array<{ rank: number; name: string }> = [];
  const re = /(?:#|n\.?|nº|n°|Nr\.?|Nº|N°)\s*([0-9]{1,3})\s*(?:in|en|dans|in\s*der|in\s*die|in\s*den|nel(?:la)?|tra|de|des\s*ventes\s*dans)\s+([^#\n\r\|\(\)\[\];:,\.]{2,120})/gi;
  let m: RegExpExecArray | null;
  let guard = 0;
  while ((m = re.exec(scoped)) && guard < 10) {
    guard++;
    const rank = parseInt(m[1], 10);
    const name = (m[2] || '').trim();
    if (Number.isFinite(rank) && name) {
      ranks.push({ rank, name });
      if (ranks.length >= 3) break;
    }
  }
  return ranks;
}

// Decide bestseller strictly by top-3 category ranks per rule:
// - If at least one of the first 3 categories is rank #1 => bestseller
// - Otherwise => not a bestseller
function decideBestsellerByRanks(ranks: Array<{ rank: number; name: string }>): boolean {
  const anyTop1 = ranks.slice(0, 3).some(r => r.rank === 1);
  return anyTop1;
}

// Detect availability status; conservative text extraction
function detectAvailability(html: string): { code: string | null; text: string | null } {
  const plain = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  // Prefer explicit In Stock when present
  const inStockMatch = plain.match(/(in stock|disponibile|artikel auf lager|en stock|en existencia)/i);
  if (inStockMatch) {
    return { code: 'IN_STOCK', text: inStockMatch[0] };
  }
  // Tighten low stock: require "Only X left in stock" (drop generic "order soon")
  const lowStockMatch = plain.match(/(only\s+\d+\s+left\s+in\s+stock[^.]*)/i);
  if (lowStockMatch) {
    return { code: 'LOW_STOCK', text: lowStockMatch[0] };
  }
  const otherSellersMatch = plain.match(
    /(available\s*from\s*(?:these|other)?\s*sellers|other\s*sellers|altri\s*venditori|disponibile\s*da\s*venditori)/i,
  );
  if (otherSellersMatch) {
    return { code: 'OTHER_SELLERS', text: otherSellersMatch[0] };
  }
  const shipDelayMatch = plain.match(
    /(available\s*to\s*ship[^.]*|usually\s*ships[^.]*|ships\s*within[^.]*|available\s*to\s*ship\s*in[^.]*|spedizione[^.]*|disponibile\s*tra[^.]*|verfügbar[^.]*|expédition\s*sous[^.]*|disponible\s*en[^.]*)/i,
  );
  if (shipDelayMatch) {
    return { code: 'SHIP_DELAY', text: shipDelayMatch[0] };
  }
  if (/(temporarily out of stock|temporalmente esaurito|derzeit nicht auf lager|temporairement en rupture|temporalmente sin stock)/i.test(plain)) {
    return { code: 'OUT_OF_STOCK', text: (plain.match(/(temporarily out of stock|temporalmente esaurito|derzeit nicht auf lager|temporairement en rupture|temporalmente sin stock)/i)?.[0] || null) };
  }
  if (/(currently unavailable|attualmente non disponibile|derzeit nicht verfügbar|actuellement indisponible|actualmente no disponible)/i.test(plain)) {
    return { code: 'UNAVAILABLE', text: (plain.match(/(currently unavailable|attualmente non disponibile|derzeit nicht verfügbar|actuellement indisponible|actualmente no disponible)/i)?.[0] || null) };
  }
  return { code: null, text: null };
}

// Output: { success, data: { page_count, dimensions_raw, trim_size, binding, language, series, category, interior_type, interior_confidence }, error? }

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4?target=deno&bundle";

// simple sleep helper for backoff
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

declare const Deno: any;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

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
const BESTSELLER_MISSES_REQUIRED = 3; // consecutive runs without top-1 before demotion

// CORS headers for browser requests
const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

async function getAccountEmail(client: any, userId: string): Promise<string | null> {
  try {
    const { data, error } = await client.auth.admin.getUserById(userId);
    if (error) return null;
    const email = (data as any)?.user?.email;
    return email ? String(email) : null;
  } catch (_e) {
    return null;
  }
}

async function sendMailgunEmail(toEmail: string, subject: string, text: string): Promise<{ ok: boolean; error?: string }> {
  const missing = getMissingMailgunEnv();
  if (missing.length) return { ok: false, error: `Missing Mailgun env: ${missing.join(", ")}` };
  try {
    const { apiKey, domain, from, apiBase } = readMailgunEnv();
    const base = (apiBase || "https://api.mailgun.net").replace(/\/+$/, "");
    const url = `${base}/v3/${domain}/messages`;
    const body = new URLSearchParams();
    body.set('from', from);
    body.set('to', toEmail);
    body.set('subject', subject);
    body.set('text', text);
    const auth = btoa(`api:${apiKey}`);
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
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

async function sendDedupedEmailAlert(
  client: any,
  userId: string,
  asin: string,
  alertType: string,
  dedupeKey: string,
  toEmail: string | null,
  subject: string,
  text: string,
): Promise<void> {
  if (!toEmail) return;
  const { error: insErr } = await client.from('email_alert_log').insert({
    user_id: userId,
    asin,
    alert_type: alertType,
    dedupe_key: dedupeKey,
  });
  if (insErr) {
    const cd = String((insErr as any)?.code || '');
    const msg = String((insErr as any)?.message || '');
    if (cd === '23505' || /duplicate key value/i.test(msg)) return;
    console.error('email_alert_log insert error', insErr);
    return;
  }
  const sent = await sendMailgunEmail(toEmail, subject, text);
  if (!sent.ok) {
    try {
      await client.from('email_alert_log').delete().eq('user_id', userId).eq('dedupe_key', dedupeKey);
    } catch (_e) {}
    console.error('Mailgun send failed', sent.error);
  }
}

function normalizeAvailabilityForChange(code: string | null): string | null {
  const c = String(code || '').toUpperCase();
  if (c === 'LOW_STOCK') return 'IN_STOCK';
  if (c === 'SHIP_DELAY') return 'IN_STOCK';
  if (c === 'OTHER_SELLERS') return 'IN_STOCK';
  if (c === 'AVAILABLE_SOON') return 'IN_STOCK';
  if (c === 'PREORDER') return 'IN_STOCK';
  return c ? c : null;
}

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

const pagesRx = /(\d{1,4})\s*(pages|pagine|seiten|paginas)/i;
const dimsLineRx = /(dimensions|product\s*dimensions|dimensioni|abmessungen|dimensions\s*du\s*produit|dimensiones)/i;

function normalizeTrimFromText(text: string): string | null {
  const s = text.toLowerCase();
  let m = s.match(/(\d{1,2}(?:[.,]\d+)?)\s*[x×]\s*(\d{1,2}(?:[.,]\d+)?)(?:\s*(?:in|inch|inches)|\s*["”])/i);
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

// (detectBestsellerBadge removed – ranks-based decision used instead)

async function fetchWithKey(client: any, userId: string, asin: string, country: string, url: string) {
  const nowIso = new Date().toISOString();
  const { data: keys } = await client
    .from("scraper_api_keys")
    .select("id, api_key, status, credits, max_credits, cost_per_call, last_used_at, success_count, failure_count, last_success_at, cooldown_until, last_reset_at, created_at")
    .eq("user_id", userId)
    .eq("service_name", "scraperapi");

  const costFallback = 1;
  const nowMs = Date.now();
  // Auto-reset credits when 30 days elapsed since last_reset_at (or created_at fallback)
  try {
    const list = Array.isArray(keys) ? keys : [];
    const dayMs = 24 * 60 * 60 * 1000;
    const needsReset = list.filter((k: any) => {
      const baseTs = k?.last_reset_at ? Date.parse(k.last_reset_at) : (k?.created_at ? Date.parse(k.created_at) : 0);
      if (!baseTs) return false;
      const elapsedDays = Math.floor((nowMs - baseTs) / dayMs);
      return elapsedDays >= 30;
    });
    if (needsReset.length) {
      const now = new Date().toISOString();
      for (const k of needsReset) {
        try {
          const maxCreds = Number.isFinite(k?.max_credits) ? Number(k.max_credits) : 1000;
          const patch: Record<string, any> = {
            credits: maxCreds,
            last_reset_at: now,
            cooldown_until: null,
          };
          if ((k?.status || '').toLowerCase() === 'exhausted') patch.status = 'active';
          await client.from('scraper_api_keys').update(patch).eq('id', k.id);
          try { await client.from('scraper_api_logs').insert({ api_key_id: k.id, asin, country, status: 'reset', cost: 0, error_message: null }); } catch (_) {}
        } catch (_) {}
      }
    }
  } catch (_) {}
  // Re-fetch keys after potential resets to work with fresh state
  let baseKeys: any[] = Array.isArray(keys) ? keys : [];
  try {
    const { data: fresh } = await client
      .from("scraper_api_keys")
      .select("id, api_key, status, credits, max_credits, cost_per_call, last_used_at, success_count, failure_count, last_success_at, cooldown_until")
      .eq("user_id", userId)
      .eq("service_name", "scraperapi");
    if (Array.isArray(fresh)) baseKeys = fresh;
  } catch (_) {}
  const candidates = (baseKeys)
    .filter((k: any) => {
      if ((k?.status || '').toLowerCase() !== 'active') return false;
      const credits = Number.isFinite(k?.credits) ? Number(k.credits) : 0;
      const unit = Number.isFinite(k?.cost_per_call) ? Math.max(1, Number(k.cost_per_call)) : costFallback;
      if (credits < unit) return false;
      const cd = k?.cooldown_until ? Date.parse(k.cooldown_until) : 0;
      if (cd && cd > nowMs) return false; // skip keys under cooldown
      return true;
    })
    .sort((a: any, b: any) => {
      // Smart priority: recent success first, then least-recently-used, then credits, then fewer failures
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

  if (!candidates.length) throw new Error('No usable ScraperAPI key available');

  const maxCycles = 2; // go through the pool twice if needed
  const baseDelay = 900; // ms
  const totalAttempts = Math.max(1, candidates.length * maxCycles);

  for (let attempt = 0; attempt < totalAttempts; attempt++) {
    const k = candidates[attempt % candidates.length];
    const cost = Number.isFinite(k?.cost_per_call) ? Math.max(1, Number(k.cost_per_call)) : costFallback;
    try {
      const apiUrl = `https://api.scraperapi.com/?api_key=${k.api_key}&url=${encodeURIComponent(url)}&keep_headers=true&device_type=desktop`;
      const resp = await fetch(apiUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
      const retryAfter = Number(resp.headers.get('Retry-After')) || 0;
      if (!resp.ok) {
        const err = new Error(`ScraperAPI HTTP ${resp.status}`);
        // log failure, maybe wait per Retry-After, and put key on cooldown
        const msg = String(err?.message || err);
        const now = new Date();
        const status = resp.status;
        // cooldown strategy: longer on 429/403, shorter otherwise
        const baseCd = (status === 429 || status === 403) ? 90_000 : 30_000; // ms
        const jitterCd = Math.floor(Math.random() * 20_000);
        const cdUntil = new Date(now.getTime() + baseCd + jitterCd).toISOString();
        // Update last_used, failure_count and cooldown_until (best-effort)
        try {
          await client.from('scraper_api_keys').update({ failure_count: (k.failure_count || 0) + 1, last_used_at: now.toISOString(), cooldown_until: cdUntil }).eq('id', k.id);
        } catch (_) {
          // fallback without cooldown_until if column doesn't exist
          try { await client.from('scraper_api_keys').update({ failure_count: (k.failure_count || 0) + 1, last_used_at: now.toISOString() }).eq('id', k.id); } catch (_) {}
        }
        try { await client.from('scraper_api_logs').insert({ api_key_id: k.id, asin, country, status: 'failure', cost: 0, error_message: msg }); } catch (_) {}
        const jitter = Math.floor(Math.random() * 400);
        const backoff = baseDelay * Math.max(1, attempt + 1);
        const waitMs = (retryAfter ? retryAfter * 1000 : 0) + backoff + jitter;
        await sleep(waitMs);
        continue;
      }
      const html = await resp.text();
      // Detect bot/blocked pages even with 200 OK
      const blocked = /(Robot\s*Check|automated\s*access|captcha|Enter\s*the\s*characters\s*you\s*see\s*below|Request\s*blocked|To\s*discuss\s*automated\s*access)/i.test(html);
      if (blocked) {
        const msg = 'ScraperAPI blocked content (captcha/robot)';
        const now = new Date();
        const baseCd = 90_000; // ms
        const jitterCd = Math.floor(Math.random() * 30_000);
        const cdUntil = new Date(now.getTime() + baseCd + jitterCd).toISOString();
        try { await client.from('scraper_api_keys').update({ failure_count: (k.failure_count || 0) + 1, last_used_at: now.toISOString(), cooldown_until: cdUntil }).eq('id', k.id); } catch (_) {
          try { await client.from('scraper_api_keys').update({ failure_count: (k.failure_count || 0) + 1, last_used_at: now.toISOString() }).eq('id', k.id); } catch (_) {}
        }
        try { await client.from('scraper_api_logs').insert({ api_key_id: k.id, asin, country, status: 'failure', cost: 0, error_message: msg }); } catch (_) {}
        const jitter = Math.floor(Math.random() * 400);
        const backoff = baseDelay * Math.max(1, attempt + 1);
        await sleep(backoff + jitter);
        continue;
      }
      // success: decrement credits and log
      const now = new Date();
      // credits & last_used always updated
      try {
        await client.from('scraper_api_keys').update({
          credits: Math.max(0, (k.credits || cost) - cost),
          last_used_at: now.toISOString(),
        }).eq('id', k.id);
      } catch (_) {}
      // try to record success_count / last_success_at / clear cooldown
      try {
        await client.from('scraper_api_keys').update({
          success_count: (k.success_count || 0) + 1,
          last_success_at: now.toISOString(),
          cooldown_until: null,
        }).eq('id', k.id);
      } catch (_) {}
      try { await client.from('scraper_api_logs').insert({ api_key_id: k.id, asin, country, status: 'success', cost }); } catch (_) {}
      return html;
    } catch (err: any) {
      const msg = String(err?.message || err);
      const now = new Date();
      const baseCd = 30_000;
      const jitterCd = Math.floor(Math.random() * 20_000);
      const cdUntil = new Date(now.getTime() + baseCd + jitterCd).toISOString();
      try { await client.from('scraper_api_keys').update({ failure_count: (k.failure_count || 0) + 1, last_used_at: now.toISOString(), cooldown_until: cdUntil }).eq('id', k.id); } catch (_) {
        try { await client.from('scraper_api_keys').update({ failure_count: (k.failure_count || 0) + 1, last_used_at: now.toISOString() }).eq('id', k.id); } catch (_) {}
      }
      try { await client.from('scraper_api_logs').insert({ api_key_id: k.id, asin, country, status: 'failure', cost: 0, error_message: msg }); } catch (_) {}
      const jitter = Math.floor(Math.random() * 500);
      const waitMs = baseDelay * Math.max(1, attempt + 1) + jitter;
      await sleep(waitMs);
      continue;
    }
  }
  throw new Error('All ScraperAPI keys failed after rotation');
}

function parseField(html: string, rx: RegExp): string | null {
  const m = html.match(rx);
  return m ? m[0] : null;
}

serve(async (req: Request) => {
  // Preflight support
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ success: false, error: "Missing Supabase env" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ success: false, error: "Method Not Allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const payload = await req.json();
    const asin: string = payload?.asin;
    const country: string = (payload?.country || "com").toLowerCase();
    const userId: string = payload?.userId;
    if (!asin || !userId) {
      return new Response(JSON.stringify({ success: false, error: "Missing asin or userId" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    let alertSettings: any = null;
    try {
      const { data } = await client
        .from('settings')
        .select('stock_alert_enabled, stock_alert_on_change')
        .eq('user_id', userId)
        .maybeSingle();
      alertSettings = data || null;
    } catch (_e) {}
    const stockAlertEnabled = !!alertSettings?.stock_alert_enabled;
    const stockAlertOnChange = !!alertSettings?.stock_alert_on_change;
    const wantsAnyEmailAlert = stockAlertEnabled || stockAlertOnChange;
    const accountEmail = wantsAnyEmailAlert ? await getAccountEmail(client, userId) : null;

    // Build product URL
    const dom = countryToDomain[country] || countryToDomain["com"];
    const url = `https://${dom}/dp/${asin}`;

    // Get HTML via ScraperAPI
    const html = await fetchWithKey(client, userId, asin, country, url);

    // Parse title and price if available in asin_data
    const { data: asinRow } = await client
      .from("asin_data")
      .select("id, price, title, is_bestseller, is_bestseller_miss_count, availability_code, stock_status")
      .eq("asin", asin)
      .eq("user_id", userId)
      .maybeSingle();

    const price = Number(asinRow?.price) || 0;
    const title = String(asinRow?.title || "");

    // Extract fields
    let page_count: number | null = extractPageCount(html);
    if (Number.isFinite(page_count as number) && (page_count as number) < 1) page_count = null;

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
      const gen = html.match(/\d{1,2}(?:[.,]\d+)?\s*[x×]\s*\d{1,2}(?:[.,]\d+)?\s*(?:in|inch|inches|cm|["”])/i);
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

    // Publication date (best-effort)
    const publication_date = extractPublicationDate(html);

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

    // Bestseller decision strictly by top-3 category ranks
    const ranks = parseTopCategoryRanks(html);
    const hasRankData = ranks.length > 0;
    const top1 = hasRankData ? decideBestsellerByRanks(ranks) : false;

    // Availability detection
    const avail = detectAvailability(html);
    const prevCode = asinRow?.availability_code ? String(asinRow.availability_code) : null;
    const newCode = avail.code ? String(avail.code) : null;

    // Update asin_data for this user's ASIN
    if (asinRow?.id) {
      try {
        // Conservative demotion logic using miss counter
        const bestsellerUpdate: Record<string, any> = {};
        if (hasRankData) {
          const currIs = asinRow?.is_bestseller === true;
          const currMiss = Number(asinRow?.is_bestseller_miss_count) || 0;
          if (top1) {
            bestsellerUpdate.is_bestseller = true;
            bestsellerUpdate.is_bestseller_miss_count = 0;
          } else {
            if (currIs) {
              const nextMiss = currMiss + 1;
              if (nextMiss >= BESTSELLER_MISSES_REQUIRED) {
                bestsellerUpdate.is_bestseller = false;
                bestsellerUpdate.is_bestseller_miss_count = 0;
              } else {
                // keep bestseller=true, just increment miss count
                bestsellerUpdate.is_bestseller_miss_count = nextMiss;
              }
            } else {
              // not currently bestseller; keep as false; increment miss count up to threshold for telemetry
              const nextMiss = Math.min(currMiss + 1, BESTSELLER_MISSES_REQUIRED);
              bestsellerUpdate.is_bestseller = false;
              bestsellerUpdate.is_bestseller_miss_count = nextMiss;
            }
          }
        }
        const availabilityUpdate: Record<string, any> = {};
        if (avail.text) availabilityUpdate.stock_status = avail.text;
        if (avail.code) availabilityUpdate.availability_code = avail.code;
        // Build update payload; avoid erasing existing publication_date when not parsed
        const updateObj: Record<string, any> = {
          dimensions_raw,
          trim_size,
          binding,
          language,
          series,
          category,
          interior_type,
          interior_confidence,
          interior_detected: true,
          ...bestsellerUpdate,
          ...availabilityUpdate,
        };
        if (page_count != null) updateObj.page_count = page_count;
        if (publication_date) updateObj.publication_date = publication_date;
        await client
          .from("asin_data")
          .update(updateObj)
          .eq("id", asinRow.id);
      } catch (_) {
        // Fallback if column doesn't exist yet
        await client
          .from("asin_data")
          .update({
            dimensions_raw,
            trim_size,
            binding,
            language,
            series,
            // publication_date may not exist on older schemas; omit in fallback
            category,
            interior_type,
            interior_confidence,
            interior_detected: true,
          })
          .eq("id", asinRow.id);
      }

      if (wantsAnyEmailAlert && accountEmail && prevCode && newCode && prevCode !== newCode) {
        try {
          const dayKey = new Date().toISOString().slice(0, 10);
          const prevEff = normalizeAvailabilityForChange(prevCode);
          const newEff = normalizeAvailabilityForChange(newCode);

          const inStockCodes = new Set([
            'IN_STOCK',
            'LOW_STOCK',
            'SHIP_DELAY',
            'AVAILABLE_SOON',
            'OTHER_SELLERS',
            'POD',
            'PREORDER',
            'MADE_TO_ORDER',
          ]);
          const outOfStockCodes = new Set(['OOS', 'OUT_OF_STOCK', 'UNAVAILABLE']);

          if (stockAlertOnChange && prevEff && newEff && prevEff !== newEff) {
            const dedupeKey = `stock_change:${asin}:${prevEff}->${newEff}:${dayKey}`;
            const subject = `[KDPInsights] Stock changed (${asin})`;
            const body = [
              `ASIN: ${asin}`,
              `Title: ${title || ''}`,
              `Previous: ${prevCode}`,
              `Now: ${newCode}`,
              `Time (UTC): ${new Date().toISOString()}`,
            ].filter(Boolean).join('\n');
            await sendDedupedEmailAlert(client, userId, asin, 'stock_change', dedupeKey, accountEmail, subject, body);
          }

          if (
            stockAlertEnabled &&
            inStockCodes.has(String(prevCode).toUpperCase()) &&
            outOfStockCodes.has(String(newCode).toUpperCase())
          ) {
            const dedupeKey = `stock_oos:${asin}:${String(newCode).toUpperCase()}:${dayKey}`;
            const subject = `[KDPInsights] Out of stock (${asin})`;
            const body = [
              `ASIN: ${asin}`,
              `Title: ${title || ''}`,
              `Previous: ${prevCode}`,
              `Now: ${newCode}`,
              `Time (UTC): ${new Date().toISOString()}`,
            ].filter(Boolean).join('\n');
            await sendDedupedEmailAlert(client, userId, asin, 'stock_oos', dedupeKey, accountEmail, subject, body);
          }
        } catch (e: any) {
          console.error('Email alert send error', e?.message || e);
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, data: { page_count, dimensions_raw, trim_size, binding, language, series, publication_date, category, interior_type, interior_confidence, is_bestseller: hasRankData ? top1 : null, stock_status: avail.text || null, availability_code: avail.code || null } }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    const msg = String(e?.message || e);
    return new Response(JSON.stringify({ success: false, error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
