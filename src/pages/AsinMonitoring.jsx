import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, RefreshCw, LayoutGrid, List, Loader2, BookOpen, Filter, Target } from 'lucide-react';
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
import { scrapeAndProcessAsin, deleteAsinAndHistory, processAllAsins } from '@/services/asinService';
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

  
  const { trends, refreshTrends } = useAsinTrends(trackedAsins);
  const channelRef = useRef(null); // ← add this

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

useEffect(() => {
  if (!user) return;

  // First load
  fetchTrackedAsins();

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
        toast({ title: 'Dati aggiornati!', description: `I dati per ${payload.new.title} sono stati aggiornati.` });
      } else if (payload.eventType === 'DELETE') {
        setTrackedAsins(curr => curr.filter(a => a.id !== payload.old.id));
      }

      // refresh charts whenever a row changes
      refreshTrends();
    }
  );

  // 2) asin_history: on new point, refresh charts
  channel.on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'asin_history' },
    (payload) => {
      if (payload.new?.user_id !== user.id) return;
      refreshTrends();
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
}, [user?.id, fetchTrackedAsins, refreshTrends]);

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

    return sortedAsins.filter(item => item.title && item.title.toLowerCase().includes(filter.toLowerCase()));
  }, [trackedAsins, sort, filter]);
  
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
    setRefreshingAsin(asinToRefresh.asin);
    await scrapeAndProcessAsin(asinToRefresh.asin, asinToRefresh.country, user);
    setRefreshingAsin(null);
  };

const handleRefreshAll = async () => {
  toast({ title: 'Aggiornamento in corso...', description: 'Update la prima parte...' });
  setIsRefreshingAll(true);
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session.user.id;

    // prendo TUTTI gli ASIN tracciati (non solo i filtrati a schermo)
    const items = trackedAsins.map(a => ({ asin: a.asin, country: a.country }));

    await processAllAsins(
      {
        items,
        userId,
        max: 6,         // **limite concorrenza** (3–5 è ok)
        pauseMs: 900,   // **pausa tra batch**
        baseDelay: 700, // **retry backoff**: 0.7s, ~1.4s, ~2.1s con jitter
        retries: 3
      },
      ({ asin, ok, error }) => {
        if (!ok) console.warn('Scrape fallito', asin, error);
      }
    );
  } finally {
    setIsRefreshingAll(false);
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

  return (
    <>
      <Helmet>
        <title>Monitoraggio ASIN - KDP Insights Pro</title>
        <meta name="description" content="Aggiungi e monitora i tuoi ASIN Amazon in tempo reale." />
      </Helmet>
      <div className="container mx-auto pb-24 lg:pb-8">

        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-semibold text-foreground">I tuoi ASIN ({filteredAndSortedAsins.length})</h2>
          <div className="flex gap-2">
            <Button onClick={handleRefreshAll} variant="outline" className="border-border text-muted-foreground hover:bg-muted hover:text-foreground" disabled={isRefreshingAll}>
              {isRefreshingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </Button>
            <div className="bg-muted/50 p-1 rounded-lg border border-border">
              <Button onClick={() => setViewMode('grid')} variant={viewMode === 'grid' ? 'default' : 'ghost'} size="sm" className={viewMode === 'grid' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}>
                <LayoutGrid className="w-4 h-4" />
              </Button>
              <Button onClick={() => setViewMode('list')} variant={viewMode === 'list' ? 'default' : 'ghost'} size="sm" className={viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}>
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
                  onRefresh={handleRefreshSingle}
                  onDelete={confirmDelete}
                  onShowChart={() => setSelectedAsinForChart(item)}
                  onEditRoyalty={() => setSelectedAsinForRoyalty(item)}
                  onShowReviews={() => setSelectedAsinForReviews(item)}
                  onShowLogs={() => setSelectedAsinForLogs(item)}
                  isRefreshing={refreshingAsin === item.asin}
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
                  onRefresh={handleRefreshSingle}
                  onDelete={confirmDelete}
                  onShowChart={() => setSelectedAsinForChart(item)}
                  onEditRoyalty={() => setSelectedAsinForRoyalty(item)}
                  onShowReviews={() => setSelectedAsinForReviews(item)}
                  onShowLogs={() => setSelectedAsinForLogs(item)}
                  isRefreshing={refreshingAsin === item.asin}
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
            <AlertDialogTitle>Sei sicuro?</AlertDialogTitle>
            <AlertDialogDescription>
              Questa azione non può essere annullata. Questo cancellerà permanentemente l'ASIN e tutti i suoi dati storici.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Continua</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default AsinMonitoring;