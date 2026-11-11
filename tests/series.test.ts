import { describe, it, expect } from 'vitest';
import { toSeries } from '../src/lib/series';
import type { FitRecord, ParsedFile } from '../src/lib/types';

const file = (records: FitRecord[]): ParsedFile => ({
  meta: { fileName: 'a.fit', device: 'x', start: new Date(0), durationSec: 0, avgPower: 0 },
  records,
});
const r = (t: number, power: number | null, cadence: number | null = 90): FitRecord => ({ t, power, cadence });

describe('toSeries', () => {
  it('fills a short gap by carry-forward', () => {
    const s = toSeries(file([r(100, 10), r(101, 20), r(103, 30)]), 3);
    expect(s.start).toBe(100);
    expect(s.power).toEqual([10, 20, 20, 30]);
    expect(s.cadence).toEqual([90, 90, 90, 90]);
  });
  it('leaves long gaps null', () => {
    const s = toSeries(file([r(100, 10), r(105, 30)]), 3);
    expect(s.power).toEqual([10, null, null, null, null, 30]);
    expect(s.cadence).toEqual([90, null, null, null, null, 90]);
  });
  it('fills a gap exactly gapFillSec long', () => {
    const s = toSeries(file([r(100, 10), r(104, 30)]), 3);
    expect(s.power).toEqual([10, 10, 10, 10, 30]);
  });
  it('last duplicate timestamp wins', () => {
    const s = toSeries(file([r(100, 10), r(101, 20), r(101, 25), r(102, 30)]), 3);
    expect(s.power[1]).toBe(25);
  });
  it('record without power becomes 0, cadence stays null', () => {
    const s = toSeries(file([r(100, 10), r(101, null, null), r(102, 30)]), 3);
    expect(s.power).toEqual([10, 0, 30]);
    expect(s.cadence).toEqual([90, null, 90]);
  });
  it('single record', () => {
    const s = toSeries(file([r(100, 10)]), 3);
    expect(s.power.length).toBe(1);
    expect(s.power).toEqual([10]);
  });
  it('sorts unordered records', () => {
    const s = toSeries(file([r(102, 30), r(100, 10), r(101, 20)]), 3);
    expect(s.start).toBe(100);
    expect(s.power).toEqual([10, 20, 30]);
  });
  it('empty file gives empty series', () => {
    expect(toSeries(file([]), 3).power).toEqual([]);
  });
});
