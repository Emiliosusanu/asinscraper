import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, ReferenceLine, Brush } from 'recharts';
import { supabase } from '@/lib/customSupabaseClient';
import { Loader2, X, Wand2, AlertTriangle, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import DateRangePicker from '@/components/DateRangePicker';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { addDays, format } from 'date-fns';
import useLocalStorage from '@/hooks/useLocalStorage';
import BestsellerBadge from '@/components/BestsellerBadge';

// Custom tooltip with currency-aware formatting and compact layout
const CustomTooltip = ({ active, payload, label, currency }) => {
  if (!active || !payload || payload.length === 0) return null;
  const findVal = (key) => {
    const item = payload.find((p) => p?.dataKey === key || p?.name === key);
    return item?.value;
  };

  
  const bsr = findVal('BSR');
  const rev = findVal('Recensioni');
  const price = findVal('Prezzo');
  const deltaPct = findVal('BSRDeltaPct');
  const nf = new Intl.NumberFormat('it-IT');
  const cf = currency ? new Intl.NumberFormat('it-IT', { style: 'currency', currency }) : null;

  return (
    <div className="rounded-md border border-white/15 bg-slate-900/90 px-3 py-2 text-xs text-white shadow-xl backdrop-blur">
      <div className="font-semibold mb-1">{label}</div>
      <div className="space-y-0.5">
        {(typeof deltaPct === 'number' && isFinite(deltaPct)) && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-emerald-300">BSR Δ</span>
            <span className={`${deltaPct > 0 ? 'text-red-300' : 'text-yellow-300'}`}>{`${deltaPct > 0 ? '+' : ''}${deltaPct.toFixed(1)}%`}</span>
          </div>
        )}
        <div className="flex items-center justify-between gap-3">
          <span className="text-emerald-300">BSR</span>
          <span className="text-emerald-200">{(typeof bsr === 'number' && isFinite(bsr)) ? nf.format(bsr) : '—'}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-indigo-300">Recensioni</span>
          <span className="text-indigo-200">{(typeof rev === 'number' && isFinite(rev)) ? nf.format(rev) : '—'}</span>
        </div>
        {price != null && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-amber-300">Prezzo</span>
            <span className="text-amber-200">{(typeof price === 'number' && isFinite(price)) ? (cf ? cf.format(price) : nf.format(price)) : '—'}</span>
          </div>
        )}
      </div>
    </div>
  );
};

// Info: spiegazione dei controlli (IT)
const ControlsInfo = () => (
  <div className="text-xs text-gray-100 space-y-2">
    <div className="font-semibold text-gray-100">Guida rapida</div>
    <ul className="space-y-1.5">
      <li><span className="text-emerald-200 font-medium">Periodo rapido (7g, 30g, 90g):</span> imposta velocemente l'intervallo temporale.</li>
      <li><span className="text-emerald-200 font-medium">Selettore date:</span> personalizza l'intervallo (da / a).</li>
      <li><span className="text-emerald-200 font-medium">Normalizza:</span> aggrega i campioni giornalieri (BSR=min, Recensioni=max, Prezzo=media). Oggi mantiene i campioni intraday.</li>
      <li><span className="text-emerald-200 font-medium">Smussa:</span> media mobile 3pt su BSR/Prezzo per linee più fluide.</li>
      <li><span className="text-emerald-200 font-medium">Prezzo:</span> mostra/nasconde la serie Prezzo.</li>
      <li><span className="text-emerald-200 font-medium">Outlier:</span> attenua picchi isolati del BSR confrontando i valori vicini.</li>
      <li><span className="text-emerald-200 font-medium">Rec.↑:</span> impone la monotonia delle Recensioni (mai decrescente).</li>
      <li><span className="text-emerald-200 font-medium">Brush (desktop):</span> seleziona una finestra temporale direttamente nel mini-tracciato.</li>
      <li><span className="text-emerald-200 font-medium">Linee di riferimento:</span> BSR <em>Attuale</em>, <em>Migliore</em> (min storico), <em>Peggiore</em> (max storico).</li>
      <li><span className="text-emerald-200 font-medium">Colori BSR:</span> giallo = miglioramento (BSR in discesa), rosso = peggioramento (BSR in salita).</li>
    </ul>
    <div className="text-[11px] text-gray-400">Suggerimento: i pulsanti evidenziati in verde sono attivi.</div>
  </div>
);

const AsinTrendChart = ({ asinData, onClose }) => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState({
    from: addDays(new Date(), -60),
    to: new Date(),
  });
  const [normalize, setNormalize] = useLocalStorage('asinTrendChartNormalize', true);
  const [smooth, setSmooth] = useLocalStorage('asinTrendChartSmooth', false);
  const [showPrice, setShowPrice] = useLocalStorage('asinTrendChartShowPrice', true);
  const [guardOutliers, setGuardOutliers] = useLocalStorage('asinTrendChartGuardOutliers', true);
  const [fixReviews, setFixReviews] = useLocalStorage('asinTrendChartFixReviews', true);
  // Global neon mode toggle shared with other charts
  const [neonMode, setNeonMode] = useLocalStorage('neonChartsMode', true);
  const [isMobile, setIsMobile] = useState(false);
  const [bsrRange, setBsrRange] = useState({ min: null, max: null });
  // Mouse-follow glow in chart area
  const chartAreaRef = useRef(null);
  const modalRef = useRef(null);
  const [glow, setGlow] = useState({ on: false, x: 0, y: 0 });

  // Sanitize stray text nodes that may appear from third-party libs or templating glitches
  useEffect(() => {
    const container = modalRef.current;
    if (!container) return;
    const removeStrays = () => {
      try {
        const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
        const toRemove = [];
        let n = walker.nextNode();
        while (n) {
          const txt = (n.nodeValue || '').trim();
          if (txt === ')}' || txt === ')},' || txt === '{{ ... }}') {
            toRemove.push(n);
          }
          n = walker.nextNode();
        }
        toRemove.forEach(node => node.parentNode && node.parentNode.removeChild(node));
      } catch (_) {}
    };
    removeStrays();
    const t = setTimeout(removeStrays, 50);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const fetchHistory = async () => {
      setLoading(true);
      
      let query = supabase
        .from('asin_history')
        .select('created_at, bsr, review_count, price')
        .eq('asin_data_id', asinData.id);

      if (dateRange?.from) {
        query = query.gte('created_at', dateRange.from.toISOString());
      }
      if (dateRange?.to) {
        query = query.lte('created_at', dateRange.to.toISOString());
      }

      query = query.order('created_at', { ascending: true });

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching history:', error);
      } else {
        const formattedData = data.map(item => {
          const d = new Date(item.created_at);
          const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          const label = d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' });
          const time = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
          return {
            dateKey,
            date: label,
            BSR: Number(item.bsr),
            Recensioni: Number(item.review_count),
            Prezzo: Number(item.price),
            time,
            ts: d.getTime(),
          };
        });
        setHistory(formattedData);
      }
      setLoading(false);
    };

    if (asinData) {
      fetchHistory();
    }
  }, [asinData, dateRange]);

  useEffect(() => {
    // Track mobile layout for responsive tweaks
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(max-width: 640px)');
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const currency = useMemo(() => {
    const c = (asinData?.country || 'it').toLowerCase();
    if (c === 'com' || c === 'us') return 'USD';
    if (c === 'co.uk' || c === 'uk') return 'GBP';
    return 'EUR';
  }, [asinData?.country]);

  // Fetch global BSR range (ever) for this ASIN
  useEffect(() => {
    let cancelled = false;
    const loadRange = async () => {
      if (!asinData?.id) return;
      try {
        const { data: minRows } = await supabase
          .from('asin_history')
          .select('bsr')
          .eq('asin_data_id', asinData.id)
          .gt('bsr', 0)
          .order('bsr', { ascending: true })
          .limit(1);
        const { data: maxRows } = await supabase
          .from('asin_history')
          .select('bsr')
          .eq('asin_data_id', asinData.id)
          .gt('bsr', 0)
          .order('bsr', { ascending: false })
          .limit(1);
        const min = Number(minRows?.[0]?.bsr);
        const max = Number(maxRows?.[0]?.bsr);
        if (!cancelled) setBsrRange({ min: Number.isFinite(min) ? min : null, max: Number.isFinite(max) ? max : null });
      } catch (_) {}
    };
    loadRange();
    return () => { cancelled = true; };
  }, [asinData?.id]);

  // Number formatters
  const nfCompact = useMemo(() => new Intl.NumberFormat('it-IT', { notation: 'compact', maximumFractionDigits: 1 }), []);
  const nfPlain = useMemo(() => new Intl.NumberFormat('it-IT'), []);
  const fmtTick = useMemo(() => (v) => (typeof v === 'number' && isFinite(v)) ? nfCompact.format(v) : '', [nfCompact]);
  const fmtPriceTick = useMemo(() => (v) => {
    if (!(typeof v === 'number' && isFinite(v))) return '';
    try { return new Intl.NumberFormat('it-IT', { style: 'currency', currency }).format(v); } catch { return nfPlain.format(v); }
  }, [currency, nfPlain]);

  // Reserve vertical space inside the plot area so overlay labels never touch the chart
  const chartTopMargin = useMemo(() => (isMobile ? 56 : 64), [isMobile]);
  const chartBottomMargin = useMemo(() => (isMobile ? 28 : 28), [isMobile]);

  // Quick range setter (mobile)
  const setRangeDays = (days) => {
    const to = new Date();
    const from = addDays(new Date(), -days);
    setDateRange({ from, to });
  };

  // Centered range label (mobile-first), e.g., "Jul 12, 2025 - Sep 10, 2025"
  const rangeLabel = useMemo(() => {
    try {
      const f = dateRange?.from ? format(dateRange.from, 'MMM d, yyyy') : null;
      const t = dateRange?.to ? format(dateRange.to, 'MMM d, yyyy') : null;
      if (f && t) return `${f} - ${t}`;
      if (f) return `${f} - oggi`;
      if (t) return `fino a ${t}`;
    } catch (_) {}
    return '';
  }, [dateRange?.from, dateRange?.to]);

  // Minimal, elegant glass buttons for this chart only
  const baseBtnClass = 'rounded-full border border-white/10 bg-white/5 backdrop-blur-sm text-gray-200 hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-colors';
  const activeBtnClass = 'border-emerald-400/60 bg-emerald-500/15 text-emerald-200 shadow-[0_0_0_1px_rgba(16,185,129,0.35)_inset]';
  const toggleBtnClass = baseBtnClass;
  const quickBtnClass = baseBtnClass;

  // Quick-range active helper
  const activeRangeDays = useMemo(() => {
    const f = dateRange?.from, t = dateRange?.to;
    if (!f || !t) return null;
    const diff = Math.round((t.getTime() - f.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  }, [dateRange?.from, dateRange?.to]);
  const isRangeActive = (days) => activeRangeDays != null && Math.abs(activeRangeDays - days) <= 1;

  const dataForChart = useMemo(() => {
    if (!normalize) {
      // Clean raw history: zero-guard, optional monotonic reviews, optional outlier guard, optional smoothing
      if (history.length === 0) return history;
      const cleaned = history.map((row) => ({ ...row }));
      // forward-fill zero/invalid values
      let prevBSR = null, prevRev = null, prevPrice = null;
      for (const row of cleaned) {
        const b = Number(row.BSR);
        if (!isFinite(b) || b <= 0) { if (prevBSR != null) row.BSR = prevBSR; } else { prevBSR = b; }
        const r = Number(row.Recensioni);
        if (!isFinite(r) || r < 0) { if (prevRev != null) row.Recensioni = prevRev; } else { prevRev = r; }
        const p = Number(row.Prezzo);
        if (!isFinite(p) || p <= 0) { if (prevPrice != null) row.Prezzo = prevPrice; } else { prevPrice = p; }
      }
      // enforce non-decreasing reviews if requested
      if (fixReviews) {
        let prev = null;
        for (const row of cleaned) {
          const r = Number(row.Recensioni);
          if (Number.isFinite(r)) {
            if (prev != null && r < prev) row.Recensioni = prev;
            else prev = r;
          }
        }
      }
      // simple outlier guard for BSR relative to neighbors
      if (guardOutliers && cleaned.length > 2) {
        for (let i = 1; i < cleaned.length - 1; i++) {
          const prev = Number(cleaned[i-1].BSR);
          const curr = Number(cleaned[i].BSR);
          const next = Number(cleaned[i+1].BSR);
          if ([prev, curr, next].every(v => Number.isFinite(v) && v > 0)) {
            const hi = Math.max(prev, next);
            const lo = Math.min(prev, next);
            if (curr > hi * 4 || curr < lo / 4) {
              cleaned[i].BSR = Math.round((prev + next) / 2);
            }
          }
        }
      }
      if (!smooth) {
        // annotate BSR trend arrows and delta on cleaned
        const annotated = cleaned.map(r => ({ ...r }));
        for (let i = 1; i < annotated.length; i++) {
          const prev = Number(annotated[i-1].BSR);
          const curr = Number(annotated[i].BSR);
          if (Number.isFinite(prev) && Number.isFinite(curr) && prev > 0) {
            const rel = (prev - curr) / prev; // positive => improvement (down)
            annotated[i].BSRTrend = Math.abs(rel) >= 0.03 ? (rel > 0 ? 'down' : 'up') : 'flat';
            annotated[i].BSRDeltaPct = ((curr - prev) / prev) * 100;
          } else {
            annotated[i].BSRTrend = 'flat';
            annotated[i].BSRDeltaPct = null;
          }
        }
        const painted = annotated.map(r => ({ ...r }));
        for (let i = 1; i < painted.length; i++) {
          const p = painted[i-1];
          const c = painted[i];
          const prev = Number(p.BSR), curr = Number(c.BSR);
          if (Number.isFinite(prev) && Number.isFinite(curr) && prev > 0) {
            if (curr > prev) { p.BSR_UP = prev; c.BSR_UP = curr; }
            else if (curr < prev) { p.BSR_DOWN = prev; c.BSR_DOWN = curr; }
          }
        }
        return painted;
      }
      // smoothing
      const smoothed = [...cleaned];
      const win = 3;
      for (let i = 0; i < smoothed.length; i++) {
        const from = Math.max(0, i - Math.floor(win / 2));
        const to = Math.min(smoothed.length - 1, i + Math.floor(win / 2));
        const slice = smoothed.slice(from, to + 1);
        const bsrVals = slice.map(r => r.BSR).filter(v => Number.isFinite(v) && v > 0);
        const priceVals = slice.map(r => r.Prezzo).filter(v => Number.isFinite(v) && v > 0);
        if (bsrVals.length) smoothed[i] = { ...smoothed[i], BSR: Math.round(bsrVals.reduce((a,b)=>a+b,0)/bsrVals.length) };
        if (priceVals.length) smoothed[i] = { ...smoothed[i], Prezzo: Number((priceVals.reduce((a,b)=>a+b,0)/priceVals.length).toFixed(2)) };
      }
      // annotate BSR trend arrows based on relative change > 3%
      for (let i = 1; i < smoothed.length; i++) {
        const prev = Number(smoothed[i-1].BSR);
        const curr = Number(smoothed[i].BSR);
        if (Number.isFinite(prev) && Number.isFinite(curr) && prev > 0) {
          const rel = (prev - curr) / prev; // positive => BSR improved (down)
          smoothed[i].BSRTrend = Math.abs(rel) >= 0.03 ? (rel > 0 ? 'down' : 'up') : 'flat';
          smoothed[i].BSRDeltaPct = ((curr - prev) / prev) * 100;
        } else {
          smoothed[i].BSRTrend = 'flat';
          smoothed[i].BSRDeltaPct = null;
        }
      }
      // paint red/yellow segments
      const painted = smoothed.map(r => ({ ...r }));
      for (let i = 1; i < painted.length; i++) {
        const p = painted[i-1];
        const c = painted[i];
        const prev = Number(p.BSR), curr = Number(c.BSR);
        if (Number.isFinite(prev) && Number.isFinite(curr) && prev > 0) {
          if (curr > prev) { // worse
            p.BSR_UP = prev; c.BSR_UP = curr;
          } else if (curr < prev) { // better
            p.BSR_DOWN = prev; c.BSR_DOWN = curr;
          }
        }
      }
      return painted;
    }
    // Group by dateKey (keep all intraday samples for 'today', aggregate previous days)
    const groups = new Map();
    for (const it of history) {
      const key = it.dateKey;
      if (!key) continue;
      const arr = groups.get(key) || [];
      arr.push(it);
      groups.set(key, arr);
    }
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const sortedKeys = Array.from(groups.keys()).sort((a, b) => a.localeCompare(b));
    // Typical (median) BSR to detect unrealistic '1' values for non-bestsellers
    const bsrAll = history.map(r => Number(r.BSR)).filter(v => Number.isFinite(v) && v > 0).sort((a,b)=>a-b);
    const medianBSR = bsrAll.length ? bsrAll[Math.floor(bsrAll.length/2)] : Infinity;

    const normalized = [];
    let prevBSR = null, prevRev = null, prevPrice = null;
    for (const key of sortedKeys) {
      const arr = (groups.get(key) || []).slice();
      const [y, m, d] = key.split('-').map(Number);
      const label = new Date(y, (m || 1) - 1, d || 1).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' });
      const isToday = key === todayKey;
      if (!isToday) {
        // Aggregate previous days: keep higher for BSR, Reviews, Price; zero => carry, 1 with high median => carry
        const bsrCand = arr
          .map(s => Number(s.BSR))
          .filter(v => Number.isFinite(v) && v > 0 && !(v === 1 && medianBSR > 10000));
        const revCand = arr
          .map(s => Number(s.Recensioni))
          .filter(v => Number.isFinite(v) && v > 0);
        const priceCand = arr
          .map(s => Number(s.Prezzo))
          .filter(v => Number.isFinite(v) && v > 0);

        const aggBSR = bsrCand.length ? Math.max(...bsrCand) : (prevBSR != null ? prevBSR : null);
        const aggRev = revCand.length ? Math.max(...revCand) : (prevRev != null ? prevRev : null);
        const aggPrice = priceCand.length ? Math.max(...priceCand) : (prevPrice != null ? prevPrice : null);

        normalized.push({ dateKey: key, date: label, BSR: aggBSR, Recensioni: aggRev, Prezzo: aggPrice });
        if (Number.isFinite(aggBSR)) prevBSR = aggBSR;
        if (Number.isFinite(aggRev)) prevRev = aggRev;
        if (Number.isFinite(aggPrice)) prevPrice = aggPrice;
      } else {
        // Today: keep all intraday samples (sorted), adjust 0/1 using yesterday's carry
        arr.sort((a,b)=> (a.ts||0) - (b.ts||0));
        for (const s of arr) {
          let b = Number(s.BSR);
          if (!Number.isFinite(b) || b <= 0 || (b === 1 && medianBSR > 10000)) b = prevBSR != null ? prevBSR : null;
          let r = Number(s.Recensioni);
          if (!Number.isFinite(r) || r <= 0) r = prevRev != null ? prevRev : null;
          let p = Number(s.Prezzo);
          if (!Number.isFinite(p) || p <= 0) p = prevPrice != null ? prevPrice : null;

          normalized.push({ dateKey: key, date: s.time || label, BSR: b, Recensioni: r, Prezzo: p });
          if (Number.isFinite(b)) prevBSR = b;
          if (Number.isFinite(r)) prevRev = r;
          if (Number.isFinite(p)) prevPrice = p;
        }
      }
    }

    // Forward-fill: if a day's BSR/Reviews/Price are null/0, use previous day's value
    let ffBSR = null;
    let ffRev = null;
    let ffPrice = null;
    for (const row of normalized) {
      const b = Number(row.BSR);
      if (!isFinite(b) || b === 0) {
        if (ffBSR != null) row.BSR = ffBSR;
      } else {
        ffBSR = b;
      }

      const r = Number(row.Recensioni);
      if (!isFinite(r) || r === 0) {
        if (ffRev != null) row.Recensioni = ffRev;
      } else {
        ffRev = r;
      }

      const p = Number(row.Prezzo);
      if (!isFinite(p) || p === 0) {
        if (ffPrice != null) row.Prezzo = ffPrice;
      } else {
        ffPrice = p;
      }
    }
    // Ensure non-decreasing reviews across days if requested
    if (fixReviews) {
      let prev = null;
      for (const row of normalized) {
        const r = Number(row.Recensioni);
        if (Number.isFinite(r)) {
          if (prev != null && r < prev) row.Recensioni = prev;
          else prev = r;
        }
      }
    }
    // Outlier guard for BSR (compare with neighbors)
    if (guardOutliers && normalized.length > 2) {
      for (let i = 1; i < normalized.length - 1; i++) {
        const prev = Number(normalized[i-1].BSR);
        const curr = Number(normalized[i].BSR);
        const next = Number(normalized[i+1].BSR);
        if ([prev, curr, next].every(v => Number.isFinite(v) && v > 0)) {
          const hi = Math.max(prev, next);
          const lo = Math.min(prev, next);
          if (curr > hi * 4 || curr < lo / 4) {
            normalized[i].BSR = Math.round((prev + next) / 2);
          }
        }
      }
    }
    if (!smooth) {
      // annotate BSR trend arrows
      for (let i = 1; i < normalized.length; i++) {
        const prev = Number(normalized[i-1].BSR);
        const curr = Number(normalized[i].BSR);
        if (Number.isFinite(prev) && Number.isFinite(curr) && prev > 0) {
          const rel = (prev - curr) / prev;
          normalized[i].BSRTrend = Math.abs(rel) >= 0.03 ? (rel > 0 ? 'down' : 'up') : 'flat';
          normalized[i].BSRDeltaPct = ((curr - prev) / prev) * 100;
        } else {
          normalized[i].BSRTrend = 'flat';
          normalized[i].BSRDeltaPct = null;
        }
      }
      // paint red/yellow segments
      const painted = normalized.map(r => ({ ...r }));
      for (let i = 1; i < painted.length; i++) {
        const p = painted[i-1];
        const c = painted[i];
        const prev = Number(p.BSR), curr = Number(c.BSR);
        if (Number.isFinite(prev) && Number.isFinite(curr) && prev > 0) {
          if (curr > prev) { p.BSR_UP = prev; c.BSR_UP = curr; }
          else if (curr < prev) { p.BSR_DOWN = prev; c.BSR_DOWN = curr; }
        }
      }
      return painted;
    }
    // Simple 3-point moving average smoothing for BSR and Prezzo
    const win = 3;
    const smoothed = [...normalized];
    for (let i = 0; i < smoothed.length; i++) {
      const from = Math.max(0, i - Math.floor(win / 2));
      const to = Math.min(smoothed.length - 1, i + Math.floor(win / 2));
      const slice = smoothed.slice(from, to + 1);
      const bsrVals = slice.map(r => r.BSR).filter(v => Number.isFinite(v) && v > 0);
      const priceVals = slice.map(r => r.Prezzo).filter(v => Number.isFinite(v) && v > 0);
      if (bsrVals.length) smoothed[i] = { ...smoothed[i], BSR: Math.round(bsrVals.reduce((a,b)=>a+b,0)/bsrVals.length) };
      if (priceVals.length) smoothed[i] = { ...smoothed[i], Prezzo: Number((priceVals.reduce((a,b)=>a+b,0)/priceVals.length).toFixed(2)) };
    }
    // annotate BSR trend arrows
    for (let i = 1; i < smoothed.length; i++) {
      const prev = Number(smoothed[i-1].BSR);
      const curr = Number(smoothed[i].BSR);
      if (Number.isFinite(prev) && Number.isFinite(curr) && prev > 0) {
        const rel = (prev - curr) / prev;
        smoothed[i].BSRTrend = Math.abs(rel) >= 0.03 ? (rel > 0 ? 'down' : 'up') : 'flat';
        smoothed[i].BSRDeltaPct = ((curr - prev) / prev) * 100;
      } else {
        smoothed[i].BSRTrend = 'flat';
        smoothed[i].BSRDeltaPct = null;
      }
    }
    // paint red/yellow segments
    const painted = smoothed.map(r => ({ ...r }));
    for (let i = 1; i < painted.length; i++) {
      const p = painted[i-1];
      const c = painted[i];
      const prev = Number(p.BSR), curr = Number(c.BSR);
      if (Number.isFinite(prev) && Number.isFinite(curr) && prev > 0) {
        if (curr > prev) { p.BSR_UP = prev; c.BSR_UP = curr; }
        else if (curr < prev) { p.BSR_DOWN = prev; c.BSR_DOWN = curr; }
      }
    }
    return painted;
  }, [history, normalize, smooth, guardOutliers, fixReviews]);

  // Current BSR (latest valid point from the visible data)
  const currentBSR = useMemo(() => {
    const arr = dataForChart || [];
    for (let i = arr.length - 1; i >= 0; i--) {
      const b = Number(arr[i]?.BSR);
      if (Number.isFinite(b) && b > 0) return b;
    }
    return null;
  }, [dataForChart]);

  // Display min/max (global if available, otherwise fallback to loaded history)
  const displayMin = useMemo(() => {
    const gmin = Number(bsrRange?.min);
    if (Number.isFinite(gmin) && gmin > 0) return gmin;
    const xs = (history || []).map(r => Number(r?.BSR)).filter(v => Number.isFinite(v) && v > 0);
    return xs.length ? Math.min(...xs) : null;
  }, [bsrRange?.min, history]);
  const displayMax = useMemo(() => {
    const gmax = Number(bsrRange?.max);
    if (Number.isFinite(gmax) && gmax > 0) return gmax;
    const xs = (history || []).map(r => Number(r?.BSR)).filter(v => Number.isFinite(v) && v > 0);
    return xs.length ? Math.max(...xs) : null;
  }, [bsrRange?.max, history]);

  // Position of current BSR within the range [min..max]
  const bsrRangePos = useMemo(() => {
    const min = Number(displayMin);
    const max = Number(displayMax);
    const curr = Number(currentBSR);
    if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(curr) || max <= min) return null;
    let pos = (curr - min) / (max - min);
    pos = Math.max(0, Math.min(1, pos));
    return pos;
  }, [displayMin, displayMax, currentBSR]);

  const bsrPerfLabel = useMemo(() => {
    if (bsrRangePos == null) return null;
    if (bsrRangePos <= 0.12) return 'Migliore';
    if (bsrRangePos >= 0.88) return 'Peggiore';
    if (bsrRangePos <= 0.5) return 'Buona';
    return 'In calo';
  }, [bsrRangePos]);

  // Tint for pulsing halo on the range marker
  const perfTint = useMemo(() => {
    switch (bsrPerfLabel) {
      case 'Migliore':
        return 'rgba(250,204,21,0.45)'; // yellow-400
      case 'Peggiore':
        return 'rgba(239,68,68,0.45)'; // red-500
      case 'Buona':
        return 'rgba(52,211,153,0.45)'; // emerald-400
      case 'In calo':
        return 'rgba(59,130,246,0.38)'; // blue-500
      default:
        return 'rgba(255,255,255,0.35)';
    }
  }, [bsrPerfLabel]);

  // 7-day BSR delta (%). Positive value = BSR increased (worse), negative = decreased (better)
  const bsrDelta7 = useMemo(() => {
    const arr = dataForChart || [];
    if (arr.length < 8) return null;
    // Find last valid BSR
    let lastIdx = arr.length - 1;
    let last = null;
    for (let i = arr.length - 1; i >= 0; i--) {
      const b = Number(arr[i]?.BSR);
      if (Number.isFinite(b) && b > 0) { last = b; lastIdx = i; break; }
    }
    if (last == null) return null;
    // Find value ~7 points earlier (approx daily)
    let prev = null;
    let seen = 0;
    for (let j = lastIdx - 1; j >= 0; j--) {
      const b = Number(arr[j]?.BSR);
      if (Number.isFinite(b) && b > 0) {
        seen++;
        if (seen === 7) { prev = b; break; }
      }
    }
    if (prev == null || prev <= 0) return null;
    return ((last - prev) / prev) * 100;
  }, [dataForChart]);

  // Custom dot: minimal chevron markers placed NEAR the line; pulsing halo only if neonMode
  const TrendArrowDot = (props) => {
    const { cx, cy, payload } = props || {};
    const t = payload?.BSRTrend;
    if (!cx || !cy || !t || t === 'flat') return null;
    const color = t === 'up' ? '#ef4444' : '#fbbf24';
    // Recharts YAxis for BSR is reversed; screen goes DOWN when t === 'up' (worse), UP when t === 'down' (better)
    const reversedYAxis = true;
    const screenDown = reversedYAxis ? (t === 'up') : (t === 'down');
    const rotate = screenDown ? 180 : 0; // point chevron in the screen direction
    // Offset arrows near the line: below if screenDown, above otherwise
    const offset = 8; // px
    const ox = 0;
    const oy = screenDown ? offset : -offset;
    return (
      <g transform={`translate(${cx + ox}, ${cy + oy}) rotate(${rotate})`}>
        {neonMode && (
          <g filter="url(#pulseHalo)">
            <circle r="0" fill={color} opacity="0.22">
              <animate attributeName="r" values="0;7;0" dur="2.2s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.22;0;0.22" dur="2.2s" repeatCount="indefinite" />
            </circle>
          </g>
        )}
        {/* subtle glow underlay for chevron */}
        <path d="M -5 0 L 0 -4 L 5 0" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" opacity="0.18" />
        {/* minimal main chevron */}
        <path d="M -5 0 L 0 -4 L 5 0" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" opacity="0.98" />
      </g>
    );
  };

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
          className="bg-gradient-to-br from-[#0b1020] to-[#0d1b2a] border border-white/5 rounded-2xl shadow-2xl w-full max-w-[1200px] xl:max-w-[1400px] h-full max-h-[90vh] flex flex-col p-6"
          ref={modalRef}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Local keyframes for shimmer/pulse */}
          <style>{`
            @keyframes shineMove { 0% { transform: translateX(-120%); } 100% { transform: translateX(120%); } }
            @keyframes beamPulse { 0%, 100% { opacity: 0.25; } 50% { opacity: 0.8; } }
            @keyframes knobGlow { 0%, 100% { box-shadow: 0 0 12px rgba(255,255,255,0.35); } 50% { box-shadow: 0 0 18px rgba(255,255,255,0.7); } }
          `}</style>
          <div className="flex justify-between items-center mb-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-white font-semibold truncate text-lg sm:text-xl md:text-2xl" title={asinData.title}>{asinData.title}</h2>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {isMobile ? (
                <>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button size="xs" variant="outline" className={`${toggleBtnClass} px-3`}>Tune</Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-64 bg-slate-900 border-slate-700 text-gray-100">
                      <div className="space-y-2 text-sm">
                        <div className="font-semibold text-gray-200">Periodo rapido</div>
                        <div className="flex items-center gap-2">
                          <Button size="xs" variant="outline" className={`${quickBtnClass} ${isRangeActive(7) ? activeBtnClass : ''}`} aria-pressed={isRangeActive(7)} onClick={() => setRangeDays(7)}>7g</Button>
                          <Button size="xs" variant="outline" className={`${quickBtnClass} ${isRangeActive(30) ? activeBtnClass : ''}`} aria-pressed={isRangeActive(30)} onClick={() => setRangeDays(30)}>30g</Button>
                          <Button size="xs" variant="outline" className={`${quickBtnClass} ${isRangeActive(90) ? activeBtnClass : ''}`} aria-pressed={isRangeActive(90)} onClick={() => setRangeDays(90)}>90g</Button>
                        </div>
                        <div className="font-semibold text-gray-200 pt-2">Filtri</div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Button size="xs" variant="outline" title="Aggrega i campioni giornalieri (BSR=min, Recensioni=max, Prezzo=media)" className={`${toggleBtnClass} ${normalize ? activeBtnClass : ''}`} aria-pressed={!!normalize} onClick={() => setNormalize(v => !v)}>Normalizza</Button>
                          <Button size="xs" variant="outline" title="Smussa BSR/Prezzo con una media mobile a 3 punti" className={`${toggleBtnClass} ${smooth ? activeBtnClass : ''}`} aria-pressed={!!smooth} onClick={() => setSmooth(v => !v)}><Wand2 className="w-3.5 h-3.5 mr-1" />Smussa</Button>
                          <Button size="xs" variant="outline" title="Mostra/Nasconde la serie Prezzo" className={`${toggleBtnClass} ${showPrice ? activeBtnClass : ''}`} aria-pressed={!!showPrice} onClick={() => setShowPrice(v => !v)}>Prezzo</Button>
                          <Button size="xs" variant="outline" title="Attenua spike isolati nel BSR confrontando i valori vicini" className={`${toggleBtnClass} ${guardOutliers ? activeBtnClass : ''}`} aria-pressed={!!guardOutliers} onClick={() => setGuardOutliers(v => !v)}><AlertTriangle className="w-3.5 h-3.5 mr-1" />Outlier</Button>
                          <Button size="xs" variant="outline" title="Rende monotona la serie Recensioni (mai decrescente)" className={`${toggleBtnClass} ${fixReviews ? activeBtnClass : ''}`} aria-pressed={!!fixReviews} onClick={() => setFixReviews(v => !v)}>Rec.↑</Button>
                          <Button size="xs" variant="outline" title="Abilita/Disabilita effetto neon e pulsazioni" className={`${toggleBtnClass} ${neonMode ? activeBtnClass : ''}`} aria-pressed={!!neonMode} onClick={() => setNeonMode(v => !v)}>Neon</Button>
                        </div>
                        <div className="text-[11px] text-gray-400 pt-1">• Smussa: media mobile 3pt per linee più fluide. • Outlier: riduce picchi isolati sul BSR.</div>
                        <div className="font-semibold text-gray-200 pt-2">Data</div>
                        <DateRangePicker date={dateRange} setDate={setDateRange} />
                      </div>
                    </PopoverContent>
                  </Popover>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button size="xs" variant="outline" className={`${toggleBtnClass} px-2`} title="Informazioni sui controlli">
                        <Info className="w-3.5 h-3.5" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-96 max-w-[24rem] bg-slate-900 border-slate-700 text-gray-100">
                      <ControlsInfo />
                    </PopoverContent>
                  </Popover>
                </>
              ) : (
                <div className="hidden sm:flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <Button size="xs" variant="outline" className={`${quickBtnClass} ${isRangeActive(7) ? activeBtnClass : ''}`} aria-pressed={isRangeActive(7)} onClick={() => setRangeDays(7)}>7g</Button>
                    <Button size="xs" variant="outline" className={`${quickBtnClass} ${isRangeActive(30) ? activeBtnClass : ''}`} aria-pressed={isRangeActive(30)} onClick={() => setRangeDays(30)}>30g</Button>
                    <Button size="xs" variant="outline" className={`${quickBtnClass} ${isRangeActive(90) ? activeBtnClass : ''}`} aria-pressed={isRangeActive(90)} onClick={() => setRangeDays(90)}>90g</Button>
                  </div>
                  <div className="hidden sm:block min-w-[480px]">
                    <DateRangePicker date={dateRange} setDate={setDateRange} />
                  </div>
                  <Button onClick={() => setNormalize(v => !v)} variant="outline" size="xs" title="Aggrega i campioni giornalieri (BSR=min, Recensioni=max, Prezzo=media)" className={`${toggleBtnClass} ${normalize ? activeBtnClass : ''}`} aria-pressed={!!normalize}>{normalize ? 'Normalizza: ON' : 'Normalizza: OFF'}</Button>
                  <Button onClick={() => setSmooth(v => !v)} variant="outline" size="xs" title="Smussa BSR/Prezzo con una media mobile a 3 punti" className={`${toggleBtnClass} ${smooth ? activeBtnClass : ''}`} aria-pressed={!!smooth}>{smooth ? <><Wand2 className="w-3.5 h-3.5 mr-1" />Smussa: ON</> : <><Wand2 className="w-3.5 h-3.5 mr-1" />Smussa: OFF</>}</Button>
                  <Button onClick={() => setShowPrice(v => !v)} variant="outline" size="xs" title="Mostra/Nasconde la serie Prezzo" className={`${toggleBtnClass} ${showPrice ? activeBtnClass : ''}`} aria-pressed={!!showPrice}>{showPrice ? 'Prezzo: ON' : 'Prezzo: OFF'}</Button>
                  <Button onClick={() => setGuardOutliers(v => !v)} variant="outline" size="xs" title="Attenua spike isolati nel BSR confrontando i valori vicini" className={`${toggleBtnClass} ${guardOutliers ? activeBtnClass : ''}`} aria-pressed={!!guardOutliers}>{guardOutliers ? <><AlertTriangle className="w-3.5 h-3.5 mr-1" />Outlier: ON</> : <><AlertTriangle className="w-3.5 h-3.5 mr-1" />Outlier: OFF</>}</Button>
                  <Button onClick={() => setNeonMode(v => !v)} variant="outline" size="xs" title="Abilita/Disabilita effetto neon e pulsazioni" className={`${toggleBtnClass} ${neonMode ? activeBtnClass : ''}`} aria-pressed={!!neonMode}>{neonMode ? 'Neon: ON' : 'Neon: OFF'}</Button>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button size="xs" variant="outline" className={`${toggleBtnClass} px-2`} title="Informazioni sui controlli">
                        <Info className="w-3.5 h-3.5" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-96 max-w-[24rem] bg-slate-900 border-slate-700 text-gray-100">
                      <ControlsInfo />
                    </PopoverContent>
                  </Popover>
                </div>
              )}
              <Button onClick={onClose} size="iconSm" variant="ghost" className="text-white/70 hover:text-white hover:bg-white/10 ml-1">
                <X className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {/* BSR range bar (min..max ever) with current position */}
          {(displayMin != null && displayMax != null && currentBSR != null && bsrRangePos != null) && (
            <div className="mb-3 sm:mb-4 flex flex-col items-center">
              <div className="text-[11px] sm:text-xs text-gray-300 mb-1">
                Prestazioni BSR · <span className="text-emerald-300">migliore</span> ↔ <span className="text-red-300">peggiore</span>
              </div>
              <div className="w-full max-w-md sm:max-w-lg">
                <div className="relative h-3 rounded-full bg-gradient-to-r from-yellow-400/60 via-orange-400/60 to-red-500/60 border border-white/15 shadow-inner overflow-hidden">
                  {/* animated shimmer across the bar */}
                  <div className="pointer-events-none absolute inset-0 overflow-hidden">
                    <div
                      className="absolute top-0 -left-1/3 h-full"
                      style={{ width: '36%', background: 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.14) 50%, rgba(255,255,255,0) 100%)', animation: 'shineMove 2800ms linear infinite' }}
                    />
                  </div>
                  <div
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2"
                    style={{ left: `${(bsrRangePos * 100).toFixed(1)}%` }}
                  >
                    <div className="relative">
                      {/* pulsing halo ring */}
                      <span className="pointer-events-none absolute -inset-3 rounded-full blur-md animate-ping" style={{ backgroundColor: perfTint }} />
                      {/* static glow underlay */}
                      <span className="pointer-events-none absolute -inset-1 rounded-full blur-sm" style={{ backgroundColor: perfTint, opacity: 0.55 }} />
                      {/* vertical beam */}
                      <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 h-8 w-[2px] rounded-full bg-white/40 blur-[1px]" style={{ animation: 'beamPulse 2400ms ease-in-out infinite' }} />
                      {/* main knob */}
                      <div className="h-4 w-4 rounded-full bg-white/90 border border-white/60" style={{ animation: 'knobGlow 2200ms ease-in-out infinite' }} />
                    </div>
                  </div>
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[11px] sm:text-xs text-gray-300">
                  <div className="flex items-center gap-1">
                    <span className="text-yellow-300">Migliore</span>
                    <span className="opacity-80">BSR</span>
                    <span className="text-gray-100 font-medium">{nfPlain.format(displayMin)}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="opacity-80">Attuale</span>
                    <span className={`font-semibold ${bsrPerfLabel==='Migliore'?'text-yellow-300':bsrPerfLabel==='Peggiore'?'text-red-300':'text-gray-100'}`}>{nfPlain.format(currentBSR)}</span>
                    <span className="text-gray-400">({bsrPerfLabel})</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="opacity-80">BSR</span>
                    <span className="text-gray-100 font-medium">{nfPlain.format(displayMax)}</span>
                    <span className="text-red-300">Peggiore</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {isMobile && (
            <div className="mb-2 text-center text-[11px] text-gray-400 whitespace-nowrap">
              {rangeLabel}
            </div>
          )}

          {isMobile && (
            <div className="mb-3 flex items-center gap-2 overflow-x-auto justify-center">
              <Button size="xs" variant="outline" className={`${quickBtnClass} ${isRangeActive(7) ? activeBtnClass : ''}`} aria-pressed={isRangeActive(7)} onClick={() => setRangeDays(7)}>7g</Button>
              <Button size="xs" variant="outline" className={`${quickBtnClass} ${isRangeActive(30) ? activeBtnClass : ''}`} aria-pressed={isRangeActive(30)} onClick={() => setRangeDays(30)}>30g</Button>
              <Button size="xs" variant="outline" className={`${quickBtnClass} ${isRangeActive(90) ? activeBtnClass : ''}`} aria-pressed={isRangeActive(90)} onClick={() => setRangeDays(90)}>90g</Button>
              <Button
                size="xs"
                variant="outline"
                className={`${toggleBtnClass} ${normalize ? activeBtnClass : ''}`}
                title="Aggrega i campioni giornalieri (BSR=min, Recensioni=max, Prezzo=media)"
                aria-pressed={!!normalize}
                onClick={() => setNormalize(v => !v)}
              >{normalize ? 'Normalizza' : 'Normalizza Off'}</Button>
            </div>
          )}

          <div className="flex-grow">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-12 h-12 text-white animate-spin" />
              </div>
            ) : dataForChart.length > 1 ? (
              <div
                ref={chartAreaRef}
                className="relative h-full"
                onMouseMove={(e) => {
                  const el = chartAreaRef.current;
                  if (!el) return;
                  const r = el.getBoundingClientRect();
                  setGlow({ on: true, x: e.clientX - r.left, y: e.clientY - r.top });
                }}
                onMouseEnter={(e) => {
                  const el = chartAreaRef.current;
                  if (!el) return;
                  const r = el.getBoundingClientRect();
                  setGlow({ on: true, x: e.clientX - r.left, y: e.clientY - r.top });
                }}
                onMouseLeave={() => setGlow((g) => ({ ...g, on: false }))}
              >
                {/* mouse-follow glow overlay (non-interactive) */}
                <div
                  aria-hidden
                  className={`pointer-events-none absolute inset-0 z-10 transition-opacity duration-150 ${glow.on ? 'opacity-100' : 'opacity-0'}`}
                  style={{
                    background: `radial-gradient(180px circle at ${glow.x}px ${glow.y}px, rgba(255,255,255,0.07), rgba(255,255,255,0) 60%)`
                  }}
                />
                {/* Overlay bar (reserved space) */}
                <div className="absolute inset-x-0 top-0 z-20 px-3 sm:px-4 pt-1">
                  <div className="h-9 sm:h-10 flex items-center justify-between pointer-events-none">
                    <div>
                      <span className="text-[11px] sm:text-xs text-white/80 bg-white/10 px-2 py-0.5 rounded-full border border-white/15 backdrop-blur">
                        Andamento storico
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {asinData?.is_bestseller && (
                        <div className="rounded-full bg-amber-400/10 px-2 py-0.5 border border-amber-300/30 backdrop-blur flex items-center gap-1 shadow-sm">
                          <BestsellerBadge small />
                          <span className="text-[10px] sm:text-xs text-amber-200 font-medium">Bestseller</span>
                        </div>
                      )}
                      {typeof bsrDelta7 === 'number' && isFinite(bsrDelta7) && (
                        <span className={`text-[10px] sm:text-xs px-2 py-0.5 rounded-full border backdrop-blur font-medium ${bsrDelta7 > 0 ? 'text-red-300 bg-red-500/10 border-red-500/20' : 'text-yellow-300 bg-yellow-500/10 border-yellow-500/20'}`}>
                          Δ7g {bsrDelta7 > 0 ? '+' : ''}{bsrDelta7.toFixed(1)}%
                        </span>
                      )}
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-gray-200/90 flex items-center gap-1">
                          <span className="inline-block w-2.5 h-2.5 rounded-full" style={{background:'#34d399'}}></span> BSR
                        </span>
                        <span className="text-[11px] text-gray-200/90 flex items-center gap-1">
                          <span className="inline-block w-2.5 h-2.5 rounded-full" style={{background:'#818cf8'}}></span> Recensioni
                        </span>
                        {showPrice && (
                          <span className="text-[11px] text-gray-200/90 flex items-center gap-1">
                            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{background:'#f59e0b'}}></span> Prezzo
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dataForChart} margin={{ top: chartTopMargin, right: 30, left: 20, bottom: chartBottomMargin }}>
                  <defs>
                    <linearGradient id="gradBSR" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#34d399" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradREV" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#818cf8" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="#818cf8" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradPRICE" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                    {/* gradient strokes for glowing lines */}
                    <linearGradient id="strokeBSR" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#34d399" />
                      <stop offset="100%" stopColor="#059669" />
                    </linearGradient>
                    <linearGradient id="strokeREV" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#818cf8" />
                      <stop offset="100%" stopColor="#4f46e5" />
                    </linearGradient>
                    <linearGradient id="strokePRICE" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f59e0b" />
                      <stop offset="100%" stopColor="#d97706" />
                    </linearGradient>
                    {/* subtle glow filters for underlines */}
                    <filter id="glowBSR" x="-50%" y="-50%" width="200%" height="200%">
                      <feGaussianBlur stdDeviation="2.25" result="coloredBlur" />
                      <feMerge>
                        <feMergeNode in="coloredBlur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                    <filter id="glowREV" x="-50%" y="-50%" width="200%" height="200%">
                      <feGaussianBlur stdDeviation="2" result="coloredBlur" />
                      <feMerge>
                        <feMergeNode in="coloredBlur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                    <filter id="glowPRICE" x="-50%" y="-50%" width="200%" height="200%">
                      <feGaussianBlur stdDeviation="1.8" result="coloredBlur" />
                      <feMerge>
                        <feMergeNode in="coloredBlur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                    {/* pulsing animated line glows */}
                    <filter id="pulseLineBSR" x="-50%" y="-50%" width="200%" height="200%">
                      <feGaussianBlur stdDeviation="2.2" result="blur">
                        <animate attributeName="stdDeviation" values="1.6;3.2;1.6" dur="3s" repeatCount="indefinite" />
                      </feGaussianBlur>
                      <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                    <filter id="pulseLineREV" x="-50%" y="-50%" width="200%" height="200%">
                      <feGaussianBlur stdDeviation="1.8" result="blur">
                        <animate attributeName="stdDeviation" values="1.2;2.4;1.2" dur="3.2s" repeatCount="indefinite" />
                      </feGaussianBlur>
                      <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                    <filter id="pulseLinePRICE" x="-50%" y="-50%" width="200%" height="200%">
                      <feGaussianBlur stdDeviation="1.6" result="blur">
                        <animate attributeName="stdDeviation" values="1;2;1" dur="3.4s" repeatCount="indefinite" />
                      </feGaussianBlur>
                      <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                    {/* pulsing halo for markers */}
                    <filter id="pulseHalo" x="-100%" y="-100%" width="300%" height="300%">
                      <feGaussianBlur stdDeviation="4" result="blur" />
                      <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  </defs>
                  <CartesianGrid strokeDasharray="2 6" stroke="rgba(255, 255, 255, 0.08)" />
                  <XAxis
                    dataKey="date"
                    stroke="rgba(255, 255, 255, 0.55)"
                    tick={{ fontSize: isMobile ? 10 : 12 }}
                    interval="preserveStartEnd"
                    minTickGap={isMobile ? 4 : 8}
                    tickMargin={isMobile ? 6 : 10}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="left"
                    stroke="rgba(255, 255, 255, 0.55)"
                    orientation="left"
                    label={{ value: 'BSR', angle: -90, position: 'insideLeft', fill: 'rgba(255,255,255,0.7)' }}
                    reversed={true}
                    tick={{ fontSize: isMobile ? 10 : 12 }}
                    tickFormatter={fmtTick}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                    allowDataOverflow
                    domain={[(dataMin) => Math.max(1, Math.floor(dataMin * 0.95)), (dataMax) => Math.ceil(dataMax * 1.05)]}
                    width={isMobile ? 36 : 48}
                  />
                  <YAxis
                    yAxisId="right"
                    stroke="rgba(255, 255, 255, 0.55)"
                    orientation="right"
                    label={{ value: 'Recensioni', angle: -90, position: 'insideRight', fill: 'rgba(255,255,255,0.7)' }}
                    tick={{ fontSize: isMobile ? 10 : 12 }}
                    tickFormatter={fmtTick}
                    axisLine={false}
                    tickLine={false}
                    width={isMobile ? 36 : 48}
                  />
                  {showPrice && (
                    <YAxis
                      yAxisId="price"
                      stroke="rgba(255, 255, 255, 0.55)"
                      orientation="right"
                      width={isMobile ? 40 : 56}
                      tick={{ fontSize: isMobile ? 10 : 12 }}
                      tickFormatter={fmtPriceTick}
                      axisLine={false}
                      tickLine={false}
                      allowDataOverflow
                      domain={[(dataMin) => Number((dataMin * 0.9).toFixed(2)), (dataMax) => Number((dataMax * 1.1).toFixed(2))]}
                    />
                  )}
                  <Tooltip content={<CustomTooltip currency={currency} />} cursor={{ stroke: 'rgba(255,255,255,0.2)', strokeWidth: 1 }} />
                  <Area yAxisId="left" type="monotone" dataKey="BSR" stroke="none" fill="url(#gradBSR)" fillOpacity={0.18} isAnimationActive animationDuration={700} animationEasing="ease-out" />
                  <Area yAxisId="right" type="monotone" dataKey="Recensioni" stroke="none" fill="url(#gradREV)" fillOpacity={0.1} isAnimationActive animationDuration={650} animationEasing="ease-out" />
                  {showPrice && (
                    <Area yAxisId="price" type="monotone" dataKey="Prezzo" stroke="none" fill="url(#gradPRICE)" fillOpacity={0.12} isAnimationActive animationDuration={600} animationEasing="ease-out" />
                  )}
                  {/* glow underlines with animated pulsing filters (conditional by Neon mode) */}
                  <Line yAxisId="left" type="monotone" dataKey="BSR" stroke="url(#strokeBSR)" strokeOpacity={0.3} strokeWidth={isMobile ? 6 : 5} dot={false} activeDot={false} animationDuration={650} animationEasing="ease-out" connectNulls strokeLinecap="round" strokeLinejoin="round" filter={neonMode ? 'url(#pulseLineBSR)' : 'url(#glowBSR)'} />
                  <Line yAxisId="right" type="monotone" dataKey="Recensioni" stroke="url(#strokeREV)" strokeOpacity={0.24} strokeWidth={isMobile ? 5 : 4.5} dot={false} activeDot={false} animationDuration={650} animationEasing="ease-out" connectNulls strokeLinecap="round" strokeLinejoin="round" filter={neonMode ? 'url(#pulseLineREV)' : 'url(#glowREV)'} />
                  {showPrice && (
                    <Line yAxisId="price" type="monotone" dataKey="Prezzo" stroke="url(#strokePRICE)" strokeOpacity={0.22} strokeWidth={isMobile ? 5 : 4.5} dot={false} activeDot={false} animationDuration={600} animationEasing="ease-out" connectNulls strokeLinecap="round" strokeLinejoin="round" filter={neonMode ? 'url(#pulseLinePRICE)' : 'url(#glowPRICE)'} />
                  )}
                  <Line yAxisId="left" type="monotone" dataKey="BSR" stroke="#34d399" strokeWidth={isMobile ? 2.6 : 2.2} dot={<TrendArrowDot />} activeDot={{ r: isMobile ? 4.5 : 6 }} animationDuration={800} animationEasing="ease-out" connectNulls strokeLinecap="round" strokeLinejoin="round" />
                  {/* Color segments: red when BSR increases (worse), yellow when BSR decreases (better) */}
                  <Line yAxisId="left" type="monotone" dataKey="BSR_UP" stroke="#ef4444" strokeOpacity={0.95} strokeWidth={isMobile ? 3 : 2.6} dot={false} activeDot={false} connectNulls={false} legendType="none" isAnimationActive animationDuration={550} animationEasing="ease-out" strokeLinecap="round" strokeLinejoin="round" />
                  <Line yAxisId="left" type="monotone" dataKey="BSR_DOWN" stroke="#fbbf24" strokeOpacity={0.95} strokeWidth={isMobile ? 3 : 2.6} dot={false} activeDot={false} connectNulls={false} legendType="none" isAnimationActive animationDuration={550} animationEasing="ease-out" strokeLinecap="round" strokeLinejoin="round" />
                  <Line yAxisId="right" type="monotone" dataKey="Recensioni" stroke="#818cf8" strokeWidth={isMobile ? 2.3 : 2} dot={{ r: isMobile ? 1.8 : 2 }} activeDot={{ r: isMobile ? 4.5 : 6 }} animationDuration={700} animationEasing="ease-out" connectNulls strokeLinecap="round" strokeLinejoin="round" />
                  {showPrice && (
                    <Line yAxisId="price" type="monotone" dataKey="Prezzo" stroke="#f59e0b" strokeWidth={isMobile ? 2.2 : 2} dot={{ r: isMobile ? 1.8 : 2 }} activeDot={{ r: isMobile ? 4.5 : 6 }} animationDuration={650} animationEasing="ease-out" connectNulls strokeLinecap="round" strokeLinejoin="round" />
                  )}
                  {currentBSR != null && (
                    <ReferenceLine yAxisId="left" y={currentBSR} stroke="rgba(52,211,153,0.35)" strokeDasharray="4 4" ifOverflow="extendDomain" label={!isMobile ? { value: 'Attuale', position: 'right', fill: 'rgba(255,255,255,0.75)', fontSize: 11 } : undefined} />
                  )}
                  {displayMin != null && (
                    <ReferenceLine yAxisId="left" y={displayMin} stroke="rgba(250,204,21,0.25)" strokeDasharray="3 3" ifOverflow="extendDomain" label={!isMobile ? { value: 'Migliore', position: 'right', fill: 'rgba(255,255,255,0.6)', fontSize: 10 } : undefined} />
                  )}
                  {displayMax != null && (
                    <ReferenceLine yAxisId="left" y={displayMax} stroke="rgba(239,68,68,0.20)" strokeDasharray="3 3" ifOverflow="extendDomain" label={!isMobile ? { value: 'Peggiore', position: 'right', fill: 'rgba(255,255,255,0.6)', fontSize: 10 } : undefined} />
                  )}
                  {!isMobile && (
                    <Brush dataKey="date" height={20} stroke="rgba(255,255,255,0.25)" travellerWidth={8} fill="rgba(255,255,255,0.03)" />
                  )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400">
                Dati storici insufficienti per generare un grafico.
              </div>
            )}
          </div>
          {/* Minimal footer title below the chart */}
          <div className="mt-2 text-center">
            <span className="inline-block max-w-full truncate text-[10px] text-gray-400" title={asinData.title}>
              {asinData.title}
            </span>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default AsinTrendChart;