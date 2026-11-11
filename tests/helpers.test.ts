import { expect, test } from 'vitest';
import { makeSeries, ridePower } from './helpers';

test('ridePower is deterministic, sized, non-negative, seed-sensitive', () => {
  const a = ridePower(1000, 1);
  expect(a).toEqual(ridePower(1000, 1));
  expect(a).toHaveLength(1000);
  expect(a.every((v) => v >= 0)).toBe(true);
  expect(a).not.toEqual(ridePower(1000, 99));
});

test('makeSeries defaults cadence', () => {
  const s = makeSeries([100, null]);
  expect(s.start).toBe(1_700_000_000);
  expect(s.cadence).toEqual([90, null]);
});
