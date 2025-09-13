import React, { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, BarChart2, BrainCircuit, DollarSign, ArrowRight, Info } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { toast } from '@/components/ui/use-toast';
import { Loader2 } from 'lucide-react';

// Emilio: This is the new Market Analysis page.

const formatNumber = (num) => {
  if (typeof num !== 'number') return '—';
  return new Intl.NumberFormat('it-IT').format(num);
};

const formatCurrency = (num) => {
  if (typeof num !== 'number') return '€ 0';
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(num);
};

const AnalysisCard = ({ icon: Icon, title, value, change, description, color, isLoading }) => (
  <Card className="glass-card">
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      <Icon className={`h-5 w-5 ${color}`} />
    </CardHeader>
    <CardContent>
      {isLoading ? (
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      ) : (
        <>
          <div className="text-2xl font-bold text-foreground">{value}</div>
          <p className="text-xs text-muted-foreground">{description}</p>
        </>
      )}
    </CardContent>
  </Card>
);

const BookPerformanceCard = ({ book, type }) => {
  const isTop = type === 'top';
  const ArrowIcon = isTop ? TrendingDown : TrendingUp; // BSR down = good (green), BSR up = bad (red)
  return (
    <motion.div 
      whileHover={{ y: -5 }}
      className="flex items-center gap-4 p-4 rounded-lg bg-muted/50 border border-border transition-all"
    >
      <img src={book.image_url} alt={book.title} className="w-12 h-16 object-cover rounded-md" />
      <div className="flex-1">
        <p className="font-semibold text-foreground line-clamp-1">{book.title}</p>
        <p className="text-sm text-muted-foreground">BSR: {formatNumber(book.bsr)}</p>
      </div>
      <div className={`flex items-center gap-1 text-sm font-bold ${isTop ? 'text-green-400' : 'text-red-400'}`}>
        <ArrowIcon className="w-4 h-4" />
        <span>{formatNumber(book.bsr_change)}</span>
      </div>
    </motion.div>
  );
};

const MarketAnalysis = () => {
  const { user } = useAuth();
  const [asins, setAsins] = useState([]);
  const [history, setHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [entries, setEntries] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;
      setIsLoading(true);
      try {
        const { data: asinsData, error: asinsError } = await supabase
          .from('asin_data')
          .select('*')
          .eq('user_id', user.id);

        if (asinsError) throw asinsError;

        const asinIds = asinsData.map(a => a.id);
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const today = new Date();

        const { data: historyData, error: historyError } = await supabase
          .from('asin_history')
          .select('*')
          .in('asin_data_id', asinIds)
          .gte('created_at', thirtyDaysAgo.toISOString());

        if (historyError) throw historyError;

        // Real income from kdp_entries (EUR) last 30 days
        let kdp = [];
        try {
          const { data: kdpData, error: kdpErr } = await supabase
            .from('kdp_entries')
            .select('date, income, income_currency')
            .eq('user_id', user.id)
            .eq('income_currency', 'EUR')
            .gte('date', thirtyDaysAgo.toISOString().slice(0,10))
            .lte('date', today.toISOString().slice(0,10));
          if (kdpErr) throw kdpErr;
          kdp = Array.isArray(kdpData) ? kdpData : [];
        } catch (_) {
          kdp = [];
        }

        setAsins(asinsData);
        setHistory(historyData);
        setEntries(kdp);
      } catch (error) {
        toast({
          title: 'Errore nel caricamento dei dati',
          description: error.message,
          variant: 'destructive',
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [user]);

  const analysisData = useMemo(() => {
    if (asins.length === 0 && history.length === 0 && entries.length === 0) {
      return {
        topPerformers: [],
        worstPerformers: [],
        totalIncome: 0,
        bsrAverage: 0,
      };
    }

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 15);

    const withDelta15d = asins.map(asin => {
      const recent = history
        .filter(h => h.asin_data_id === asin.id && new Date(h.created_at) >= cutoff)
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at)); // oldest..latest in last 15d
      if (recent.length < 2) return null;
      const oldestBsr = recent[0]?.bsr ?? null;
      const latestBsr = recent[recent.length - 1]?.bsr ?? null;
      if (!Number.isFinite(oldestBsr) || !Number.isFinite(latestBsr)) return null;
      const bsr_change = oldestBsr - latestBsr; // positive => BSR decreased (good)
      return { ...asin, bsr: latestBsr, bsr_change };
    }).filter(Boolean);

    const topPerformers = withDelta15d
      .filter(b => Number.isFinite(b.bsr_change) && b.bsr_change > 0)
      .sort((a, b) => b.bsr_change - a.bsr_change)
      .slice(0, 3);

    const worstPerformers = withDelta15d
      .filter(b => Number.isFinite(b.bsr_change) && b.bsr_change < 0)
      .sort((a, b) => a.bsr_change - b.bsr_change) // most negative first (largest increase in BSR)
      .slice(0, 3);

    // Real income sum over last 30 days (EUR)
    const totalIncome = (entries || []).reduce((sum, r) => sum + (parseFloat(r.income ?? 0) || 0), 0);
    // Average latest BSR across portfolio
    const latestByAsin = asins.map(a => {
      const rel = history
        .filter(h => h.asin_data_id === a.id)
        .sort((x, y) => new Date(y.created_at) - new Date(x.created_at));
      return rel[0]?.bsr || null;
    }).filter(v => Number.isFinite(v));
    const bsrAverage = latestByAsin.length ? Math.round(latestByAsin.reduce((a,b)=>a+b,0) / latestByAsin.length) : 0;

    return { topPerformers, worstPerformers, totalIncome, bsrAverage };
  }, [asins, history, entries]);

  return (
    <>
      <Helmet>
        <title>Stime & Analisi - KDP Insights Pro</title>
        <meta name="description" content="Analisi di mercato e previsioni basate sui tuoi dati KDP." />
      </Helmet>
      <div className="container mx-auto pb-20 lg:pb-0">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <div className="inline-block p-4 bg-muted/50 rounded-2xl border border-border mb-4">
             <BrainCircuit className="w-12 h-12 text-primary" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold gradient-text">
            Stime & Analisi di Mercato
          </h1>
          <p className="mt-4 text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto">
            Insight automatici basati sui dati reali degli ultimi 30 giorni del tuo catalogo.
          </p>
        </motion.div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
            <AnalysisCard 
                icon={DollarSign}
                title="Entrate 30 giorni (EUR)"
                value={formatCurrency(analysisData.totalIncome)}
                description="Somma dei ricavi (kdp_entries)"
                color="text-green-400"
                isLoading={isLoading}
            />
            <AnalysisCard 
                icon={BarChart2}
                title="BSR Medio Attuale"
                value={formatNumber(analysisData.bsrAverage)}
                description="Media di tutti i tuoi libri"
                color="text-purple-400"
                isLoading={isLoading}
            />
        </div>

        <div className="grid md:grid-cols-2 gap-8">
            <div>
                <h2 className="text-2xl font-bold text-foreground mb-4">Top Performers</h2>
                <div className="space-y-4">
                    {isLoading ? (
                        <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mt-8" />
                    ) : analysisData.topPerformers.length > 0 ? (
                        analysisData.topPerformers.map(book => <BookPerformanceCard key={book.id} book={book} type="top" />)
                    ) : (
                        <p className="text-muted-foreground text-center py-8">Nessun dato sufficiente per l'analisi.</p>
                    )}
                </div>
            </div>
            <div>
                <h2 className="text-2xl font-bold text-foreground mb-4">Da Monitorare</h2>
                 <div className="space-y-4">
                    {isLoading ? (
                        <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mt-8" />
                    ) : analysisData.worstPerformers.length > 0 ? (
                        analysisData.worstPerformers.map(book => <BookPerformanceCard key={book.id} book={book} type="worst" />)
                    ) : (
                        <p className="text-muted-foreground text-center py-8">Nessun dato sufficiente per l'analisi.</p>
                    )}
                </div>
            </div>
        </div>
        
        {/* Removed simulation disclaimer: metrics are based on real data */}

      </div>
    </>
  );
};

export default MarketAnalysis;