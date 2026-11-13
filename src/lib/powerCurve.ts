import type { Aligned, CurveBin, CurveFit, CurvePoint, Overlap, PowerCurve } from './types';
import { CURVE_BIN_W, CURVE_MIN_BIN_SEC, DIFF_PCT_MIN_METER_W } from './settings';
import { rollingMean } from './smooth';

/**
 * Difference (trainer − meter) as a function of meter power, over the same
 * seconds computeStats uses: inside the overlap, both smoothed values present,
 * and not both raw values 0.
 */
export function computePowerCurve(a: Aligned, ov: Overlap, smoothingSec: number): PowerCurve {
  const st = rollingMean(a.trainer, smoothingSec);
  const sm = rollingMean(a.meter, smoothingSec);

  const points: CurvePoint[] = [];
  const binSums = new Map<number, { n: number; d: number; m: number }>();

  const end = Math.min(ov.to, a.trainer.length, a.meter.length);
  for (let i = Math.max(0, ov.from); i < end; i++) {
    const t = st[i], m = sm[i];
    if (t === null || m === null) continue;
    if (a.trainer[i] === 0 && a.meter[i] === 0) continue;
    const d = t - m;
    points.push({ meterW: m, diffW: d, diffPct: m < DIFF_PCT_MIN_METER_W ? null : (d / m) * 100 });
    const idx = Math.floor(m / CURVE_BIN_W);
    const b = binSums.get(idx) ?? { n: 0, d: 0, m: 0 };
    b.n++; b.d += d; b.m += m;
    binSums.set(idx, b);
  }

  const bins: CurveBin[] = [...binSums.entries()]
    .filter(([, b]) => b.n >= CURVE_MIN_BIN_SEC)
    .sort(([x], [y]) => x - y)
    .map(([idx, b]) => ({
      centerW: idx * CURVE_BIN_W + CURVE_BIN_W / 2,
      meanMeterW: b.m / b.n,
      seconds: b.n,
      meanDiffW: b.d / b.n,
      meanDiffPct: b.m / b.n < DIFF_PCT_MIN_METER_W ? null : (b.d / b.m) * 100,
    }));

  return { points, bins, fit: fitLine(points, bins) };
}

function fitLine(points: CurvePoint[], bins: CurveBin[]): CurveFit | null {
  const n = points.length;
  if (n < 2) return null;
  let mx = 0, my = 0;
  for (const p of points) { mx += p.meterW; my += p.diffW; }
  mx /= n; my /= n;
  let sxx = 0, sxy = 0;
  for (const p of points) {
    const dx = p.meterW - mx;
    sxx += dx * dx; sxy += dx * (p.diffW - my);
  }
  if (sxx <= 1e-9 * n) return null;
  const slope = sxy / sxx;
  const interceptW = my - slope * mx;

  let maxBinDeviationW: number | null = null;
  let maxBinDeviationAtW: number | null = null;
  if (bins.length >= 2) {
    for (const b of bins) {
      // Compare at the bin's mean power, not its centre, so a sloped line inside a bin isn't counted as curvature.
      const dev = Math.abs(b.meanDiffW - (interceptW + slope * b.meanMeterW));
      if (maxBinDeviationW === null || dev > maxBinDeviationW) {
        maxBinDeviationW = dev;
        maxBinDeviationAtW = b.centerW;
      }
    }
  }
  return { interceptW, slope, maxBinDeviationW, maxBinDeviationAtW };
}
