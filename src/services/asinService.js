import { supabase } from '@/lib/customSupabaseClient';
import { toast } from '@/components/ui/use-toast';

// Simple limiter factory (p-limit style)
function createLimiter(max = 4) {
  let active = 0;
  const queue = [];
  const runNext = () => {
    if (active >= max || queue.length === 0) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    Promise.resolve()
      .then(fn)
      .then((res) => resolve(res))
      .catch((e) => reject(e))
      .finally(() => {
        active--;
        runNext();
      });
  };
  return (fn) => new Promise((resolve, reject) => { queue.push({ fn, resolve, reject }); runNext(); });
}

// Dedupe + limit wrapper around baseline scrape
async function runScrapeDeduped({ asin, country, userId }, opts) {
  const key = `${userId}:${country || 'com'}:${asin}:baseline`;
  if (inflightBaseline.has(key)) return inflightBaseline.get(key);
  const p = limitBaseline(() => runScrapeWithRetry({ asin, country, userId }, opts))
    .finally(() => inflightBaseline.delete(key));
  inflightBaseline.set(key, p);
  return p;
}

// global limiter and inflight map for details calls
const limitDetails = createLimiter(4); // at most 4 concurrent details invocations
const inflightDetails = new Map(); // key -> Promise

// baseline limiter and inflight dedupe
const limitBaseline = createLimiter(4);
const inflightBaseline = new Map();

// Invoke the details edge function with retries and jittered backoff
async function invokeDetailsWithRetry({ asin, country, userId }, { tries = 3, baseDelay = 800 } = {}) {
  let attempt = 0;
  let lastErr;
  while (attempt < Math.max(1, tries)) {
    try {
      const { data, error } = await supabase.functions.invoke('scrape_product_details', {
        body: { asin, country, userId },
      });
      if (error) throw new Error(error.message || 'details invoke error');
      return data;
    } catch (e) {
      lastErr = e;
      attempt += 1;
      if (attempt >= tries) break;
      const jitter = Math.floor(Math.random() * 300);
      await sleep(baseDelay * attempt + jitter);
    }
  }
  throw lastErr || new Error('details invoke failed');
}

// Dedupe wrapper: if the same asin+country+userId is already running, await the same Promise
async function invokeDetailsDeduped({ asin, country, userId }, opts) {
  const key = `${userId}:${country || 'com'}:${asin}`;
  if (inflightDetails.has(key)) return inflightDetails.get(key);
  const p = (async () => {
    return await invokeDetailsWithRetry({ asin, country, userId }, opts);
  })().finally(() => inflightDetails.delete(key));
  inflightDetails.set(key, p);
  return p;
}

// (imports moved to top)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Chiamata singola con retry + backoff.
 * - retries: 3 tentativi
 * - backoff: 0.7s, ~1.4s, ~2.1s con jitter
 * - ritenta solo su errori 429/403/timeout/transienti
 */
export async function runScrapeWithRetry(
	{ asin, country, userId },
	{ retries = 3, baseDelay = 900 } = {}
) {
 
	let lastErr;
	for (let attempt = 1; attempt <= retries; attempt++) {
		try {
			const { data, error } = await supabase.functions.invoke('kdp-insights-scraper', {
				body: { asin, country, userId },
			});
			if (error) throw error;
			if (data && data.error) throw new Error(data.error);
			return data; // success
		} catch (e) {
			lastErr = e;
			const msg = String(e?.message || '');
			// ritenta solo su rate-limit o errori transitori
			if (attempt < retries && /(429|403|timeout|temporar|rate|still\s*running|step\s*is\s*still\s*running)/i.test(msg)) {
				const jitter = Math.floor(Math.random() * 300);
				await sleep(baseDelay * attempt + jitter);
				continue;
			}
			break;
		}
	}
	throw lastErr;
}

/**
 * API pre-esistente per una singola card (manteniamo i toast).
 * Ora usa runScrapeWithRetry sotto al cofano.
 */
export const scrapeAndProcessAsin = async (asinToScrape, countryCode, user, opts = {}) => {
  const suppressToast = !!opts.suppressToast;
  try {
    const functionResponse = await runScrapeDeduped({
      asin: asinToScrape,
      country: countryCode || 'com',
      userId: user.id,
    });

    if (!functionResponse || !functionResponse.success) {
      throw new Error(functionResponse?.error || `Scraping failed for ${asinToScrape} after all attempts.`);
    }

    const sanitize = (d) => {
      if (!d || typeof d !== 'object') return d;
      const out = { ...d };
      // Guard common fields
      const n = (x) => (Number.isFinite(Number(x)) ? Number(x) : null);
      const clamp = (x, lo, hi) => (Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : null);
      const posInt = (x) => (Number.isFinite(x) && x > 0 ? Math.round(x) : null);
      out.bsr = posInt(n(out.bsr));
      out.review_count = Math.max(0, posInt(n(out.review_count)) || 0);
      out.rating = clamp(n(out.rating), 0, 5);
      out.price = n(out.price);
      if (out && typeof out.title === 'string') {
        out.title = out.title.replace(/\s+/g, ' ').trim();
      }
      return out;
    };
    const processedData = sanitize(functionResponse.data);

    // Enrich product details via ScraperAPI (page count, dimensions, binding, language, etc.)
    try {
      await limitDetails(() => invokeDetailsDeduped({ asin: asinToScrape, country: countryCode || 'com', userId: user.id }, { tries: 3, baseDelay: 700 }));
    } catch (e) {
      console.warn('enrich details failed', e?.message || e);
    }

    if (!suppressToast) {
      if (functionResponse.isNew) {
        toast({ title: 'ASIN Aggiunto!', description: `${processedData.title} è ora monitorato.` });
      } else {
        toast({ title: 'ASIN Aggiornato!', description: `Dati per ${processedData.title} aggiornati.` });
      }
    }

    return processedData;
  } catch (error) {
    console.error(`Final error processing ${asinToScrape}:`, error);
    toast({
      title: 'Errore di scraping',
      description: `Impossibile ottenere i dati per ${asinToScrape}. Dettagli: ${error.message}`,
      variant: 'destructive',
    });
    return null;
  }
};

/**
 * NUOVO: Scrape “tutti” con batch di dimensione limitata (concorrenza MAX)
 * - max: quanti in parallelo (3–5 è sicuro)
 * - pausa tra batch con jitter per ridurre 429
 * - onProgress opzionale per aggiornare UI
 */
export async function processAllAsins(
  { items, userId, max = 3, pauseMs = 1000, baseDelay = 900, retries = 3, maxCycles = 6, untilSuccess = false, maxItemAttempts = 3 },
  onProgress
) {
  const results = new Map(); // asin -> data
  const pending = items.map(({ asin, country }) => ({ asin, country: country || 'com', attempts: 0 }));

  let cycle = 0;
  while (pending.length > 0 && (untilSuccess || cycle < Math.max(1, maxCycles))) {
    cycle += 1;
    const batchDelay = pauseMs + Math.floor(Math.random() * 450) + (cycle - 1) * 350;
    const current = [...pending];
    pending.length = 0; // we'll requeue failures

    for (let i = 0; i < current.length; i += max) {
      const slice = current.slice(i, i + max);
      const sliceResults = await Promise.all(
        slice.map(async (job) => {
          const { asin, country } = job;
          try {
            const data = await runScrapeDeduped(
              { asin, country, userId },
              { retries, baseDelay: baseDelay * cycle }
            );
            // Best-effort enrichment; tolerate errors but do not block
            try {
              await limitDetails(() => invokeDetailsDeduped({ asin: job.asin, country: job.country, userId }, { tries: 3, baseDelay: 900 }));
            } catch (_) {}
            const sanitize = (d) => {
              if (!d || typeof d !== 'object') return d;
              const out = { ...d };
              // Guard common fields
              const n = (x) => (Number.isFinite(Number(x)) ? Number(x) : null);
              const clamp = (x, lo, hi) => (Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : null);
              const posInt = (x) => (Number.isFinite(x) && x > 0 ? Math.round(x) : null);
              out.bsr = posInt(n(out.bsr));
              out.review_count = Math.max(0, posInt(n(out.review_count)) || 0);
              out.rating = clamp(n(out.rating), 0, 5);
              out.price = n(out.price);
              if (out && typeof out.title === 'string') {
                out.title = out.title.replace(/\s+/g, ' ').trim();
              }
              return out;
            };
            const sanitizedData = sanitize(data?.data || null);
            onProgress?.({ asin, ok: true });
            return { asin, ok: true, data: sanitizedData };
          } catch (err) {
            const msg = err?.message || String(err);
            console.warn('Scrape failed, will requeue if cycles remain', asin, msg);
            onProgress?.({ asin, ok: false, error: msg, retry: cycle });
            return { asin, ok: false, error: msg, attempts: job.attempts + 1 };
          }
        })
      );
      for (const r of sliceResults) {
        if (r.ok) {
          results.set(r.asin, r.data);
        } else {
          // requeue only if attempts below threshold or untilSuccess requested
          const baseItem = items.find((it) => it.asin === r.asin) || { asin: r.asin, country: 'com' };
          const nextAttempts = r.attempts || 1;
          const canRetry = untilSuccess || nextAttempts < Math.max(1, maxItemAttempts);
          if (canRetry) {
            pending.push({ asin: baseItem.asin, country: baseItem.country || 'com', attempts: nextAttempts });
          } else {
            onProgress?.({ asin: r.asin, ok: false, error: r.error, final: true, attempts: nextAttempts });
          }
        }
      }
      // soft pause between slices to avoid bursts
      if (i + max < current.length) {
        await sleep(200 + Math.floor(Math.random() * 250));
      }
    }

    if (pending.length > 0 && (untilSuccess || cycle < maxCycles)) {
      // wait a bit longer before next cycle to let rate-limits cool down
      await sleep(batchDelay);
    }
  }

  // If still pending after maxCycles, do one last best-effort pass serially
  if (!untilSuccess && pending.length > 0) {
    for (const job of pending) {
      try {
        const data = await runScrapeDeduped(
          { asin: job.asin, country: job.country, userId },
          { retries: Math.max(retries, 4), baseDelay: baseDelay * (maxCycles + 1) }
        );
        try {
          await limitDetails(() => invokeDetailsDeduped({ asin: job.asin, country: job.country, userId }, { tries: 3, baseDelay: 900 }));
        } catch (_) {}
        const sanitize = (d) => {
          if (!d || typeof d !== 'object') return d;
          const out = { ...d };
          // Guard common fields
          const n = (x) => (Number.isFinite(Number(x)) ? Number(x) : null);
          const clamp = (x, lo, hi) => (Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : null);
          const posInt = (x) => (Number.isFinite(x) && x > 0 ? Math.round(x) : null);
          out.bsr = posInt(n(out.bsr));
          out.review_count = Math.max(0, posInt(n(out.review_count)) || 0);
          out.rating = clamp(n(out.rating), 0, 5);
          out.price = n(out.price);
          if (out && typeof out.title === 'string') {
            out.title = out.title.replace(/\s+/g, ' ').trim();
          }
          return out;
        };
        const sanitizedData = sanitize(data?.data || null);
        onProgress?.({ asin: job.asin, ok: true });
        results.set(job.asin, sanitizedData);
      } catch (err) {
        const msg = err?.message || String(err);
        onProgress?.({ asin: job.asin, ok: false, error: msg, final: true });
        console.error('Final failure after all cycles:', job.asin, msg);
      }
    }
  }
  // Return in original format: array ordered as input
  return items.map(({ asin }) => results.get(asin) || null);
}

/**
 * Backfill enrichment only (no baseline scrape): calls scrape_product_details for all items.
 * - max: parallel concurrency (default 5)
 * - pause between batches to avoid rate limits
 * - onProgress: ({ asin, ok, error }) per item
 */
export async function enrichAllAsins(
  { items, userId, max = 4, pauseMs = 600 },
  onProgress
) {
  const results = [];
  for (let i = 0; i < items.length; i += max) {
    const chunk = items.slice(i, i + max);
    const chunkResults = await Promise.all(
      chunk.map(async ({ asin, country }) => {
        try {
          // Use limiter + dedupe for direct enrichment batches as well
          const data = await limitDetails(() => invokeDetailsDeduped({ asin, country: country || 'com', userId }, { tries: 3, baseDelay: 700 }));
          const error = null;
          if (error) throw error;
          onProgress?.({ asin, ok: true });
          return data || null;
        } catch (err) {
          onProgress?.({ asin, ok: false, error: err?.message || String(err) });
          return null;
        }
      })
    );
    results.push(...chunkResults);
    if (i + max < items.length) {
      await sleep(pauseMs + Math.floor(Math.random() * 300));
    }
  }
  return results;
}

export const deleteAsinAndHistory = async (asinToDelete) => {
	if (!asinToDelete) return false;

	const { error: historyError } = await supabase
		.from('asin_history')
		.delete()
		.eq('asin_data_id', asinToDelete.id);

	if (historyError) {
		toast({
			title: 'Errore nella cancellazione dello storico',
			description: historyError.message,
			variant: 'destructive',
		});
		return false;
	}

	const { error } = await supabase.from('asin_data').delete().eq('id', asinToDelete.id);

	if (error) {
		toast({
			title: "Errore nella cancellazione dell'ASIN",
			description: error.message,
			variant: 'destructive',
		});
		return false;
	}

	toast({ title: 'ASIN cancellato', description: `${asinToDelete.title} è stato rimosso.` });
	return true;
};