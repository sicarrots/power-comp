import { expect, test } from 'vitest';
import { formatClock, formatDuration, formatPct, formatW } from '../src/lib/format';

test('formatW', () => {
  expect(formatW(8.44, true)).toBe('+8.4 W');
  expect(formatW(-3, true)).toBe('−3.0 W');
  expect(formatW(8.44)).toBe('8.4 W');
});
test('formatPct', () => {
  expect(formatPct(6.08, true)).toBe('+6.1%');
  expect(formatPct(-2)).toBe('−2.0%');
});
test('formatDuration', () => {
  expect(formatDuration(7150)).toBe('1:59:10');
  expect(formatDuration(245)).toBe('4:05');
});
test('formatClock', () => {
  expect(formatClock(new Date(2024, 0, 1, 9, 5, 7))).toBe('09:05:07');
});
test('tiny negatives do not print a negative zero', () => {
  expect(formatW(-0.04, true)).toBe('+0.0 W');
  expect(formatW(-0.04)).toBe('0.0 W');
  expect(formatPct(-0.03, true)).toBe('+0.0%');
  expect(formatW(0.04, true)).toBe('+0.0 W');
});
