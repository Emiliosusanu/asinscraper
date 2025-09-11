// deno-lint-ignore-file no-explicit-any
/**
 * Shared helpers for Intelligent Notifications
 * This module mirrors the client-side logic in src/lib/incomeCalculator.js and src/lib/royaltyEstimator.js
 * while running on Supabase Edge Functions (Deno). Keep changes in sync.
 */

export type WindowParams = {
  windowDays: number; // default 30
};

export type DriverWeights = {
  reviews: number; // default 0.35
  bsr: number;     // default 0.30
  royalty: number; // default 0.25
  price: number;   // default 0.10
};

export type SnapshotStatus = 'better' | 'worse' | 'stable';
export type Confidence = 'high' | 'medium' | 'low';

export interface SnapshotDetails {
  prev: {
    avgRoyalty: number;
    avgPrice: number;
    avgBsr: number;
    reviewVelocity: number;
    samples: number;
  };
  curr: {
    avgRoyalty: number;
    avgPrice: number;
    avgBsr: number;
    reviewVelocity: number;
    samples: number;
  };
  coverageDays: number;
}

export interface SnapshotPayload {
  asin: string;
  user_id: string;
  status: SnapshotStatus;
  netImpact: number; // percent
  sentiment: string; // Trend stabile | In miglioramento | In calo
  drivers: string[]; // textual list
  confidence: Confidence;
  details: SnapshotDetails;
  algoVersion: string;
  createdAt: string;
}

const EPS = 1e-9;

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function safeAvg(values: number[]): number {
  const xs = values.filter((v) => Number.isFinite(v));
  if (xs.length === 0) return 0;
  const s = xs.reduce((a, b) => a + b, 0);
  return s / xs.length;
}

export function momPercent(prev: number, curr: number): number {
  const denom = Math.max(Math.abs(prev), EPS);
  return ((curr - prev) / denom) * 100;
}

export function reviewVelocity(deltaReviews: number, days: number): number {
  const d = Math.max(1, days);
  return deltaReviews / d;
}

/** Zero-guard filtering: drop samples with clearly invalid zeros */
export function filterValidSamples<T extends Record<string, any>>(rows: T[]): T[] {
  return rows.filter((r) => {
    // Be lenient: accept a row if at least one core signal is present and non-zero
    const bsrOk = Number(r.bsr) > 0;
    const priceOk = Number(r.price) > 0;
    const revOk = Number(r.review_count) > 0;
    // Discard obviously unrealistic BSR=1 if overall dataset is large; this check is done upstream when aggregating
    return bsrOk || priceOk || revOk;
  });
}

export function confidenceFrom(coverageDays: number, samples: number): Confidence {
  if (coverageDays >= 14 && samples >= 50) return 'high';
  if (coverageDays >= 7) return 'medium';
  return 'low';
}

export function sentimentFrom(status: SnapshotStatus): string {
  if (status === 'better') return 'In miglioramento';
  if (status === 'worse') return 'In calo';
  return 'Trend stabile';
}

export function defaultWeights(): DriverWeights {
  return { reviews: 0.35, bsr: 0.30, royalty: 0.25, price: 0.10 };
}

export function renormalizeWeights(w: DriverWeights): DriverWeights {
  const sum = w.reviews + w.bsr + w.royalty + w.price;
  if (sum <= 0) return defaultWeights();
  return {
    reviews: w.reviews / sum,
    bsr: w.bsr / sum,
    royalty: w.royalty / sum,
    price: w.price / sum,
  };
}

export function emaWeights(oldW: DriverWeights, signal: number): DriverWeights {
  // Simple EMA update on all weights equally, then clamp and renormalize
  const next: DriverWeights = {
    reviews: 0.95 * oldW.reviews + 0.05 * signal,
    bsr: 0.95 * oldW.bsr + 0.05 * signal,
    royalty: 0.95 * oldW.royalty + 0.05 * signal,
    price: 0.95 * oldW.price + 0.05 * signal,
  };
  // clamp
  next.reviews = clamp(next.reviews, 0.05, 0.6);
  next.bsr = clamp(next.bsr, 0.05, 0.6);
  next.royalty = clamp(next.royalty, 0.05, 0.6);
  next.price = clamp(next.price, 0.05, 0.6);
  return renormalizeWeights(next);
}

// Domain helpers mirrored from src/lib/royaltyEstimator.js and src/lib/incomeCalculator.js
export type Market = 'US' | 'EU' | 'UK';

const MARKET_BY_COUNTRY: Record<string, Market> = {
  'com': 'US', 'us': 'US',
  'it': 'EU', 'de': 'EU', 'fr': 'EU', 'es': 'EU',
  'co.uk': 'UK', 'uk': 'UK',
};

const PRINT_COST = {
  US: { paperback: { bw: { fixed: 0.85, perPage: 0.012 } } },
  EU: { paperback: { bw: { fixed: 0.60, perPage: 0.01 } } },
  UK: { paperback: { bw: { fixed: 0.70, perPage: 0.01 } } },
} as const;

const BOOK_VAT: Record<string, number> = {
  it: 0.04, de: 0.07, fr: 0.055, es: 0.04, 'co.uk': 0.0, uk: 0.0, com: 0.0,
};

function clampPages(n: unknown): number {
  const x = Number(n);
  if (!Number.isFinite(x)) return 120;
  return Math.max(24, Math.min(828, Math.round(x)));
}

function round2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

export function estimatePrintingCost(input: { page_count?: number; country?: string }): number {
  const market = MARKET_BY_COUNTRY[(input.country || '').toLowerCase()] || 'EU';
  const cfg = (PRINT_COST as any)[market]?.paperback?.bw;
  const pages = clampPages(input.page_count);
  if (!cfg) return 0;
  return round2(cfg.fixed + cfg.perPage * pages);
}

export function estimateRoyalty(input: { price?: number; page_count?: number; country?: string }): number {
  const price = Number(input?.price) || 0;
  if (price <= 0) return 0;
  const country = (input?.country || '').toLowerCase();
  const vat = Object.prototype.hasOwnProperty.call(BOOK_VAT, country) ? BOOK_VAT[country] : 0.0;
  const basePrice = price > 0 ? (vat > 0 ? price / (1 + vat) : price) : 0;
  const gross = 0.60 * basePrice;
  const print = estimatePrintingCost(input);
  const net = gross - print;
  return net > 0 ? round2(net) : 0;
}

export function avgMonthlyIncomeFromBsr(bsr: number, royalty: number): number {
  // Approximation: reuse a simplified shape based on src/lib/incomeCalculator
  if (!royalty || royalty <= 0 || !bsr || bsr <= 0) return 0;
  // Simple decreasing function based on rank buckets (not exact but consistent)
  // For more accuracy, port the whole table if needed
  let factor = 0;
  if (bsr <= 500) factor = 7000; else if (bsr <= 1000) factor = 4500; else if (bsr <= 5000) factor = 1200;
  else if (bsr <= 10000) factor = 600; else if (bsr <= 25000) factor = 330; else if (bsr <= 50000) factor = 180;
  else if (bsr <= 100000) factor = 90; else factor = 60;
  return royalty * factor; // rough monthly units * royalty
}

export function computeDrivers(prev: { avgBsr: number; avgPrice: number; avgRoyalty: number; reviewVelocity: number },
                               curr: { avgBsr: number; avgPrice: number; avgRoyalty: number; reviewVelocity: number }) {
  const drivers: string[] = [];

  const rvDelta = curr.reviewVelocity - prev.reviewVelocity;
  if (Math.abs(rvDelta) >= 0.1) {
    drivers.push(rvDelta > 0 ? 'Velocità recensioni in aumento' : 'Velocità recensioni in calo');
  }

  // Lower BSR is better
  const bsrDeltaPct = momPercent(prev.avgBsr, curr.avgBsr) * -1;
  if (Math.abs(bsrDeltaPct) >= 3) {
    drivers.push(bsrDeltaPct > 0 ? 'BSR medio in miglioramento' : 'BSR medio in peggioramento');
  }

  const royaltyDeltaPct = momPercent(prev.avgRoyalty, curr.avgRoyalty);
  if (Math.abs(royaltyDeltaPct) >= 1) {
    drivers.push(royaltyDeltaPct > 0 ? 'Royalty su' : 'Royalty giù');
  }

  const priceDeltaPct = momPercent(prev.avgPrice, curr.avgPrice);
  if (Math.abs(priceDeltaPct) >= 1) {
    drivers.push(priceDeltaPct > 0 ? 'Prezzo su' : 'Prezzo giù');
  }

  return { drivers, changes: { bsrDeltaPct, royaltyDeltaPct, priceDeltaPct, rvDelta } };
}

export function weightedNetImpact(changes: { bsrDeltaPct: number; royaltyDeltaPct: number; priceDeltaPct: number; rvDelta: number },
                                  prev: { reviewVelocity: number },
                                  weights: DriverWeights): number {
  // Normalize review velocity change to pct via prev baseline
  const rvPct = momPercent(prev.reviewVelocity, prev.reviewVelocity + changes.rvDelta);
  const terms = [
    { v: rvPct, w: weights.reviews },
    { v: changes.bsrDeltaPct, w: weights.bsr },
    { v: changes.royaltyDeltaPct, w: weights.royalty },
    { v: changes.priceDeltaPct, w: weights.price },
  ];
  const score = terms.reduce((acc, t) => acc + (t.v * t.w), 0);
  return clamp(score, -300, 300);
}

export function statusFrom(netImpact: number, momPct: number): SnapshotStatus {
  if (netImpact > 0 && momPct > 1) return 'better';
  if (netImpact < 0 && momPct < -1) return 'worse';
  return 'stable';
}
