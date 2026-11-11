import type { AlignResult, Aligned, Num, Series } from './types';
import { type Settings, ALIGN_SMOOTH_SEC, FULL_SEARCH_MIN_OVERLAP_SEC, WINDOW_MIN_OVERLAP_FRAC } from './settings';
import { rollingMean } from './smooth';

/**
 * Lag convention: lagSec is added to the meter's absolute timestamps. The meter sample at
 * absolute time T is compared with the trainer sample at T + lagSec.
 */

/** Put both series on one 1 s grid spanning the union of trainer and lag-shifted meter. */
export function applyLag(trainer: Series, meter: Series, lagSec: number): Aligned {
  const lag = Math.round(lagSec);
  const nT = trainer.power.length;
  const nM = meter.power.length;
  const mStart = meter.start + lag;
  const start = nM === 0 ? trainer.start : nT === 0 ? mStart : Math.min(trainer.start, mStart);
  const end = Math.max(nT === 0 ? start : trainer.start + nT, nM === 0 ? start : mStart + nM);
  const len = Math.max(0, end - start);
  const tOff = trainer.start - start;
  const mOff = mStart - start;
  const place = (src: Num[], off: number): Num[] => {
    const out: Num[] = new Array(len).fill(null);
    for (let k = 0; k < src.length; k++) out[k + off] = src[k] ?? null;
    return out;
  };
  return {
    start,
    trainer: place(trainer.power, tOff),
    meter: place(meter.power, mOff),
    trainerCad: place(trainer.cadence, tOff),
    meterCad: place(meter.cadence, mOff),
  };
}

/** Smoothed, mean-centred power as Float64Array with NaN for null (centring improves precision). */
function prep(s: Series): Float64Array {
  const sm = rollingMean(s.power, ALIGN_SMOOTH_SEC);
  const out = new Float64Array(sm.length);
  let sum = 0;
  let c = 0;
  for (let k = 0; k < sm.length; k++) {
    const v = sm[k];
    if (v === null) out[k] = NaN;
    else { out[k] = v; sum += v; c++; }
  }
  const mean = c ? sum / c : 0;
  for (let k = 0; k < out.length; k++) out[k] -= mean;
  return out;
}

/** Pearson r between t[j + off] and m[j] over indices where both are finite. One pass. */
function corr(t: Float64Array, m: Float64Array, off: number): { r: number | null; n: number } {
  const jLo = Math.max(0, -off);
  const jHi = Math.min(m.length, t.length - off);
  let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  for (let j = jLo; j < jHi; j++) {
    const y = m[j];
    const x = t[j + off];
    if (x !== x || y !== y) continue; // NaN check
    n++; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
  }
  if (n < 2) return { r: null, n };
  const vx = sxx - (sx * sx) / n;
  const vy = syy - (sy * sy) / n;
  if (!(vx > 1e-12 * n) || !(vy > 1e-12 * n)) return { r: null, n };
  const r = (sxy - (sx * sy) / n) / Math.sqrt(vx * vy);
  return { r: Math.max(-1, Math.min(1, r)), n };
}

/** Pearson r of ALIGN_SMOOTH_SEC-smoothed power at the given lag; n = seconds where both non-null. */
export function correlationAt(trainer: Series, meter: Series, lagSec: number): { r: number | null; n: number } {
  return corr(prep(trainer), prep(meter), meter.start + Math.round(lagSec) - trainer.start);
}

function nonNullCount(v: Num[]): number {
  let c = 0;
  for (const x of v) if (x !== null) c++;
  return c;
}

interface Best { lag: number; r: number }

function search(
  t: Float64Array, m: Float64Array, base: number, lagLo: number, lagHi: number, minN: number,
): Best | null {
  let best: Best | null = null;
  for (let lag = lagLo; lag <= lagHi; lag++) {
    const { r, n } = corr(t, m, base + lag);
    if (r === null || n < minN) continue;
    if (!best || r > best.r || (r === best.r && Math.abs(lag) < Math.abs(best.lag))) best = { lag, r };
  }
  return best;
}

/** Find the lag maximising correlation: timestamp window first, full search as fallback. */
export function autoLag(trainer: Series, meter: Series, s: Settings): AlignResult {
  const t = prep(trainer);
  const m = prep(meter);
  const base = meter.start - trainer.start; // off = base + lag
  const w = Math.max(0, Math.round(s.searchWindowSec));
  const minN = WINDOW_MIN_OVERLAP_FRAC * Math.min(nonNullCount(trainer.power), nonNullCount(meter.power));
  const win = search(t, m, base, -w, w, Math.max(minN, 2));

  let full: Best | null = null;
  if (!win || win.r < s.minCorrelation) {
    // Span overlap of [0, nT) and [off, off + nM) >= F  ⇔  F - nM <= off <= nT - F.
    const F = FULL_SEARCH_MIN_OVERLAP_SEC;
    const offLo = F - m.length;
    const offHi = t.length - F;
    if (offLo <= offHi) full = search(t, m, base, offLo - base, offHi - base, F);
  }

  let pick: AlignResult['method'] = 'timestamp-window';
  let best = win;
  if (full && (!best || full.r > best.r)) { best = full; pick = 'full-search'; }
  if (!best) return { lagSec: 0, r: 0, method: 'timestamp-window', lowConfidence: true };
  return { lagSec: best.lag, r: best.r, method: pick, lowConfidence: best.r < s.minCorrelation };
}
