import React from 'react';
import { Star, FileText, TrendingUp, DollarSign } from 'lucide-react';
import { motion } from 'framer-motion';

const ScrapedBookCard = ({ book }) => {
  if (!book) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className="bg-gradient-to-br from-slate-700/50 to-slate-800/50 rounded-xl p-6 border border-white/10 shadow-lg"
    >
      <div className="flex flex-col sm:flex-row gap-6">
        <div className="flex-shrink-0">
          <img  class="w-32 h-48 object-cover rounded-md shadow-md mx-auto" alt={`Cover of ${book.title}`} src="https://images.unsplash.com/photo-1641505819445-77b0b6b5b4ef" />
        </div>
        <div className="flex-1">
          <h3 className="text-2xl font-bold text-white mb-2">{book.title}</h3>
          <p className="text-lg text-gray-300 mb-4">by {book.author}</p>
          
          <div className="grid grid-cols-2 gap-4 text-white">
            <div className="flex items-center gap-2 bg-white/10 p-3 rounded-lg">
              <DollarSign className="w-5 h-5 text-green-400" />
              <div>
                <p className="text-sm text-gray-400">Price</p>
                <p className="font-semibold">{book.price ? `$${book.price.toFixed(2)}` : 'N/A'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 bg-white/10 p-3 rounded-lg">
              <TrendingUp className="w-5 h-5 text-purple-400" />
              <div>
                <p className="text-sm text-gray-400">BSR</p>
                <p className="font-semibold">{book.bsr ? `#${book.bsr.toLocaleString()}` : 'N/A'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 bg-white/10 p-3 rounded-lg">
              <Star className="w-5 h-5 text-yellow-400" />
              <div>
                <p className="text-sm text-gray-400">Rating</p>
                <p className="font-semibold">{book.rating ? `${book.rating} / 5` : 'N/A'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 bg-white/10 p-3 rounded-lg">
              <FileText className="w-5 h-5 text-blue-400" />
              <div>
                <p className="text-sm text-gray-400">Reviews</p>
                <p className="font-semibold">{book.reviewCount ? book.reviewCount.toLocaleString() : 'N/A'}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default ScrapedBookCard;