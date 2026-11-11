import { describe, it, expect } from 'vitest';
import { findOverlap } from '../src/lib/overlap';
import { DEFAULT_SETTINGS } from '../src/lib/settings';
import type { Aligned, Num } from '../src/lib/types';

const s = DEFAULT_SETTINGS;
function mk(n: number, tr: (i: number) => Num, me: (i: number) => Num): Aligned {
  const t = Array.from({ length: n }, (_, i) => tr(i));
  const m = Array.from({ length: n }, (_, i) => me(i));
  return { start: 0, trainer: t, meter: m, trainerCad: t.map(() => 90), meterCad: m.map(() => 90) };
}

describe('findOverlap', () => {
  it('trims edges of a common run', () => {
    const a = mk(1100, () => 200, (i) => (i >= 10 && i < 1010 ? 200 : null));
    expect(findOverlap(a, s)).toEqual({ from: 40, to: 980, tooShort: false });
  });
  it('picks the longest of two runs', () => {
    const a = mk(1400, () => 200, (i) => (i < 400 || (i >= 450 && i < 1350) ? 200 : null));
    expect(findOverlap(a, s)).toEqual({ from: 480, to: 1320, tooShort: false });
  });
  it('flags short result', () => {
    const a = mk(320, () => 200, () => 200);
    expect(findOverlap(a, s)).toEqual({ from: 30, to: 290, tooShort: true });
  });
  it('returns null when nothing remains', () => {
    expect(findOverlap(mk(50, () => 200, () => 200), s)).toBeNull();
    expect(findOverlap(mk(100, () => 200, () => null), s)).toBeNull();
  });
  it('zeros do not split runs', () => {
    const a = mk(2000, () => 200, (i) => (i >= 850 && i < 1150 ? 0 : 200));
    const a2 = { ...a, trainer: a.trainer.map((v, i) => (i >= 850 && i < 1150 ? 0 : v)) };
    expect(findOverlap(a2, s)).toEqual({ from: 30, to: 1970, tooShort: false });
  });
  it('ties pick earliest', () => {
    const a = mk(1000, () => 200, (i) => (i === 500 ? null : 200));
    expect(findOverlap(a, s)!.from).toBe(30);
  });
});
