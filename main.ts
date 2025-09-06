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

const triggerScrapingForUser = async (userId: string) => {
  console.log(`[${new Date().toISOString()}] 🚀 Triggering scraping for user: ${userId}`);

  const { data: asins, error: asinsError } = await supabaseAdmin
    .from("asin_data")
    .select("asin, country")
    .eq("user_id", userId);

  if (asinsError) {
    console.error(`[${new Date().toISOString()}] Error fetching ASINs for user ${userId}:`, asinsError);
    return;
  }

  if (!asins || asins.length === 0) {
    console.log(`[${new Date().toISOString()}] No ASINs to scrape for user ${userId}.`);
    return;
  }

  console.log(`[${new Date().toISOString()}] Found ${asins.length} ASINs for user ${userId}.`);

  for (const asin of asins) {
      try {
        console.log(`[${new Date().toISOString()}] Invoking scraper for ASIN: ${asin.asin}, Country: ${asin.country || 'com'}`);
        // Using await here ensures we process one by one, reducing load and making logs clearer.
        const { data: functionData, error: invokeError } = await supabaseAdmin.functions.invoke(
          "kdp-insights-scraper",
          {
            body: JSON.stringify({
              userId: userId,
              asin: asin.asin,
              country: asin.country || "com",
            }),
          },
        );
        if (invokeError) {
          console.error(`[${new Date().toISOString()}] Error scraping ${asin.asin} for user ${userId}:`, invokeError.message);
        } else if (functionData && functionData.error) {
          console.error(`[${new Date().toISOString()}] Function returned an error for ${asin.asin}:`, functionData.error);
        } else {
          console.log(`[${new Date().toISOString()}] ✅ Successfully processed scraper for ${asin.asin} for user ${userId}.`);
        }
      } catch (e) {
        console.error(`[${new Date().toISOString()}] Exception during scraping ${asin.asin} for user ${userId}:`, e);
      }
  }

  // Update last_scrape_at only after all ASINs for the user have been processed.
  const { error: updateError } = await supabaseAdmin
    .from("settings")
    .update({ last_scrape_at: new Date().toISOString() })
    .eq("user_id", userId);

  if (updateError) {
    console.error(`[${new Date().toISOString()}] Error updating last_scrape_at for user ${userId}:`, updateError);
  } else {
    console.log(`[${new Date().toISOString()}] Successfully updated last_scrape_at for user ${userId} after completing all scrapes.`);
  }
};

const parseIntervalToHourly = (interval: string | null): number | null => {
    if (!interval) return null;
    const runsPerDay = parseInt(interval, 10);
    if (!isNaN(runsPerDay) && runsPerDay > 0) {
        return 24 / runsPerDay;
    }
    return null;
};


const checkAndRunScraper = async () => {
  console.log(`\n---\n[${new Date().toISOString()}] 🔄 Cron job started ---\n`);

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

    const runsPerDay = settings.scraping_interval ? parseInt(settings.scraping_interval, 10) : 0;
    const startHour = settings.scraping_start_hour ?? 0;

    if (!runsPerDay || runsPerDay <= 0) {
        console.log(`[${new Date().toISOString()}] ⏭️ Skipped user ${settings.user_id} — Scraping is off or interval is invalid.`);
        continue;
    }
    
    // Check if the current hour is one of the scheduled hours
    const intervalHours = 24 / runsPerDay;
    const scheduledHours = Array.from({length: runsPerDay}, (_, i) => (startHour + i * intervalHours) % 24);
    
    if (!scheduledHours.includes(currentUTCHour)) {
        console.log(`[${new Date().toISOString()}] ⏭️ Skipped user ${settings.user_id}. Not a scheduled hour. Current: ${currentUTCHour}, Scheduled: ${scheduledHours.join(', ')}`);
        continue;
    }

    // Check if a scrape has already run recently to avoid double-runs
    if (settings.last_scrape_at) {
        const lastScrape = new Date(settings.last_scrape_at);
        const hoursSinceLastScrape = (now.getTime() - lastScrape.getTime()) / (1000 * 60 * 60);
        if (hoursSinceLastScrape < intervalHours * 0.95) { // e.g., < 5.7 hours for a 6-hour interval
            console.log(`[${new Date().toISOString()}] ⏭️ Skipped user ${settings.user_id} — Already scraped recently (${hoursSinceLastScrape.toFixed(1)}h ago).`);
            continue;
        }
    }
    
    console.log(`[${new Date().toISOString()}] User ${settings.user_id} is due for a scrape at hour ${currentUTCHour}.`);
    await triggerScrapingForUser(settings.user_id);
  }
  console.log(`\n---\n[${new Date().toISOString()}] 🏁 Cron job finished ---\n`);
};

// This cron job runs every hour at the beginning of the hour.
const job = new Cron("0 * * * *", async () => {
  await checkAndRunScraper();
});

console.log(`[${new Date().toISOString()}] Deno cron handler initialized. Pattern: '0 * * * *'. Next run at: ${job.nextRun()}`);

serve(async (_req) => {
  const url = new URL(_req.url);
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