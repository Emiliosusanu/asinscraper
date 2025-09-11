// deno-lint-ignore-file no-explicit-any
import {
  clamp,
  safeAvg,
  momPercent,
  reviewVelocity,
  confidenceFrom,
  weightedNetImpact,
  defaultWeights,
} from "./notifications.ts";

Deno.test('clamp bounds', () => {
  if (clamp(10, -5, 5) !== 5) throw new Error('clamp upper');
  if (clamp(-10, -5, 5) !== -5) throw new Error('clamp lower');
  if (clamp(0, -5, 5) !== 0) throw new Error('clamp mid');
});

Deno.test('safeAvg ignores NaN', () => {
  const v = safeAvg([1, 2, NaN, 3]);
  if (Math.abs(v - 2) > 1e-6) throw new Error('safeAvg');
});

Deno.test('momPercent epsilon', () => {
  const p = momPercent(0, 10);
  if (!Number.isFinite(p)) throw new Error('momPercent finite');
});

Deno.test('reviewVelocity per day', () => {
  const v = reviewVelocity(10, 20);
  if (Math.abs(v - 0.5) > 1e-9) throw new Error('rv');
});

Deno.test('confidence thresholds', () => {
  if (confidenceFrom(14, 50) !== 'high') throw new Error('high');
  if (confidenceFrom(7, 10) !== 'medium') throw new Error('medium');
  if (confidenceFrom(2, 0) !== 'low') throw new Error('low');
});

Deno.test('weightedNetImpact sign', () => {
  const changes = { bsrDeltaPct: 10, royaltyDeltaPct: 5, priceDeltaPct: -1, rvDelta: 0.2 };
  const prev = { reviewVelocity: 0.5 };
  const w = defaultWeights();
  const score = weightedNetImpact(changes as any, prev as any, w);
  if (score <= 0) throw new Error('expected positive net impact');
});
