import type { Num } from './types';

/** Centred rolling mean ignoring nulls. Window covers i-floor((w-1)/2) .. i+ceil((w-1)/2), clipped to the array. */
export function rollingMean(values: Num[], windowSec: number): Num[] {
  const n = values.length;
  const w = Math.max(1, Math.floor(windowSec));
  const back = Math.floor((w - 1) / 2);
  const fwd = Math.ceil((w - 1) / 2);
  const sum = new Float64Array(n + 1);
  const cnt = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) {
    const v = values[i];
    sum[i + 1] = sum[i] + (v ?? 0);
    cnt[i + 1] = cnt[i] + (v === null ? 0 : 1);
  }
  const out: Num[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - back);
    const hi = Math.min(n, i + fwd + 1);
    const c = cnt[hi] - cnt[lo];
    out[i] = c === 0 ? null : (sum[hi] - sum[lo]) / c;
  }
  return out;
}
