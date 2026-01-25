import React, { useId } from 'react';
import { Star } from 'lucide-react';

const BestsellerBadge = ({ small = false, micro = false, iconOnly = false }) => {
  const variant = micro ? 'micro' : (small ? 'small' : 'default');
  const sizeText = iconOnly ? 'px-1.5 py-1' : (variant === 'default'
    ? 'text-[10.5px] px-2 py-[1px]'
    : variant === 'small'
      ? 'text-[10px] px-1.5 py-[0.5px]'
      : 'text-[9px] px-1.5 py-[0.5px]');
  const iconSize = iconOnly ? 'w-3 h-3' : (variant === 'default' ? 'w-3.5 h-3.5' : variant === 'small' ? 'w-3 h-3' : 'w-2.5 h-2.5');
  const shimmerDuration = variant === 'default' ? '5s' : '3.8s';
  const glowInsetClass = variant === 'micro' ? '-inset-1' : (variant === 'small' ? '-inset-2' : '-inset-3');
  const sparkSize = variant === 'default' ? 14 : (variant === 'small' ? 13 : 12);
  const sparkPosClass = variant === 'default' ? '-top-2 right-1' : (variant === 'small' ? '-top-2 right-0.5' : '-top-2 right-0');
  const sparkId = useId();
  const bodyGlowStyle = iconOnly ? undefined : {
    filter: variant === 'default'
      ? 'drop-shadow(0 0 10px rgba(255,255,255,0.28)) drop-shadow(0 0 22px rgba(251,146,60,0.32))'
      : variant === 'small'
        ? 'drop-shadow(0 0 8px rgba(255,255,255,0.22)) drop-shadow(0 0 18px rgba(251,146,60,0.26))'
        : 'drop-shadow(0 0 6px rgba(255,255,255,0.18)) drop-shadow(0 0 14px rgba(251,146,60,0.22))'
  };
  const bodyClass = iconOnly
    ? 'bg-amber-400/20 text-amber-200 border border-amber-400/40'
    : (variant === 'micro'
      ? 'bg-gradient-to-r from-amber-600 via-orange-600 to-amber-600 text-white border border-white/10'
      : variant === 'small'
        ? 'bg-gradient-to-r from-amber-600 via-orange-600 to-amber-600 text-white border border-white/10'
        : 'bg-gradient-to-r from-amber-600 via-orange-600 to-amber-600 text-white border border-white/10 shadow-md');

  return (
    <div className="relative inline-flex items-center group">
      <style>{`
        @keyframes badgeShimmer { from { transform: translateX(-110%); } to { transform: translateX(110%); } }
        @keyframes badgeRingSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes badgeTwinkle { 0%, 100% { opacity: 0.22; transform: translate3d(-2px, 1px, 0) scale(1); } 50% { opacity: 0.46; transform: translate3d(2px, -1px, 0) scale(1.02); } }
        @keyframes badgeGlowPulse { 0%, 100% { opacity: 0.35; transform: scale(1); } 50% { opacity: 0.7; transform: scale(1.05); } }
        @keyframes badgeGlitter { 0% { background-position: 0% 20%, 100% 0%, 40% 100%, 0% 100%; opacity: 0.22; } 50% { background-position: 100% 60%, 0% 100%, 70% 0%, 100% 100%; opacity: 0.52; } 100% { background-position: 0% 20%, 100% 0%, 40% 100%, 0% 100%; opacity: 0.22; } }
        @keyframes badgeFlash { 0% { transform: translateX(-140%) skewX(-18deg); opacity: 0; } 12% { opacity: 0.9; } 22% { opacity: 0.0; } 100% { transform: translateX(220%) skewX(-18deg); opacity: 0; } }
        @keyframes badgeSparkBurst { 0% { transform: scale(0.65) rotate(-10deg); opacity: 0.0; } 18% { opacity: 1; } 55% { transform: scale(1.05) rotate(10deg); opacity: 0.9; } 100% { transform: scale(0.8) rotate(18deg); opacity: 0.15; } }
        @keyframes badgeSparkDrift { 0%, 100% { transform: translate3d(0, 0, 0); } 50% { transform: translate3d(1px, -1px, 0); } }
        @media (prefers-reduced-motion: reduce) { .badge-anim { animation: none !important; } }
      `}</style>
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute ${sparkPosClass} badge-anim mix-blend-screen`}
        style={{
          width: `${sparkSize}px`,
          height: `${sparkSize}px`,
          filter: 'drop-shadow(0 0 7px rgba(255,255,255,0.25)) drop-shadow(0 0 14px rgba(244,114,182,0.25))',
          animation: `badgeSparkBurst ${variant === 'default' ? '1400ms' : variant === 'small' ? '1500ms' : '1600ms'} ease-in-out infinite, badgeSparkDrift 1200ms ease-in-out infinite`
        }}
      >
        <svg viewBox="0 0 24 24" className="w-full h-full" key={sparkId}>
          <path d="M12 0 L14.6 9.4 L24 12 L14.6 14.6 L12 24 L9.4 14.6 L0 12 L9.4 9.4 Z" fill="#f59e0b" opacity="0.95" />
          <path d="M7 5 L8.3 9.2 L12.5 10.5 L8.3 11.8 L7 16 L5.7 11.8 L1.5 10.5 L5.7 9.2 Z" fill="#f472b6" opacity="0.9" />
          <path d="M16.5 6 L17.6 9.7 L21.3 10.8 L17.6 11.9 L16.5 15.6 L15.4 11.9 L11.7 10.8 L15.4 9.7 Z" fill="#22d3ee" opacity="0.85" />
        </svg>
      </div>
      {!iconOnly && (
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute ${glowInsetClass} rounded-full blur-lg badge-anim opacity-60 group-hover:opacity-100 transition-opacity`}
          style={{
            background: 'conic-gradient(from 180deg, rgba(251,146,60,0.35), rgba(255,255,255,0.10), rgba(250,204,21,0.28), rgba(255,255,255,0.10), rgba(236,72,153,0.22), rgba(255,255,255,0.08), rgba(34,211,238,0.20), rgba(255,255,255,0.10), rgba(251,146,60,0.35))',
            animation: `badgeRingSpin ${variant === 'default' ? '7s' : variant === 'small' ? '8.5s' : '9s'} linear infinite, badgeGlowPulse ${variant === 'default' ? '1.6s' : '1.9s'} ease-in-out infinite`,
            opacity: variant === 'default' ? 0.65 : variant === 'small' ? 0.55 : 0.45
          }}
        />
      )}
      {/* subtle animated ring (disabled on micro) */}
      {(variant === 'default' || variant === 'small') && (
        <div className="absolute -inset-[1px] rounded-full pointer-events-none badge-anim"
             style={{ animation: `badgeRingSpin ${variant === 'default' ? '12s' : '14s'} linear infinite`, opacity: variant === 'default' ? 0.6 : 0.45 }}>
          <div
            className="w-full h-full rounded-full"
            style={{
              background: 'conic-gradient(from 0deg, rgba(251,146,60,0.35), rgba(250,204,21,0.22), rgba(255,255,255,0.08), rgba(236,72,153,0.14), rgba(34,211,238,0.14), rgba(255,255,255,0.08), rgba(251,146,60,0.35))',
              WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 1px), #000 calc(100% - 0px))',
              mask: 'radial-gradient(farthest-side, transparent calc(100% - 1px), #000 calc(100% - 0px))'
            }}
          />
        </div>
      )}
      {/* badge body */}
      <div className={`relative rounded-full pointer-events-none flex items-center ${iconOnly ? '' : 'gap-1'} ${bodyClass} ${sizeText}`} style={bodyGlowStyle}>
        {iconOnly && <Star className={`${iconSize}`} />}
        {!iconOnly && (
          <span className={variant === 'micro' ? 'tracking-tight' : 'tracking-wide'}>{variant === 'micro' ? 'Bestseller' : '#1 Best Seller'}</span>
        )}
        {/* shimmer overlay (disabled on micro) */}
        {!iconOnly && (variant === 'default' || variant === 'small') && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-full">
            <div
              className="badge-anim absolute inset-y-0 -left-full w-1/2 bg-gradient-to-r from-transparent via-white/30 to-transparent"
              style={{ animation: `badgeShimmer ${shimmerDuration} ease-in-out infinite`, opacity: variant === 'default' ? 0.40 : 0.34 }}
            />
          </div>
        )}
        {!iconOnly && (variant === 'default' || variant === 'small') && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-full">
            <div
              className="badge-anim absolute inset-0 mix-blend-screen"
              style={{
                backgroundImage: 'radial-gradient(circle at 10% 20%, rgba(255,255,255,0.80) 0px, rgba(255,255,255,0) 10px), radial-gradient(circle at 85% 15%, rgba(251,146,60,0.65) 0px, rgba(251,146,60,0) 12px), radial-gradient(circle at 70% 85%, rgba(250,204,21,0.60) 0px, rgba(250,204,21,0) 12px), radial-gradient(circle at 20% 80%, rgba(34,211,238,0.55) 0px, rgba(34,211,238,0) 14px)',
                backgroundSize: '140% 140%, 160% 160%, 160% 160%, 180% 180%',
                animation: `badgeGlitter ${variant === 'default' ? '1600ms' : '1900ms'} ease-in-out infinite`,
                opacity: variant === 'default' ? 0.34 : 0.26
              }}
            />
          </div>
        )}
        {!iconOnly && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-full">
            <div
              className="badge-anim absolute inset-y-0 -left-full w-1/3 bg-gradient-to-r from-transparent via-white/70 to-transparent mix-blend-screen"
              style={{ animation: `badgeFlash ${variant === 'default' ? '2200ms' : variant === 'small' ? '2500ms' : '2700ms'} ease-in-out infinite`, opacity: variant === 'default' ? 0.75 : 0.6 }}
            />
          </div>
        )}
        {!iconOnly && variant === 'micro' && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-full">
            <div
              className="badge-anim absolute -inset-1 rounded-full mix-blend-screen"
              style={{
                backgroundImage: 'radial-gradient(circle at 20% 30%, rgba(255,255,255,0.65) 0px, rgba(255,255,255,0) 10px), radial-gradient(circle at 80% 40%, rgba(251,146,60,0.55) 0px, rgba(251,146,60,0) 12px), radial-gradient(circle at 60% 80%, rgba(255,255,255,0.45) 0px, rgba(255,255,255,0) 12px)',
                opacity: 0.42,
                animation: 'badgeTwinkle 1500ms ease-in-out infinite'
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default BestsellerBadge;