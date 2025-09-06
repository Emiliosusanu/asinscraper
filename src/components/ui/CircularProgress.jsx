import React from 'react';

/**
 * CircularProgress
 * - progress: number 0..1 (optional). If omitted, shows indeterminate spinner.
 * - size: px number (default 32)
 * - thickness: ring thickness in px (default 3)
 * - color: CSS color or gradient (default conic gradient teal->blue)
 * - trackColor: CSS color (default rgba(255,255,255,0.12))
 * - label: optional text or element rendered in center
 */
const CircularProgress = ({ progress, size = 32, thickness = 3, color, trackColor, label }) => {
  const isDeterminate = Number.isFinite(progress) && progress >= 0 && progress <= 1;
  const angle = isDeterminate ? Math.max(0, Math.min(1, progress)) * 360 : 270;
  const ringColor = color || 'conic-gradient(from 0deg, rgba(16,185,129,0.9), rgba(59,130,246,0.9), rgba(16,185,129,0.9))';
  const track = trackColor || 'rgba(255,255,255,0.12)';

  const styleDeterminate = {
    width: size,
    height: size,
    background: `conic-gradient(${track} ${angle}deg, ${ringColor} 0)`
  };

  const styleIndeterminate = {
    width: size,
    height: size,
    background: ringColor,
    animation: 'spin 1.25s linear infinite'
  };

  const mask = {
    WebkitMask: `radial-gradient(farthest-side, transparent calc(100% - ${thickness + 1}px), #000 calc(100% - ${thickness}px))`,
    mask: `radial-gradient(farthest-side, transparent calc(100% - ${thickness + 1}px), #000 calc(100% - ${thickness}px))`,
  };

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <div
        className={`rounded-full ${isDeterminate ? '' : 'animate-spin-slow'}`}
        style={{ ...(isDeterminate ? styleDeterminate : styleIndeterminate), ...mask, borderRadius: '9999px' }}
        aria-hidden="true"
      />
      {label ? (
        <div className="absolute inset-0 flex items-center justify-center text-[10px] text-white/90 select-none">
          {label}
        </div>
      ) : null}
      <style jsx>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

export default CircularProgress;
