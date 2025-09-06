import React from 'react';
import { motion } from 'framer-motion';
import { BookOpen, Star, MessageSquare, TrendingUp } from 'lucide-react';

const StatsOverview = ({ totalBooks, avgRating, totalReviews, avgBSR }) => {
  const stats = [
    {
      icon: BookOpen,
      label: 'Total Books',
      value: totalBooks,
      color: 'from-blue-500 to-cyan-500',
      bgColor: 'bg-blue-500/10'
    },
    {
      icon: Star,
      label: 'Avg Rating',
      value: avgRating,
      color: 'from-yellow-500 to-orange-500',
      bgColor: 'bg-yellow-500/10'
    },
    {
      icon: MessageSquare,
      label: 'Total Reviews',
      value: totalReviews.toLocaleString(),
      color: 'from-green-500 to-emerald-500',
      bgColor: 'bg-green-500/10'
    },
    {
      icon: TrendingUp,
      label: 'Avg BSR',
      value: `#${avgBSR.toLocaleString()}`,
      color: 'from-purple-500 to-pink-500',
      bgColor: 'bg-purple-500/10'
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      {stats.map((stat, index) => (
        <motion.div
          key={stat.label}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1 }}
          className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm rounded-2xl p-6 border border-white/10 shadow-2xl"
        >
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-xl ${stat.bgColor}`}>
              <stat.icon className={`w-6 h-6 bg-gradient-to-r ${stat.color} bg-clip-text text-transparent`} />
            </div>
            <div>
              <div className="text-2xl font-bold text-white">{stat.value}</div>
              <div className="text-sm text-gray-400">{stat.label}</div>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
};

export default StatsOverview;