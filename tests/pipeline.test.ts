import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseFit } from '../src/lib/fit';
import { toSeries } from '../src/lib/series';
import { autoLag, correlationAt } from '../src/lib/align';
import { DEFAULT_SETTINGS } from '../src/lib/settings';
import { analyze } from '../src/lib/pipeline';
import { makeSeries, ridePower } from './helpers';

function load(name: string): ArrayBuffer {
  const b = readFileSync(`examples/${name}`);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}
const S = DEFAULT_SETTINGS;

describe('analyze', () => {
  it('end-to-end on the example rides', () => {
    const trainer = toSeries(parseFit(load('zwift-wahoo.fit'), 'zwift-wahoo.fit'), S.gapFillSec);
    const meter = toSeries(parseFit(load('garmin-favero.fit'), 'garmin-favero.fit'), S.gapFillSec);
    const al = autoLag(trainer, meter, S);
    const a = analyze(trainer, meter, al.lagSec, S);
    expect(Math.abs(al.lagSec)).toBeLessThanOrEqual(10);
    expect(a.r!).toBeGreaterThan(0.9);
    expect(a.overlap!.tooShort).toBe(false);
    expect(a.stats!.meanDiffPct).toBeGreaterThan(3);
    expect(a.stats!.meanDiffPct).toBeLessThan(9);
    expect(a.stats!.durationSec).toBeGreaterThan(6600);
  });

  it('same file as trainer and meter gives zero diff', () => {
    const f = toSeries(parseFit(load('zwift-wahoo.fit'), 'zwift-wahoo.fit'), S.gapFillSec);
    const al = autoLag(f, f, S);
    const a = analyze(f, f, al.lagSec, S);
    expect(al.lagSec).toBe(0);
    expect(a.r!).toBeGreaterThan(0.999);
    expect(a.stats!.meanDiffW).toBe(0);
    expect(a.anomalies).toEqual([]);
    expect(a.r).toBe(correlationAt(f, f, 0).r);
  });

  it('short overlap gives null stats but populated smoothing', () => {
    const p = ridePower(120);
    const a = analyze(makeSeries(p), makeSeries(p.map((x) => x - 5)), 0, S);
    expect(a.stats).toBeNull();
    expect(a.anomalies).toEqual([]);
    expect(a.smoothed.trainer.length).toBe(a.aligned.trainer.length);
    expect(a.smoothed.diffW.some((v) => v !== null)).toBe(true);
  });

  it('diffPct is null when meter is below 20 W', () => {
    const a = analyze(makeSeries(Array(400).fill(40)), makeSeries(Array(400).fill(10)), 0, S);
    expect(a.smoothed.diffW.some((v) => v !== null)).toBe(true);
    expect(a.smoothed.diffPct.every((v) => v === null)).toBe(true);
  });

  it('swapped inputs flip the lag sign and negate the difference', () => {
    const t = toSeries(parseFit(load('zwift-wahoo.fit'), 'zwift-wahoo.fit'), S.gapFillSec);
    const m = toSeries(parseFit(load('garmin-favero.fit'), 'garmin-favero.fit'), S.gapFillSec);
    const fwd = autoLag(t, m, S);
    const rev = autoLag(m, t, S);
    expect(rev.lagSec).toBe(-fwd.lagSec);
    const a = analyze(t, m, fwd.lagSec, S).stats!;
    const b = analyze(m, t, rev.lagSec, S).stats!;
    expect(a.meanDiffW).toBeGreaterThan(0);
    expect(b.meanDiffW).toBeLessThan(0);
    expect(b.meanDiffPct).toBeLessThan(0);
  });

  it('recovers a known lag and a 5% offset on synthetic data', () => {
    const meterP = ridePower(3600);
    const trainerP = meterP.map((x) => x * 1.05);
    const trainer = makeSeries(trainerP);
    const meter = makeSeries(meterP, 1_700_000_004); // meter clock 4 s late
    const al = autoLag(trainer, meter, S);
    expect(al.lagSec).toBe(-4);
    const a = analyze(trainer, meter, al.lagSec, S);
    expect(Math.abs(a.stats!.meanDiffPct - 5)).toBeLessThan(0.2);
  });
});
