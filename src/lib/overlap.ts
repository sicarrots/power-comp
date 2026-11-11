import type { Aligned, Overlap } from './types';
import type { Settings } from './settings';
import { MIN_OVERLAP_SEC } from './settings';

/** Longest run where both sources have data (0 counts as data), trimmed at both ends. */
export function findOverlap(a: Aligned, s: Settings): Overlap | null {
  const n = Math.min(a.trainer.length, a.meter.length);
  let bestFrom = 0, bestLen = 0, runFrom = 0, runLen = 0;
  for (let i = 0; i < n; i++) {
    if (a.trainer[i] !== null && a.meter[i] !== null) {
      if (runLen === 0) runFrom = i;
      runLen++;
      if (runLen > bestLen) { bestLen = runLen; bestFrom = runFrom; }
    } else runLen = 0;
  }
  const from = bestFrom + s.trimSec;
  const to = bestFrom + bestLen - s.trimSec;
  if (bestLen === 0 || to <= from) return null;
  return { from, to, tooShort: to - from < MIN_OVERLAP_SEC };
}
