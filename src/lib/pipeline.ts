import type { Aligned, Anomaly, Num, Overlap, Series, Stats } from './types';
import { DIFF_PCT_MIN_METER_W, type Settings } from './settings';
import { applyLag, correlationAt } from './align';
import { findOverlap } from './overlap';
import { rollingMean } from './smooth';
import { computeStats } from './stats';
import { detectAnomalies } from './anomalies';

export interface Analysis {
  aligned: Aligned;
  overlap: Overlap | null;
  r: number | null;
  smoothed: { trainer: Num[]; meter: Num[]; diffW: Num[]; diffPct: Num[] };
  stats: Stats | null;
  anomalies: Anomaly[];
}

export function analyze(trainer: Series, meter: Series, lagSec: number, s: Settings): Analysis {
  const aligned = applyLag(trainer, meter, lagSec);
  const overlap = findOverlap(aligned, s);
  const { r } = correlationAt(trainer, meter, lagSec);
  const st = rollingMean(aligned.trainer, s.smoothingSec);
  const sm = rollingMean(aligned.meter, s.smoothingSec);
  const diffW: Num[] = st.map((t, i) => (t === null || sm[i] === null ? null : t - (sm[i] as number)));
  const diffPct: Num[] = diffW.map((d, i) => {
    const m = sm[i];
    return d === null || m === null || m < DIFF_PCT_MIN_METER_W ? null : (d / m) * 100;
  });
  const stats = overlap && !overlap.tooShort ? computeStats(aligned, overlap, s.smoothingSec) : null;
  const anomalies = stats && overlap ? detectAnomalies(aligned, overlap, stats, s) : [];
  return { aligned, overlap, r, smoothed: { trainer: st, meter: sm, diffW, diffPct }, stats, anomalies };
}
