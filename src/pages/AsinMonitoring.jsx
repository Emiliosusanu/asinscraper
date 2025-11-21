import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, RefreshCw, LayoutGrid, List, Loader2, BookOpen, Filter, Target, Archive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Helmet } from 'react-helmet';
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
          {isAdding ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
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
  const [refreshingAsin, setRefreshingAsin] = useState(null);
  const [viewMode, setViewMode] = useLocalStorage('asinMonitoringViewMode', 'grid');
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

  
  const { trends, refreshTrends } = useAsinTrends(trackedAsins);
  const perfByAsinId = usePerformanceSnapshots(trackedAsins);
  const channelRef = useRef(null); // current realtime channel
  const refreshTrendsRef = useRef(refreshTrends);
  const fetchTrackedAsinsRef = useRef(null);
  const toastCooldownRef = useRef(new Map()); // asin_id -> lastToastTs
  const [poolReviews7d, setPoolReviews7d] = useState({ gained: 0, lost: 0 });
  const computeReviewsRef = useRef(null);

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
    const pre = new Date(from); pre.setDate(from.getDate() - 30);
    const { data, error } = await supabase
      .from('asin_history')
      .select('asin_data_id, review_count, created_at')
      .in('asin_data_id', ids)
      .gte('created_at', pre.toISOString())
      .order('created_at', { ascending: true });
    if (error) { setPoolReviews7d({ gained: 0, lost: 0 }); return; }
    const by = new Map();
    for (const r of (data || [])) {
      const arr = by.get(r.asin_data_id) || [];
      arr.push(r);
      by.set(r.asin_data_id, arr);
    }
    let gained = 0, lost = 0;
    const startTs = from.getTime();
    by.forEach((arr) => {
      arr.sort((a,b)=> new Date(a.created_at) - new Date(b.created_at));
      let baseline = null;
      let prev = null;
      for (const row of arr) {
        const curr = Number(row.review_count);
        if (!Number.isFinite(curr) || curr <= 0) continue;
        const ts = new Date(row.created_at).getTime();
        if (ts < startTs) {
          baseline = curr;
          prev = curr;
          continue;
        }
        const p = (prev != null ? prev : baseline);
        if (p != null) {
          const d = curr - p;
          if (d > 0) gained += d; else if (d < 0) lost += -d;
        }
        prev = curr;
      }
    });
    setPoolReviews7d({ gained, lost });
  }, [trackedAsins, showArchived, user]);

  useEffect(() => { computeReviewsRef.current = computePoolReviews7d; }, [computePoolReviews7d]);
  useEffect(() => { computePoolReviews7d(); }, [computePoolReviews7d]);
  
  const handleAddAsin = async (asin, country) => {
    setIsAdding(true);
    const existingAsin = trackedAsins.find(item => item.asin === asin && item.country === country);
    if (existingAsin) {
        toast({ title: 'ASIN già presente', description: 'Questo ASIN è già nella tua lista di monitoraggio.', variant: 'destructive' });
        setIsAdding(false);
        return;
    }
    await scrapeAndProcessAsin(asin, country, user);
    setIsAdding(false);
  };
  
  const handleRefreshSingle = async (asinToRefresh) => {
    // Skip if already running
    if (refreshingAsin === asinToRefresh.asin || inProgressAsins.has(asinToRefresh.asin)) return;
    setRefreshingAsin(asinToRefresh.asin);
    if (asinToRefresh.archived) {
      toast({ title: 'ASIN archiviato', description: 'Ripristina per poter aggiornare i dati.' });
      setRefreshingAsin(null);
      return;
    }
    // Suppress service-level success toast to avoid duplicate toasts with realtime updates
    await scrapeAndProcessAsin(asinToRefresh.asin, asinToRefresh.country, user, { suppressToast: true });
    setRefreshingAsin(null);
  };

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
      ({ asin, ok, error, final, retry, attempts }) => {
        if (!ok) console.warn('Scrape fallito', asin, error, final ? '(final)' : retry ? `(retry cycle ${retry})` : '');
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
      <div className="container mx-auto max-w-[1400px] xl:max-w-[1600px] 2xl:max-w-[1800px] pb-24 lg:pb-8">

        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-semibold text-foreground">I tuoi ASIN ({filteredAndSortedAsins.length})</h2>
            {portfolioQi && (
              <div className="hidden sm:flex items-center gap-2 px-2 py-1 rounded-full border border-border bg-muted/40" title={`${Math.round(portfolioQi.avg)}/100 • ${portfolioQi.label} • ${portfolioQi.count} libri`}>
                <span className="text-xs text-muted-foreground">QI Portafoglio</span>
                <div className="relative w-20 h-1.5 rounded-full overflow-hidden bg-gradient-to-r from-red-500 via-yellow-500 to-emerald-500/70">
                  <div className="absolute inset-y-0 left-0 bg-white/70" style={{ width: `${Math.round(portfolioQi.avg)}%` }} />
                </div>
                <span className="text-xs font-semibold">{Math.round(portfolioQi.avg)}</span>
                <span className="text-xs text-muted-foreground">{portfolioQi.label}</span>
              </div>
            )}
            <div className="hidden sm:flex items-center gap-2 px-2 py-1 rounded-full border border-border bg-muted/40" title="Recensioni ultimi 7 giorni">
              <span className="text-xs text-muted-foreground">Recensioni 7g</span>
              {Number(poolReviews7d.gained) > 0 && (
                <span className="inline-flex items-center justify-center h-5 px-1.5 rounded-full border text-[10px] font-medium text-emerald-300 bg-emerald-500/10 border-emerald-500/20">+{new Intl.NumberFormat('it-IT').format(poolReviews7d.gained)}</span>
              )}
              {Number(poolReviews7d.lost) > 0 && (
                <span className="inline-flex items-center justify-center h-5 px-1.5 rounded-full border text-[10px] font-medium text-red-300 bg-red-500/10 border-red-500/20">-{new Intl.NumberFormat('it-IT').format(poolReviews7d.lost)}</span>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="xs" onClick={handleRefreshAll} variant="outline" className="border-border text-muted-foreground hover:bg-muted hover:text-foreground rounded-full px-3" disabled={isRefreshingAll}>
              {isRefreshingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </Button>
            <Button size="xs" onClick={() => setShowArchived(v => !v)} variant={showArchived ? 'default' : 'ghost'} className={showArchived ? 'bg-primary text-primary-foreground rounded-full' : 'text-muted-foreground rounded-full'}>
              <Archive className="w-4 h-4 mr-1" /> {showArchived ? 'Archiviati' : 'Attivi'}
            </Button>
            <div className="bg-muted/50 p-1 rounded-full border border-border">
              <Button onClick={() => setViewMode('grid')} variant={viewMode === 'grid' ? 'default' : 'ghost'} size="xs" className={viewMode === 'grid' ? 'bg-primary text-primary-foreground rounded-full' : 'text-muted-foreground rounded-full'}>
                <LayoutGrid className="w-4 h-4" />
              </Button>
              <Button onClick={() => setViewMode('list')} variant={viewMode === 'list' ? 'default' : 'ghost'} size="xs" className={viewMode === 'list' ? 'bg-primary text-primary-foreground rounded-full' : 'text-muted-foreground rounded-full'}>
                <List className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
        
        {viewMode === 'list' && (
          <AsinListFilters sort={sort} setSort={setSort} filter={filter} setFilter={setFilter} />
        )}

        {isLoading ? (
          <div className="flex justify-center items-center py-16"><Loader2 className="w-16 h-16 text-primary animate-spin" /></div>
        ) : trackedAsins.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16 glass-card border-dashed">
            <BookOpen className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-2xl font-semibold text-foreground mb-2">Nessun ASIN monitorato</h3>
            <p className="text-muted-foreground mb-6">Inizia ad aggiungere i tuoi prodotti per vederli qui.</p>
          </motion.div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
            {filteredAndSortedAsins.map((item) => (
              <div key={item.id}>
                <AsinCard 
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
        ) : (
          <div className="glass-card overflow-hidden">
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
    </>
  );
};

export default AsinMonitoring;