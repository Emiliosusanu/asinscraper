import React from 'react';
import { Star } from 'lucide-react';

const BestsellerBadge = ({ small = false }) => {
  const sizeText = small ? 'text-[8px] px-1 py-[0.5px]' : 'text-[9px] px-1 py-[0.5px]';
  const iconSize = small ? 'w-2 h-2' : 'w-2.5 h-2.5';
  return (
    <div className="relative inline-flex items-center group">
      <style>{`
        @keyframes badgeShimmer { from { transform: translateX(-110%); } to { transform: translateX(110%); } }
        @keyframes badgeRingSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) {
          .badge-anim { animation: none !important; }
        }
      `}</style>
      {/* subtle animated ring (very low alpha) */}
      <div className="absolute -inset-[0.5px] rounded-full pointer-events-none badge-anim"
           style={{
             animation: 'badgeRingSpin 14s linear infinite',
             opacity: 0.18,
           }}>
        <div
          className="w-full h-full rounded-full"
          style={{
            background: 'conic-gradient(from 0deg, rgba(251,146,60,0.10), rgba(255,255,255,0.03), rgba(251,146,60,0.10))',
            WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 1px), #000 calc(100% - 0px))',
            mask: 'radial-gradient(farthest-side, transparent calc(100% - 1px), #000 calc(100% - 0px))'
          }}
        />
      </div>
      {/* badge body */}
      <div className={`relative bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500 text-white font-normal rounded-full shadow-none pointer-events-none flex items-center gap-0.5 border border-white/10 leading-none ${sizeText}`}>
        <Star className={`${iconSize}`} />
        <span className="tracking-tight">#1 Best Seller</span>
        {/* shimmer overlay */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-full">
          <div
            className="badge-anim absolute inset-y-0 -left-full w-1/4 bg-gradient-to-r from-transparent via-white/30 to-transparent opacity-20"
            style={{ animation: 'badgeShimmer 8s ease-in-out infinite' }}
          />
        </div>
      </div>
    </div>
  );
};

export default BestsellerBadge;