import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { calculateSalesFromBsr, calculateIncome } from '@/lib/incomeCalculator';
import { estimateRoyalty } from '@/lib/royaltyEstimator';

const calculateTrend = (current, previous, lowerIsBetter = false, noThreshold = false) => {
  if (previous === null || current === null) return 'stable';
  if (current === previous) return 'stable';
  if (!noThreshold && previous === 0) return 'stable';
  if (!noThreshold) {
    const changeThreshold = 0.01;
    const absoluteChange = Math.abs(current - previous);
    const relativeChange = Math.abs(absoluteChange / previous);
    if (relativeChange < changeThreshold && absoluteChange < 5) return 'stable';
  }
  if (lowerIsBetter) return current < previous ? 'up' : 'down';
  return current > previous ? 'up' : 'down';
};

const useAsinTrends = (asins) => {
  const [trends, setTrends] = useState({});
  const [isLoading, setIsLoading] = useState(false);

  const calculateAsinTrends = useCallback(async () => {
    if (!asins || asins.length === 0) {
      setTrends({});
      return;
    }

    setIsLoading(true);
    const asinIds = asins.map(a => a.id);

    const { data: historyData, error } = await supabase
      .from('asin_history')
      .select('asin_data_id, bsr, review_count, created_at, price')
      .in('asin_data_id', asinIds)
      .order('created_at', { ascending: false });

    if (error) {
      console.error("Error fetching history for trends:", error);
      setTrends({});
      setIsLoading(false);
      return;
    }

    const newTrends = {};
    // Group history by ASIN for deeper analysis (summary and MoM guard)
    const historyByAsin = (historyData || []).reduce((acc, h) => {
      (acc[h.asin_data_id] = acc[h.asin_data_id] || []).push(h);
      return acc;
    }, {});

    for (const asin of asins) {
      const allHistory = historyByAsin[asin.id] || [];
      const relevantHistory = allHistory.slice(0, 4); // Get last 4 scrapes for stable trend arrows

      const bsr4d = (() => {
        const days = 10;
        const dayMin = new Map();
        const keysDesc = [];
        for (const row of allHistory) {
          const ts = row?.created_at ? new Date(row.created_at) : null;
          if (!ts || Number.isNaN(ts.getTime())) continue;
          const key = `${ts.getFullYear()}-${String(ts.getMonth() + 1).padStart(2, '0')}-${String(ts.getDate()).padStart(2, '0')}`;
          const b = Number(row?.bsr);
          if (!Number.isFinite(b) || b <= 0) continue;
          const prev = dayMin.get(key);
          if (!Number.isFinite(prev)) keysDesc.push(key);
          if (!Number.isFinite(prev) || b < prev) dayMin.set(key, b);
          if (keysDesc.length > days) break;
        }

        const keys = keysDesc.slice(0, days).reverse();
        const values = keys.map((k) => dayMin.get(k)).filter((v) => Number.isFinite(v) && v > 0);

        if (values.length < 2) return { values, overall: 'flat' };

        const first = values[0];
        const last = values[values.length - 1];
        const delta = last - first;
        const rel = first ? Math.abs(delta / first) : 0;
        const abs = Math.abs(delta);
        const stepScore = values.slice(1).reduce((s, v, i) => {
          const prev = values[i];
          const d = v - prev; // positive = worse
          if (Math.abs(d) < 15) return s;
          return s + (d < 0 ? 1 : -1);
        }, 0);
        const overall = (rel < 0.01 && abs < 15) ? 'flat' : ((stepScore === 0) ? (delta < 0 ? 'good' : 'bad') : (stepScore > 0 ? 'good' : 'bad'));
        return { values, overall };
      })();

      if (relevantHistory.length < 2) {
        newTrends[asin.id] = { bsr: 'stable', reviews: 'stable', income: 'stable', price: 'stable', acos: 'stable', bsr4d };
        continue;
      }

      const current = relevantHistory[0];
      // Find the last different value for each metric to avoid flipping to 'stable' when duplicate points are inserted
      const findPrevDifferent = (arr, key, isPositive = true) => {
        const curr = Number(arr?.[0]?.[key]);
        if (!Number.isFinite(curr)) return null;
        for (let i = 1; i < arr.length; i++) {
          const v = Number(arr[i]?.[key]);
          if (!Number.isFinite(v)) continue;
          if (v !== curr) return v;
        }
        // fallback to immediate previous even if equal
        const fallback = Number(arr?.[1]?.[key]);
        return Number.isFinite(fallback) ? fallback : null;
      };

      const prevBsr = findPrevDifferent(relevantHistory, 'bsr');
      const prevReviews = findPrevDifferent(relevantHistory, 'review_count');
      const prevPrice = findPrevDifferent(relevantHistory, 'price');

      const bsrTrend = calculateTrend(current.bsr, prevBsr, true);
      const reviewsTrend = calculateTrend(current.review_count, prevReviews, false, true);
      const priceTrend = calculateTrend(current.price, prevPrice);

      const lastTwoValid = (arr, key) => {
        if (!arr || arr.length === 0) return [null, null];
        let curr = null, prev = null;
        for (let i = 0; i < arr.length; i++) {
          const v = Number(arr[i]?.[key]);
          if (!Number.isFinite(v) || v < 0) continue;
          if (curr === null) curr = v; else { prev = v; break; }
        }
        return [curr, prev];
      };
      const [currRev, prevRevImmediate] = lastTwoValid(allHistory, 'review_count');
      const reviewsDelta = (currRev != null && prevRevImmediate != null) ? (currRev - prevRevImmediate) : null;

      const currentSales = calculateSalesFromBsr(current.bsr);
      const effectiveRoyalty = (asin.royalty && asin.royalty > 0) ? asin.royalty : estimateRoyalty(asin);
      const currentIncome = calculateIncome(currentSales, effectiveRoyalty);
      const currentAvgIncome = (currentIncome.monthly[0] + currentIncome.monthly[1]) / 2;

      const previousBsr = prevBsr;
      const previousPrice = prevPrice;
      const previousReviews = prevReviews;

      const previousSales = calculateSalesFromBsr(previousBsr);
      // Use previous price for royalty estimate if present
      const effRoyaltyPrev = (asin.royalty && asin.royalty > 0)
        ? asin.royalty
        : estimateRoyalty({ ...asin, price: (previousPrice ?? asin.price) });
      const previousIncome = calculateIncome(previousSales, effRoyaltyPrev);
      const previousAvgIncome = (previousIncome.monthly[0] + previousIncome.monthly[1]) / 2;

      const incomeTrend = calculateTrend(currentAvgIncome, previousAvgIncome);

      // Break-even ACOS = (royalty / price) * 100
      const currentBE = (effectiveRoyalty && current.price) ? (effectiveRoyalty / current.price) * 100 : null;
      const previousBE = (effectiveRoyalty && previousPrice) ? (effectiveRoyalty / previousPrice) * 100 : null;
      const acosTrend = calculateTrend(currentBE, previousBE);

      // Build concise summary since last scrape (avoid redundancy)
      const summaryItems = [];
      // BSR change (lower is better). Use % change threshold 1% and absolute >= 5
      if (previousBsr && current.bsr) {
        const delta = current.bsr - previousBsr; // positive = worse
        const rel = previousBsr ? Math.abs(delta / previousBsr) : 0;
        if (Math.abs(delta) >= 5 && rel >= 0.01) {
          if (delta < 0) {
            summaryItems.push(`BSR migliorato di ${Math.abs((rel*100)).toFixed(1)}%`);
          } else {
            summaryItems.push(`BSR peggiorato di ${Math.abs((rel*100)).toFixed(1)}%`);
          }
        }
      }
      // Reviews gained
      const revDelta = (current.review_count || 0) - (previousReviews || 0);
      if (revDelta > 0) {
        summaryItems.push(`+${revDelta} recensioni`);
      }
      // Price change
      const priceDelta = Number(current.price || 0) - Number(previousPrice || 0);
      if (Math.abs(priceDelta) >= 0.01) {
        const dir = priceDelta > 0 ? '↑' : '↓';
        summaryItems.push(`Prezzo ${dir} €${Math.abs(priceDelta).toFixed(2)}`);
      }
      // Estimated monthly income change
      if (previousAvgIncome && currentAvgIncome) {
        const incDelta = currentAvgIncome - previousAvgIncome;
        const incRel = previousAvgIncome ? incDelta / previousAvgIncome : 0;
        if (Math.abs(incRel) >= 0.05 && Math.abs(incDelta) >= 0.5) {
          const dir = incDelta > 0 ? '↑' : '↓';
          summaryItems.push(`Guadagno stimato ${dir} ${Math.abs(incRel*100).toFixed(1)}%`);
        }
      }

      // Month-over-month guard (last 30d vs previous 30d)
      const now = new Date();
      const d30 = new Date(now); d30.setDate(now.getDate() - 30);
      const d60 = new Date(now); d60.setDate(now.getDate() - 60);
      const period2 = allHistory.filter(h => new Date(h.created_at) >= d30); // last 30d
      const period1 = allHistory.filter(h => new Date(h.created_at) < d30 && new Date(h.created_at) >= d60); // prev 30d
      // Helpers for drivers/confidence
      const avg = (arr) => (arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : null);
      const uniqueDates = (records) => Array.from(new Set(records.map(r => new Date(r.created_at).toISOString().split('T')[0])));
      const avgBsr = (records) => {
        const v = records.map(r => Number(r.bsr)).filter(x => Number.isFinite(x) && x > 0);
        return v.length ? avg(v) : null;
      };
      const avgRoyalty = (records) => {
        if (!records || records.length === 0) return null;
        const vals = records.map(r => (
          (asin.royalty && asin.royalty > 0) ? asin.royalty : estimateRoyalty({ ...asin, price: (r.price ?? asin.price) })
        )).filter(Number.isFinite);
        return vals.length ? avg(vals) : null;
      };
      const avgPrice = (records) => {
        const v = records.map(r => Number(r.price)).filter(x => Number.isFinite(x) && x > 0);
        return v.length ? avg(v) : null;
      };
      const reviewVelocity = (records) => {
        if (!records || records.length < 2) return null;
        const last = records[0];
        const first = records[records.length - 1];
        const days = Math.max(1, Math.abs((new Date(last.created_at) - new Date(first.created_at)) / (1000*60*60*24)));
        const delta = (Number(last.review_count)||0) - (Number(first.review_count)||0);
        return delta / days;
      };
      const avgMonthlyIncome = (records) => {
        if (!records || records.length === 0) return null;
        const vals = records.map(r => {
          const sales = calculateSalesFromBsr(r.bsr);
          const effR = (asin.royalty && asin.royalty > 0) ? asin.royalty : estimateRoyalty({ ...asin, price: (r.price ?? asin.price) });
          const inc = calculateIncome(sales, effR);
          return (inc.monthly[0] + inc.monthly[1]) / 2;
        }).filter(v => Number.isFinite(v));
        if (vals.length === 0) return null;
        return vals.reduce((a, b) => a + b, 0) / vals.length;
      };
      const m1 = avgMonthlyIncome(period1);
      const m2 = avgMonthlyIncome(period2);
      const b1 = avgBsr(period1);
      const b2 = avgBsr(period2);
      const v1 = reviewVelocity(period1);
      const v2 = reviewVelocity(period2);
      const r1 = avgRoyalty(period1);
      const r2 = avgRoyalty(period2);
      const p1 = avgPrice(period1);
      const p2 = avgPrice(period2);
      const coverageDays2 = uniqueDates(period2).length;
      const confidence = coverageDays2 >= 14 && period2.length >= 8 ? 'high' : (coverageDays2 >= 7 && period2.length >= 4 ? 'medium' : 'low');
      let moGuard = 'stable';
      let moDeltaPct = null; // percent only when both periods > 0
      let moKind = 'flat';   // 'ratio' | 'new' | 'lost' | 'flat'
      if (Number.isFinite(m1) && m1 > 0 && Number.isFinite(m2) && m2 > 0) {
        moDeltaPct = ((m2 - m1) / m1) * 100;
        moKind = 'ratio';
        if (moDeltaPct >= 5) moGuard = 'better';
        else if (moDeltaPct <= -5) moGuard = 'worse';
        else moGuard = 'stable';
      } else if (Number.isFinite(m2) && m2 > 0 && (!Number.isFinite(m1) || m1 === 0)) {
        moGuard = 'better';
        moKind = 'new';
        moDeltaPct = null;
      } else if (Number.isFinite(m1) && m1 > 0 && (!Number.isFinite(m2) || m2 === 0)) {
        moGuard = 'worse';
        moKind = 'lost';
        moDeltaPct = null;
      } else {
        moKind = 'flat';
        moDeltaPct = 0;
      }
      // Drivers for MoM change
      const drivers = [];
      const pct = (a,b) => (b > 0 ? ((a-b)/b)*100 : 0);
      const bsrDeltaPct = pct(b2, b1);
      const velDelta = (Number.isFinite(v1) && Number.isFinite(v2)) ? (v2 - v1) : null;
      const royaltyDeltaPct = pct(r2, r1);
      const priceDeltaPct = pct(p2, p1);
      if (Number.isFinite(b1) && Number.isFinite(b2) && Math.abs(bsrDeltaPct) >= 3) {
        drivers.push(bsrDeltaPct < 0 ? 'BSR medio più basso' : 'BSR medio più alto');
      }
      if (Number.isFinite(velDelta) && Math.abs(velDelta) >= 0.1) {
        drivers.push(velDelta > 0 ? 'Velocità recensioni in aumento' : 'Velocità recensioni in calo');
      }
      if (Number.isFinite(royaltyDeltaPct) && Math.abs(royaltyDeltaPct) >= 1) {
        drivers.push(royaltyDeltaPct > 0 ? 'Margine per copia più alto' : 'Margine per copia più basso');
      } else if (Number.isFinite(priceDeltaPct) && Math.abs(priceDeltaPct) >= 1) {
        drivers.push(priceDeltaPct > 0 ? 'Prezzo medio più alto' : 'Prezzo medio più basso');
      }

      // Compute QI score from BSR range, ignoring sub-1000 values as unrealistic (launch spikes)
      const bsrVals = (allHistory || []).map((r) => Number(r.bsr)).filter((v) => Number.isFinite(v) && v > 0);
      const FLOOR_MIN = 1000; // ignore BSR < 1000 for baseline
      const baseVals = bsrVals.filter((v) => v >= FLOOR_MIN);
      const minEver = baseVals.length ? Math.min(...baseVals) : FLOOR_MIN;
      const maxEver = baseVals.length ? Math.max(...baseVals) : (bsrVals.length ? Math.max(...bsrVals) : null);
      const currBsr = (Number.isFinite(Number(asin.bsr)) && Number(asin.bsr) > 0)
        ? Number(asin.bsr)
        : (Number.isFinite(Number(current?.bsr)) && Number(current?.bsr) > 0 ? Number(current?.bsr) : null);
      let qiScore = null;
      if (!Number.isFinite(currBsr)) {
        qiScore = null;
      } else if (baseVals.length === 0) {
        // No baseline >= 1000 available: treat current (sub-1000 period) as perfect
        qiScore = 100;
      } else if (Number.isFinite(maxEver) && maxEver > minEver) {
        const ratio = (maxEver - currBsr) / (maxEver - minEver);
        qiScore = Math.round(Math.max(0, Math.min(1, ratio)) * 100);
      }

      newTrends[asin.id] = {
        bsr: bsrTrend,
        reviews: reviewsTrend,
        reviewsDelta,
        income: incomeTrend,
        price: priceTrend,
        acos: acosTrend,
        bsr4d,
        qi: { score: qiScore, min: minEver, max: maxEver, current: currBsr },
        summary: {
          items: summaryItems,
          moGuard,
          moKind,
          moDeltaPct,
          drivers,
          confidence,
          stats: {
            m1: Number.isFinite(m1) ? Number(m1.toFixed(2)) : null,
            m2: Number.isFinite(m2) ? Number(m2.toFixed(2)) : null,
            b1: Number.isFinite(b1) ? Math.round(b1) : null,
            b2: Number.isFinite(b2) ? Math.round(b2) : null,
            v1: Number.isFinite(v1) ? Number(v1.toFixed(2)) : null,
            v2: Number.isFinite(v2) ? Number(v2.toFixed(2)) : null,
            p1: Number.isFinite(p1) ? Number(p1.toFixed(2)) : null,
            p2: Number.isFinite(p2) ? Number(p2.toFixed(2)) : null,
            r1: Number.isFinite(r1) ? Number(r1.toFixed(2)) : null,
            r2: Number.isFinite(r2) ? Number(r2.toFixed(2)) : null,
            coverageDays: coverageDays2,
            samples: { prev: period1.length, curr: period2.length },
          },
        },
      };
    }

    setTrends(newTrends);
    // Persist global notifications for top bell
    try {
      const entries = Object.entries(newTrends);
      const better = entries.filter(([,t]) => t?.summary?.moGuard === 'better');
      const worse = entries.filter(([,t]) => t?.summary?.moGuard === 'worse');
      const stable = entries.filter(([,t]) => t?.summary?.moGuard === 'stable');
      const topMessages = entries.slice(0, 50).map(([id, t]) => {
        const title = (asins.find(a => a.id === id)?.title) || (asins.find(a => String(a.id) === String(id))?.title) || '';
        const guard = t?.summary?.moGuard;
        const pct = t?.summary?.moDeltaPct;
        const kind = t?.summary?.moKind;
        const drv = (t?.summary?.drivers || []).slice(0,2).join(', ');
        if (!guard || guard === 'stable') return null;
        const pctLabel = kind === 'new' ? 'nuovo' : (kind === 'lost' ? 'perso' : (Number.isFinite(pct) ? `${pct.toFixed(1)}%` : '—'));
        return `${title || 'ASIN'}: ${guard === 'better' ? 'migliore' : 'peggiore'} (${pctLabel}) — ${drv}`;
      }).filter(Boolean).slice(0, 12);
      const details = entries.map(([id, t]) => {
        const asin = asins.find(a => a.id === id) || asins.find(a => String(a.id) === String(id));
        const pctVal = Number.isFinite(t?.summary?.moDeltaPct) ? Number(t.summary.moDeltaPct.toFixed(1)) : null;
        return {
          id,
          asin: asin?.asin,
          title: asin?.title,
          guard: t?.summary?.moGuard,
          kind: t?.summary?.moKind || 'ratio',
          pct: pctVal,
          drivers: (t?.summary?.drivers || []).slice(0, 4),
          confidence: t?.summary?.confidence || 'low',
          stats: t?.summary?.stats || null,
        };
      }).filter(d => d.guard && d.guard !== 'stable');
      // Create a stable fingerprint based on essential fields
      const detailsForFp = details
        .map(d => ({ id: String(d.id), guard: d.guard, kind: d.kind, pct: d.pct != null ? Number(d.pct).toFixed(1) : 'NA', drv: (d.drivers||[]).slice(0,4).join('|') }))
        .sort((a,b) => (a.id + a.guard + a.pct + a.drv).localeCompare(b.id + b.guard + b.pct + b.drv));
      const countsObj = { better: better.length, worse: worse.length, stable: stable.length };
      const fingerprint = JSON.stringify({ counts: countsObj, details: detailsForFp });

      const payload = {
        ts: Date.now(),
        counts: countsObj,
        messages: topMessages,
        details,
        fingerprint,
      };
      localStorage.setItem('globalNotifications', JSON.stringify(payload));
      try { window.dispatchEvent(new Event('globalNotificationsUpdated')); } catch (_) {}
    } catch (_) {}
    setIsLoading(false);
  }, [asins.map(a => a.id).join(',')]); // Depend on string of IDs

  useEffect(() => {
    calculateAsinTrends();
  }, [calculateAsinTrends]);

  return { trends, isLoading, refreshTrends: calculateAsinTrends };
};

export default useAsinTrends;