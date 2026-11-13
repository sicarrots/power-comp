import { describe, it, expect } from 'vitest';
import { buildCurveChart } from '../src/lib/curveChart';
import { computePowerCurve } from '../src/lib/powerCurve';
import type { Aligned, Num, Overlap } from '../src/lib/types';
import { ridePower } from './helpers';

function al(trainer: Num[], meter: Num[]): Aligned {
  return { start: 0, trainer, meter, trainerCad: trainer.map(() => null), meterCad: meter.map(() => null) };
}
const full = (n: number): Overlap => ({ from: 0, to: n, tooShort: false });

function rideWithOutliers() {
  const m = ridePower(3600);
  const t = m.map((v) => v * 1.05 + 2);
  for (let i = 1000; i < 1015; i++) { m[i] = 25; t[i] = 200; } // short dropout-like outliers
  return computePowerCurve(al(t, m), full(3600), 1);
}

describe('buildCurveChart', () => {
  for (const mode of ['W', '%'] as const) {
    it(`${mode}: x ascending and exactly one series per row`, () => {
      const { data } = buildCurveChart(rideWithOutliers(), mode);
      const [xs, ...ys] = data;
      for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThanOrEqual(xs[i - 1]);
      for (let i = 0; i < xs.length; i++) expect(ys.filter((y) => y[i] !== null)).toHaveLength(1);
    });
  }

  it('W: y range follows the bins and the line, not outlier points', () => {
    const c = rideWithOutliers();
    const { yRange } = buildCurveChart(c, 'W');
    const binYs = c.bins.map((b) => b.meanDiffW);
    expect(yRange[0]).toBeLessThanOrEqual(Math.min(...binYs));
    expect(yRange[1]).toBeGreaterThanOrEqual(Math.max(...binYs));
    expect(yRange[1]).toBeLessThan(100); // outliers sit at about +175 W
  });

  it('%: drops points below 20 W, fit starts at 20 W or above, range ignores outliers', () => {
    const m = ridePower(3600);
    m[5] = 10;
    const t = m.map((v) => v * 1.05 + 2);
    const c = computePowerCurve(al(t, m), full(3600), 1);
    const { data, yRange } = buildCurveChart(c, '%');
    const [xs, pts, , fit] = data;
    xs.forEach((x, i) => { if (pts[i] !== null) expect(x).toBeGreaterThanOrEqual(20); });
    xs.forEach((x, i) => { if (fit[i] !== null) expect(x).toBeGreaterThanOrEqual(20); });
    expect(yRange[1] - yRange[0]).toBeLessThan(40);
  });
});
