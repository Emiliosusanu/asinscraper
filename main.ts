
import { serve } from "https://deno.land/std@0.167.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.30.0";
import { Cron } from "https://deno.land/x/croner@8.0.0/dist/croner.js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing Supabase environment variables.");
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
  },
});

// Small helpers for retries and delayed batches
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Job = { asin: string; country: string };
const delayedRetryTimers = new Map<string, { first?: ReturnType<typeof setTimeout>; second?: ReturnType<typeof setTimeout> }>();
let isRunning = false;

async function invokeScraperWithRetry(
  userId: string,
  asin: string,
  country: string,
  retries = 3,
  baseDelay = 900,
) {
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= Math.max(1, retries); attempt++) {
    try {
      const { data, error } = await supabaseAdmin.functions.invoke('kdp-insights-scraper', {
        body: JSON.stringify({ userId, asin, country }),
      });
      if (error) throw new Error(error.message || 'invoke error');
      const jd: any = data;
      if (!jd || jd.success !== true) throw new Error((jd && jd.error) ? String(jd.error) : 'scraper returned failure');
      const payload = jd.data || {};
      const pagesOk = Number.isFinite(payload?.page_count) && Number(payload.page_count) > 0;
      const pubOk = !!payload?.publication_date;
      if (!pagesOk || !pubOk) throw new Error('incomplete scrape: missing pages or publication_date');
      return { ok: true as const };
    } catch (e) {
      lastErr = e;
      const msg = String((e as any)?.message || e);
      const transient = /(429|403|timeout|temporar|rate|still\s*running|step\s*is\s*still\s*running|incomplete|missing)/i.test(msg);
      if (attempt < retries && transient) {
        const jitter = Math.floor(Math.random() * 300);
        await sleep(baseDelay * attempt + jitter);
        continue;
      }
      break;
    }
  }
  return { ok: false as const, error: String((lastErr as any)?.message || lastErr || 'unknown error') };
}

interface UserSettings {
  user_id: string;
  scraping_interval: string | null;
  last_scrape_at: string | null;
  scraping_start_hour: number | null;
}

const triggerScrapingForUser = async (userId: string) => {
  console.log(`[${new Date().toISOString()}] 🚀 Triggering scraping for user: ${userId}`);

  const { data: asins, error: asinsError } = await supabaseAdmin
    .from('asin_data')
    .select('asin, country')
    .eq('user_id', userId)
    .eq('archived', false);

  if (asinsError) {
    console.error(`[${new Date().toISOString()}] Error fetching ASINs for user ${userId}:`, asinsError);
    return;
  }
  if (!asins || asins.length === 0) {
    console.log(`[${new Date().toISOString()}] No ASINs to scrape for user ${userId}.`);
    return;
  }

  console.log(`[${new Date().toISOString()}] Found ${asins.length} ASINs for user ${userId}.`);

  const failures: Job[] = [];
  for (const row of asins) {
    const asin = String((row as any).asin);
    const country = String((row as any).country || 'com');
    try {
      console.log(`[${new Date().toISOString()}] ▶️ Scrape ${asin} (${country})`);
      const r = await invokeScraperWithRetry(userId, asin, country, 3, 900);
      if (!r.ok) {
        console.warn(`[${new Date().toISOString()}] ⚠️ Failed ${asin}: ${r.error}`);
        failures.push({ asin, country });
      } else {
        console.log(`[${new Date().toISOString()}] ✅ Done ${asin}`);
      }
    } catch (e) {
      console.error(`[${new Date().toISOString()}] ❌ Exception ${asin}:`, e);
      failures.push({ asin, country });
    }
  }

  // Update last_scrape_at after main pass
  const { error: updateError } = await supabaseAdmin
    .from('settings')
    .update({ last_scrape_at: new Date().toISOString() })
    .eq('user_id', userId);
  if (updateError) console.error('last_scrape_at update error', updateError);

  // Delayed retries: +5m then +10m only for the failed ones
  if (failures.length > 0) {
    const prev = delayedRetryTimers.get(userId);
    if (prev?.first) clearTimeout(prev.first);
    if (prev?.second) clearTimeout(prev.second);
    const timers: { first?: ReturnType<typeof setTimeout>; second?: ReturnType<typeof setTimeout> } = {};

    const retryOnce = async (jobs: Job[], label: string): Promise<Job[]> => {
      if (!jobs.length) return [];
      console.log(`[${new Date().toISOString()}] 🔁 Delayed retry ${label} for ${jobs.length} ASIN(s)`);
      const remain: Job[] = [];
      for (const j of jobs) {
        try {
          const r = await invokeScraperWithRetry(userId, j.asin, j.country, 3, 1200);
          if (!r.ok) remain.push(j);
        } catch (_) {
          remain.push(j);
        }
      }
      return remain;
    };

    timers.first = setTimeout(async () => {
      const remain1 = await retryOnce(failures, 't+5m');
      if (remain1.length > 0) {
        timers.second = setTimeout(async () => {
          await retryOnce(remain1, 't+10m');
          // cleanup after second run completes
          delayedRetryTimers.delete(userId);
        }, 5 * 60 * 1000);
      } else {
        // cleanup if nothing remains after first run
        delayedRetryTimers.delete(userId);
      }
    }, 5 * 60 * 1000);
    delayedRetryTimers.set(userId, timers);
  }
};

const parseInterval = (interval: string): { type: 'hourly' | 'daily_at', value: number } | null => {
    const numericValue = parseInt(interval, 10);
    if (!isNaN(numericValue) && numericValue > 0) {
        return { type: 'hourly', value: 24 / numericValue };
    }

    const dailyMatch = interval.match(/^daily_at_(\d{1,2})/);
    if (dailyMatch && dailyMatch[1]) {
        const hour = parseInt(dailyMatch[1], 10);
        if (hour >= 0 && hour <= 23) {
            return { type: 'daily_at', value: hour };
        }
    }

    return null;
};


const checkAndRunScraper = async () => {
  if (isRunning) {
    console.log(`[${new Date().toISOString()}] ⚠️ Previous run still in progress. Skipping this tick.`);
    return;
  }
  isRunning = true;
  console.log(`\n---\n[${new Date().toISOString()}] 🔄 Cron job started ---\n`);
  try {
  const { data: allUserSettings, error } = await supabaseAdmin
    .from("settings")
    .select("user_id, scraping_interval, last_scrape_at, scraping_start_hour");

  if (error) {
    console.error(`[${new Date().toISOString()}] Error fetching user settings:`, error);
    return;
  }
  
  if (!allUserSettings) {
      console.log(`[${new Date().toISOString()}] No user settings found.`);
      return;
  }

  const now = new Date();
  const currentUTCHour = now.getUTCHours();

  for (const settings of allUserSettings) {
    console.log(`---`);
    console.log(`[${new Date().toISOString()}] 🔍 Evaluating user ${settings.user_id}`);

    if (!settings.scraping_interval || settings.scraping_interval === 'off') {
        console.log(`[${new Date().toISOString()}] ⏭️ Skipped user ${settings.user_id} — Scraping is off.`);
        continue;
    }

    const parsedInterval = parseInterval(settings.scraping_interval);

    if (!parsedInterval) {
        console.log(`[${new Date().toISOString()}] ⚠️ Invalid scraping_interval format for user ${settings.user_id}: ${settings.scraping_interval}`);
        continue;
    }

    if (!settings.last_scrape_at) {
        console.log(`[${new Date().toISOString()}] User ${settings.user_id} has never been scraped. Triggering initial scrape.`);
        await triggerScrapingForUser(settings.user_id);
        continue;
    }

    const lastScrape = new Date(settings.last_scrape_at);
    const hoursSinceLastScrape = (now.getTime() - lastScrape.getTime()) / (1000 * 60 * 60);

    let shouldScrape = false;

    if (parsedInterval.type === 'hourly') {
        const intervalHours = parsedInterval.value;
        console.log(`[${new Date().toISOString()}] User ${settings.user_id} schedule: Every ${intervalHours} hours. Hours since last: ${hoursSinceLastScrape.toFixed(2)}`);
        if (hoursSinceLastScrape >= intervalHours * 0.95) {
            shouldScrape = true;
        }
    } else if (parsedInterval.type === 'daily_at') {
        const targetHour = parsedInterval.value;
        console.log(`[${new Date().toISOString()}] User ${settings.user_id} schedule: Daily at ${targetHour}:00 UTC. Current UTC hour: ${currentUTCHour}. Hours since last: ${hoursSinceLastScrape.toFixed(2)}`);
        if (currentUTCHour === targetHour && hoursSinceLastScrape >= 23) {
            shouldScrape = true;
        }
    }

    if (shouldScrape) {
        console.log(`[${new Date().toISOString()}] User ${settings.user_id} is due for a scrape.`);
        await triggerScrapingForUser(settings.user_id);
    } else {
        console.log(`[${new Date().toISOString()}] ⏭️ Skipped user ${settings.user_id} — Not due for a scrape yet.`);
    }
  }
  console.log(`\n---\n[${new Date().toISOString()}] 🏁 Cron job finished ---\n`);
  } finally {
    isRunning = false;
  }
};

const job = new Cron("*/5 * * * *", async () => {
await checkAndRunScraper();
});

console.log(`[${new Date().toISOString()}] Deno cron handler initialized. Pattern: '*/5 * * * *'. Next run at: ${job.nextRun()}`);

serve(async (req: Request) => {
const url = new URL(req.url);
if (url.pathname === '/invoke-cron') {
await checkAndRunScraper();
return new Response("Scraper check executed manually.", {
headers: { "Content-Type": "text/plain" },
});
}
return new Response("Cron job service is running. Use /invoke-cron to trigger manually.", {
headers: { "Content-Type": "text/plain" },
});
});