import React from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Star, Calendar } from 'lucide-react';

const TrendChart = ({ book, detailed = false }) => {
  if (!book.trendData || book.trendData.length === 0) {
    return (
      <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm rounded-2xl p-6 border border-white/10">
        <h3 className="text-lg font-semibold text-white mb-4">{book.title}</h3>
        <div className="text-center py-8 text-gray-400">
          No trend data available
        </div>
      </div>
    );
  }

  // Forward-fill null/0 values from previous day to avoid dips to 0/null
  const trendData = (() => {
    const out = [];
    let prevBsr = null;
    let prevRev = null;
    for (const d of book.trendData) {
      let b = Number(d?.bsr);
      if (!Number.isFinite(b) || b === 0) {
        if (prevBsr != null) b = prevBsr;
      } else {
        prevBsr = b;
      }
      let r = Number(d?.reviews);
      if (!Number.isFinite(r) || r === 0) {
        if (prevRev != null) r = prevRev;
      } else {
        prevRev = r;
      }
      out.push({ ...d, bsr: b, reviews: r });
    }
    return out;
  })();

  const bsrVals = trendData.map(d => d.bsr).filter(v => Number.isFinite(v) && v !== 0);
  const reviewVals = trendData.map(d => d.reviews).filter(v => Number.isFinite(v) && v !== 0);
  const maxBSR = bsrVals.length ? Math.max(...bsrVals) : 1;
  const minBSR = bsrVals.length ? Math.min(...bsrVals) : 0;
  const maxReviews = reviewVals.length ? Math.max(...reviewVals) : 1;
  const minReviews = reviewVals.length ? Math.min(...reviewVals) : 0;
  const bsrRange = Math.max(1, maxBSR - minBSR);
  const reviewsRange = Math.max(1, maxReviews - minReviews);

  const chartHeight = detailed ? 300 : 200;
  const chartWidth = 800;
  const paddingX = 20;
  const paddingY = 20;
  const innerH = chartHeight - paddingY * 2;

  const computeX = (i) => (i / Math.max(1, (trendData.length - 1))) * (chartWidth - paddingX * 2) + paddingX;
  const computeYBSR = (v) => chartHeight - paddingY - ((v - minBSR) / bsrRange) * innerH;
  const computeYREV = (v) => chartHeight - paddingY - ((v - minReviews) / reviewsRange) * innerH;

  const bsrPolyline = trendData.map((p, i) => `${computeX(i)},${computeYBSR(p.bsr)}`).join(' ');
  const revPolyline = trendData.map((p, i) => `${computeX(i)},${computeYREV(p.reviews)}`).join(' ');
  const btmY = chartHeight - paddingY;
  const areaBsrPoints = `${bsrPolyline} ${computeX(trendData.length - 1)},${btmY} ${computeX(0)},${btmY}`;
  const areaRevPoints = `${revPolyline} ${computeX(trendData.length - 1)},${btmY} ${computeX(0)},${btmY}`;

  // Calculate trend direction
  const recentBSR = trendData.slice(-7).map(d => d.bsr).filter(v => Number.isFinite(v));
  const avgRecentBSR = recentBSR.length ? recentBSR.reduce((a, b) => a + b, 0) / recentBSR.length : NaN;
  const olderBSR = trendData.slice(-14, -7).map(d => d.bsr).filter(v => Number.isFinite(v));
  const avgOlderBSR = olderBSR.length ? olderBSR.reduce((a, b) => a + b, 0) / olderBSR.length : NaN;
  const bsrTrend = (isNaN(avgRecentBSR) || isNaN(avgOlderBSR)) ? 'improving' : (avgRecentBSR < avgOlderBSR ? 'improving' : 'declining');

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gradient-to-br from-[#0b1020]/90 to-[#0d1b2a]/90 backdrop-blur-md rounded-2xl p-6 border border-white/10 shadow-2xl"
    >
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
        <div>
          <h3 className="text-xl font-bold text-white mb-1">{book.title}</h3>
          <div className="flex items-center gap-4 text-sm text-gray-400">
            <span>ASIN: {book.asin}</span>
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
              book.category === 'Travel Guide' 
                ? 'bg-blue-500/20 text-blue-300' 
                : 'bg-green-500/20 text-green-300'
            }`}>
              {book.category}
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="text-center">
            <div className="flex items-center gap-1 text-sm text-gray-400 mb-1">
              {bsrTrend === 'improving' ? (
                <TrendingUp className="w-4 h-4 text-green-400" />
              ) : (
                <TrendingDown className="w-4 h-4 text-red-400" />
              )}
              <span>BSR Trend</span>
            </div>
            <span className={`text-lg font-bold ${
              bsrTrend === 'improving' ? 'text-green-400' : 'text-red-400'
            }`}>
              {bsrTrend === 'improving' ? 'Improving' : 'Declining'}
            </span>
          </div>
          
          <div className="text-center">
            <div className="flex items-center gap-1 text-sm text-gray-400 mb-1">
              <Star className="w-4 h-4 text-yellow-400" />
              <span>Current Rating</span>
            </div>
            <span className="text-lg font-bold text-white">{book.rating}</span>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-white/5 rounded-xl p-4 mb-4 border border-white/10">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-lg font-semibold text-white">60-Day Performance Trend</h4>
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ background: 'linear-gradient(90deg, #8b5cf6, #ec4899)' }}></div>
              <span className="text-gray-300">BSR (Lower is Better)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ background: 'linear-gradient(90deg, #3b82f6, #06b6d4)' }}></div>
              <span className="text-gray-300">Review Count</span>
            </div>
          </div>
        </div>
        
        <div className="relative overflow-x-auto">
          <svg 
            className="w-full min-w-[600px]" 
            viewBox={`0 0 ${chartWidth} ${chartHeight + 60}`}
            style={{ height: detailed ? '400px' : '280px' }}
          >
            {/* Grid lines */}
            <defs>
              <pattern id="grid" width="40" height="30" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 30" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1"/>
              </pattern>
              <linearGradient id="bsrGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#8b5cf6" />
                <stop offset="100%" stopColor="#ec4899" />
              </linearGradient>
              <linearGradient id="reviewGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#3b82f6" />
                <stop offset="100%" stopColor="#06b6d4" />
              </linearGradient>
              <linearGradient id="bsrArea" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.28" />
                <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="revArea" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.18" />
                <stop offset="100%" stopColor="#06b6d4" stopOpacity="0" />
              </linearGradient>
              <filter id="glowPink" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="2.5" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter id="glowCyan" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="2.2" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              {/* pulsing animated line glows */}
              <filter id="pulsePink" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="2.2" result="blur">
                  <animate attributeName="stdDeviation" values="1.6;3.2;1.6" dur="3s" repeatCount="indefinite" />
                </feGaussianBlur>
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter id="pulseCyan" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="2.0" result="blur">
                  <animate attributeName="stdDeviation" values="1.2;2.4;1.2" dur="3.2s" repeatCount="indefinite" />
                </feGaussianBlur>
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              {/* pulsing halo for markers */}
              <filter id="pulseHaloMini" x="-100%" y="-100%" width="300%" height="300%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            
            <rect width={chartWidth} height={chartHeight} fill="url(#grid)" />
            
            {/* BSR Area */}
            <polygon points={areaBsrPoints} fill="url(#bsrArea)" />
            {/* BSR Line */}
            <polyline
              fill="none"
              stroke="url(#bsrGradient)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              filter="url(#pulsePink)"
              points={bsrPolyline}
            />
            
            {/* Review Area */}
            <polygon points={areaRevPoints} fill="url(#revArea)" />
            {/* Review Count Line */}
            <polyline
              fill="none"
              stroke="url(#reviewGradient)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              filter="url(#pulseCyan)"
              points={revPolyline}
            />
            
            {/* Data points: minimal near-line markers (chevrons for BSR, dots for reviews) */}
            {trendData.map((point, index) => {
              if (index % 5 === 0 || index === book.trendData.length - 1) {
                const x = computeX(index);
                const bsrY = computeYBSR(point.bsr);
                const reviewY = computeYREV(point.reviews);
                const prevBsr = Number(trendData?.[index - 1]?.bsr);
                const hasPrev = Number.isFinite(prevBsr) && Number.isFinite(point.bsr);
                const improved = hasPrev ? (point.bsr < prevBsr) : null; // improvement => BSR decreased
                const t = improved === null ? 'flat' : (improved ? 'down' : 'up');
                const color = t === 'up' ? '#ef4444' : '#fbbf24';
                const rotate = t === 'down' ? 180 : 0;
                const offset = 8;
                const oy = t === 'up' ? -offset : offset; // up arrow sits above, down arrow below

                return (
                  <g key={index}>
                    {/* BSR near-line chevron marker with pulsing halo */}
                    <g transform={`translate(${x}, ${bsrY + oy}) rotate(${rotate})`}>
                      <g filter="url(#pulseHaloMini)">
                        <circle r="0" fill={color} opacity="0.22">
                          <animate attributeName="r" values="0;6;0" dur="2.2s" repeatCount="indefinite" />
                          <animate attributeName="opacity" values="0.22;0;0.22" dur="2.2s" repeatCount="indefinite" />
                        </circle>
                      </g>
                      <path d="M -6 0 L 0 -5 L 6 0" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" opacity="0.18" />
                      <path d="M -6 0 L 0 -5 L 6 0" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                    </g>
                    {/* Reviews small dot (kept minimal) */}
                    <circle cx={x} cy={reviewY} r="2.5" fill="#06b6d4" />
                  </g>
                );
              }
              return null;
            })}
            
            {/* Y-axis labels */}
            <text x="10" y="20" fill="rgba(255,255,255,0.7)" fontSize="12" textAnchor="middle">
              {maxBSR.toLocaleString()}
            </text>
            <text x="10" y={chartHeight - 10} fill="rgba(255,255,255,0.7)" fontSize="12" textAnchor="middle">
              {minBSR.toLocaleString()}
            </text>
            
            {/* X-axis labels */}
            <text x="20" y={chartHeight + 20} fill="rgba(255,255,255,0.7)" fontSize="12" textAnchor="start">
              {trendData[0]?.date}
            </text>
            <text x={chartWidth - 20} y={chartHeight + 20} fill="rgba(255,255,255,0.7)" fontSize="12" textAnchor="end">
              {trendData[trendData.length - 1]?.date}
            </text>
          </svg>
        </div>
      </div>

      {/* Key Metrics */}
      {detailed && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white/5 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-white">#{book.currentBSR.toLocaleString()}</div>
            <div className="text-sm text-gray-400">Current BSR</div>
          </div>
          <div className="bg-white/5 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-white">{book.reviewCount}</div>
            <div className="text-sm text-gray-400">Total Reviews</div>
          </div>
          <div className="bg-white/5 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-white">${book.price}</div>
            <div className="text-sm text-gray-400">Current Price</div>
          </div>
          <div className="bg-white/5 rounded-lg p-3 text-center">
            <div className={`text-2xl font-bold ${
              book.stockStatus === 'In Stock' ? 'text-green-400' : 
              book.stockStatus === 'Low Stock' ? 'text-yellow-400' : 'text-red-400'
            }`}>
              {book.stockStatus}
            </div>
            <div className="text-sm text-gray-400">Stock Status</div>
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default TrendChart;