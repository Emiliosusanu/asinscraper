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
        {isTop ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
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

        const { data: historyData, error: historyError } = await supabase
          .from('asin_history')
          .select('*')
          .in('asin_data_id', asinIds)
          .gte('created_at', thirtyDaysAgo.toISOString());

        if (historyError) throw historyError;

        setAsins(asinsData);
        setHistory(historyData);
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
    if (asins.length === 0 || history.length === 0) {
      return {
        topPerformers: [],
        worstPerformers: [],
        totalIncome: 0,
        bsrAverage: 0,
        predictedIncome: 0,
        predictedBsrChange: 0,
      };
    }

    const asinsWithChange = asins.map(asin => {
      const relevantHistory = history
        .filter(h => h.asin_data_id === asin.id)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      
      if (relevantHistory.length < 2) return { ...asin, bsr_change: 0 };

      const latestBsr = relevantHistory[0].bsr;
      const oldestBsr = relevantHistory[relevantHistory.length - 1].bsr;
      const bsr_change = oldestBsr - latestBsr; // Positive change is good (lower BSR)
      return { ...asin, bsr: latestBsr, bsr_change };
    });

    const sortedByChange = [...asinsWithChange].sort((a, b) => b.bsr_change - a.bsr_change);
    const topPerformers = sortedByChange.slice(0, 3);
    const worstPerformers = sortedByChange.slice(-3).reverse();

    const totalIncome = asins.reduce((acc, asin) => acc + (asin.royalty || 0), 0); // This is a placeholder
    const bsrAverage = asins.reduce((acc, asin) => acc + (asin.bsr || 0), 0) / asins.length;

    // AI Prediction Simulation
    const predictedIncome = totalIncome * 1.15; // Simulate 15% increase
    const predictedBsrChange = -50; // Simulate average BSR decrease

    return { topPerformers, worstPerformers, totalIncome, bsrAverage, predictedIncome, predictedBsrChange };
  }, [asins, history]);

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
            Insight automatici e previsioni simulate basate sulle performance dei tuoi libri negli ultimi 30 giorni.
          </p>
        </motion.div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
            <AnalysisCard 
                icon={DollarSign}
                title="Guadagno Mensile Stimato"
                value={formatCurrency(analysisData.totalIncome)}
                description="Basato sulle royalty impostate"
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
            <AnalysisCard 
                icon={BrainCircuit}
                title="Previsione Guadagno Prossimo Mese"
                value={formatCurrency(analysisData.predictedIncome)}
                description="Simulazione AI"
                color="text-cyan-400"
                isLoading={isLoading}
            />
            <AnalysisCard 
                icon={TrendingUp}
                title="Previsione BSR Medio"
                value={`${formatNumber(analysisData.predictedBsrChange)}`}
                description="Variazione media stimata"
                color="text-pink-400"
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
        
        <div className="mt-12 p-6 bg-blue-900/20 border border-blue-500/30 rounded-lg text-center">
            <Info className="w-8 h-8 mx-auto text-blue-400 mb-3" />
            <h3 className="text-lg font-semibold text-foreground">Disclaimer Simulazione AI</h3>
            <p className="text-sm text-muted-foreground max-w-2xl mx-auto">
                Le previsioni mostrate sono una simulazione dimostrativa. L'integrazione di un vero modello di intelligenza artificiale per analisi accurate può essere richiesta come prossima funzionalità.
            </p>
        </div>

      </div>
    </>
  );
};

export default MarketAnalysis;