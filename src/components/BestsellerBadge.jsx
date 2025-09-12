import React from 'react';
import { Star } from 'lucide-react';

const BestsellerBadge = ({ small = false, micro = false, iconOnly = false }) => {
  const variant = micro ? 'micro' : (small ? 'small' : 'default');
  const sizeText = iconOnly ? 'px-1.5 py-1' : (variant === 'default'
    ? 'text-[11px] px-2 py-[1.5px]'
    : variant === 'small'
      ? 'text-[10px] px-1.5 py-[1px]'
      : 'text-[9px] px-1.5 py-px');
  const iconSize = iconOnly ? 'w-3 h-3' : (variant === 'default' ? 'w-3.5 h-3.5' : variant === 'small' ? 'w-3 h-3' : 'w-2.5 h-2.5');
  const bodyClass = iconOnly
    ? 'bg-amber-400/20 text-amber-200 border border-amber-400/40'
    : (variant === 'micro'
      ? 'bg-amber-500/12 text-amber-200 border border-amber-400/25'
      : 'bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500 text-white border border-white/10 shadow-md');

  return (
    <div className="relative inline-flex items-center group">
      <style>{`
        @keyframes badgeShimmer { from { transform: translateX(-110%); } to { transform: translateX(110%); } }
        @keyframes badgeRingSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) { .badge-anim { animation: none !important; } }
      `}</style>
      {/* subtle animated ring (disabled on micro) */}
      {variant !== 'micro' && (
        <div className="absolute -inset-[1px] rounded-full pointer-events-none badge-anim"
             style={{ animation: 'badgeRingSpin 12s linear infinite', opacity: 0.6 }}>
          <div
            className="w-full h-full rounded-full"
            style={{
              background: 'conic-gradient(from 0deg, rgba(251,146,60,0.20), rgba(255,255,255,0.06), rgba(251,146,60,0.20))',
              WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 1px), #000 calc(100% - 0px))',
              mask: 'radial-gradient(farthest-side, transparent calc(100% - 1px), #000 calc(100% - 0px))'
            }}
          />
        </div>
      )}
      {/* badge body */}
      <div className={`relative rounded-full pointer-events-none flex items-center ${iconOnly ? '' : 'gap-1'} ${bodyClass} ${sizeText}`}>
        <Star className={`${iconSize}`} />
        {!iconOnly && (
          <span className={variant === 'micro' ? 'tracking-tight' : 'tracking-wide'}>{variant === 'micro' ? 'Bestseller' : '#1 Best Seller'}</span>
        )}
        {/* shimmer overlay (disabled on micro) */}
        {!iconOnly && variant !== 'micro' && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-full">
            <div
              className="badge-anim absolute inset-y-0 -left-full w-1/2 bg-gradient-to-r from-transparent via-white/30 to-transparent opacity-40"
              style={{ animation: 'badgeShimmer 5s ease-in-out infinite' }}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default BestsellerBadge;