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

    if (asins.length === 0 || history.length === 0) {
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
    
    const aggregatedHistory = Object.entries(historyByDate).map(([date, records]) => {
      const dailyBsrs = records.map(r => r.bsr).filter(Boolean);
      const avgBsr = calculateAverage(dailyBsrs);
      
      const totalMonthlyIncome = records.reduce((total, record) => {
        const asin = asins.find(a => a.id === record.asin_data_id);
        if(!asin || !record.bsr) return total;
        const sales = calculateSalesFromBsr(record.bsr);
        const eff = (asin.royalty && asin.royalty > 0) ? asin.royalty : estimateRoyalty(asin);
        const income = calculateIncome(sales, eff);
        return [total[0] + income.monthly[0], total[1] + income.monthly[1]];
      }, [0, 0]);
      
      return { date, avgBsr, totalMonthlyIncome: (totalMonthlyIncome[0] + totalMonthlyIncome[1])/2 };
    }).sort((a, b) => new Date(a.date) - new Date(b.date));

    const latestHistoryRecords = Object.values(historyByAsin).map(h => h[h.length - 1]);
    const totalBooks = asins.length;
    const allLatestBsrs = latestHistoryRecords.map(h => h.bsr).filter(Boolean);
    const avgBsr = allLatestBsrs.length > 0 ? Math.round(calculateAverage(allLatestBsrs)) : 0;
    const totalReviews = latestHistoryRecords.reduce((sum, h) => sum + (h.review_count || 0), 0);
    
    const totalMonthlyIncome = asins.reduce((total, asin) => {
      const latestScrape = historyByAsin[asin.id]?.[historyByAsin[asin.id].length - 1];
      if (!latestScrape || !latestScrape.bsr) return total;
      const sales = calculateSalesFromBsr(latestScrape.bsr);
      const income = calculateIncome(sales, asin.royalty);
      return [total[0] + income.monthly[0], total[1] + income.monthly[1]];
    }, [0, 0]);
    
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