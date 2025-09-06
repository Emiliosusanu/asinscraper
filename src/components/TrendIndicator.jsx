import React from 'react';
import { motion } from 'framer-motion';
import { ArrowUp, ArrowDown, Minus } from 'lucide-react';

const trendConfig = {
  up: {
    Icon: ArrowUp,
    color: 'text-green-400',
  },
  down: {
    Icon: ArrowDown,
    color: 'text-red-400',
  },
  stable: {
    Icon: Minus,
    color: 'text-gray-500',
  },
};

const TrendIndicator = ({ trend, small = false }) => {
  if (!trend || !trendConfig[trend]) {
    return <div className={small ? "w-4 h-4" : "w-5 h-5"} />; // Placeholder for alignment
  }

  const { Icon, color } = trendConfig[trend];
  const sizeCls = small ? 'w-4 h-4' : 'w-5 h-5';

  return (
    <motion.div
      key={trend}
      initial={{ opacity: 0, y: 5, scale: 0.8 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -5, scale: 0.8 }}
      transition={{ duration: 0.4, type: 'spring', stiffness: 300, damping: 20 }}
      className={`inline-flex items-center ${color}`}
    >
      <Icon className={sizeCls} />
    </motion.div>
  );
};

export default TrendIndicator;