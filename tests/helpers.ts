import type { Num, Series } from '../src/lib/types';

/** Aperiodic deterministic ride: random level 80-350 W held 20-90 s, +/-15 W noise. */
export function ridePower(n: number, seed = 1): number[] {
  let s = (seed * 2654435761) >>> 0 || 1;
  const rnd = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const out: number[] = [];
  while (out.length < n) {
    const level = 80 + rnd() * 270;
    const len = 20 + Math.floor(rnd() * 71);
    for (let i = 0; i < len && out.length < n; i++) {
      out.push(Math.max(0, Math.round(level + (rnd() * 2 - 1) * 15)));
    }
  }
  return out;
}

export function makeSeries(power: Num[], start = 1_700_000_000, cadence?: Num[]): Series {
  return { start, power, cadence: cadence ?? power.map((p) => (p === null ? null : 90)) };
}
