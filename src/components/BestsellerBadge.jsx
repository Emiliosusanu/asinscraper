import React from 'react';
import { Star } from 'lucide-react';

const BestsellerBadge = ({ small = false }) => {
  const sizeText = small ? 'text-[10px] px-1.5 py-[1px]' : 'text-[11px] px-2 py-[1.5px]';
  const iconSize = small ? 'w-3 h-3' : 'w-3.5 h-3.5';
  return (
    <div className="relative inline-flex items-center group">
      <style>{`
        @keyframes badgeShimmer { from { transform: translateX(-110%); } to { transform: translateX(110%); } }
        @keyframes badgeRingSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) {
          .badge-anim { animation: none !important; }
        }
      `}</style>
      {/* subtle animated ring */}
      <div className="absolute -inset-[1px] rounded-full pointer-events-none badge-anim"
           style={{
             animation: 'badgeRingSpin 12s linear infinite',
             opacity: 0.6,
           }}>
        <div
          className="w-full h-full rounded-full"
          style={{
            background: 'conic-gradient(from 0deg, rgba(251,146,60,0.20), rgba(255,255,255,0.06), rgba(251,146,60,0.20))',
            WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 1px), #000 calc(100% - 0px))',
            mask: 'radial-gradient(farthest-side, transparent calc(100% - 1px), #000 calc(100% - 0px))'
          }}
        />
      </div>
      {/* badge body */}
      <div className={`relative bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500 text-white font-medium rounded-full shadow-md pointer-events-none flex items-center gap-1 border border-white/10 ${sizeText}`}>
        <Star className={`${iconSize}`} />
        <span className="tracking-wide">#1 Best Seller</span>
        {/* shimmer overlay */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-full">
          <div
            className="badge-anim absolute inset-y-0 -left-full w-1/2 bg-gradient-to-r from-transparent via-white/30 to-transparent opacity-40"
            style={{ animation: 'badgeShimmer 5s ease-in-out infinite' }}
          />
        </div>
      </div>
    </div>
  );
};

export default BestsellerBadge;