export interface Settings {
  gapFillSec: number; searchWindowSec: number; minCorrelation: number; trimSec: number; smoothingSec: number;
  spikeAbsW: number; spikePct: number; dropoutMinW: number; dropoutMinSec: number; driftPctPts: number;
  bandSpreadPctPts: number; cadenceMedianRpm: number; cadenceRunRpm: number;
}

export const DEFAULT_SETTINGS: Settings = {
  gapFillSec: 3, searchWindowSec: 300, minCorrelation: 0.8, trimSec: 30, smoothingSec: 3,
  spikeAbsW: 100, spikePct: 50, dropoutMinW: 50, dropoutMinSec: 2, driftPctPts: 3,
  bandSpreadPctPts: 4, cadenceMedianRpm: 3, cadenceRunRpm: 10,
};

export const ALIGN_SMOOTH_SEC = 5;
export const WINDOW_MIN_OVERLAP_FRAC = 0.6;
export const FULL_SEARCH_MIN_OVERLAP_SEC = 600;
export const MIN_OVERLAP_SEC = 300;
export const SPIKE_MERGE_SEC = 5;
export const DRIFT_BLOCK_SEC = 30;
export const DRIFT_MIN_METER_W = 50;
export const BAND_MIN_SEC = 60;
export const CADENCE_RUN_SEC = 10;
export const DIFF_PCT_MIN_METER_W = 20;
export const SMOOTHING_OPTIONS = [1, 3, 10, 30];

const KEY = 'power-comp/settings';

function defaultStorage(): Storage | null {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

export function loadSettings(storage?: Storage | null): Settings {
  const out: Settings = { ...DEFAULT_SETTINGS };
  try {
    const st = storage === undefined ? defaultStorage() : storage;
    const raw = st?.getItem(KEY);
    if (!raw) return out;
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object') return out;
    const rec = parsed as Record<string, unknown>;
    for (const k of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
      const v = rec[k];
      if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    }
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
  return out;
}

export function saveSettings(s: Settings, storage?: Storage | null): void {
  try {
    const st = storage === undefined ? defaultStorage() : storage;
    st?.setItem(KEY, JSON.stringify(s));
  } catch { /* ignore */ }
}
