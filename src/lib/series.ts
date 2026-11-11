import type { Num, ParsedFile, Series } from './types';

/**
 * Resample records onto a 1 s grid. A second with no record is null (a gap); a record
 * without power is 0 (sensor dropout). Gaps of at most gapFillSec seconds with a record on
 * both sides are filled by carrying the previous record's values forward.
 */
export function toSeries(file: ParsedFile, gapFillSec: number): Series {
  if (file.records.length === 0) return { start: 0, power: [], cadence: [] };
  const sorted = file.records.map((rec, i) => ({ rec, i })).sort((a, b) => a.rec.t - b.rec.t || a.i - b.i);
  const start = sorted[0].rec.t;
  const n = sorted[sorted.length - 1].rec.t - start + 1;
  const power: Num[] = new Array(n).fill(null);
  const cadence: Num[] = new Array(n).fill(null);
  const present = new Uint8Array(n);
  for (const { rec } of sorted) { // later duplicates overwrite earlier ones
    const k = rec.t - start;
    power[k] = rec.power ?? 0;
    cadence[k] = rec.cadence;
    present[k] = 1;
  }
  let i = 0;
  while (i < n) {
    if (present[i]) { i++; continue; }
    let j = i;
    while (j < n && !present[j]) j++;
    // run [i, j) is missing; i > 0 and j < n always hold since the ends are records
    if (j - i <= gapFillSec) {
      for (let k = i; k < j; k++) {
        power[k] = power[i - 1];
        cadence[k] = cadence[i - 1];
      }
    }
    i = j;
  }
  return { start, power, cadence };
}
