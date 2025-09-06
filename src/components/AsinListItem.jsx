import React from 'react';
import { motion } from 'framer-motion';
import { Star, TrendingUp, DollarSign, RefreshCcw, Trash2, Loader2, LineChart, Clock, PackageCheck, PackageX, Edit, MessageCircle, BarChart2, Calendar, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import TrendIndicator from '@/components/TrendIndicator';
import BestsellerBadge from '@/components/BestsellerBadge';
import { calculateSalesFromBsr, calculateIncome } from '@/lib/incomeCalculator';
import { estimateRoyalty } from '@/lib/royaltyEstimator';

const AsinListItem = ({ data, trend, onRefresh, onDelete, onShowChart, onEditRoyalty, onShowReviews, onShowLogs, isRefreshing }) => {
  const handleRefresh = (e) => {
    e.stopPropagation();
    onRefresh?.(data);
  };

  const handleDelete = (e) => {
    e.stopPropagation();
    onDelete?.(data);
  };

  const handleShowChart = (e) => {
    e.stopPropagation();
    onShowChart?.(data);
  };

  const handleEditRoyalty = (e) => {
    e.stopPropagation();
    onEditRoyalty?.(data);
  };

  const handleShowReviews = (e) => {
    e.stopPropagation();
    onShowReviews?.(data);
  };

  const handleShowLogs = (e) => {
    e.stopPropagation();
    onShowLogs?.(data);
  };

  const imageUrl = data.image_url && data.image_url !== '/placeholder.png' 
    ? data.image_url 
    : `https://images.unsplash.com/photo-1589998059171-988d887df646?q=80&w=800&auto=format&fit=crop`;

  const amazonLink = `https://www.amazon.${data.country || 'com'}/dp/${data.asin}`;
  
  const formatTimeAgo = (dateString) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    if (seconds < 60) return `${Math.floor(seconds)}s fa`;
    const minutes = seconds / 60;
    if (minutes < 60) return `${Math.floor(minutes)}m fa`;
    const hours = minutes / 60;
    if (hours < 24) return `${Math.floor(hours)}h fa`;
    const days = hours / 24;
    return `${Math.floor(days)}g fa`;
  };
  
  const formatNumber = (num) => {
    if (typeof num !== 'number' || num === 0) return '—';
    return new Intl.NumberFormat('it-IT').format(num);
  };

  const isAvailable = data.stock_status && (data.stock_status.toLowerCase().includes('in stock') || data.stock_status.toLowerCase().includes('disponibile'));
  const sales = calculateSalesFromBsr(data.bsr);
  const effectiveRoyalty = (data.royalty && data.royalty > 0) ? data.royalty : estimateRoyalty(data);
  const income = calculateIncome(sales, effectiveRoyalty);

  const formatIncomeRange = (range) => {
    if (!range || (range[0] === 0 && range[1] === 0)) return '€0.00';
    if (range[0] === range[1]) return `€${range[0].toFixed(2)}`;
    return `€${range[0].toFixed(2)} - €${range[1].toFixed(2)}`;
  };

  // (Per-ASIN notification removed for a steadier layout)

  return (
    <motion.div
      layout
      className="flex items-center gap-2 sm:gap-4 p-2 sm:p-4 border-b border-border/20 last:border-b-0 hover:bg-muted/30 transition-colors duration-200 group"
    >
      <a href={amazonLink} target="_blank" rel="noopener noreferrer" className="flex-shrink-0 relative">
        <div className="relative w-12 h-16 sm:w-16 sm:h-24">
          {data.is_bestseller && <BestsellerBadge small={true} />}
          <img className="w-full h-full object-cover rounded-md shadow-md transition-transform duration-300 group-hover:scale-105" alt={`Copertina di ${data.title}`} src={imageUrl} />
        </div>
      </a>
      
      <div className="flex-1 grid grid-cols-12 gap-4 items-center">
        <div className="col-span-12 sm:col-span-3">
          <h3 className="font-semibold text-foreground text-sm sm:text-base line-clamp-2 sm:line-clamp-1">{data.title || 'Titolo non disponibile'}</h3>
          <p className="text-xs text-muted-foreground line-clamp-1">{data.author || 'Autore non disponibile'}</p>
          <div className={`flex items-center gap-1.5 text-xs mt-1 ${isAvailable ? 'text-green-400' : 'text-orange-400'}`}>
            {isAvailable ? <PackageCheck className="w-3 h-3" /> : <PackageX className="w-3 h-3" />}
            <span className="font-semibold">{data.stock_status || 'Sconosciuto'}</span>
          </div>
        </div>
        
        <div className="col-span-6 sm:col-span-2 flex items-center gap-2 text-sm">
          <DollarSign className="w-4 h-4 text-green-400 flex-shrink-0" />
          <div className="flex items-center gap-1">
            <span className="font-semibold text-foreground">{data.price > 0 ? `€${data.price.toFixed(2)}` : '—'}</span>
            <TrendIndicator trend={trend?.price} />
          </div>
        </div>

        <div className="col-span-6 sm:col-span-2 flex items-center gap-2 text-sm">
          <TrendingUp className="w-4 h-4 text-secondary flex-shrink-0" />
          <div className="flex items-center gap-1">
            <span className="font-semibold text-foreground">{formatNumber(data.bsr)}</span>
            <TrendIndicator trend={trend?.bsr} />
          </div>
        </div>

        <div className="col-span-6 sm:col-span-2 flex items-center gap-2 text-sm">
          <Star className="w-4 h-4 text-yellow-400 flex-shrink-0" />
          <div className="flex items-center gap-1">
            <span className="font-semibold text-foreground">{data.rating ? `${data.rating} (${formatNumber(data.review_count)})` : '—'}</span>
            <TrendIndicator trend={trend?.reviews} />
          </div>
        </div>
        
        <div className="col-span-6 sm:col-span-2 flex items-center gap-2 text-sm">
          <BarChart2 className="w-4 h-4 text-accent flex-shrink-0" />
           <div className="flex items-center gap-1">
            <span className="font-semibold text-foreground whitespace-nowrap">{formatIncomeRange(income.monthly)}</span>
            <TrendIndicator trend={trend?.income} />
          </div>
        </div>

        <div className="col-span-12 sm:col-span-1 flex flex-col items-end gap-1 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            <span>{formatTimeAgo(data.updated_at) || 'Mai'}</span>
          </div>
           {data.publication_date && (
            <div className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              <span>{new Date(data.publication_date).toLocaleDateString('it-IT')}</span>
            </div>
          )}
        </div>

        <div className="hidden sm:flex col-span-12 sm:col-span-12 items-center justify-end gap-0 -mr-2">
            <Button onClick={handleRefresh} size="icon" variant="ghost" className="w-8 h-8 text-muted-foreground hover:text-foreground hover:bg-muted" disabled={isRefreshing}>
              {isRefreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
            </Button>
            <Button onClick={handleShowLogs} size="icon" variant="ghost" className="w-8 h-8 text-muted-foreground hover:text-foreground hover:bg-muted">
              <History className="w-4 h-4" />
            </Button>
            <Button onClick={handleShowReviews} size="icon" variant="ghost" className="w-8 h-8 text-muted-foreground hover:text-foreground hover:bg-muted">
              <MessageCircle className="w-4 h-4" />
            </Button>
            <Button onClick={handleEditRoyalty} size="icon" variant="ghost" className="w-8 h-8 text-muted-foreground hover:text-foreground hover:bg-muted">
              <Edit className="w-4 h-4" />
            </Button>
            <Button onClick={handleShowChart} size="icon" variant="ghost" className="w-8 h-8 text-muted-foreground hover:text-foreground hover:bg-muted">
              <LineChart className="w-4 h-4" />
            </Button>
            <Button onClick={handleDelete} size="icon" variant="ghost" className="w-8 h-8 text-destructive/70 hover:text-destructive hover:bg-destructive/10">
              <Trash2 className="w-4 h-4" />
            </Button>
        </div>
      </div>
    </motion.div>
  );
};

export default AsinListItem;