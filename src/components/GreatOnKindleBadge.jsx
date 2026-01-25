import React from 'react';
import { BookOpen } from 'lucide-react';

const GreatOnKindleBadge = ({ small = false, micro = false, iconOnly = false }) => {
  const variant = micro ? 'micro' : (small ? 'small' : 'default');
  const label = (variant === 'micro') ? 'GOK' : 'Great on Kindle';
  const sizeText = iconOnly ? 'px-1.5 py-1' : (variant === 'default'
    ? 'text-[10.5px] px-2 py-[1px]'
    : variant === 'small'
      ? 'text-[10px] px-1.5 py-[0.5px]'
      : 'text-[9px] px-1.5 py-[0.5px]');
  const iconSize = iconOnly ? 'w-3 h-3' : (variant === 'default' ? 'w-3.5 h-3.5' : variant === 'small' ? 'w-3 h-3' : 'w-2.5 h-2.5');
  const shimmerDuration = variant === 'default' ? '5s' : '3.8s';
  const glowInsetClass = variant === 'micro' ? '-inset-1' : (variant === 'small' ? '-inset-2' : '-inset-3');
  const bodyGlowStyle = iconOnly ? undefined : {
    filter: variant === 'default'
      ? 'drop-shadow(0 0 10px rgba(255,255,255,0.26)) drop-shadow(0 0 22px rgba(56,189,248,0.34))'
      : variant === 'small'
        ? 'drop-shadow(0 0 8px rgba(255,255,255,0.20)) drop-shadow(0 0 18px rgba(56,189,248,0.28))'
        : 'drop-shadow(0 0 6px rgba(255,255,255,0.16)) drop-shadow(0 0 14px rgba(56,189,248,0.24))'
  };
  const bodyClass = iconOnly
    ? 'bg-sky-500/20 text-sky-200 border border-sky-400/40'
    : (variant === 'micro'
      ? 'bg-gradient-to-r from-sky-600 via-blue-600 to-sky-600 text-white border border-white/10'
      : variant === 'small'
        ? 'bg-gradient-to-r from-sky-600 via-blue-600 to-sky-600 text-white border border-white/10'
        : 'bg-gradient-to-r from-sky-600 via-blue-600 to-sky-600 text-white border border-white/10 shadow-md');

  return (
    <div className="relative inline-flex items-center group">
      <style>{`
        @keyframes badgeShimmer { from { transform: translateX(-110%); } to { transform: translateX(110%); } }
        @keyframes badgeRingSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes badgeTwinkle { 0%, 100% { opacity: 0.22; transform: translate3d(-2px, 1px, 0) scale(1); } 50% { opacity: 0.46; transform: translate3d(2px, -1px, 0) scale(1.02); } }
        @keyframes badgeGlowPulse { 0%, 100% { opacity: 0.35; transform: scale(1); } 50% { opacity: 0.7; transform: scale(1.05); } }
        @keyframes badgeGlitter { 0% { background-position: 0% 20%, 100% 0%, 40% 100%, 0% 100%; opacity: 0.22; } 50% { background-position: 100% 60%, 0% 100%, 70% 0%, 100% 100%; opacity: 0.52; } 100% { background-position: 0% 20%, 100% 0%, 40% 100%, 0% 100%; opacity: 0.22; } }
        @keyframes badgeFlash { 0% { transform: translateX(-140%) skewX(-18deg); opacity: 0; } 12% { opacity: 0.9; } 22% { opacity: 0.0; } 100% { transform: translateX(220%) skewX(-18deg); opacity: 0; } }
        @media (prefers-reduced-motion: reduce) { .badge-anim { animation: none !important; } }
      `}</style>
      {!iconOnly && (
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute ${glowInsetClass} rounded-full blur-lg badge-anim opacity-60 group-hover:opacity-100 transition-opacity`}
          style={{
            background: 'conic-gradient(from 180deg, rgba(56,189,248,0.36), rgba(255,255,255,0.10), rgba(59,130,246,0.28), rgba(255,255,255,0.10), rgba(168,85,247,0.22), rgba(255,255,255,0.08), rgba(34,211,238,0.22), rgba(255,255,255,0.10), rgba(56,189,248,0.36))',
            animation: `badgeRingSpin ${variant === 'default' ? '7s' : variant === 'small' ? '8.5s' : '9s'} linear infinite, badgeGlowPulse ${variant === 'default' ? '1.6s' : '1.9s'} ease-in-out infinite`,
            opacity: variant === 'default' ? 0.65 : variant === 'small' ? 0.55 : 0.45
          }}
        />
      )}
      {(variant === 'default' || variant === 'small') && (
        <div className="absolute -inset-[1px] rounded-full pointer-events-none badge-anim" style={{ animation: `badgeRingSpin ${variant === 'default' ? '12s' : '14s'} linear infinite`, opacity: variant === 'default' ? 0.6 : 0.45 }}>
          <div
            className="w-full h-full rounded-full"
            style={{
              background: 'conic-gradient(from 0deg, rgba(56,189,248,0.38), rgba(59,130,246,0.22), rgba(255,255,255,0.08), rgba(168,85,247,0.16), rgba(34,211,238,0.16), rgba(255,255,255,0.08), rgba(56,189,248,0.38))',
              WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 1px), #000 calc(100% - 0px))',
              mask: 'radial-gradient(farthest-side, transparent calc(100% - 1px), #000 calc(100% - 0px))'
            }}
          />
        </div>
      )}
      <div className={`relative rounded-full pointer-events-none flex items-center ${iconOnly ? '' : 'gap-1'} ${bodyClass} ${sizeText}`} style={bodyGlowStyle}>
        {iconOnly && <BookOpen className={`${iconSize}`} />}
        {!iconOnly && (
          <span className={variant === 'micro' ? 'tracking-tight' : 'tracking-wide'}>{label}</span>
        )}
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
                backgroundImage: 'radial-gradient(circle at 10% 20%, rgba(255,255,255,0.80) 0px, rgba(255,255,255,0) 10px), radial-gradient(circle at 85% 15%, rgba(56,189,248,0.70) 0px, rgba(56,189,248,0) 12px), radial-gradient(circle at 70% 85%, rgba(168,85,247,0.62) 0px, rgba(168,85,247,0) 12px), radial-gradient(circle at 20% 80%, rgba(34,211,238,0.62) 0px, rgba(34,211,238,0) 14px)',
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
                backgroundImage: 'radial-gradient(circle at 20% 30%, rgba(255,255,255,0.65) 0px, rgba(255,255,255,0) 10px), radial-gradient(circle at 85% 35%, rgba(56,189,248,0.55) 0px, rgba(56,189,248,0) 12px), radial-gradient(circle at 60% 80%, rgba(255,255,255,0.45) 0px, rgba(255,255,255,0) 12px)',
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

export default GreatOnKindleBadge;
