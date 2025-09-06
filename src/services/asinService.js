import { supabase } from '@/lib/customSupabaseClient';
import { toast } from '@/components/ui/use-toast';

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
			if (attempt < retries && /(429|403|timeout|temporar|rate)/i.test(msg)) {
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
export const scrapeAndProcessAsin = async (asinToScrape, countryCode, user) => {
	try {
		const functionResponse = await runScrapeWithRetry({
			asin: asinToScrape,
			country: countryCode || 'com',
			userId: user.id,
		});

		if (!functionResponse || !functionResponse.success) {
			throw new Error(functionResponse?.error || `Scraping failed for ${asinToScrape} after all attempts.`);
		}

		const processedData = functionResponse.data;

		if (functionResponse.isNew) {
			toast({ title: 'ASIN Aggiunto!', description: `${processedData.title} è ora monitorato.` });
		} else {
			toast({ title: 'ASIN Aggiornato!', description: `Dati per ${processedData.title} aggiornati.` });
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
	{ items, userId, max = 3, pauseMs = 1000, baseDelay = 900, retries = 3 },
	onProgress
) {
	const results = [];
	for (let i = 0; i < items.length; i += max) {
		const chunk = items.slice(i, i + max);
		const chunkResults = await Promise.all(
			chunk.map(async ({ asin, country }) => {
				try {
					const data = await runScrapeWithRetry(
						{ asin, country: country || 'com', userId },
						{ retries, baseDelay }
					);
					onProgress?.({ asin, ok: true });
					return data?.data || null;
				} catch (err) {
					console.warn('Scrape failed', asin, err?.message || err);
					onProgress?.({ asin, ok: false, error: err?.message || String(err) });
					return null;
				}
			})
		);
		results.push(...chunkResults);
		// pausa tra batch per non sparare burst
		await sleep(pauseMs + Math.floor(Math.random() * 450));
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