import React, { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, BarChart2, BrainCircuit, DollarSign, ArrowRight, Info } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/use-toast';
import BrandPreloader from '@/components/BrandPreloader';

// Emilio: This is the new Market Analysis page.

const formatNumber = (num) => {
  if (typeof num !== 'number') return '—';
  return new Intl.NumberFormat('it-IT').format(num);
};

const formatCurrency = (num) => {
  if (typeof num !== 'number') return '€ 0';
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(num);
};

const pad2 = (n) => String(n).padStart(2, '0');

const quantile = (arr, q) => {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const a = [...arr].sort((x, y) => x - y);
  const pos = (a.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (a[base + 1] === undefined) return a[base];
  return a[base] + rest * (a[base + 1] - a[base]);
};

const formatTimeRange = (startHour, bucketHours) => {
  const endHour = (startHour + bucketHours) % 24;
  const start = `${pad2(startHour)}:00`;
  const end = `${pad2(endHour)}:00`;
  return `${start}–${end}`;
};

const computeBsrTimeOfDay = (rows, { timezone = 'local', bucketHours = 1 } = {}) => {
  const bh = Math.max(1, Math.min(6, Number(bucketHours) || 1));
  const bucketCount = Math.ceil(24 / bh);
  const buckets = Array.from({ length: bucketCount }, (_, idx) => {
    const startHour = idx * bh;
    return {
      bucketIndex: idx,
      startHour,
      label: formatTimeRange(startHour, bh),
      count: 0,
      incCount: 0,
      decCount: 0,
      sumDelta: 0,
      incSum: 0,
      decSum: 0,
    };
  });

  const byAsin = new Map();
  for (const r of rows || []) {
    const asinId = r?.asin_data_id;
    const bsr = Number(r?.bsr);
    const createdAt = r?.created_at;
    if (!asinId || !createdAt) continue;
    if (!Number.isFinite(bsr) || bsr <= 0) continue;
    const list = byAsin.get(asinId) || [];
    list.push({ created_at: createdAt, bsr });
    byAsin.set(asinId, list);
  }

  const hourFromIso = (iso) => {
    const d = new Date(iso);
    return timezone === 'utc' ? d.getUTCHours() : d.getHours();
  };

  for (const arr of byAsin.values()) {
    if (arr.length < 2) continue;
    arr.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    for (let i = 1; i < arr.length; i++) {
      const prev = arr[i - 1];
      const curr = arr[i];
      const delta = Number(curr.bsr) - Number(prev.bsr);
      if (!Number.isFinite(delta) || delta === 0) continue;
      const h = hourFromIso(curr.created_at);
      const idx = Math.floor(h / bh);
      const b = buckets[idx];
      if (!b) continue;
      b.count += 1;
      b.sumDelta += delta;
      if (delta > 0) {
        b.incCount += 1;
        b.incSum += delta;
      } else {
        b.decCount += 1;
        b.decSum += delta;
      }
    }
  }

  let minCount = 20;
  let scored = buckets.filter(b => b.count >= minCount).map(b => b.decCount / b.count);
  if (scored.length < 6) {
    minCount = 8;
    scored = buckets.filter(b => b.count >= minCount).map(b => b.decCount / b.count);
  }
  if (scored.length < 4) {
    minCount = 1;
    scored = buckets.filter(b => b.count >= minCount).map(b => b.decCount / b.count);
  }
  const q33 = quantile(scored, 1 / 3);
  const q66 = quantile(scored, 2 / 3);

  const computedBuckets = buckets.map(b => {
    const avgDelta = b.count ? b.sumDelta / b.count : 0;
    const incRate = b.count ? b.incCount / b.count : 0;
    const decRate = b.count ? b.decCount / b.count : 0;
    const buyScore = decRate;
    let segment = 'unknown';
    if (b.count >= minCount && q33 != null && q66 != null) {
      if (buyScore >= q66) segment = 'green';
      else if (buyScore <= q33) segment = 'orange';
      else segment = 'yellow';
    }
    return {
      ...b,
      avgDelta,
      incRate,
      decRate,
      buyScore,
      segment,
      minCount,
    };
  });

  const nonEmpty = computedBuckets.filter(b => b.count > 0);
  const peakWorsen = nonEmpty.length
    ? nonEmpty.reduce((best, b) => (best == null || b.avgDelta > best.avgDelta ? b : best), null)
    : null;
  const peakImprove = nonEmpty.length
    ? nonEmpty.reduce((best, b) => (best == null || b.avgDelta < best.avgDelta ? b : best), null)
    : null;

  const totalMoves = computedBuckets.reduce((s, b) => s + b.count, 0);
  return { buckets: computedBuckets, peakWorsen, peakImprove, totalMoves, bucketHours: bh, minCount, q33, q66 };
};

const AnalysisCard = ({ icon: Icon, title, value, change, description, color, isLoading }) => (
  <Card className="glass-card">
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      <Icon className={`h-5 w-5 ${color}`} />
    </CardHeader>
    <CardContent>
      {isLoading ? (
        <BrandPreloader size={28} />
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

  const [todPeriod, setTodPeriod] = useState('all');
  const [todTimezone, setTodTimezone] = useState('local');
  const [todBucketHours, setTodBucketHours] = useState('1');
  const [todRows, setTodRows] = useState([]);
  const [todLoading, setTodLoading] = useState(false);
  const [todCapped, setTodCapped] = useState(false);

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

  useEffect(() => {
    const fetchTimeOfDay = async () => {
      if (!user?.id) return;
      setTodLoading(true);
      setTodCapped(false);
      try {
        const pageSize = 1000;
        const maxRows = 20000;
        let offset = 0;
        let out = [];
        const fromIso = (() => {
          if (todPeriod === 'all') return null;
          const days = Number(todPeriod);
          if (!Number.isFinite(days) || days <= 0) return null;
          const d = new Date();
          d.setDate(d.getDate() - days);
          return d.toISOString();
        })();

        while (offset < maxRows) {
          let q = supabase
            .from('asin_history')
            .select('asin_data_id, created_at, bsr')
            .eq('user_id', user.id)
            .order('created_at', { ascending: true });
          if (fromIso) q = q.gte('created_at', fromIso);

          const { data, error } = await q.range(offset, offset + pageSize - 1);
          if (error) throw error;

          const rows = Array.isArray(data) ? data : [];
          out = out.concat(rows);
          if (rows.length < pageSize) break;

          offset += pageSize;
        }

        if (out.length >= maxRows) setTodCapped(true);
        setTodRows(out.slice(0, maxRows));
      } catch (error) {
        setTodRows([]);
        toast({
          title: 'Errore nel caricamento dello storico BSR',
          description: error.message,
          variant: 'destructive',
        });
      } finally {
        setTodLoading(false);
      }
    };

    fetchTimeOfDay();
  }, [user?.id, todPeriod]);

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

  const todAnalysis = useMemo(() => {
    return computeBsrTimeOfDay(todRows, { timezone: todTimezone, bucketHours: todBucketHours });
  }, [todRows, todTimezone, todBucketHours]);

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

        <Card className="glass-card mb-10">
          <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="text-xl">Movimento BSR per Fascia Oraria</CardTitle>
              <CardDescription>
                Basato sulle differenze tra scrapes consecutivi. Verde = più spesso BSR scende (più acquisti), Arancione = più spesso BSR sale.
              </CardDescription>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
              <Select value={todPeriod} onValueChange={setTodPeriod}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Periodo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutto lo storico</SelectItem>
                  <SelectItem value="30">Ultimi 30 giorni</SelectItem>
                  <SelectItem value="90">Ultimi 90 giorni</SelectItem>
                  <SelectItem value="180">Ultimi 180 giorni</SelectItem>
                </SelectContent>
              </Select>

              <Select value={todTimezone} onValueChange={setTodTimezone}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Timezone" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="local">Ora locale</SelectItem>
                  <SelectItem value="utc">UTC</SelectItem>
                </SelectContent>
              </Select>

              <Select value={todBucketHours} onValueChange={setTodBucketHours}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Bucket" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Bucket 1h</SelectItem>
                  <SelectItem value="2">Bucket 2h</SelectItem>
                  <SelectItem value="3">Bucket 3h</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>

          <CardContent>
            {todLoading ? (
              <div className="flex items-center gap-3 text-muted-foreground">
                <BrandPreloader size={22} />
                <span>Analisi dello storico BSR...</span>
              </div>
            ) : todAnalysis.totalMoves === 0 ? (
              <div className="text-muted-foreground">Dati insufficienti per calcolare il pattern orario (servono scrapes consecutivi con BSR valido).</div>
            ) : (
              <div className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-lg border border-border bg-muted/30 p-4">
                    <div className="flex items-center gap-2 font-semibold">
                      <TrendingDown className="w-5 h-5 text-green-400" />
                      <span>Finestra migliore (BSR scende)</span>
                    </div>
                    <div className="mt-2 text-sm text-muted-foreground">
                      {todAnalysis.peakImprove ? (
                        <div>
                          <div className="text-foreground font-bold">{todAnalysis.peakImprove.label}</div>
                          <div>
                            Media ΔBSR:{' '}
                            <span className={todAnalysis.peakImprove.avgDelta < 0 ? 'text-green-400 font-semibold' : 'text-muted-foreground'}>
                              {Math.round(todAnalysis.peakImprove.avgDelta).toLocaleString('it-IT')}
                            </span>
                            {' '}| ↓ {Math.round(todAnalysis.peakImprove.decRate * 100)}% (n={todAnalysis.peakImprove.count.toLocaleString('it-IT')})
                          </div>
                        </div>
                      ) : '—'}
                    </div>
                  </div>

                  <div className="rounded-lg border border-border bg-muted/30 p-4">
                    <div className="flex items-center gap-2 font-semibold">
                      <TrendingUp className="w-5 h-5 text-orange-400" />
                      <span>Finestra peggiore (BSR sale)</span>
                    </div>
                    <div className="mt-2 text-sm text-muted-foreground">
                      {todAnalysis.peakWorsen ? (
                        <div>
                          <div className="text-foreground font-bold">{todAnalysis.peakWorsen.label}</div>
                          <div>
                            Media ΔBSR:{' '}
                            <span className={todAnalysis.peakWorsen.avgDelta > 0 ? 'text-orange-400 font-semibold' : 'text-muted-foreground'}>
                              +{Math.round(todAnalysis.peakWorsen.avgDelta).toLocaleString('it-IT')}
                            </span>
                            {' '}| ↑ {Math.round(todAnalysis.peakWorsen.incRate * 100)}% (n={todAnalysis.peakWorsen.count.toLocaleString('it-IT')})
                          </div>
                        </div>
                      ) : '—'}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-green-500/70" />Verde</span>
                    <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-yellow-500/70" />Giallo</span>
                    <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-orange-500/70" />Arancione</span>
                    <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-zinc-500/70" />Pochi dati</span>
                    <span className="ml-auto">Movimenti analizzati: {todAnalysis.totalMoves.toLocaleString('it-IT')}{todCapped ? ' (limitati)' : ''}</span>
                  </div>

                  <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${todAnalysis.buckets.length}, minmax(0, 1fr))` }}>
                    {todAnalysis.buckets.map((b) => {
                      const cls =
                        b.segment === 'green'
                          ? 'border-green-500/30 bg-green-500/15 text-green-200'
                          : b.segment === 'orange'
                            ? 'border-orange-500/30 bg-orange-500/15 text-orange-200'
                            : b.segment === 'yellow'
                              ? 'border-yellow-500/30 bg-yellow-500/15 text-yellow-200'
                              : 'border-zinc-500/20 bg-zinc-500/10 text-zinc-300';

                      const title = `${b.label}\nMovimenti: ${b.count}\n↑ ${(b.incRate * 100).toFixed(0)}% | ↓ ${(b.decRate * 100).toFixed(0)}%\nMedia ΔBSR: ${Math.round(b.avgDelta)}`;
                      return (
                        <div
                          key={b.bucketIndex}
                          title={title}
                          className={`rounded-md border p-2 text-center ${cls}`}
                        >
                          <div className="text-xs font-semibold">{b.label}</div>
                          <div className="text-[11px] opacity-90 mt-1">
                            ↓ {Math.round(b.decRate * 100)}%
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="text-xs text-muted-foreground">
                    Segmentazione calcolata su fasce con almeno {todAnalysis.minCount} movimenti (verde/arancione = terzili della tua distribuzione).
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-2 gap-8">
            <div>
                <h2 className="text-2xl font-bold text-foreground mb-4">Top Performers</h2>
                <div className="space-y-4">
                    {isLoading ? (
                        <div className="flex justify-center mt-8"><BrandPreloader size={64} /></div>
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
                        <div className="flex justify-center mt-8"><BrandPreloader size={64} /></div>
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