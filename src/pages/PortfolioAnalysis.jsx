import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { BrainCircuit, Book, TrendingUp, TrendingDown, Star, DollarSign, Loader2, ArrowUp, ArrowDown } from 'lucide-react';
import usePortfolioAnalysis from '@/hooks/usePortfolioAnalysis';
import { Button } from '@/components/ui/button';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import TrendIndicator from '@/components/TrendIndicator';

// Emilio: This component is for Portfolio Analysis.
const StatCard = ({ icon: Icon, label, value, trend, color, formatFn }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="glass-card p-6"
  >
    <div className="flex justify-between items-start">
      <div>
        <p className="text-muted-foreground text-sm mb-1">{label}</p>
        <p className="text-3xl font-bold text-foreground">{formatFn ? formatFn(value) : value}</p>
      </div>
      <div className={`p-3 rounded-xl bg-gradient-to-br ${color}`}>
        <Icon className="w-6 h-6 text-white" />
      </div>
    </div>
    {trend && (
      <div className="flex items-center gap-2 mt-4 text-sm">
        <TrendIndicator trend={trend} />
        <span className={trend === 'up' ? 'text-green-400' : trend === 'down' ? 'text-red-400' : 'text-muted-foreground'}>
          Andamento Portfolio
        </span>
      </div>
    )}
  </motion.div>
);

const PerformerList = ({ title, data, metricLabel, icon: Icon, iconColor }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: 0.2 }}
    className="glass-card p-6 h-full"
  >
    <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
      <Icon className={`w-6 h-6 ${iconColor}`} /> {title}
    </h3>
    <ul className="space-y-3">
      {data.length > 0 ? data.map(item => (
        <li key={item.id} className="flex justify-between items-center text-sm p-2 rounded-md hover:bg-muted/50 transition-colors">
          <span className="truncate w-2/3">{item.title}</span>
          <span className={`font-semibold flex items-center gap-1 ${metricLabel(item).color}`}>
            {metricLabel(item).icon}
            {metricLabel(item).text}
          </span>
        </li>
      )) : <p className="text-muted-foreground text-center py-4">Dati insufficienti.</p>}
    </ul>
  </motion.div>
);

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    const formattedDate = new Date(label).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' });
    return (
      <div className="glass-card p-4">
        <p className="text-muted-foreground mb-2">{formattedDate}</p>
        {payload.map(pld => (
          <div key={pld.dataKey} style={{ color: pld.color }} className="flex justify-between gap-4">
            <span>{pld.name}:</span>
            <span className="font-bold">{pld.value.toLocaleString('it-IT', { maximumFractionDigits: 0 })}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

const PortfolioAnalysis = () => {
  const [period, setPeriod] = useState(30);
  const { stats, topPerformers, worstPerformers, history, isLoading } = usePortfolioAnalysis(period);

  const formatIncome = (value) => `€${((value[0] + value[1]) / 2).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const periods = [
    { label: '7 Giorni', value: 7 },
    { label: '30 Giorni', value: 30 },
    { label: '60 Giorni', value: 60 },
  ];

  if (isLoading && !stats.totalBooks && history.length === 0) {
    return (
      <div className="flex justify-center items-center h-[80vh]">
        <Loader2 className="w-16 h-16 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>Analisi Portfolio - KDP Insights Pro</title>
        <meta name="description" content="Analisi approfondita delle performance del tuo portfolio di libri." />
      </Helmet>
      <div className="container mx-auto">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-4">
            <div className="flex items-center gap-4">
              <BrainCircuit className="w-10 h-10 text-accent" />
              <div>
                <h1 className="text-4xl font-bold text-foreground">Analisi Portfolio</h1>
                <p className="text-lg text-muted-foreground">Visione d'insieme sulle performance dei tuoi libri.</p>
              </div>
            </div>
            <div className="bg-muted/50 p-1 rounded-lg border border-border">
              {periods.map(p => (
                <Button
                  key={p.value}
                  onClick={() => setPeriod(p.value)}
                  variant={period === p.value ? 'default' : 'ghost'}
                  className={`${period === p.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
                >
                  {p.label}
                </Button>
              ))}
            </div>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
          <StatCard icon={Book} label="Libri Totali" value={stats.totalBooks} color="from-blue-500 to-cyan-500" />
          <StatCard icon={DollarSign} label="Guadagno Mensile Stimato" value={stats.totalMonthlyIncome} trend={stats.portfolioIncomeTrend} formatFn={formatIncome} color="from-green-500 to-emerald-500" />
          <StatCard icon={TrendingUp} label="BSR Medio" value={stats.avgBsr.toLocaleString('it-IT')} trend={stats.portfolioBsrTrend} color="from-purple-500 to-pink-500" />
          <StatCard icon={Star} label="Recensioni Totali" value={stats.totalReviews.toLocaleString('it-IT')} color="from-yellow-500 to-orange-500" />
        </div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card p-6 mb-8 h-[50vh]">
            <h3 className="text-xl font-semibold mb-4">Andamento Portfolio</h3>
            {isLoading && history.length === 0 ? <div className="flex justify-center items-center h-full"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div> :
             history.length > 1 ? (
              <ResponsiveContainer width="100%" height="100%">
                 <AreaChart data={history} margin={{ top: 10, right: 30, left: 20, bottom: 20 }}>
                    <defs>
                      <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorBsr" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--secondary))" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="hsl(var(--secondary))" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.5)" />
                    <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" tickFormatter={(str) => new Date(str).toLocaleDateString('it-IT', {day: '2-digit', month: 'short'})} />
                    <YAxis yAxisId="left" stroke="hsl(var(--primary))" orientation="left" label={{ value: 'Guadagno (€)', angle: -90, position: 'insideLeft', fill: 'hsl(var(--primary))', style: {textAnchor: 'middle'} }} tickFormatter={(val) => `€${val.toLocaleString()}`}/>
                    <YAxis yAxisId="right" stroke="hsl(var(--secondary))" orientation="right" label={{ value: 'BSR Medio', angle: -90, position: 'insideRight', fill: 'hsl(var(--secondary))', style: {textAnchor: 'middle'} }} reversed={true} tickFormatter={(val) => val.toLocaleString()}/>
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ color: 'hsl(var(--foreground))', paddingTop: '20px' }} />
                    <Area yAxisId="left" type="monotone" dataKey="totalMonthlyIncome" name="Guadagno Stimato" stroke="hsl(var(--primary))" strokeWidth={2} fillOpacity={1} fill="url(#colorIncome)" />
                    <Area yAxisId="right" type="monotone" dataKey="avgBsr" name="BSR Medio" stroke="hsl(var(--secondary))" strokeWidth={2} fillOpacity={1} fill="url(#colorBsr)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
                 <div className="flex items-center justify-center h-full text-muted-foreground">Dati insufficienti per il grafico. Prova un periodo più lungo o aggiungi più libri.</div>
            )}
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <PerformerList 
              title="Top Performers (Miglior Trend BSR)" 
              data={topPerformers} 
              metricLabel={item => ({
                text: `${item.bsrChange.toLocaleString('it-IT')}`,
                color: 'text-green-400',
                icon: <ArrowDown className="w-4 h-4" />
              })} 
              icon={TrendingUp}
              iconColor="text-green-400"
            />
            <PerformerList 
              title="Worst Performers (Peggior Trend BSR)" 
              data={worstPerformers} 
              metricLabel={item => ({
                text: `+${item.bsrChange.toLocaleString('it-IT')}`,
                color: 'text-red-400',
                icon: <ArrowUp className="w-4 h-4" />
              })}
              icon={TrendingDown}
              iconColor="text-red-400"
            />
        </div>
      </div>
    </>
  );
};

export default PortfolioAnalysis;