import React from 'react';

const BsrTrendSparkline = ({ values, overall, title = null, width = 42, height = 18 }) => {
  const vals = Array.isArray(values) ? values.map((v) => Number(v)).filter((v) => Number.isFinite(v) && v > 0) : [];
  if (vals.length < 2) return null;

  const w = Number(width) || 42;
  const h = Number(height) || 18;
  const pad = 1.5;
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;

  const base = Number(vals[0]) || 1;
  const rangePct = 0.2; // fixed scale: +/- 20% around base => slope reflects real change intensity

  const xFor = (i) => pad + (i / Math.max(1, vals.length - 1)) * innerW;
  const yFor = (v) => {
    const pct = base > 0 ? (Number(v) - base) / base : 0;
    const clamped = Math.max(-rangePct, Math.min(rangePct, pct));
    const mid = pad + innerH / 2;
    return mid + (clamped / rangePct) * (innerH / 2);
  };

  const points = vals.map((v, i) => ({ x: xFor(i), y: yFor(v), v }));
  const polyPoints = points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');

  const strokeClass =
    overall === 'good'
      ? 'stroke-emerald-400'
      : overall === 'bad'
        ? 'stroke-red-400'
        : 'stroke-slate-400';

  const strokeOpacity = overall === 'flat' ? 0.75 : 0.9;

  const last = points[points.length - 1];
  const prev = points[points.length - 2] || last;
  const dx = last.x - prev.x;
  const dy = last.y - prev.y;
  const len = Math.max(0.0001, Math.hypot(dx, dy));
  const ux = dx / len;
  const uy = dy / len;
  const arrowLen = 5.5;
  const angle = Math.PI / 6; // 30deg
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const rx1 = ux * cos - uy * sin;
  const ry1 = ux * sin + uy * cos;
  const rx2 = ux * cos + uy * sin;
  const ry2 = -ux * sin + uy * cos;
  const a1x = last.x - rx1 * arrowLen;
  const a1y = last.y - ry1 * arrowLen;
  const a2x = last.x - rx2 * arrowLen;
  const a2y = last.y - ry2 * arrowLen;

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="block"
      style={{ opacity: strokeOpacity }}
      title={title || undefined}
    >
      <polyline
        fill="none"
        points={polyPoints}
        className={strokeClass}
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line x1={last.x} y1={last.y} x2={a1x} y2={a1y} className={strokeClass} strokeWidth="1.4" strokeLinecap="round" />
      <line x1={last.x} y1={last.y} x2={a2x} y2={a2y} className={strokeClass} strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
};

export default BsrTrendSparkline;
