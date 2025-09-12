import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { calculateSalesFromBsr, calculateIncome } from '@/lib/incomeCalculator';
import { estimateRoyalty } from '@/lib/royaltyEstimator';

const usePortfolioAnalysis = (periodInDays) => {
  const { user } = useAuth();
  const [data, setData] = useState({
    stats: {
      totalBooks: 0,
      totalMonthlyIncome: [0, 0],
      avgBsr: 0,
      totalReviews: 0,
      portfolioBsrTrend: 'stable',
      portfolioIncomeTrend: 'stable',
    },
    topPerformers: [],
    worstPerformers: [],
    history: [],
  });
  const [isLoading, setIsLoading] = useState(true);

  const calculateAverage = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  
  const calculateTrend = (current, previous, lowerIsBetter = false) => {
    if (previous === null || current === null || current === previous || previous === 0) {
      return 'stable';
    }
    const change = ((current - previous) / previous);
    if (Math.abs(change) < 0.02) return 'stable';
  
    if (lowerIsBetter) {
      return current < previous ? 'up' : 'down';
    }
    return current > previous ? 'up' : 'down';
  };

  const analyzeData = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);

    const { data: asins, error: asinsError } = await supabase
      .from('asin_data')
      .select('id, title, royalty')
      .eq('user_id', user.id);

    if (asinsError) {
      console.error("Error fetching ASINs:", asinsError);
      setIsLoading(false);
      return;
    }

    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - periodInDays);
    const toDate = new Date();
    
    const { data: history, error: historyError } = await supabase
      .from('asin_history')
      .select('asin_data_id, bsr, review_count, created_at')
      .eq('user_id', user.id)
      .gte('created_at', fromDate.toISOString())
      .order('created_at', { ascending: true });

    if (historyError) {
      console.error("Error fetching history:", historyError);
      setIsLoading(false);
      return;
    }

    // Load real income entries (EUR only) for the same window
    let entries = [];
    try {
      const { data: kdp, error: kdpErr } = await supabase
        .from('kdp_entries')
        .select('date, income, income_currency')
        .eq('user_id', user.id)
        .eq('income_currency', 'EUR')
        .gte('date', fromDate.toISOString().slice(0,10))
        .lte('date', toDate.toISOString().slice(0,10));
      if (kdpErr) throw kdpErr;
      entries = Array.isArray(kdp) ? kdp : [];
    } catch (e) {
      entries = [];
    }

    if (asins.length === 0 || (history.length === 0 && entries.length === 0)) {
        setData({
            stats: { totalBooks: asins.length, totalMonthlyIncome: [0,0], avgBsr: 0, totalReviews: 0, portfolioBsrTrend: 'stable', portfolioIncomeTrend: 'stable' },
            topPerformers: [],
            worstPerformers: [],
            history: []
        });
      setIsLoading(false);
      return;
    }

    const historyByAsin = history.reduce((acc, curr) => {
      (acc[curr.asin_data_id] = acc[curr.asin_data_id] || []).push(curr);
      return acc;
    }, {});

    const analysisResults = asins.map(asin => {
      const asinHistory = historyByAsin[asin.id] || [];
      if (asinHistory.length < 2) return null;
      
      const latest = asinHistory[asinHistory.length - 1];
      const oldest = asinHistory[0];

      const bsrChange = (latest.bsr || 0) - (oldest.bsr || 0);
      const sales = calculateSalesFromBsr(latest.bsr);
      const effectiveRoyalty = (asin.royalty && asin.royalty > 0) ? asin.royalty : estimateRoyalty(asin);
      const income = calculateIncome(sales, effectiveRoyalty);
      const avgMonthlyIncome = (income.monthly[0] + income.monthly[1]) / 2;
      const reviewsChange = (latest.review_count || 0) - (oldest.review_count || 0);

      return {
        ...asin,
        bsrChange,
        avgMonthlyIncome,
        latestBsr: latest.bsr,
        reviewsChange,
      };
    }).filter(Boolean);

    const topPerformers = [...analysisResults].sort((a, b) => a.bsrChange - b.bsrChange).slice(0, 5);
    const worstPerformers = [...analysisResults].sort((a, b) => b.bsrChange - a.bsrChange).slice(0, 5);
    
    const historyByDate = history.reduce((acc, curr) => {
      const date = new Date(curr.created_at).toISOString().split('T')[0];
      (acc[date] = acc[date] || []).push(curr);
      return acc;
    }, {});

    // Build daily income map from entries (EUR only)
    const dailyIncomeEUR = entries.reduce((acc, r) => {
      const d = (r.date || '').slice(0,10);
      const inc = parseFloat(r.income ?? 0) || 0;
      acc[d] = (acc[d] || 0) + inc;
      return acc;
    }, {});
    
    const allDates = Array.from(new Set([
      ...Object.keys(historyByDate),
      ...Object.keys(dailyIncomeEUR),
    ]));
    const aggregatedHistory = allDates.map((date) => {
      const records = historyByDate[date] || [];
      const dailyBsrs = records.map(r => r.bsr).filter(Boolean);
      const avgBsr = dailyBsrs.length ? calculateAverage(dailyBsrs) : null;
      const incomeEUR = Number(dailyIncomeEUR[date] || 0);
      return { date, avgBsr, totalMonthlyIncome: incomeEUR };
    }).sort((a, b) => new Date(a.date) - new Date(b.date));

    const latestHistoryRecords = Object.values(historyByAsin).map(h => h[h.length - 1]);
    const totalBooks = asins.length;
    const allLatestBsrs = latestHistoryRecords.map(h => h.bsr).filter(Boolean);
    const avgBsr = allLatestBsrs.length > 0 ? Math.round(calculateAverage(allLatestBsrs)) : 0;
    const totalReviews = latestHistoryRecords.reduce((sum, h) => sum + (h.review_count || 0), 0);
    
    // Real income sum over period (EUR)
    const sumIncomeEUR = Object.values(dailyIncomeEUR).reduce((a, b) => a + (b || 0), 0);
    const totalMonthlyIncome = [sumIncomeEUR, sumIncomeEUR];
    
    let portfolioBsrTrend = 'stable';
    let portfolioIncomeTrend = 'stable';
    if(aggregatedHistory.length >= 2) {
      const latestPoint = aggregatedHistory[aggregatedHistory.length - 1];
      const previousPoint = aggregatedHistory[0];
      portfolioBsrTrend = calculateTrend(latestPoint.avgBsr, previousPoint.avgBsr, true);
      portfolioIncomeTrend = calculateTrend(latestPoint.totalMonthlyIncome, previousPoint.totalMonthlyIncome);
    }

    setData({
      stats: { totalBooks, totalMonthlyIncome, avgBsr, totalReviews, portfolioBsrTrend, portfolioIncomeTrend },
      topPerformers,
      worstPerformers,
      history: aggregatedHistory,
    });
    setIsLoading(false);
  }, [user, periodInDays]);

  useEffect(() => {
    analyzeData();
  }, [analyzeData]);

  return { ...data, isLoading, refreshAnalysis: analyzeData };
};

export default usePortfolioAnalysis;