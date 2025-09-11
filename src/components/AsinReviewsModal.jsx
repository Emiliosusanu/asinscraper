import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Loader2, X, Star, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';

const StarRating = ({ rating }) => (
  <div className="flex items-center">
    {[...Array(5)].map((_, i) => (
      <Star
        key={i}
        className={`w-4 h-4 ${i < Math.round(rating) ? 'text-yellow-400 fill-yellow-400' : 'text-gray-500'}`}
      />
    ))}
  </div>
);

const AsinReviewsModal = ({ asinData, onClose }) => {
  const { user } = useAuth();
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchReviews = async () => {
      setLoading(true);
      try {
        const now = new Date();
        const nowIso = now.toISOString();
        const userId = user?.id;
        if (!userId) throw new Error('Utente non autenticato');

        // Load available ScraperAPI keys for this user
        const { data: keys, error: keysErr } = await supabase
          .from('scraper_api_keys')
          .select('id, api_key, status, credits, max_credits, cost_per_call, created_at, last_reset_at, success_count, failure_count')
          .eq('user_id', userId)
          .eq('service_name', 'scraperapi')
          .order('credits', { ascending: false });
        if (keysErr) throw keysErr;

        // Helper: reset if 30d passed since last reset or creation
        const DAY_MS = 24 * 60 * 60 * 1000;
        const isDueReset = (row) => {
          const last = row.last_reset_at ? new Date(row.last_reset_at) : (row.created_at ? new Date(row.created_at) : null);
          if (!last) return false;
          return (now.getTime() - last.getTime()) >= (30 * DAY_MS);
        };

        const candidates = Array.isArray(keys) ? keys.slice() : [];

        // Try each key in order (preferring those with credits and active status)
        for (const k of candidates) {
          const cost = Number.isFinite(k?.cost_per_call) ? Math.max(1, Number(k.cost_per_call)) : 5;
          const hasCredits = Number.isFinite(k?.credits) ? (k.credits >= cost) : false;
          const active = (k?.status || '').toLowerCase() === 'active';

          // Auto-reset if due and credits aren't already full
          if (isDueReset(k) && Number.isFinite(k.max_credits) && k.credits < k.max_credits) {
            try {
              await supabase.from('scraper_api_keys').update({ credits: k.max_credits, last_reset_at: nowIso }).eq('id', k.id);
              k.credits = k.max_credits;
              k.last_reset_at = nowIso;
            } catch (_) {}
          }

          if (!active || !hasCredits) continue;

          // Attempt with this key
          try {
            const { data, error } = await supabase.functions.invoke('scrape-amazon-reviews', {
              body: JSON.stringify({ asin: asinData.asin, apiKey: k.api_key }),
            });
            if (error) throw error;

            // On success: decrement credits, increment success_count, set last_used_at, log
            await supabase.from('scraper_api_keys')
              .update({ 
                credits: Math.max(0, (k.credits || cost) - cost), 
                success_count: (k.success_count || 0) + 1,
                last_used_at: nowIso,
              })
              .eq('id', k.id);

            await supabase.from('scraper_api_logs').insert({
              api_key_id: k.id,
              asin: asinData.asin,
              country: asinData.country || null,
              status: 'success',
              cost,
            });

            setReviews(data?.reviews || []);
            setLoading(false);
            return; // done
          } catch (err) {
            // Mark failure: do not decrement credits on generic errors to avoid false exhaustion
            try {
              // Heuristic: only mark exhausted if clear quota/credit error
              const msg = String(err?.message || '').toLowerCase();
              const quotaLike = msg.includes('quota') || msg.includes('credit') || msg.includes('exhaust') || msg.includes('limit');
              const nextCredits = k.credits; // unchanged on failure
              const nextStatus = quotaLike && Number.isFinite(k.credits) && k.credits <= 0 ? 'exhausted' : k.status;
              await supabase.from('scraper_api_keys')
                .update({ credits: nextCredits, failure_count: (k.failure_count || 0) + 1, status: nextStatus, last_used_at: nowIso })
                .eq('id', k.id);
              await supabase.from('scraper_api_logs').insert({
                api_key_id: k.id,
                asin: asinData.asin,
                country: asinData.country || null,
                status: 'failure',
                cost: 0,
                error_message: String(err?.message || err),
              });
            } catch (_) {}
            // try next key
          }
        }

        // Fallback: settings.scraperapi_key
        const { data: settingsData } = await supabase
          .from('settings')
          .select('scraperapi_key')
          .eq('user_id', userId)
          .single();
        const fallbackKey = settingsData?.scraperapi_key;
        if (fallbackKey) {
          const { data, error } = await supabase.functions.invoke('scrape-amazon-reviews', {
            body: JSON.stringify({ asin: asinData.asin, apiKey: fallbackKey }),
          });
          if (!error) {
            setReviews(data?.reviews || []);
            setLoading(false);
            return;
          }
        }

        throw new Error('Nessuna chiave disponibile o tutte le richieste sono fallite.');
      } catch (error) {
        toast({ title: 'Errore nel caricare le recensioni', description: error.message, variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    };

    if (asinData && user) {
      fetchReviews();
    }
  }, [asinData, user]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-gradient-to-br from-slate-900 to-slate-800 border border-white/10 rounded-2xl shadow-2xl w-full max-w-4xl h-full max-h-[90vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex justify-between items-center p-6 border-b border-white/10">
            <div>
              <h2 className="text-2xl font-bold text-white">Ultime Recensioni</h2>
              <p className="text-gray-400 line-clamp-1">{asinData.title}</p>
            </div>
            <Button onClick={onClose} size="icon" variant="ghost" className="text-white/70 hover:text-white hover:bg-white/10">
              <X className="w-6 h-6" />
            </Button>
          </div>

          <div className="flex-grow p-6 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-12 h-12 text-white animate-spin" />
              </div>
            ) : reviews.length > 0 ? (
              <div className="space-y-6">
                {reviews.map((review) => (
                  <motion.div 
                    key={review.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className="bg-white/5 p-4 rounded-lg"
                  >
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-300 font-bold flex-shrink-0">
                        {review.author.charAt(0)}
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-center mb-1">
                          <p className="font-semibold text-white">{review.author}</p>
                          <StarRating rating={review.rating} />
                        </div>
                        <p className="text-xs text-gray-400 mb-2">{review.date}</p>
                        <h3 className="font-semibold text-gray-200 mb-2">{review.title}</h3>
                        <p className="text-sm text-gray-300">{review.body}</p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 text-center">
                 <MessageCircle className="w-16 h-16 mb-4 text-gray-500" />
                <h3 className="text-xl font-semibold mb-2">Nessuna recensione trovata</h3>
                <p>Non è stato possibile caricare le recensioni per questo prodotto in questo momento.</p>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default AsinReviewsModal;