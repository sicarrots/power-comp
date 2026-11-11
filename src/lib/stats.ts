import type { Aligned, Band, Extreme, Overlap, Stats } from './types';
import { rollingMean } from './smooth';

export const BANDS: { label: string; min: number; max: number | null }[] = [
  { label: '<150 W', min: 0, max: 150 },
  { label: '150–250 W', min: 150, max: 250 },
  { label: '250–350 W', min: 250, max: 350 },
  { label: '>350 W', min: 350, max: null },
];

export function computeStats(a: Aligned, ov: Overlap, smoothingSec: number): Stats {
  const st = rollingMean(a.trainer, smoothingSec);
  const sm = rollingMean(a.meter, smoothingSec);
  const nb = BANDS.length;
  const bN = new Array<number>(nb).fill(0);
  const bT = new Array<number>(nb).fill(0);
  const bM = new Array<number>(nb).fill(0);

  let n = 0, sumT = 0, sumM = 0, sumD = 0, sumAbs = 0, sumSq = 0;
  let maxPos: Extreme | null = null;
  let maxNeg: Extreme | null = null;

  const end = Math.min(ov.to, a.trainer.length, a.meter.length);
  for (let i = Math.max(0, ov.from); i < end; i++) {
    const t = st[i], m = sm[i];
    if (t === null || m === null) continue;
    if (a.trainer[i] === 0 && a.meter[i] === 0) continue;
    const d = t - m;
    n++; sumT += t; sumM += m; sumD += d; sumAbs += Math.abs(d); sumSq += d * d;
    const pct = (d / Math.max(m, 1)) * 100;
    if (!maxPos || d > maxPos.w) maxPos = { w: d, pct, t: i };
    if (!maxNeg || d < maxNeg.w) maxNeg = { w: d, pct, t: i };
    for (let b = 0; b < nb; b++) {
      const { min, max } = BANDS[b];
      if (m >= min && (max === null || m < max)) { bN[b]++; bT[b] += t; bM[b] += m; break; }
    }
  }

  const bands: Band[] = BANDS.map((def, b) => ({
    ...def,
    seconds: bN[b],
    meanDiffW: bN[b] ? (bT[b] - bM[b]) / bN[b] : 0,
    meanDiffPct: bN[b] && bM[b] !== 0 ? ((bT[b] - bM[b]) / bM[b]) * 100 : null,
  }));

  if (n === 0 || !maxPos || !maxNeg) {
    const z = { w: 0, pct: 0, t: ov.from };
    return {
      durationSec: 0, meanTrainerW: 0, meanMeterW: 0, meanDiffW: 0, meanDiffPct: 0,
      meanAbsDiffW: 0, sdDiffW: 0, maxPos: { ...z }, maxNeg: { ...z }, bands,
    };
  }

  const meanD = sumD / n;
  const meanM = sumM / n;
  return {
    durationSec: n,
    meanTrainerW: sumT / n,
    meanMeterW: meanM,
    meanDiffW: meanD,
    meanDiffPct: meanM === 0 ? 0 : ((sumT / n - meanM) / meanM) * 100,
    meanAbsDiffW: sumAbs / n,
    sdDiffW: Math.sqrt(Math.max(0, sumSq / n - meanD * meanD)),
    maxPos, maxNeg, bands,
  };
}
