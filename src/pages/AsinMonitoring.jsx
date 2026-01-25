import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, RefreshCw, LayoutGrid, List, BookOpen, Filter, Target, Archive, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Helmet } from 'react-helmet';
import BrandPreloader from '@/components/BrandPreloader';
import BrandFish from '@/components/BrandFish';
import AsinCard from '@/components/AsinCard';
import AsinListItem from '@/components/AsinListItem';
import AsinTrendChart from '@/components/AsinTrendChart';
import PayoutWidget from '@/components/PayoutWidget';
import RoyaltyEditModal from '@/components/RoyaltyEditModal';
import AsinReviewsModal from '@/components/AsinReviewsModal';
import AsinEventLogModal from '@/components/AsinEventLogModal';
import useAsinTrends from '@/hooks/useAsinTrends';
import useLocalStorage from '@/hooks/useLocalStorage';
import usePerformanceSnapshots from '@/hooks/usePerformanceSnapshots';
import { scrapeAndProcessAsin, deleteAsinAndHistory, processAllAsins, archiveAsin, unarchiveAsin } from '@/services/asinService';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const AsinListFilters = ({ sort, setSort, filter, setFilter }) => (
  <div className="flex items-center gap-2 mb-4">
    <Input
      placeholder="Filtra per titolo..."
      value={filter}
      onChange={(e) => setFilter(e.target.value)}
      className="max-w-sm glass-input"
    />
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="ml-auto border-border text-muted-foreground hover:bg-muted hover:text-foreground">
          <Filter className="mr-2 h-4 w-4" />
          Ordina per
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56 glass-card">
        <DropdownMenuLabel>Criterio di ordinamento</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={sort} onValueChange={setSort}>
          <DropdownMenuRadioItem value="bsr-asc">BSR (Migliore)</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="updated_at-desc">Ultimo Aggiornamento</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="created_at-desc">Data Aggiunta</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="bsr-desc">BSR (Peggiore)</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="price-desc">Prezzo (Decrescente)</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="price-asc">Prezzo (Crescente)</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="title-asc">Titolo (A-Z)</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
);

const AsinForm = ({ isAdding, onAdd }) => {
  const [asin, setAsin] = useState('');
  const [country, setCountry] = useState('com');

  const handleSubmit = (e) => {
    e.preventDefault();
    const asinRegex = /^[A-Z0-9]{10}$/;
    const trimmedAsin = asin.trim().toUpperCase();
    if (!asinRegex.test(trimmedAsin)) {
      toast({ title: 'ASIN non valido', description: 'Per favore, inserisci un ASIN di 10 caratteri alfanumerici.', variant: 'destructive' });
      return;
    }
    onAdd(trimmedAsin, country);
    setAsin('');
  };

  return (
    <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2 glass-card p-3">
        <div className="relative flex-grow">
          <Target className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="text"
            value={asin}
            onChange={(e) => setAsin(e.target.value)}
            placeholder="Aggiungi un ASIN da tracciare..."
            className="flex-grow glass-input pl-10 py-3 text-sm"
          />
        </div>
        <select 
            value={country} 
            onChange={(e) => setCountry(e.target.value)} 
            className="glass-input px-4 py-3 text-sm"
          >
            <option value="com">.com</option>
            <option value="it">.it</option>
            <option value="de">.de</option>
            <option value="fr">.fr</option>
            <option value="es">.es</option>
            <option value="co.uk">.co.uk</option>
        </select>
        <Button type="submit" disabled={isAdding} className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20">
          {isAdding ? <BrandPreloader size={16} className="mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
          {isAdding ? 'Aggiungo...' : 'Aggiungi'}
        </Button>
      </form>
    </motion.div>
  );
};


const AsinMonitoring = () => {
  const { user } = useAuth();
  const [trackedAsins, setTrackedAsins] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [isRefreshingAll, setIsRefreshingAll] = useState(false);
  const [isRefreshAllDialogOpen, setIsRefreshAllDialogOpen] = useState(false);
  const [refreshingAsin, setRefreshingAsin] = useState(null);
  const [viewMode, setViewMode] = useLocalStorage('asinMonitoringViewMode', 'grid');
  const effectiveViewMode = 'grid';
  const [selectedAsinForChart, setSelectedAsinForChart] = useState(null);
  const [selectedAsinForRoyalty, setSelectedAsinForRoyalty] = useState(null);
  const [selectedAsinForReviews, setSelectedAsinForReviews] = useState(null);
  const [selectedAsinForLogs, setSelectedAsinForLogs] = useState(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [asinToDelete, setAsinToDelete] = useState(null);
  const [sort, setSort] = useState("bsr-asc");
  const [filter, setFilter] = useState("");
  const [inProgressAsins, setInProgressAsins] = useState(new Set());
  const lastScrollTsRef = useRef(0);
  const [showArchived, setShowArchived] = useLocalStorage('asinMonitoringShowArchived', false);

  useEffect(() => {
    if (viewMode !== 'grid') setViewMode('grid');
  }, [viewMode, setViewMode]);

  const displayName = useMemo(() => {
    const meta = user?.user_metadata || {};
    return (
      meta.full_name ||
      meta.name ||
      (user?.email ? user.email.split('@')[0] : null) ||
      ''
    );
  }, [user?.id, user?.email, user?.user_metadata]);

  const [topBooksMonth, setTopBooksMonth] = useState([]);
  const [refreshQueue, setRefreshQueue] = useLocalStorage('asinRefreshQueue', []);
  const queueRunningRef = useRef(false);
  const refreshQueueRef = useRef(refreshQueue);

  useEffect(() => { refreshQueueRef.current = refreshQueue; }, [refreshQueue]);

  
  const { trends, refreshTrends } = useAsinTrends(trackedAsins);
  const perfByAsinId = usePerformanceSnapshots(trackedAsins);
  const channelRef = useRef(null); // current realtime channel
  const refreshTrendsRef = useRef(refreshTrends);
  const fetchTrackedAsinsRef = useRef(null);
  const toastCooldownRef = useRef(new Map()); // asin_id -> lastToastTs
  const [poolReviews7d, setPoolReviews7d] = useState({ gained: 0, lost: 0 });
  const computeReviewsRef = useRef(null);
  const loadTopBooksMonthRef = useRef(null);

  const upsertTrackedAsin = useCallback((row, { prepend = false } = {}) => {
    if (!row) return;
    setTrackedAsins(curr => {
      const key = row.id ? `id:${row.id}` : `asin:${row.asin}:${row.country || 'com'}`;
      const keyed = new Map(curr.map(a => {
        const k = a?.id ? `id:${a.id}` : `asin:${a.asin}:${a.country || 'com'}`;
        return [k, a];
      }));
      const existing = keyed.get(key);
      keyed.set(key, existing ? { ...existing, ...row } : row);
      const arr = Array.from(keyed.values());
      if (prepend && !existing) {
        const moved = arr.filter(a => {
          const k = a?.id ? `id:${a.id}` : `asin:${a.asin}:${a.country || 'com'}`;
          return k !== key;
        });
        return [row, ...moved];
      }
      return arr;
    });
  }, []);

  const portfolioQi = useMemo(() => {
    const items = (trackedAsins || [])
      .filter(a => !a?.archived)
      .filter(a => Number(a?.bsr) >= 1000); // ignore <1000 BSR (launch period / non-real)
    const scores = items
      .map(a => Number(trends?.[a.id]?.qi?.score))
      .filter(v => Number.isFinite(v));
    const n = scores.length;
    if (!n) return null;
    const avg = scores.reduce((s, v) => s + v, 0) / n; // 0..100
    const sorted = [...scores].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const label = avg >= 70 ? 'Buono' : avg >= 45 ? 'Nella media' : 'Debole';
    return { avg, median, count: n, label };
  }, [trackedAsins, trends]);

  const fetchTrackedAsins = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    const { data, error } = await supabase
      .from('asin_data')
      .select('*')
      .eq('user_id', user.id);

    if (error) {
      toast({ title: 'Errore nel caricare gli ASIN', description: error.message, variant: 'destructive' });
    } else {
      setTrackedAsins(data);
    }
    setIsLoading(false);
  }, [user]);

  // Keep refs updated after functions are defined
  useEffect(() => { refreshTrendsRef.current = refreshTrends; }, [refreshTrends]);
  useEffect(() => { fetchTrackedAsinsRef.current = fetchTrackedAsins; }, [fetchTrackedAsins]);

  const loadTopBooksMonth = useCallback(async () => {
    if (!user) {
      setTopBooksMonth([]);
      return;
    }
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    let rows = [];
    try {
      const { data, error } = await supabase
        .from('kdp_top_books_month')
        .select('rank,title,royalties_text,orders,cover_url,month,account_id,pages')
        .eq('account_id', user.id)
        .eq('month', month)
        .order('rank', { ascending: true });
      if (!error && Array.isArray(data)) rows = data;
    } catch (_) {}
    if (!rows || rows.length === 0) {
      try {
        const { data, error } = await supabase
          .from('kdp_top_books_month')
          .select('rank,title,royalties_text,orders,cover_url,month,account_id,pages')
          .eq('month', month)
          .order('rank', { ascending: true });
        if (!error && Array.isArray(data)) rows = data;
      } catch (_) {}
    }
    if (!rows || rows.length === 0) {
      try {
        const { data, error } = await supabase
          .from('kdp_top_books_month')
          .select('rank,title,royalties_text,orders,cover_url,month,account_id')
          .eq('account_id', user.id)
          .order('month', { ascending: false })
          .order('rank', { ascending: true })
          .limit(9);
        if (!error && Array.isArray(data) && data.length) {
          const lastMonth = data[0].month;
          rows = data.filter(r => r.month === lastMonth);
        }
      } catch (_) {}
    }
    if (!rows || rows.length === 0) {
      try {
        const { data, error } = await supabase
          .from('kdp_top_books_month')
          .select('rank,title,royalties_text,orders,cover_url,month,account_id')
          .order('month', { ascending: false })
          .order('rank', { ascending: true })
          .limit(9);
        if (!error && Array.isArray(data) && data.length) {
          const lastMonth = data[0].month;
          rows = data.filter(r => r.month === lastMonth);
        }
      } catch (_) {}
    }
    setTopBooksMonth(Array.isArray(rows) ? rows : []);
  }, [user?.id]);

  useEffect(() => { loadTopBooksMonthRef.current = loadTopBooksMonth; }, [loadTopBooksMonth]);

useEffect(() => {
  if (!user) return;

  // First load
  fetchTrackedAsinsRef.current?.();

  // Ensure no old subscription stays around
  if (channelRef.current) {
    supabase.removeChannel(channelRef.current);
    channelRef.current = null;
  }

  // One channel per user
  const channel = supabase.channel(`realtime-asin-monitoring:${user.id}`);

  // 1) asin_data: INSERT / UPDATE / DELETE
  channel.on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'asin_data' }, // no server-side filter
    (payload) => {
      // filter by user on the client so UPDATEs are always delivered
      const recNew = payload.new || payload.record || null;
      const recOld = payload.old || null;
      const uid = recNew?.user_id ?? recOld?.user_id;
      if (uid !== user.id) return;

      if (payload.eventType === 'INSERT') {
        setTrackedAsins(curr => {
          const next = [payload.new, ...curr];
          return Array.from(new Map(next.map(x => [x.id, x])).values());
        });
      } else if (payload.eventType === 'UPDATE') {
        setTrackedAsins(curr => curr.map(a => (a.id === payload.new.id ? { ...a, ...payload.new } : a)));
        // Avoid duplicate toasts here: details enrichment also triggers UPDATE without meaningful metric changes
      } else if (payload.eventType === 'DELETE') {
        setTrackedAsins(curr => curr.filter(a => a.id !== payload.old.id));
      }

      // refresh charts whenever a row changes
      refreshTrendsRef.current?.();
    }
  );

  // 2) asin_history: on new point, refresh charts
  channel.on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'asin_history' },
    (payload) => {
      if (payload.new?.user_id !== user.id) return;
      refreshTrendsRef.current?.();
      try { computeReviewsRef.current?.(); } catch (_) {}
      // Show a single consolidated toast when a real history point arrives
      try {
        const asinId = payload.new.asin_data_id;
        const now = Date.now();
        const last = toastCooldownRef.current.get(asinId) || 0;
        if (now - last > 4000) {
          toastCooldownRef.current.set(asinId, now);
          const a = trackedAsins.find(x => x.id === asinId);
          const title = a?.title || 'ASIN';
          toast({ title: 'Dati aggiornati!', description: `I dati per ${title} sono stati aggiornati.` });
        }
      } catch (_) {}
    }
  );

  // 3) asin_events: live toast for price/status
  channel.on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'asin_events' },
    (payload) => {
      if (payload.new?.user_id !== user.id) return;
      const ev = payload.new;
      if (ev?.event_type === 'PRICE_CHANGED') {
        const oldP = ev?.metadata?.old ?? '—';
        const newP = ev?.metadata?.new ?? '—';
        toast({ title: 'Prezzo cambiato', description: `${oldP} → ${newP}` });
      }
      if (ev?.event_type === 'STATUS_CHANGED') {
        const from = ev?.metadata?.from ?? 'unknown';
        const to = ev?.metadata?.to ?? 'unknown';
        toast({ title: 'Stato cambiato', description: `${from} → ${to}` });
      }
    }
  );

  channel.on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'kdp_top_books_month' },
    (payload) => {
      const recNew = payload.new || payload.record || null;
      const recOld = payload.old || null;
      const acc = recNew?.account_id ?? recOld?.account_id;
      if (!user?.id || acc !== user.id) return;
      loadTopBooksMonthRef.current?.();
    }
  );

  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      console.log('Realtime subscribed (asin_data, asin_history, asin_events)');
    }
  });

  channelRef.current = channel;

  // Cleanup on unmount or user change
  return () => {
    if (channelRef.current) supabase.removeChannel(channelRef.current);
    channelRef.current = null;
  };
}, [user?.id]);

  useEffect(() => {
    if (!user) {
      setTopBooksMonth([]);
      return;
    }
    loadTopBooksMonthRef.current?.();
  }, [user?.id]);

// Removed periodic polling to keep the layout steady; rely on realtime updates and manual refresh

  const filteredAndSortedAsins = useMemo(() => {
    let sortedAsins = [...trackedAsins];
    const [sortKey, sortDir] = sort.split('-');

    sortedAsins.sort((a, b) => {
        if (sortKey === 'created_at') {
            return new Date(b.created_at) - new Date(a.created_at);
        }
        
        let valA = a[sortKey];
        let valB = b[sortKey];

        if (valA === null || valA === undefined || valA === 0) valA = sortDir === 'asc' ? Infinity : -Infinity;
        if (valB === null || valB === undefined || valB === 0) valB = sortDir === 'asc' ? Infinity : -Infinity;
        
        if(sortKey === 'title') {
            return sortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }

        if(sortKey === 'updated_at') {
            return sortDir === 'asc' ? new Date(valA) - new Date(valB) : new Date(valB) - new Date(valA);
        }

        return sortDir === 'asc' ? valA - valB : valB - valA;
    });

    return sortedAsins
      .filter(item => (showArchived ? item.archived === true : item.archived !== true))
      .filter(item => item.title && item.title.toLowerCase().includes(filter.toLowerCase()));
  }, [trackedAsins, sort, filter, showArchived]);

  const computePoolReviews7d = useCallback(async () => {
    if (!user) return setPoolReviews7d({ gained: 0, lost: 0 });
    const items = (trackedAsins || []).filter(a => (showArchived ? a.archived === true : a.archived !== true));
    const ids = items.map(a => a.id);
    if (!ids.length) { setPoolReviews7d({ gained: 0, lost: 0 }); return; }
    const now = new Date();
    const from = new Date(now); from.setDate(now.getDate() - 7);
    const startIso = from.toISOString();
    let gained = 0;
    let lost = 0;
    const chunkSize = 10;
    for (let i = 0; i < items.length; i += chunkSize) {
      const chunk = items.slice(i, i + chunkSize);
      const deltas = await Promise.all(
        chunk.map(async (a) => {
          const current = Number(a.review_count);
          if (!Number.isFinite(current) || current <= 0) return { gained: 0, lost: 0 };

          let baseline = null;
          const { data: baseRow, error: baseErr } = await supabase
            .from('asin_history')
            .select('review_count, created_at')
            .eq('asin_data_id', a.id)
            .lte('created_at', startIso)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (!baseErr && baseRow && Number.isFinite(Number(baseRow.review_count))) {
            baseline = Number(baseRow.review_count);
          } else {
            const { data: firstRow, error: firstErr } = await supabase
              .from('asin_history')
              .select('review_count, created_at')
              .eq('asin_data_id', a.id)
              .gte('created_at', startIso)
              .order('created_at', { ascending: true })
              .limit(1)
              .maybeSingle();
            if (!firstErr && firstRow && Number.isFinite(Number(firstRow.review_count))) {
              baseline = Number(firstRow.review_count);
            }
          }

          if (!Number.isFinite(Number(baseline)) || Number(baseline) <= 0) return { gained: 0, lost: 0 };
          const d = current - Number(baseline);
          if (d > 0) return { gained: d, lost: 0 };
          if (d < 0) return { gained: 0, lost: -d };
          return { gained: 0, lost: 0 };
        })
      );
      for (const d of deltas) {
        gained += Number(d?.gained) || 0;
        lost += Number(d?.lost) || 0;
      }
    }
    setPoolReviews7d({ gained, lost });
  }, [trackedAsins, showArchived, user]);

  useEffect(() => { computeReviewsRef.current = computePoolReviews7d; }, [computePoolReviews7d]);
  useEffect(() => { computePoolReviews7d(); }, [computePoolReviews7d]);
  
  const handleAddAsin = async (asin, country) => {
    setIsAdding(true);
    try {
      const existingAsin = trackedAsins.find(item => item.asin === asin && item.country === country);
      if (existingAsin) {
        toast({ title: 'ASIN già presente', description: 'Questo ASIN è già nella tua lista di monitoraggio.', variant: 'destructive' });
        return;
      }
      const row = await scrapeAndProcessAsin(asin, country, user);
      if (row) upsertTrackedAsin(row, { prepend: true });
    } finally {
      setIsAdding(false);
    }
  };
  
  const handleRefreshSingle = async (asinToRefresh) => {
    if (!asinToRefresh) return;
    if (asinToRefresh.archived) {
      toast({ title: 'ASIN archiviato', description: 'Ripristina per poter aggiornare i dati.' });
      return;
    }
    const key = `${asinToRefresh.asin}:${asinToRefresh.country || 'com'}`;
    setRefreshQueue((q = []) => {
      const exists = (q || []).some(it => `${it.asin}:${it.country || 'com'}` === key);
      if (exists) return q;
      return [...q, { asin: asinToRefresh.asin, country: asinToRefresh.country }];
    });
    setInProgressAsins(prev => { const next = new Set(prev); next.add(asinToRefresh.asin); return next; });
  };

  const runRefreshQueue = useCallback(async () => {
    if (queueRunningRef.current) return;
    if (!user) return;
    const curr = refreshQueueRef.current || [];
    if (!curr.length) return;
    queueRunningRef.current = true;
    try {
      // add queued ASINs to in-progress indicator on mount or new additions
      setInProgressAsins(prev => { const next = new Set(prev); (curr || []).forEach(it => next.add(it.asin)); return next; });
      while ((refreshQueueRef.current || []).length > 0) {
        const item = (refreshQueueRef.current || [])[0];
        try {
          const row = await scrapeAndProcessAsin(item.asin, item.country, user, { suppressToast: true });
          if (row) upsertTrackedAsin(row);
          try { await loadTopBooksMonthRef.current?.(); } catch (_) {}
        } catch (_) {
        } finally {
          setRefreshQueue(q => {
            const next = Array.isArray(q) ? q.slice(1) : [];
            refreshQueueRef.current = next;
            return next;
          });
          setInProgressAsins(prev => { const next = new Set(prev); next.delete(item.asin); return next; });
        }
      }
    } finally {
      queueRunningRef.current = false;
    }
  }, [user]);

  useEffect(() => { runRefreshQueue(); }, [refreshQueue, runRefreshQueue]);

const handleRefreshAll = async () => {
  toast({ title: 'Aggiornamento in corso...', description: 'Update la prima parte...' });
  setIsRefreshingAll(true);
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session.user.id;

    // prendo TUTTI gli ASIN tracciati (non solo i filtrati a schermo) e rimuovo duplicati asin+country
    const seen = new Set();
    const items = [];
    for (const a of trackedAsins) {
      if (a.archived) continue; // skip archived items in bulk refresh
      const key = `${a.asin}:${a.country || 'com'}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ asin: a.asin, country: a.country });
    }

    // mark all as in-progress for visuals
    setInProgressAsins(new Set(items.map(i => i.asin)));

    await processAllAsins(
      {
        items,
        userId,
        max: 4,         // **limite concorrenza** (4 consigliato per evitare WORKER_LIMIT)
        pauseMs: 1100,  // **pausa tra batch** leggermente maggiore
        baseDelay: 700, // **retry backoff**: 0.7s, ~1.4s, ~2.1s con jitter
        retries: 3,
        maxItemAttempts: 3,
        untilSuccess: false,
      },
      ({ asin, ok, data, error, final, retry, attempts }) => {
        if (!ok) console.warn('Scrape fallito', asin, error, final ? '(final)' : retry ? `(retry cycle ${retry})` : '');
        if (ok && data) {
          upsertTrackedAsin(data);
        }
        // mark as completed only when success or final failure
        if (ok || final) {
          setInProgressAsins(prev => {
            const next = new Set(prev);
            next.delete(asin);
            return next;
          });
          // gently scroll to the just-completed ASIN (success or final)
          try {
            const now = Date.now();
            if (now - (lastScrollTsRef.current || 0) < 400) {
              setTimeout(() => {
                const el = document.querySelector(`[data-asin="${asin}"]`);
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }, 400);
            } else {
              const el = document.querySelector(`[data-asin="${asin}"]`);
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            lastScrollTsRef.current = Date.now();
          } catch (_) {}
          if (final && error) {
            toast({ title: 'Scrape fermato', description: `ASIN ${asin}: interrotto dopo tentativi multipli.`, variant: 'destructive' });
          }
        }
      }
    );
    try { await loadTopBooksMonthRef.current?.(); } catch (_) {}
  } finally {
    setIsRefreshingAll(false);
    setInProgressAsins(new Set());
    toast({ title: 'Aggiornamento completato!', description: 'Tutti i dati sono stati aggiornati.' });
  }
};


  const confirmDelete = (asinData) => {
    setAsinToDelete(asinData);
    setIsDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!asinToDelete) return;
    const ok = await deleteAsinAndHistory(asinToDelete);
    if (ok) {
      // Optimistically update UI without waiting for realtime event
      setTrackedAsins(curr => curr.filter(a => a.id !== asinToDelete.id));
    }
    setIsDeleteDialogOpen(false);
    setAsinToDelete(null);
  };

  const handleRoyaltyUpdate = (updatedAsin) => {
    refreshTrends();
  };

  const handleArchive = async () => {
    if (!asinToDelete) return;
    const ok = await archiveAsin(asinToDelete);
    if (ok) {
      setTrackedAsins(curr => curr.map(a => (a.id === asinToDelete.id ? { ...a, archived: true, archived_at: new Date().toISOString() } : a)));
    }
    setIsDeleteDialogOpen(false);
    setAsinToDelete(null);
  };

  const handleRestore = async () => {
    if (!asinToDelete) return;
    const ok = await unarchiveAsin(asinToDelete);
    if (ok) {
      setTrackedAsins(curr => curr.map(a => (a.id === asinToDelete.id ? { ...a, archived: false, archived_at: null } : a)));
    }
    setIsDeleteDialogOpen(false);
    setAsinToDelete(null);
  };

  return (
    <>
      <Helmet>
        <title>Monitoraggio ASIN - KDP Insights Pro</title>
        <meta name="description" content="Aggiungi e monitora i tuoi ASIN Amazon in tempo reale." />
      </Helmet>
      <div className="w-full">
        <div className="w-full pb-24 lg:pb-8">

        <div className="grid grid-cols-[1fr_auto] items-center gap-3 mb-6">
          <div className="relative min-w-0 pr-2 sm:pr-0 overflow-x-hidden overflow-y-visible">
            <div className="sm:hidden flex items-center gap-2 min-w-0">
              {(() => {
                const gained = Number(poolReviews7d.gained) || 0;
                const lost = Number(poolReviews7d.lost) || 0;
                const fmt = (n) => new Intl.NumberFormat('it-IT').format(Math.abs(n));
                const qi = portfolioQi ? Math.round(portfolioQi.avg) : null;
                return (
                  <div className="flex items-center gap-2 min-w-0">
                    {qi != null && (
                      <div
                        className="shrink-0 h-10 px-3 rounded-full border border-white/10 bg-white/[0.04] shadow-[0_10px_26px_rgba(0,0,0,0.25),0_0_0_1px_rgba(255,255,255,0.04)_inset] flex items-center gap-2"
                        title="QI"
                      >
                        <BrandFish size={16} className="-ml-0.5" />
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/70 shadow-[0_0_14px_rgba(16,185,129,0.35)]" />
                        <span className="text-sm font-semibold tabular-nums text-foreground">{qi}</span>
                      </div>
                    )}

                    <div
                      className="shrink-0 h-12 min-w-[56px] px-4 rounded-full border border-white/10 bg-gradient-to-b from-white/[0.08] to-white/[0.03] shadow-[0_10px_26px_rgba(0,0,0,0.25),0_18px_36px_rgba(0,0,0,0.35)_inset,0_0_0_1px_rgba(255,255,255,0.04)_inset] flex items-center justify-center"
                      title="Libri"
                    >
                      <span className="text-3xl font-semibold tabular-nums text-foreground">{filteredAndSortedAsins.length}</span>
                    </div>

                    <div
                      className="flex-1 min-w-0 overflow-hidden flex items-center gap-1 h-10 px-2 rounded-full border border-white/10 bg-white/[0.04] shadow-[0_10px_26px_rgba(0,0,0,0.25),0_0_0_1px_rgba(255,255,255,0.04)_inset]"
                      title="Recensioni ultimi 7 giorni"
                    >
                      <span className="shrink-0 text-xs font-semibold tracking-wide text-muted-foreground/80">7G</span>
                      <span className={`min-w-0 flex-1 truncate inline-flex items-center justify-center h-7 px-2 rounded-full border text-xs font-semibold tabular-nums ${gained > 0 ? 'text-emerald-200 bg-emerald-500/15 border-emerald-500/25 shadow-[0_0_18px_rgba(16,185,129,0.18)]' : 'text-slate-200 bg-black/20 border-white/10'}`}>{gained > 0 ? `+${fmt(gained)}` : '0'}</span>
                      <span className={`min-w-0 flex-1 truncate inline-flex items-center justify-center h-7 px-2 rounded-full border text-xs font-semibold tabular-nums ${lost > 0 ? 'text-red-200 bg-red-500/15 border-red-500/25 shadow-[0_0_18px_rgba(239,68,68,0.16)]' : 'text-slate-200 bg-black/20 border-white/10'}`}>{lost > 0 ? `-${fmt(lost)}` : '0'}</span>
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="hidden sm:flex items-center gap-3 min-w-0 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {portfolioQi && (
              <div
                className="shrink-0 flex items-center gap-2.5 px-3 py-1.5 rounded-full border border-white/10 bg-gradient-to-r from-white/[0.06] to-white/[0.03] shadow-[0_0_0_1px_rgba(255,255,255,0.04)_inset] hover:border-white/20 transition-colors"
                title={`${Math.round(portfolioQi.avg)}/100 • ${portfolioQi.label} • ${portfolioQi.count} libri`}
              >
                <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground/80">
                  <BrandFish size={14} className="opacity-90" />
                  QI
                </span>
                <div className="relative w-24 h-1.5 rounded-full overflow-hidden bg-gradient-to-r from-red-500 via-yellow-500 to-emerald-500/70">
                  <div className="absolute inset-y-0 left-0 bg-white/70" style={{ width: `${Math.round(portfolioQi.avg)}%` }} />
                </div>
                <span className="text-xs font-semibold tabular-nums text-foreground">{Math.round(portfolioQi.avg)}</span>
                <span className={`hidden sm:inline text-xs font-semibold ${portfolioQi.avg >= 70 ? 'text-emerald-300' : portfolioQi.avg >= 45 ? 'text-yellow-300' : 'text-red-300'}`}>{portfolioQi.label}</span>
              </div>
            )}
            <div className="shrink-0 flex items-end gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-gradient-to-r from-white/[0.06] to-white/[0.03] shadow-[0_0_0_1px_rgba(255,255,255,0.04)_inset]">
              <span className="text-3xl sm:text-4xl font-semibold tabular-nums text-foreground">{filteredAndSortedAsins.length}</span>
              <span className="hidden sm:inline text-sm text-muted-foreground pb-1">libri</span>
            </div>
            <div
              className="shrink-0 flex items-center gap-2.5 px-3 py-1.5 rounded-full border border-white/10 bg-gradient-to-r from-white/[0.06] to-white/[0.03] shadow-[0_0_0_1px_rgba(255,255,255,0.04)_inset] hover:border-white/20 transition-colors"
              title="Recensioni ultimi 7 giorni"
            >
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground/80">Recensioni 7g</span>
              {(() => {
                const gained = Number(poolReviews7d.gained) || 0;
                const lost = Number(poolReviews7d.lost) || 0;
                const fmt = (n) => new Intl.NumberFormat('it-IT').format(Math.abs(n));
                return (
                  <>
                    <span className={`inline-flex items-center justify-center h-5 px-1.5 rounded-full border text-[10px] font-medium tabular-nums ${gained > 0 ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20' : 'text-slate-200 bg-white/5 border-white/10'}`}>{gained > 0 ? `+${fmt(gained)}` : '0'}</span>
                    <span className={`inline-flex items-center justify-center h-5 px-1.5 rounded-full border text-[10px] font-medium tabular-nums ${lost > 0 ? 'text-red-300 bg-red-500/10 border-red-500/20' : 'text-slate-200 bg-white/5 border-white/10'}`}>{lost > 0 ? `-${fmt(lost)}` : '0'}</span>
                  </>
                );
              })()}
            </div>
            </div>

            <div aria-hidden="true" className="hidden sm:block pointer-events-none absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-background to-transparent" />
            <div aria-hidden="true" className="hidden sm:block pointer-events-none absolute right-0 top-0 bottom-0 w-10 bg-gradient-to-l from-background to-transparent" />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {displayName && (
              <div className="hidden md:flex items-center px-3 py-1.5 rounded-full border border-white/10 bg-gradient-to-r from-white/[0.06] to-white/[0.03] shadow-[0_0_0_1px_rgba(255,255,255,0.04)_inset] text-xs font-semibold text-foreground/90 max-w-[220px] truncate" title={displayName}>
                {displayName}
              </div>
            )}
            <Button
              size="xs"
              onClick={() => setIsRefreshAllDialogOpen(true)}
              variant="outline"
              className="h-10 w-10 p-0 rounded-full border border-white/10 bg-white/[0.04] text-muted-foreground hover:bg-white/[0.06] hover:text-foreground sm:h-auto sm:w-auto sm:bg-transparent sm:border-border sm:px-3"
              disabled={isRefreshingAll}
            >
              {isRefreshingAll ? <BrandPreloader size={18} /> : <RefreshCw className="w-4 h-4" />}
            </Button>
            <Button size="xs" onClick={() => setShowArchived(v => !v)} variant={showArchived ? 'default' : 'ghost'} className={showArchived ? 'h-10 w-10 p-0 rounded-full bg-white/[0.07] text-foreground border border-white/10 sm:h-auto sm:w-auto sm:p-0 sm:bg-primary sm:text-primary-foreground sm:border-0' : 'h-10 w-10 p-0 rounded-full border border-white/10 bg-white/[0.04] text-muted-foreground hover:bg-white/[0.06] hover:text-foreground sm:h-auto sm:w-auto sm:p-0 sm:border-0 sm:bg-transparent sm:text-muted-foreground'}>
              <Trash2 className="w-4 h-4 sm:hidden" />
              <Archive className="w-4 h-4 hidden sm:block sm:mr-1" />
              <span className="hidden sm:inline">{showArchived ? 'Archiviati' : 'Attivi'}</span>
            </Button>
            <div className="bg-white/[0.04] p-1 rounded-full border border-white/10 sm:bg-muted/50 sm:border-border">
              <Button onClick={() => setViewMode('grid')} variant={effectiveViewMode === 'grid' ? 'default' : 'ghost'} size="xs" className={effectiveViewMode === 'grid' ? 'bg-emerald-300 text-black rounded-full shadow-[0_0_22px_rgba(16,185,129,0.25)] sm:bg-primary sm:text-primary-foreground' : 'text-muted-foreground rounded-full'}>
                <LayoutGrid className="w-4 h-4" />
              </Button>
              <Button disabled onClick={() => setViewMode('list')} variant={effectiveViewMode === 'list' ? 'default' : 'ghost'} size="xs" className={(effectiveViewMode === 'list' ? 'bg-emerald-300 text-black rounded-full shadow-[0_0_22px_rgba(16,185,129,0.25)] sm:bg-primary sm:text-primary-foreground' : 'text-muted-foreground rounded-full') + ' opacity-40 cursor-not-allowed'}>
                <List className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
        
        {effectiveViewMode === 'list' && (
          <AsinListFilters sort={sort} setSort={setSort} filter={filter} setFilter={setFilter} />
        )}

        {isLoading ? (
          <div className="flex justify-center items-center py-16"><BrandPreloader size={84} /></div>
        ) : trackedAsins.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16 glass-card border-dashed">
            <BookOpen className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-2xl font-semibold text-foreground mb-2">Nessun ASIN monitorato</h3>
            <p className="text-muted-foreground mb-6">Inizia ad aggiungere i tuoi prodotti per vederli qui.</p>
          </motion.div>
        ) : effectiveViewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-5">
            {filteredAndSortedAsins.map((item) => (
              <div key={item.id}>
                <AsinCard 
                  data={item} 
                  trend={trends[item.id]}
                  snapshot={perfByAsinId[item.id]}
                  topBook={(topBooksMonth || []).find(tb => {
                    const norm = (x) => (x || '')
                      .toString()
                      .trim()
                      .toLowerCase()
                      .normalize('NFD')
                      .replace(/[\u0300-\u036f]/g, '')
                      .replace(/[^a-z0-9]+/g, '');
                    const t = (item?.title || '').trim();
                    const s = (item?.subtitle || '').trim();
                    const tbTitleN = norm(tb?.title);
                    if (!tbTitleN) return false;
                    const variants = [];
                    if (t) variants.push(t);
                    if (s) {
                      variants.push(`${t} ${s}`);
                      variants.push(`${t}: ${s}`);
                      variants.push(`${t} - ${s}`);
                      variants.push(`${t}-${s}`);
                      variants.push(`${t} – ${s}`);
                      variants.push(`${t}—${s}`);
                      variants.push(`${t} (${s})`);
                    }
                    return variants
                      .map(v => norm(v))
                      .some(v => v && (v === tbTitleN || v.startsWith(tbTitleN) || tbTitleN.startsWith(v)));
                  })}
                  onRefresh={handleRefreshSingle}
                  onDelete={confirmDelete}
                  onShowChart={() => setSelectedAsinForChart(item)}
                  onEditRoyalty={() => setSelectedAsinForRoyalty(item)}
                  onShowReviews={() => setSelectedAsinForReviews(item)}
                  onShowLogs={() => setSelectedAsinForLogs(item)}
                  isRefreshing={(refreshingAsin === item.asin) || inProgressAsins.has(item.asin)}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="glass-card overflow-hidden">
            <div className="hidden sm:grid grid-cols-12 gap-3 sm:gap-4 px-4 py-2 border-b border-border/20 bg-white/[0.03]">
              <div className="col-span-3 text-[11px] uppercase tracking-wide text-muted-foreground/70">Titolo</div>
              <div className="col-span-2 text-[11px] uppercase tracking-wide text-muted-foreground/70">Prezzo</div>
              <div className="col-span-2 text-[11px] uppercase tracking-wide text-muted-foreground/70">BSR</div>
              <div className="col-span-1 text-[11px] uppercase tracking-wide text-muted-foreground/70 text-center">Trend</div>
              <div className="col-span-2 text-[11px] uppercase tracking-wide text-muted-foreground/70">Rating</div>
              <div className="col-span-2 text-[11px] uppercase tracking-wide text-muted-foreground/70">Guadagno</div>
            </div>
            {filteredAndSortedAsins.map((item) => (
              <div key={item.id}>
                <AsinListItem
                  data={item}
                  trend={trends[item.id]}
                  snapshot={perfByAsinId[item.id]}
                  onRefresh={handleRefreshSingle}
                  onDelete={confirmDelete}
                  onShowChart={() => setSelectedAsinForChart(item)}
                  onEditRoyalty={() => setSelectedAsinForRoyalty(item)}
                  onShowReviews={() => setSelectedAsinForReviews(item)}
                  onShowLogs={() => setSelectedAsinForLogs(item)}
                  isRefreshing={(refreshingAsin === item.asin) || inProgressAsins.has(item.asin)}
                />
              </div>
            ))}
          </div>
        )}

        {/* Sposta il form di inserimento ASIN in fondo alla pagina */}
        <div className="mt-8">
          <AsinForm isAdding={isAdding} onAdd={handleAddAsin} />
        </div>
        {/* Amazon payout forecast widget */}
        <PayoutWidget />
        </div>
      </div>
      <AnimatePresence>
        {selectedAsinForChart && (
          <AsinTrendChart asinData={selectedAsinForChart} onClose={() => setSelectedAsinForChart(null)} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {selectedAsinForReviews && (
          <AsinReviewsModal asinData={selectedAsinForReviews} onClose={() => setSelectedAsinForReviews(null)} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {selectedAsinForLogs && (
          <AsinEventLogModal asinData={selectedAsinForLogs} isOpen={!!selectedAsinForLogs} onClose={() => setSelectedAsinForLogs(null)} />
        )}
      </AnimatePresence>
      <RoyaltyEditModal 
        asinData={selectedAsinForRoyalty}
        isOpen={!!selectedAsinForRoyalty}
        onClose={() => setSelectedAsinForRoyalty(null)}
        onRoyaltyUpdate={handleRoyaltyUpdate}
      />
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Gestisci ASIN</AlertDialogTitle>
            <AlertDialogDescription>
              Scegli se archiviare (mantieni storico, rimuovi dal monitoraggio) o eliminare definitivamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            {asinToDelete?.archived ? (
              <AlertDialogAction onClick={handleRestore}>Ripristina</AlertDialogAction>
            ) : (
              <AlertDialogAction onClick={handleArchive}>Archivia</AlertDialogAction>
            )}
            <AlertDialogAction onClick={handleDelete}>Elimina</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isRefreshAllDialogOpen} onOpenChange={setIsRefreshAllDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Conferma aggiornamento</AlertDialogTitle>
            <AlertDialogDescription>
              Vuoi aggiornare tutti gli ASIN? Potrebbe richiedere alcuni minuti.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setIsRefreshAllDialogOpen(false);
                handleRefreshAll();
              }}
            >
              Conferma
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default AsinMonitoring;