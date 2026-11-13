import type { PowerCurve } from './types';
import { DIFF_PCT_MIN_METER_W } from './settings';

export type CurveMode = 'W' | '%';

/** x column then three y columns: per-second points, bin means, fitted line. */
export type CurveChartData = [number[], (number | null)[], (number | null)[], (number | null)[]];

const FIT_STEP_W = 5;
const MIN_PAD = { W: 5, '%': 2 } as const;

function fitAt(curve: PowerCurve, mode: CurveMode, x: number): number | null {
  const f = curve.fit;
  if (!f) return null;
  if (mode === 'W') return f.interceptW + f.slope * x;
  return x < DIFF_PCT_MIN_METER_W ? null : (f.interceptW / x + f.slope) * 100;
}

/**
 * Lays the curve out for uPlot (one ascending x column shared by all series, nulls
 * where a series has no value) and picks a y range from the bin means and the line,
 * so stray points can't squash the part of the chart that answers the question.
 */
export function buildCurveChart(curve: PowerCurve, mode: CurveMode): { data: CurveChartData; yRange: [number, number] } {
  const rows: [number, number, 0 | 1 | 2][] = [];
  for (const p of curve.points) {
    const y = mode === 'W' ? p.diffW : p.diffPct;
    if (y !== null) rows.push([p.meterW, y, 0]);
  }
  for (const b of curve.bins) {
    const y = mode === 'W' ? b.meanDiffW : b.meanDiffPct;
    if (y !== null) rows.push([b.meanMeterW, y, 1]);
  }
  if (curve.fit && curve.points.length) {
    let lo = Infinity, hi = -Infinity;
    for (const p of curve.points) { lo = Math.min(lo, p.meterW); hi = Math.max(hi, p.meterW); }
    if (mode === 'W') {
      rows.push([lo, fitAt(curve, mode, lo)!, 2], [hi, fitAt(curve, mode, hi)!, 2]);
    } else {
      for (let x = Math.max(lo, DIFF_PCT_MIN_METER_W); x <= hi; x += FIT_STEP_W) rows.push([x, fitAt(curve, mode, x)!, 2]);
    }
  }
  rows.sort((a, b) => a[0] - b[0]);

  const xs: number[] = [];
  const series: (number | null)[][] = [[], [], []];
  for (const [x, y, s] of rows) {
    xs.push(x);
    for (let k = 0; k < 3; k++) series[k].push(k === s ? y : null);
  }
  const data: CurveChartData = [xs, series[0], series[1], series[2]];

  // Range from what the reader needs: bin means and the line where the bins are.
  const ys: number[] = [0];
  for (const b of curve.bins) {
    const y = mode === 'W' ? b.meanDiffW : b.meanDiffPct;
    if (y !== null) ys.push(y);
    const f = fitAt(curve, mode, b.meanMeterW);
    if (f !== null) ys.push(f);
  }
  const lo = Math.min(...ys), hi = Math.max(...ys);
  const pad = Math.max((hi - lo) * 0.5, MIN_PAD[mode]);
  return { data, yRange: [lo - pad, hi + pad] };
}
