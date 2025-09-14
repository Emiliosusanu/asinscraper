import React from 'react';
import { motion } from 'framer-motion';
import { Star, TrendingUp, DollarSign, RefreshCcw, Trash2, Loader2, LineChart, Clock, PackageCheck, PackageX, Edit, MessageCircle, BarChart2, Calendar, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import TrendIndicator from '@/components/TrendIndicator';
import BestsellerBadge from '@/components/BestsellerBadge';
import { calculateSalesFromBsr, calculateIncome } from '@/lib/incomeCalculator';
import { estimateRoyalty } from '@/lib/royaltyEstimator';

const AsinListItem = ({ data, trend, snapshot, onRefresh, onDelete, onShowChart, onEditRoyalty, onShowReviews, onShowLogs, isRefreshing }) => {
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
  const countryFlag = (() => {
    const cc = (data.country || 'com').toLowerCase();
    if (cc === 'it') return '🇮🇹';
    if (cc === 'de') return '🇩🇪';
    if (cc === 'fr') return '🇫🇷';
    if (cc === 'es') return '🇪🇸';
    if (cc === 'co.uk') return '🇬🇧';
    return '🇺🇸';
  })();
  
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

  const stockStatus = (data.stock_status || '').toLowerCase();
  const availableSoonRx = /(available to ship|usually ships|ships within|spedizione|disponibile tra|verfügbar|expédition sous|disponibile en)/i;
  const code = (data.availability_code || '').toUpperCase();
  const isInStock = code === 'IN_STOCK' || /in stock/i.test(stockStatus);
  const isAvailableSoon = code === 'AVAILABLE_SOON' || availableSoonRx.test(stockStatus);
  // performance snapshot chips hidden per request
  const sales = calculateSalesFromBsr(data.bsr);
  const effectiveRoyalty = (data.royalty && data.royalty > 0) ? data.royalty : estimateRoyalty(data);
  const income = calculateIncome(sales, effectiveRoyalty);

  const formatIncomeRange = (range) => {
    if (!range || (range[0] === 0 && range[1] === 0)) return '€0.00';
    if (range[0] === range[1]) return `€${range[0].toFixed(2)}`;
    return `€${range[0].toFixed(2)} - €${range[1].toFixed(2)}`;
  };

  // (Per-ASIN notification removed for a steadier layout)

  // Mouse-follow glow for list rows
  const rowRef = React.useRef(null);
  const [glowActive, setGlowActive] = React.useState(false);
  const handleMouseMove = React.useCallback((e) => {
    const el = rowRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    el.style.setProperty('--mx', `${x}px`);
    el.style.setProperty('--my', `${y}px`);
  }, []);

  return (
    <motion.div
      ref={rowRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setGlowActive(true)}
      onMouseLeave={() => setGlowActive(false)}
      layout
      data-asin={data.asin}
      tabIndex={0}
      role="row"
      aria-label={data.title || data.asin}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onShowChart?.(data);
        }
      }}
      className={`relative flex items-center gap-2 sm:gap-4 p-2 sm:p-4 border-b border-border/20 last:border-b-0 hover:bg-muted/30 transition-colors transition-shadow duration-200 md:hover:shadow-[0_0_22px_rgba(255,255,255,0.12)] group focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20 rounded-md ${isRefreshing ? 'ring-1 ring-emerald-400/40 bg-emerald-500/[0.04]' : ''}`}
      style={{ '--mx': '50%', '--my': '50%', contain: 'paint', willChange: 'box-shadow' }}
    >
      <style>{`
        @keyframes rowPulse { 0%, 100% { opacity: 0.16; } 50% { opacity: 0.5; } }
      `}</style>
      {isRefreshing && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-md"
          style={{
            background: 'linear-gradient(90deg, rgba(16,185,129,0.08), transparent 40%, rgba(59,130,246,0.08))',
            animation: 'rowPulse 1400ms ease-in-out infinite'
          }}
        />
      )}
      {/* white neon mouse-follow overlay */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 rounded-md transition-opacity duration-150 hidden md:block ${(glowActive || isRefreshing) ? 'opacity-100' : 'opacity-0'}`}
        style={{
          background: 'radial-gradient(120px circle at var(--mx) var(--my), rgba(255,255,255,0.18), rgba(255,255,255,0.06) 45%, transparent 70%), radial-gradient(300px circle at var(--mx) var(--my), rgba(255,255,255,0.08), transparent 70%)',
          mixBlendMode: 'screen'
        }}
      />
      <a href={amazonLink} target="_blank" rel="noopener noreferrer" className="flex-shrink-0 relative group/cover">
        <div className="relative w-12 h-16 sm:w-16 sm:h-24 rounded-md overflow-hidden ring-1 ring-white/10 transition-colors duration-200 md:group-hover/cover:ring-white/40">
          {data.is_bestseller && (
            <div className="absolute -left-1 -top-1 z-10">
              <BestsellerBadge small={true} />
            </div>
          )}
          {/* elegant moving sheen */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            <div className="absolute top-0 left-0 h-full w-2/3 -translate-x-[65%] md:group-hover/cover:translate-x-[180%] transition-transform duration-700 ease-in-out bg-gradient-to-r from-transparent via-white/30 to-transparent skew-x-12 blur-[0.5px]" />
          </div>
          <img className="w-full h-full object-cover rounded-md shadow-md transition-transform duration-300 group-hover:scale-105" alt={`Copertina di ${data.title}`} src={imageUrl} loading="lazy" decoding="async" fetchpriority="low" />
        </div>
      </a>
      
      <div className="flex-1 grid grid-cols-12 gap-3 sm:gap-4 items-center min-w-0">
        <div className="col-span-12 sm:col-span-3 min-w-0">
          <h3 className="font-semibold text-foreground text-sm sm:text-base line-clamp-2 sm:line-clamp-1">{data.title || 'Titolo non disponibile'}</h3>
          <p className="text-xs text-muted-foreground line-clamp-1">{data.author || 'Autore non disponibile'}</p>
          <div className={`flex items-center gap-1.5 text-xs mt-1 ${isInStock ? 'text-green-400' : isAvailableSoon ? 'text-yellow-400' : 'text-orange-400'}`}>
            {isInStock ? <PackageCheck className="w-3 h-3" /> : isAvailableSoon ? <Clock className="w-3 h-3" /> : <PackageX className="w-3 h-3" />}
            <span className="font-semibold truncate">{data.stock_status || 'Sconosciuto'}</span>
          </div>
          {/* Snapshot chips (QI/Mo/Vol) intentionally hidden */}
          {/* Mobile chips summary */}
          <div className="sm:hidden flex flex-wrap gap-1.5 mt-2">
            <span className="inline-flex items-center gap-1 bg-muted/50 text-foreground px-2 py-1 rounded text-[11px]">{countryFlag} {(data.country || 'com').toUpperCase()}</span>
            <span className="inline-flex items-center gap-1 bg-muted/50 text-foreground px-2 py-1 rounded text-[11px]"><DollarSign className="w-3 h-3 text-green-400" />{data.price > 0 ? `€${data.price.toFixed(2)}` : '—'}</span>
            <span className="inline-flex items-center gap-1 bg-muted/50 text-foreground px-2 py-1 rounded text-[11px]"><TrendingUp className="w-3 h-3 text-secondary" />{formatNumber(data.bsr)}</span>
            <span className="inline-flex items-center gap-1 bg-muted/50 text-foreground px-2 py-1 rounded text-[11px]"><Star className="w-3 h-3 text-yellow-400" />{data.rating ? `${data.rating} (${formatNumber(data.review_count)})` : '—'}</span>
            <span className="inline-flex items-center gap-1 bg-muted/50 text-foreground px-2 py-1 rounded text-[11px] whitespace-nowrap"><BarChart2 className="w-3 h-3 text-accent" />{income ? `${formatIncomeRange(income.monthly)}` : '—'}</span>
            <span className="inline-flex items-center gap-1 bg-muted/50 text-muted-foreground px-2 py-1 rounded text-[11px] whitespace-nowrap"><Clock className="w-3 h-3" />{formatTimeAgo(data.updated_at) || 'Mai'}</span>
            {data.publication_date && (
              <span className="inline-flex items-center gap-1 bg-muted/50 text-muted-foreground px-2 py-1 rounded text-[11px] whitespace-nowrap"><Calendar className="w-3 h-3" />{new Date(data.publication_date).toLocaleDateString('it-IT')}</span>
            )}
          </div>
          {/* Mobile quick actions */}
          <div className="sm:hidden flex items-center gap-1.5 mt-1 -mr-2">
            <Button onClick={handleRefresh} size="icon" variant="ghost" className="w-8 h-8" disabled={isRefreshing} aria-label="Aggiorna">
              {isRefreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
            </Button>
            <Button onClick={handleShowChart} size="icon" variant="ghost" className="w-8 h-8" aria-label="Grafico">
              <LineChart className="w-4 h-4" />
            </Button>
            <Button onClick={handleShowReviews} size="icon" variant="ghost" className="w-8 h-8" aria-label="Recensioni">
              <MessageCircle className="w-4 h-4" />
            </Button>
          </div>
        </div>
        
        <div className="hidden sm:flex col-span-6 sm:col-span-2 items-center gap-2 text-sm">
          <DollarSign className="w-4 h-4 text-green-400 flex-shrink-0" />
          <div className="flex items-center gap-1">
            <span className="font-semibold text-foreground">{data.price > 0 ? `€${data.price.toFixed(2)}` : '—'}</span>
            <TrendIndicator trend={trend?.price} />
          </div>
        </div>

        <div className="hidden sm:flex col-span-6 sm:col-span-2 items-center gap-2 text-sm">
          <TrendingUp className="w-4 h-4 text-secondary flex-shrink-0" />
          <div className="flex items-center gap-1">
            <span className="font-semibold text-foreground">{formatNumber(data.bsr)}</span>
            <TrendIndicator trend={trend?.bsr} />
          </div>
        </div>

        <div className="hidden sm:flex col-span-6 sm:col-span-2 items-center gap-2 text-sm">
          <Star className="w-4 h-4 text-yellow-400 flex-shrink-0" />
          <div className="flex items-center gap-1">
            <span className="font-semibold text-foreground">{data.rating ? `${data.rating} (${formatNumber(data.review_count)})` : '—'}</span>
            <TrendIndicator trend={trend?.reviews} />
          </div>
        </div>
        
        <div className="hidden sm:flex col-span-6 sm:col-span-2 items-center gap-2 text-sm">
          <BarChart2 className="w-4 h-4 text-accent flex-shrink-0" />
           <div className="flex items-center gap-1">
            <span className="font-semibold text-foreground whitespace-nowrap">{formatIncomeRange(income.monthly)}</span>
            <TrendIndicator trend={trend?.income} />
          </div>
        </div>

        <div className="hidden sm:flex col-span-12 sm:col-span-1 flex-col items-end gap-1 text-xs text-muted-foreground">
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