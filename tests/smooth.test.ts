import { describe, it, expect } from 'vitest';
import { rollingMean } from '../src/lib/smooth';

describe('rollingMean', () => {
  it('centred 3 s window, edges use available values', () => {
    expect(rollingMean([1, 2, 3, 4, 5], 3)).toEqual([1.5, 2, 3, 4, 4.5]);
  });
  it('ignores nulls', () => {
    expect(rollingMean([null, 2, null], 3)).toEqual([2, 2, 2]);
  });
  it('all-null window gives null', () => {
    expect(rollingMean([null, null, null, 5], 3)).toEqual([null, null, 5, 5]);
  });
  it('window 1 returns an equal copy', () => {
    const a = [1, null, 3];
    const out = rollingMean(a, 1);
    expect(out).toEqual(a);
    expect(out).not.toBe(a);
  });
  it('even window is biased backwards: i-floor((w-1)/2)..i+ceil((w-1)/2)', () => {
    expect(rollingMean([1, 2, 3, 4], 2)).toEqual([1.5, 2.5, 3.5, 4]);
  });
  it('handles empty input', () => {
    expect(rollingMean([], 5)).toEqual([]);
  });
});
