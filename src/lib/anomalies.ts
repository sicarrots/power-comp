import type { Aligned, Anomaly, Num, Overlap, Stats } from './types';
import type { Settings } from './settings';
import {
  BAND_MIN_SEC, CADENCE_RUN_SEC, DRIFT_BLOCK_SEC, DRIFT_MIN_METER_W, SPIKE_MERGE_SEC,
} from './settings';
import { formatDuration, formatPct, formatW } from './format';

interface Range { from: number; to: number }

function bounds(a: Aligned, ov: Overlap): Range {
  return { from: Math.max(0, ov.from), to: Math.min(ov.to, a.trainer.length, a.meter.length) };
}

const isOff = (v: Num): boolean => v === null || v === 0;

function spikes(a: Aligned, ov: Overlap, s: Settings): Anomaly[] {
  const { from, to } = bounds(a, ov);
  const events: { from: number; to: number; peak: number; pct: number }[] = [];
  for (let i = from; i < to; i++) {
    const t = a.trainer[i], m = a.meter[i];
    if (t === null || m === null || t === 0 || m === 0) continue; // dropouts, not spikes
    const d = t - m;
    const pct = (d / Math.max(m, 1)) * 100;
    if (!(Math.abs(d) > s.spikeAbsW && Math.abs(pct) > s.spikePct)) continue;
    const last = events[events.length - 1];
    if (last && i - last.to <= SPIKE_MERGE_SEC) {
      last.to = i + 1;
      if (Math.abs(d) > Math.abs(last.peak)) { last.peak = d; last.pct = pct; }
    } else {
      events.push({ from: i, to: i + 1, peak: d, pct });
    }
  }
  return events.map((e) => ({
    kind: 'spike', severity: 'warning', from: e.from, to: e.to,
    message: `Spike: trainer ${formatW(e.peak, true)} vs power meter (${formatPct(e.pct, true)})`,
  }));
}

function dropouts(a: Aligned, ov: Overlap, s: Settings): Anomaly[] {
  const { from, to } = bounds(a, ov);
  const out: Anomaly[] = [];
  // which source is dropping at i: 'trainer' | 'meter' | null
  const who = (i: number): 'trainer' | 'meter' | null => {
    const t = a.trainer[i], m = a.meter[i];
    if (isOff(m) && t !== null && t > s.dropoutMinW) return 'meter';
    if (isOff(t) && m !== null && m > s.dropoutMinW) return 'trainer';
    return null;
  };
  let i = from;
  while (i < to) {
    const w = who(i);
    if (w === null) { i++; continue; }
    let j = i, sum = 0;
    while (j < to && who(j) === w) {
      sum += (w === 'meter' ? a.trainer[j] : a.meter[j]) as number;
      j++;
    }
    const len = j - i;
    if (len >= s.dropoutMinSec) {
      const name = w === 'meter' ? 'power meter' : 'trainer';
      out.push({
        kind: 'dropout', severity: 'warning', from: i, to: j,
        message: `Dropout: ${name} read 0 W for ${formatDuration(len)} while the other read ${formatW(sum / len)} avg`,
      });
    }
    i = j;
  }
  return out;
}

function drift(a: Aligned, ov: Overlap, s: Settings): Anomaly[] {
  const { from, to } = bounds(a, ov);
  const xs: number[] = [], ys: number[] = [];
  for (let b = from; b < to; b += DRIFT_BLOCK_SEC) {
    const e = Math.min(b + DRIFT_BLOCK_SEC, to);
    let n = 0, sumT = 0, sumM = 0, sumI = 0;
    for (let i = b; i < e; i++) {
      const t = a.trainer[i], m = a.meter[i];
      if (t === null || m === null) continue;
      n++; sumT += t; sumM += m; sumI += i;
    }
    if (n === 0 || sumM / n < DRIFT_MIN_METER_W) continue;
    xs.push(sumI / n);
    ys.push(((sumT - sumM) / sumM) * 100);
  }
  if (xs.length < 4) return [];
  const k = xs.length;
  const mx = xs.reduce((p, v) => p + v, 0) / k;
  const my = ys.reduce((p, v) => p + v, 0) / k;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < k; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; }
  if (sxx === 0) return [];
  const slope = sxy / sxx;
  const at = (x: number) => my + slope * (x - mx);
  // Judge on the 0.1-pp values shown in the message so severity matches what the user reads.
  const r1 = (v: number) => Math.round(v * 10) / 10;
  const start = r1(at(ov.from)), end = r1(at(ov.to));
  const change = r1(Math.abs(end - start));
  if (change < s.driftPctPts) return [];
  return [{
    kind: 'drift', severity: change >= 2 * s.driftPctPts ? 'warning' : 'info', from: ov.from, to: ov.to,
    message: `Difference drifts from ${formatPct(start, true)} to ${formatPct(end, true)} over ${formatDuration(ov.to - ov.from)}`,
  }];
}

function powerDependent(ov: Overlap, stats: Stats, s: Settings): Anomaly[] {
  const bands = stats.bands.filter((b) => b.seconds >= BAND_MIN_SEC && b.meanDiffPct !== null);
  if (bands.length < 2) return [];
  let hi = bands[0], lo = bands[0];
  for (const b of bands) {
    if ((b.meanDiffPct as number) > (hi.meanDiffPct as number)) hi = b;
    if ((b.meanDiffPct as number) < (lo.meanDiffPct as number)) lo = b;
  }
  const hp = hi.meanDiffPct as number, lp = lo.meanDiffPct as number;
  if (hp - lp < s.bandSpreadPctPts) return [];
  return [{
    kind: 'power-dependent', severity: 'info', from: ov.from, to: ov.to,
    message: `Difference depends on power: ${formatPct(hp, true)} at ${hi.label} vs ${formatPct(lp, true)} at ${lo.label}`,
  }];
}

function cadence(a: Aligned, ov: Overlap, s: Settings): Anomaly[] {
  const from = Math.max(0, ov.from);
  const to = Math.min(ov.to, a.trainerCad.length, a.meterCad.length);
  const diff = (i: number): number | null => {
    const t = a.trainerCad[i], m = a.meterCad[i];
    return t === null || m === null ? null : Math.abs(t - m);
  };
  const abs: number[] = [];
  for (let i = from; i < to; i++) { const d = diff(i); if (d !== null) abs.push(d); }
  if (abs.length === 0) return [];
  const out: Anomaly[] = [];
  abs.sort((x, y) => x - y);
  const h = abs.length >> 1;
  const median = abs.length % 2 ? abs[h] : (abs[h - 1] + abs[h]) / 2;
  if (median > s.cadenceMedianRpm) {
    out.push({
      kind: 'cadence', severity: 'info', from: ov.from, to: ov.to,
      message: `Cadence differs by ${Math.round(median)} rpm (median) — check alignment or cadence sensor`,
    });
  }
  let i = from;
  while (i < to) {
    const d = diff(i);
    if (d === null || d <= s.cadenceRunRpm) { i++; continue; }
    let j = i;
    while (j < to) { const dj = diff(j); if (dj === null || dj <= s.cadenceRunRpm) break; j++; }
    if (j - i >= CADENCE_RUN_SEC) {
      out.push({
        kind: 'cadence', severity: 'info', from: i, to: j,
        message: `Cadence differs by more than ${s.cadenceRunRpm} rpm for ${formatDuration(j - i)}`,
      });
    }
    i = j;
  }
  return out;
}

export function detectAnomalies(a: Aligned, ov: Overlap, stats: Stats, s: Settings): Anomaly[] {
  return [
    ...spikes(a, ov, s),
    ...dropouts(a, ov, s),
    ...drift(a, ov, s),
    ...powerDependent(ov, stats, s),
    ...cadence(a, ov, s),
  ].sort((x, y) => x.from - y.from);
}
