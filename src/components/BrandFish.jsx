import React, { useId } from 'react';

const BrandFish = ({ size = 18, className = '', ariaHidden = true }) => {
  const uid = useId();
  const px = typeof size === 'number' ? `${size}px` : size;
  const gradId = `bfGrad-${uid}`;
  const shineId = `bfShine-${uid}`;
  const glowId = `bfGlow-${uid}`;

  return (
    <span
      className={`inline-flex items-center justify-center ${className}`}
      style={{ width: px, height: px }}
      aria-hidden={ariaHidden}
    >
      <style>{`
        @keyframes bfFloat { 0%, 100% { transform: translate3d(0, 0, 0); } 50% { transform: translate3d(0, -1.5px, 0); } }
        @keyframes bfPulse { 0%, 100% { opacity: 0.78; } 50% { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) { .bf-anim { animation: none !important; } }
      `}</style>
      <svg
        viewBox="0 0 48 48"
        className="w-full h-full bf-anim"
        style={{ animation: 'bfFloat 1200ms ease-in-out infinite, bfPulse 1600ms ease-in-out infinite' }}
      >
        <defs>
          <linearGradient id={gradId} x1="10" y1="8" x2="40" y2="38" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#a855f7" />
            <stop offset="0.45" stopColor="#f472b6" />
            <stop offset="1" stopColor="#22d3ee" />
          </linearGradient>
          <linearGradient id={shineId} x1="14" y1="10" x2="30" y2="26" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="rgba(255,255,255,0.85)" />
            <stop offset="1" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
          <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.1" result="blur" />
            <feColorMatrix
              in="blur"
              type="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 10 -5"
              result="glow"
            />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g filter={`url(#${glowId})`}>
          <path
            d="M18 16c5-5 14-4 18 2c-2 1-4 3-4 6c0 3 2 5 4 6c-4 6-13 7-18 2c-3-3-4-8-3-12c0-1 1-3 3-4z"
            fill={`url(#${gradId})`}
          />
          <path
            d="M14 20c-3 1-6 4-8 8c4 0 7-1 10-3c-1-2-1-3-2-5z"
            fill="#a855f7"
            opacity="0.85"
          />
          <path
            d="M33 17c3-2 6-2 9-1c-2 3-4 5-7 6c-1-2-1-3-2-5z"
            fill="#f472b6"
            opacity="0.85"
          />
          <path
            d="M20 17c4-3 10-2 13 2c-5 2-10 3-15 2c0-2 1-3 2-4z"
            fill={`url(#${shineId})`}
            opacity="0.65"
          />
          <circle cx="31" cy="22" r="1.3" fill="rgba(0,0,0,0.45)" />
        </g>
      </svg>
    </span>
  );
};

export default BrandFish;
