import { describe, it, expect } from 'vitest';
import { computeStats, BANDS } from '../src/lib/stats';
import type { Aligned, Num, Overlap } from '../src/lib/types';

function al(trainer: Num[], meter: Num[]): Aligned {
  return { start: 0, trainer, meter, trainerCad: trainer.map(() => null), meterCad: meter.map(() => null) };
}
const full = (n: number): Overlap => ({ from: 0, to: n, tooShort: false });
const fill = (n: number, v: number): number[] => new Array(n).fill(v);

describe('computeStats', () => {
  it('constant offset', () => {
    const s = computeStats(al(fill(1000, 210), fill(1000, 200)), full(1000), 1);
    expect(s.meanDiffW).toBeCloseTo(10);
    expect(s.meanDiffPct).toBeCloseTo(5);
    expect(s.meanAbsDiffW).toBeCloseTo(10);
    expect(s.sdDiffW).toBeCloseTo(0);
    expect(s.durationSec).toBe(1000);
  });

  it('uses ratio of means', () => {
    const m: number[] = [], t: number[] = [];
    for (let i = 0; i < 100; i++) { m.push(100, 300); t.push(110, 300); }
    expect(computeStats(al(t, m), full(200), 1).meanDiffPct).toBeCloseTo(2.5);
  });

  it('finds extremes', () => {
    const t = fill(1000, 200), m = fill(1000, 200);
    t[500] += 60; t[700] -= 40;
    const s = computeStats(al(t, m), full(1000), 1);
    expect(s.maxPos.w).toBeCloseTo(60);
    expect(s.maxPos.t).toBe(500);
    expect(s.maxPos.pct).toBeCloseTo((60 / 200) * 100);
    expect(s.maxNeg.w).toBeCloseTo(-40);
    expect(s.maxNeg.t).toBe(700);
  });

  it('skips both-zero seconds', () => {
    const base = computeStats(al(fill(100, 210), fill(100, 200)), full(100), 1);
    const s = computeStats(al([...fill(100, 210), ...fill(300, 0)], [...fill(100, 200), ...fill(300, 0)]), full(400), 1);
    expect(s.meanDiffW).toBeCloseTo(base.meanDiffW);
    expect(s.durationSec).toBe(base.durationSec);
  });

  it('computes bands by meter power', () => {
    const m = [...fill(100, 120), ...fill(100, 300)];
    const t = m.map((v) => v * 1.1);
    const s = computeStats(al(t, m), full(200), 1);
    expect(s.bands.map((b) => b.label)).toEqual(['<150 W', '150–250 W', '250–350 W', '>350 W']);
    expect(s.bands[0].seconds).toBe(100);
    expect(s.bands[0].meanDiffPct).toBeCloseTo(10);
    expect(s.bands[2].seconds).toBe(100);
    expect(s.bands[2].meanDiffPct).toBeCloseTo(10);
    for (const i of [1, 3]) {
      expect(s.bands[i].seconds).toBe(0);
      expect(s.bands[i].meanDiffPct).toBeNull();
    }
    expect(BANDS).toHaveLength(4);
  });

  it('smoothing damps a blip', () => {
    const t = fill(100, 200), m = fill(100, 200);
    t[50] += 90;
    expect(computeStats(al(t, m), full(100), 1).maxPos.w).toBeCloseTo(90);
    expect(computeStats(al(t, m), full(100), 3).maxPos.w).toBeCloseTo(30);
  });

  it('returns zeros when nothing usable', () => {
    const s = computeStats(al(fill(10, 0), fill(10, 0)), { from: 3, to: 8, tooShort: false }, 1);
    expect(s.durationSec).toBe(0);
    expect(s.meanDiffW).toBe(0);
    expect(s.meanDiffPct).toBe(0);
    expect(s.maxPos).toEqual({ w: 0, pct: 0, t: 3 });
    expect(s.maxNeg).toEqual({ w: 0, pct: 0, t: 3 });
    expect(s.bands).toHaveLength(4);
    for (const b of s.bands) { expect(b.seconds).toBe(0); expect(b.meanDiffW).toBe(0); expect(b.meanDiffPct).toBeNull(); }
  });
});
