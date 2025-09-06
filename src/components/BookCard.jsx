import React from 'react';
import { motion } from 'framer-motion';
import { Star, TrendingUp, TrendingDown, Package, DollarSign, Calendar, Trash2, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';

const BookCard = ({ book, onDelete, onViewChart }) => {
  const getBSRTrend = () => {
    if (book.trendData && book.trendData.length >= 2) {
      const recent = book.trendData[book.trendData.length - 1].bsr;
      const previous = book.trendData[book.trendData.length - 2].bsr;
      return recent < previous ? 'up' : 'down';
    }
    return 'neutral';
  };

  const getReviewVelocity = () => {
    if (book.trendData && book.trendData.length >= 7) {
      const lastWeek = book.trendData.slice(-7);
      const reviewsGained = lastWeek[lastWeek.length - 1].reviews - lastWeek[0].reviews;
      return reviewsGained;
    }
    return 0;
  };

  const bsrTrend = getBSRTrend();
  const reviewVelocity = getReviewVelocity();

  return (
    <motion.div
      whileHover={{ y: -5, scale: 1.02 }}
      className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm rounded-2xl p-6 border border-white/10 shadow-2xl"
    >
      {/* Header */}
      <div className="flex justify-between items-start mb-4">
        <div className="flex-1">
          <h3 className="text-xl font-bold text-white mb-1 line-clamp-2">{book.title}</h3>
          <div className="flex items-center gap-2 text-sm">
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
              book.category === 'Travel Guide' 
                ? 'bg-blue-500/20 text-blue-300' 
                : 'bg-green-500/20 text-green-300'
            }`}>
              {book.category}
            </span>
            <span className="text-gray-400">ASIN: {book.asin}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => onViewChart(book)}
            size="sm"
            variant="ghost"
            className="text-gray-400 hover:text-white p-2"
          >
            <BarChart3 className="w-4 h-4" />
          </Button>
          <Button
            onClick={() => onDelete(book.id)}
            size="sm"
            variant="ghost"
            className="text-red-400 hover:text-red-300 p-2"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-white/5 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="w-4 h-4 text-green-400" />
            <span className="text-sm text-gray-400">Price</span>
          </div>
          <span className="text-lg font-bold text-white">${book.price}</span>
        </div>

        <div className="bg-white/5 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <Star className="w-4 h-4 text-yellow-400" />
            <span className="text-sm text-gray-400">Rating</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-lg font-bold text-white">{book.rating}</span>
            <span className="text-sm text-gray-400">({book.reviewCount})</span>
          </div>
        </div>

        <div className="bg-white/5 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            {bsrTrend === 'up' ? (
              <TrendingUp className="w-4 h-4 text-green-400" />
            ) : (
              <TrendingDown className="w-4 h-4 text-red-400" />
            )}
            <span className="text-sm text-gray-400">BSR</span>
          </div>
          <span className="text-lg font-bold text-white">#{book.currentBSR.toLocaleString()}</span>
        </div>

        <div className="bg-white/5 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <Package className="w-4 h-4 text-blue-400" />
            <span className="text-sm text-gray-400">Stock</span>
          </div>
          <span className={`text-sm font-medium ${
            book.stockStatus === 'In Stock' ? 'text-green-400' : 
            book.stockStatus === 'Low Stock' ? 'text-yellow-400' : 'text-red-400'
          }`}>
            {book.stockStatus}
          </span>
        </div>
      </div>

      {/* Review Velocity */}
      <div className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-lg p-3 mb-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-300">Review Velocity (7 days)</span>
          <span className={`text-sm font-bold ${
            reviewVelocity > 0 ? 'text-green-400' : reviewVelocity < 0 ? 'text-red-400' : 'text-gray-400'
          }`}>
            {reviewVelocity > 0 ? '+' : ''}{reviewVelocity} reviews
          </span>
        </div>
      </div>

      {/* Mini Trend Chart */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-400">60-Day BSR Trend</span>
          <span className="text-xs text-gray-500">
            {bsrTrend === 'up' ? '📈 Improving' : bsrTrend === 'down' ? '📉 Declining' : '➡️ Stable'}
          </span>
        </div>
        <div className="h-16 bg-white/5 rounded-lg p-2">
          <svg className="w-full h-full" viewBox="0 0 200 40">
            {book.trendData && book.trendData.length > 1 && (
              <polyline
                fill="none"
                stroke="url(#gradient)"
                strokeWidth="2"
                points={book.trendData.slice(-30).map((point, index) => {
                  const x = (index / 29) * 200;
                  const maxBSR = Math.max(...book.trendData.slice(-30).map(p => p.bsr));
                  const minBSR = Math.min(...book.trendData.slice(-30).map(p => p.bsr));
                  const y = 40 - ((point.bsr - minBSR) / (maxBSR - minBSR)) * 40;
                  return `${x},${y}`;
                }).join(' ')}
              />
            )}
            <defs>
              <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#8b5cf6" />
                <stop offset="100%" stopColor="#ec4899" />
              </linearGradient>
            </defs>
          </svg>
        </div>
      </div>

      {/* Last Updated */}
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <Calendar className="w-3 h-3" />
        <span>Updated: {new Date(book.lastUpdated).toLocaleDateString()}</span>
      </div>
    </motion.div>
  );
};

export default BookCard;