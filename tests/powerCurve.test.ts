import { describe, it, expect } from 'vitest';
import { computePowerCurve } from '../src/lib/powerCurve';
import type { Aligned, Num, Overlap } from '../src/lib/types';
import { ridePower } from './helpers';

function al(trainer: Num[], meter: Num[]): Aligned {
  return { start: 0, trainer, meter, trainerCad: trainer.map(() => null), meterCad: meter.map(() => null) };
}
const full = (n: number): Overlap => ({ from: 0, to: n, tooShort: false });
const fill = (n: number, v: number): number[] => new Array(n).fill(v);

describe('computePowerCurve', () => {
  it('linear difference: fit recovers intercept and slope, bins sit on the line', () => {
    const m = ridePower(3600);
    const t = m.map((v) => v * 1.05 + 2);
    const c = computePowerCurve(al(t, m), full(3600), 1);
    expect(c.points).toHaveLength(3600);
    expect(c.fit).not.toBeNull();
    expect(Math.abs(c.fit!.interceptW - 2)).toBeLessThan(0.01);
    expect(Math.abs(c.fit!.slope - 0.05)).toBeLessThan(1e-4);
    expect(c.fit!.maxBinDeviationW!).toBeLessThan(0.01);
    expect(c.bins.every((b) => b.seconds >= 30)).toBe(true);
    const centers = c.bins.map((b) => b.centerW);
    expect(centers).toEqual([...centers].sort((a, b) => a - b));
  });

  it('non-linear difference: bins depart from the fitted line', () => {
    const m = ridePower(3600);
    const t = m.map((v) => v * (v < 150 ? 1.1 : v >= 250 ? 1.02 : 1.06));
    const c = computePowerCurve(al(t, m), full(3600), 1);
    expect(c.fit!.maxBinDeviationW!).toBeGreaterThan(2);
  });

  it('bin centres and means', () => {
    const m = [...fill(40, 104), ...fill(40, 207)];
    const t = m.map((v) => v + 5);
    const c = computePowerCurve(al(t, m), full(80), 1);
    expect(c.bins.map((b) => [b.centerW, b.seconds])).toEqual([[105, 40], [205, 40]]);
    expect(c.bins[0].meanMeterW).toBeCloseTo(104);
    expect(c.bins[1].meanMeterW).toBeCloseTo(207);
    expect(c.bins[0].meanDiffW).toBeCloseTo(5);
    expect(c.bins[1].meanDiffW).toBeCloseTo(5);
    expect(c.bins[0].meanDiffPct!).toBeCloseTo((5 / 104) * 100);
    expect(c.bins[1].meanDiffPct!).toBeCloseTo((5 / 207) * 100);
  });

  it('drops sparse bins but keeps their points', () => {
    const m = [...fill(40, 104), ...fill(10, 400)];
    const t = m.map((v) => v + 5);
    const c = computePowerCurve(al(t, m), full(50), 1);
    expect(c.bins.map((b) => b.centerW)).toEqual([105]);
    expect(c.points).toHaveLength(50);
  });

  it('excludes seconds where both sources read 0', () => {
    const m = ridePower(600);
    const t = m.map((v) => v + 3);
    const base = computePowerCurve(al(t, m), full(600), 1).points.length;
    const c = computePowerCurve(al([...t, ...fill(300, 0)], [...m, ...fill(300, 0)]), full(900), 1);
    expect(c.points.length).toBe(base);
  });

  it('near-zero meter power: W bin kept, % values null', () => {
    const m = [...ridePower(600), ...fill(60, 0)];
    const t = [...m.slice(0, 600).map((v) => v + 3), ...fill(60, 120)];
    const c = computePowerCurve(al(t, m), full(660), 1);
    const low = c.bins.find((b) => b.centerW === 5);
    expect(low).toBeDefined();
    expect(low!.meanDiffW).toBeCloseTo(120);
    expect(low!.meanDiffPct).toBeNull();
    expect(c.points.filter((p) => p.meterW === 0).every((p) => p.diffPct === null)).toBe(true);
  });

  it('steady power: no fit when x has zero variance', () => {
    const c = computePowerCurve(al(fill(600, 210), fill(600, 200)), full(600), 1);
    expect(c.fit).toBeNull();
    expect(c.bins).toHaveLength(1);
  });

  it('two power levels in different bins: fit with a bin deviation', () => {
    const m = [...fill(600, 200), ...fill(600, 210)];
    const c = computePowerCurve(al(m.map((v) => v + 5), m), full(1200), 1);
    expect(c.fit).not.toBeNull();
    expect(typeof c.fit!.maxBinDeviationW).toBe('number');
  });

  it('two power levels in one bin: fit without a bin deviation', () => {
    const m = [...fill(600, 200), ...fill(600, 203)];
    const c = computePowerCurve(al(m.map((v) => v + 5), m), full(1200), 1);
    expect(c.fit).not.toBeNull();
    expect(c.fit!.maxBinDeviationW).toBeNull();
    expect(c.fit!.maxBinDeviationAtW).toBeNull();
  });
});
