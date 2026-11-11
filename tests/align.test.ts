import { describe, it, expect } from 'vitest';
import { applyLag, correlationAt, autoLag } from '../src/lib/align';
import { DEFAULT_SETTINGS } from '../src/lib/settings';
import { makeSeries, ridePower } from './helpers';

const S = 1_700_000_000;
const base = ridePower(3600);

describe('applyLag', () => {
  it('builds union grid, missing samples are null', () => {
    const a = applyLag(makeSeries([1, 2, 3], 100), makeSeries([7, 8], 101), 0);
    expect(a.start).toBe(100);
    expect(a.trainer).toEqual([1, 2, 3]);
    expect(a.meter).toEqual([null, 7, 8]);
    expect(a.trainerCad).toEqual([90, 90, 90]);
    expect(a.meterCad).toEqual([null, 90, 90]);
  });
  it('shifts the meter by lagSec', () => {
    const a = applyLag(makeSeries([1, 2, 3], 100), makeSeries([7, 8], 101), -1);
    expect(a.start).toBe(100);
    expect(a.trainer).toEqual([1, 2, 3]);
    expect(a.meter).toEqual([7, 8, null]);
  });
  it('extends the grid when the shifted meter sticks out', () => {
    const a = applyLag(makeSeries([1, 2], 100), makeSeries([7, 8], 100), 3);
    expect(a.start).toBe(100);
    expect(a.trainer).toEqual([1, 2, null, null, null]);
    expect(a.meter).toEqual([null, null, null, 7, 8]);
  });
});

describe('correlationAt', () => {
  it('identical series at lag 0 → r ≈ 1, n = length', () => {
    const res = correlationAt(makeSeries(base, S), makeSeries(base, S), 0);
    expect(res.n).toBe(base.length);
    expect(res.r).not.toBeNull();
    expect(Math.abs((res.r as number) - 1)).toBeLessThan(1e-9);
  });
  it('r null when no overlap or zero variance', () => {
    expect(correlationAt(makeSeries([1, 2, 3], 0), makeSeries([1, 2, 3], 100), 0)).toEqual({ r: null, n: 0 });
    expect(correlationAt(makeSeries([5, 5, 5, 5], 0), makeSeries([1, 2, 3, 4], 0), 0).r).toBeNull();
  });
});

describe('autoLag', () => {
  it('meter clock 4 s late → lag −4 via timestamp window', () => {
    const trainer = makeSeries(base.map((p) => p * 1.05), S);
    const meter = makeSeries(base, S + 4);
    const res = autoLag(trainer, meter, DEFAULT_SETTINGS);
    expect(res.lagSec).toBe(-4);
    expect(res.r).toBeGreaterThan(0.99);
    expect(res.method).toBe('timestamp-window');
    expect(res.lowConfidence).toBe(false);
  });
  it('meter clock 20 min off → full search finds −1200', () => {
    const res = autoLag(makeSeries(base, S), makeSeries(base, S + 1200), DEFAULT_SETTINGS);
    expect(res.method).toBe('full-search');
    expect(res.lagSec).toBe(-1200);
    expect(res.lowConfidence).toBe(false);
  });
  it('unrelated signals → low confidence', () => {
    const res = autoLag(makeSeries(ridePower(3600, 1), S), makeSeries(ridePower(3600, 99), S), DEFAULT_SETTINGS);
    expect(res.lowConfidence).toBe(true);
  });
  it('true lag exactly at window edge is found', () => {
    const res = autoLag(makeSeries(base, S), makeSeries(base, S + 300), { ...DEFAULT_SETTINGS, searchWindowSec: 300 });
    expect(res.lagSec).toBe(-300);
    expect(res.method).toBe('timestamp-window');
  });
  it('meter covering only the middle of the ride (Review Focus 5)', () => {
    const meter = makeSeries(base.slice(900, 2700), S + 900 + 3);
    const res = autoLag(makeSeries(base, S), meter, DEFAULT_SETTINGS);
    expect(res.lagSec).toBe(-3);
    expect(res.method).toBe('timestamp-window');
    expect(res.lowConfidence).toBe(false);
  });
  it('no eligible lag → fallback result', () => {
    const res = autoLag(makeSeries([1, 2, 3], S), makeSeries([3, 2, 1], S), DEFAULT_SETTINGS);
    expect(res).toEqual({ lagSec: 0, r: 0, method: 'timestamp-window', lowConfidence: true });
  });
});
