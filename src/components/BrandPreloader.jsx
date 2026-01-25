import React from 'react';

const BrandPreloader = ({ size = 64, fullscreen = false, className = '' }) => {
  const px = typeof size === 'number' ? `${size}px` : size;

  const loader = (
    <div
      className={`relative inline-flex items-center justify-center ${className}`}
      style={{ width: px, height: px }}
      aria-label="Loading"
      role="status"
    >
      <style>{`
        @keyframes bpSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes bpFloat { 0%, 100% { transform: translate3d(0, 0, 0); } 50% { transform: translate3d(0, -4px, 0); } }
        @keyframes bpPulse { 0%, 100% { opacity: 0.55; } 50% { opacity: 1; } }
        @keyframes bpGlow { 0%, 100% { filter: drop-shadow(0 0 6px rgba(255,255,255,0.12)) drop-shadow(0 0 16px rgba(16,185,129,0.08)); } 50% { filter: drop-shadow(0 0 10px rgba(255,255,255,0.18)) drop-shadow(0 0 24px rgba(16,185,129,0.12)); } }
        @media (prefers-reduced-motion: reduce) {
          .bp-anim { animation: none !important; }
        }
      `}</style>

      <svg viewBox="0 0 128 128" className="w-full h-full">
        <defs>
          <filter id="bpSoft" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.4" result="blur" />
            <feColorMatrix
              in="blur"
              type="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 12 -6"
              result="glow"
            />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g className="bp-anim" style={{ transformOrigin: '64px 64px', animation: 'bpSpin 1200ms linear infinite, bpGlow 1400ms ease-in-out infinite' }}>
          <circle cx="64" cy="64" r="54" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="2" />

          <rect
            x="18"
            y="58"
            width="14"
            height="44"
            rx="7"
            fill="#b0004f"
            filter="url(#bpSoft)"
          />

          <path
            d="M41 45 A36 36 0 0 1 86 34 L86 70 A36 36 0 0 1 41 45 Z"
            fill="#f6b400"
            filter="url(#bpSoft)"
          />

          <circle cx="92" cy="36" r="10" fill="#b0004f" filter="url(#bpSoft)" />
        </g>

        <g className="bp-anim" style={{ transformOrigin: '64px 64px', animation: 'bpFloat 900ms ease-in-out infinite' }}>
          <circle cx="18" cy="44" r="3.2" fill="rgba(255,255,255,0.14)" />
          <circle cx="108" cy="84" r="2.6" fill="rgba(255,255,255,0.10)" />
          <circle cx="52" cy="106" r="2.2" fill="rgba(255,255,255,0.10)" />
        </g>

        <g className="bp-anim" style={{ transformOrigin: '64px 64px', animation: 'bpPulse 900ms ease-in-out infinite' }}>
          <circle cx="64" cy="64" r="60" fill="none" stroke="rgba(16,185,129,0.10)" strokeWidth="1.5" />
        </g>
      </svg>
    </div>
  );

  if (fullscreen) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        {loader}
      </div>
    );
  }

  return loader;
};

export default BrandPreloader;
